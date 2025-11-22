import { loadBuyerConfig, BuyerConfig } from '@dmm/agents-shared';

export interface BuyerContext {
  instructions: string;
  desiredOutcome?: string;
  maxPrice?: string;
}

/**
 * Load buyer context from config file
 */
export async function loadBuyerContext(): Promise<BuyerContext> {
  const config = loadBuyerConfig();
  
  // Build instructions with desired outcome if specified
  let instructions = config.instructions;
  if (config.desiredOutcome) {
    instructions = `${instructions} I want votes for proposals where the outcome is "${config.desiredOutcome}".`;
  }
  if (config.maxPrice) {
    instructions = `${instructions} Maximum ${config.maxPrice} HBAR per vote.`;
  }
  
  return {
    instructions,
    desiredOutcome: config.desiredOutcome,
    maxPrice: config.maxPrice,
  };
}

/**
 * Get buyer config (for accessing port, name, etc.)
 */
export function getBuyerConfig(): BuyerConfig {
  return loadBuyerConfig();
}

