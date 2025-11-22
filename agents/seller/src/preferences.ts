import { loadSellerConfig, SellerConfig } from '@dmm/agents-shared';

export interface UserContext {
  instructions: string;
  minPrice?: string;
}

/**
 * Load user context from config file
 */
export async function loadUserContext(): Promise<UserContext> {
  const config = loadSellerConfig();
  
  // Build instructions with minimum price if specified
  let instructions = config.instructions;
  if (config.minPrice) {
    instructions = `${instructions} Minimum ${config.minPrice} HBAR per vote.`;
  }
  
  return {
    instructions,
    minPrice: config.minPrice,
  };
}

/**
 * Get seller config (for accessing port, name, buyerUrls, etc.)
 */
export function getSellerConfig(configPath?: string): SellerConfig {
  return loadSellerConfig(configPath);
}

