import { VoteOffer, VoteOfferResponse } from '@dmm/agents-shared';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createToolCallingAgent } from 'langchain/agents';
import { AgentExecutor } from 'langchain/agents';
import type { HederaLangchainToolkit } from 'hedera-agent-kit';
import { JsonOutputParser } from '@langchain/core/output_parsers';

const llm = new ChatAnthropic({
  model: 'claude-haiku-4-5',
  temperature: 0.3,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Manages a Langchain agent executor that is reused across all offer evaluations.
 * The agent and executor are created once and reused for the entire session.
 */
export class SellerAgentManager {
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
        `You are an agent helping a user sell their voting power. The user has given you plain text instructions about what votes are allowed/not allowed.

You have access to Hedera tools that can help you check balances, query account information, and interact with the Hedera network if needed.

Always respond with valid JSON in this exact format:
{{
  "accepted": true or false,
  "reason": "explanation of decision",
  "counterOffer": "optional higher price if you want to negotiate" or null,
  "rejectionReason": "why rejected if not accepted" or null
}}

Use the available tools if you need to check the seller's balance or other Hedera account information to make an informed decision.`,
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

Based on the user's instructions, should we accept this offer, reject it, or make a counter-offer?

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
        console.error('Error initializing seller agent:', error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Evaluate an offer using the agent. The agent executor is reused across calls.
   */
  async evaluateOffer(
    offer: VoteOffer,
    userInstructions: string
  ): Promise<VoteOfferResponse> {
    try {
      // Ensure agent is initialized
      await this.initialize();

      if (!this.agentExecutor) {
        throw new Error('Agent executor not initialized');
      }

      // Invoke the agent with the formatted input
      const response = await this.agentExecutor.invoke({
        userInstructions,
        title: offer.proposal.title,
        description: offer.proposal.description,
        desiredOutcome: offer.desiredOutcome,
        offeredAmount: offer.offeredAmount,
        options: offer.proposal.options.join(', '),
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
        accepted: result.accepted === true,
        reason: result.reason || 'No reason provided',
        counterOffer: result.counterOffer || undefined,
        rejectionReason: result.rejectionReason || undefined,
      };
    } catch (e) {
      console.error('Error evaluating offer with LLM agent:', e);
      return {
        accepted: false,
        rejectionReason: 'Unable to evaluate offer',
      };
    }
  }
}

/**
 * Legacy function for backward compatibility. Creates a new agent manager instance.
 * For better performance, use SellerAgentManager directly and reuse it.
 */
export async function evaluateOfferWithLLM(
  offer: VoteOffer,
  userInstructions: string,
  hederaAgentToolkit?: HederaLangchainToolkit
): Promise<VoteOfferResponse> {
  const manager = new SellerAgentManager(hederaAgentToolkit);
  return manager.evaluateOffer(offer, userInstructions);
}

