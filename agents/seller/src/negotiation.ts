import { VoteOffer, VoteOfferResponse } from '@dmm/agents-shared';
import { evaluateOfferWithLLM } from './llm-evaluator.js';

export async function evaluateOffer(
  offer: VoteOffer,
  userInstructions: string
): Promise<VoteOfferResponse> {
  // Use LLM to evaluate the offer against user's instructions
  // The LLM will determine:
  // - Is this proposal allowed based on user's instructions?
  // - Is the price acceptable?
  // - Should we accept, reject, or counter-offer?
  return await evaluateOfferWithLLM(offer, userInstructions);
}

