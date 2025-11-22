import { VoteOffer, VoteOfferResponse } from '@dmm/agents-shared';
import { evaluateOfferWithLLM } from '../../seller/src/llm-evaluator.js';

export class SellerAgent {
  constructor(private userContext: string) {}

  async evaluateOffer(offer: VoteOffer): Promise<VoteOfferResponse> {
    // Use the actual LLM evaluator from seller agent
    return await evaluateOfferWithLLM(offer, this.userContext);
  }
}

