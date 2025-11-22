import { loadContext, saveContext, AgentContext } from '@dmm/agents-shared';

export interface BuyerContext extends AgentContext {
  instructions: string; // Plain language instructions from buyer
  // e.g., "I want votes for proposals that increase liquidity"
  // e.g., "I'm against any proposal that reduces token emissions"
  // e.g., "Support DeFi improvements, oppose governance changes"
  // e.g., "Maximum 20 HBAR per vote, need 100 votes"
}

const BUYER_CONTEXT_FILE = 'buyer-context.txt';
const DEFAULT_BUYER_INSTRUCTIONS = 'I want votes for proposals that benefit the ecosystem';

export async function loadBuyerContext(): Promise<BuyerContext> {
  return loadContext(BUYER_CONTEXT_FILE, DEFAULT_BUYER_INSTRUCTIONS) as Promise<BuyerContext>;
}

export async function saveBuyerContext(context: BuyerContext): Promise<void> {
  return saveContext(BUYER_CONTEXT_FILE, context);
}

