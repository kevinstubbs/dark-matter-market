import { VoteOffer, VoteOfferResponse } from '@dmm/agents-shared';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';

const llm = new ChatAnthropic({
  model: 'claude-haiku-4-5',
  temperature: 0.3,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const outputParser = new JsonOutputParser();

export async function evaluateOfferWithLLM(
  offer: VoteOffer,
  userInstructions: string
): Promise<VoteOfferResponse> {
  // The agent receives the user's plain language instructions as context
  // and uses reasoning to determine if the offer should be accepted, rejected, or countered
  
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an agent helping a user sell their voting power. The user has given you plain text instructions about what votes are allowed/not allowed.
Always respond with valid JSON in this exact format:
{{
  "accepted": true or false,
  "reason": "explanation of decision",
  "counterOffer": "optional higher price if you want to negotiate" or null,
  "rejectionReason": "why rejected if not accepted" or null
}}`,
    ],
    [
      'human',
      `User's instructions about selling votes:
{userInstructions}

Vote purchase offer:
Proposal: {title}
Description: {description}
Desired outcome: {desiredOutcome}
Offered amount: {offeredAmount} HBAR per vote
Voting options: {options}

Based on the user's instructions, should we accept this offer, reject it, or make a counter-offer?`,
    ],
  ]);

  const chain = prompt.pipe(llm).pipe(outputParser);

  try {
    const result = await chain.invoke({
      userInstructions,
      title: offer.proposal.title,
      description: offer.proposal.description,
      desiredOutcome: offer.desiredOutcome,
      offeredAmount: offer.offeredAmount,
      options: offer.proposal.options.join(', '),
    });

    return {
      accepted: result.accepted === true,
      reason: result.reason || 'No reason provided',
      counterOffer: result.counterOffer || undefined,
      rejectionReason: result.rejectionReason || undefined,
    };
  } catch (e) {
    console.error('Error evaluating offer with LLM:', e);
    // Fallback if LLM doesn't return valid JSON
    return {
      accepted: false,
      rejectionReason: 'Unable to evaluate offer',
    };
  }
}

