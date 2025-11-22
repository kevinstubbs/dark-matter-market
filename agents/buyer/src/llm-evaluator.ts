import { ProposalInfo } from '@dmm/agents-shared';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';

export interface ProviderEvaluation {
  shouldPursue: boolean;
  desiredOutcome?: string; // e.g., "yes", "no"
  suggestedAmount?: string; // Suggested bribe amount in HBAR
  reason?: string;
}

const llm = new ChatAnthropic({
  model: 'claude-haiku-4-5',
  temperature: 0.3,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const outputParser = new JsonOutputParser();

export interface BuyerEvaluation {
  shouldPursue: boolean;
  desiredOutcome?: string; // e.g., "yes", "no"
  suggestedAmount?: string; // Suggested offer amount in HBAR per vote
  quantity?: number; // Number of votes needed
  reason?: string;
}

export async function createOfferWithLLM(
  proposal: ProposalInfo,
  buyerContext: string
): Promise<BuyerEvaluation> {
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an agent helping a buyer decide whether to purchase votes for a governance proposal.
Always respond with valid JSON in this exact format:
{{
  "shouldPursue": true or false,
  "desiredOutcome": "yes" or "no" or "against",
  "suggestedAmount": "10" (HBAR amount per vote as string),
  "quantity": 1 (number of votes needed),
  "reason": "explanation"
}}`,
    ],
    [
      'human',
      `Buyer's goals and context:
{buyerContext}

Proposal details:
Title: {title}
Description: {description}
Voting options: {options}

Based on the buyer's context, should they pursue purchasing votes for this proposal? What outcome do they want? What's a reasonable price to offer per vote?`,
    ],
  ]);

  const chain = prompt.pipe(llm).pipe(outputParser);

  try {
    const result = await chain.invoke({
      buyerContext,
      title: proposal.title,
      description: proposal.description,
      options: proposal.options.join(', '),
    });

    return {
      shouldPursue: result.shouldPursue === true,
      desiredOutcome: result.desiredOutcome,
      suggestedAmount: result.suggestedAmount || '10',
      quantity: result.quantity || 1,
      reason: result.reason || 'No reason provided',
    };
  } catch (e) {
    console.error('Error evaluating proposal with LLM:', e);
    return {
      shouldPursue: false,
      reason: 'Unable to evaluate proposal',
    };
  }
}

