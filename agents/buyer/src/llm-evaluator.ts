import { ProposalInfo } from '@dmm/agents-shared';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createToolCallingAgent } from 'langchain/agents';
import { AgentExecutor } from 'langchain/agents';
import type { HederaLangchainToolkit } from 'hedera-agent-kit';
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

export interface BuyerEvaluation {
  shouldPursue: boolean;
  desiredOutcome?: string; // e.g., "yes", "no"
  suggestedAmount?: string; // Suggested offer amount in HBAR per vote
  quantity?: number; // Number of votes needed
  reason?: string;
}

/**
 * Manages a Langchain agent executor that is reused across all proposal evaluations.
 * The agent and executor are created once and reused for the entire session.
 */
export class BuyerAgentManager {
  private agentExecutor: AgentExecutor | null = null;
  private prompt: ChatPromptTemplate;
  private tools: any[] = [];
  private initializationPromise: Promise<void> | null = null;

  constructor(hederaAgentToolkit?: HederaLangchainToolkit) {
    // Get tools from Hedera toolkit if available
    this.tools = hederaAgentToolkit ? hederaAgentToolkit.getTools() : [];

    // Create the prompt template (reused for all evaluations)
    // Note: agent_scratchpad is required by createToolCallingAgent
    this.prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are an agent helping a buyer decide whether to purchase votes for a governance proposal.
Your task is to evaluate proposals and determine if the buyer should pursue purchasing votes.

You have access to Hedera tools that can help you check balances, query account information, and interact with the Hedera network if needed.

Always respond with valid JSON in this exact format:
{{
  "shouldPursue": true or false,
  "desiredOutcome": "yes" or "no" or "against",
  "suggestedAmount": "10" (HBAR amount per vote as string),
  "quantity": 1 (number of votes needed),
  "reason": "explanation"
}}

Use the available tools if you need to check the buyer's balance or other Hedera account information to make an informed decision.`,
      ],
      [
        'human',
        `Buyer's goals and context:
{buyerContext}
{desiredOutcomeNote}

Proposal details:
Title: {title}
Description: {description}
Voting options: {options}

Based on the buyer's context, should they pursue purchasing votes for this proposal? What outcome do they want? What's a reasonable price to offer per vote?

Respond with valid JSON in the required format.

{agent_scratchpad}`,
      ],
    ]);
  }

  /**
   * Initialize the agent and executor. This is called lazily on first use.
   */
  private async initialize(): Promise<void> {
    if (this.agentExecutor) {
      return; // Already initialized
    }

    if (this.initializationPromise) {
      return this.initializationPromise; // Initialization in progress
    }

    this.initializationPromise = (async () => {
      try {
        // Create the agent
        const agent = await createToolCallingAgent({
          llm,
          tools: this.tools,
          prompt: this.prompt,
        });

        // Wrap in executor
        this.agentExecutor = new AgentExecutor({
          agent,
          tools: this.tools,
        });
      } catch (error) {
        console.error('Error initializing buyer agent:', error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Evaluate a proposal using the agent. The agent executor is reused across calls.
   */
  async evaluateProposal(
    proposal: ProposalInfo,
    buyerContext: string,
    desiredOutcome?: string
  ): Promise<BuyerEvaluation> {
    try {
      // Ensure agent is initialized
      await this.initialize();

      if (!this.agentExecutor) {
        throw new Error('Agent executor not initialized');
      }

      const desiredOutcomeNote = desiredOutcome 
        ? `\nIMPORTANT: The buyer wants the outcome to be "${desiredOutcome}". Make sure to set desiredOutcome to "${desiredOutcome}".`
        : '';

      // Invoke the agent with the formatted input
      const response = await this.agentExecutor.invoke({
        buyerContext,
        desiredOutcomeNote,
        title: proposal.title,
        description: proposal.description,
        options: proposal.options.join(', '),
      });

      // Parse the response - it might be in the output field
      const output = typeof response.output === 'string' ? response.output : JSON.stringify(response);
      
      // Try to extract JSON from the response
      let result: any;
      try {
        // Try to parse as JSON directly
        result = JSON.parse(output);
      } catch {
        // Try to extract JSON from markdown code blocks or text
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback: use output parser
          const outputParser = new JsonOutputParser();
          result = await outputParser.parse(output);
        }
      }

      return {
        shouldPursue: result.shouldPursue === true,
        desiredOutcome: result.desiredOutcome,
        suggestedAmount: result.suggestedAmount || '10',
        quantity: result.quantity || 1,
        reason: result.reason || 'No reason provided',
      };
    } catch (e) {
      console.error('Error evaluating proposal with LLM agent:', e);
      return {
        shouldPursue: false,
        reason: 'Unable to evaluate proposal',
      };
    }
  }
}

/**
 * Legacy function for backward compatibility. Creates a new agent manager instance.
 * For better performance, use BuyerAgentManager directly and reuse it.
 */
export async function createOfferWithLLM(
  proposal: ProposalInfo,
  buyerContext: string,
  desiredOutcome?: string,
  hederaAgentToolkit?: HederaLangchainToolkit
): Promise<BuyerEvaluation> {
  const manager = new BuyerAgentManager(hederaAgentToolkit);
  return manager.evaluateProposal(proposal, buyerContext, desiredOutcome);
}

