import { VoteOffer, VoteOfferResponse } from '@dmm/agents-shared';
import { SellerAgentManager } from './llm-evaluator.js';
import type { HederaLangchainToolkit } from 'hedera-agent-kit';

// Global agent manager instance (reused across all evaluations)
let globalAgentManager: SellerAgentManager | null = null;

export function initializeAgentManager(hederaAgentToolkit?: HederaLangchainToolkit): void {
  if (!globalAgentManager) {
    globalAgentManager = new SellerAgentManager(hederaAgentToolkit);
  }
}

export async function evaluateOffer(
  offer: VoteOffer,
  userInstructions: string
): Promise<VoteOfferResponse> {
  // Use LLM agent to evaluate the offer against user's instructions
  // The agent will determine:
  // - Is this proposal allowed based on user's instructions?
  // - Is the price acceptable?
  // - Should we accept, reject, or counter-offer?
  
  // Ensure agent manager is initialized
  if (!globalAgentManager) {
    // Fallback: create a new manager without Hedera tools
    globalAgentManager = new SellerAgentManager();
  }
  
  return await globalAgentManager.evaluateOffer(offer, userInstructions);
}

