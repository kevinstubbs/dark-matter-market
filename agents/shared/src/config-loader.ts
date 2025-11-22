import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { BuyerConfig, SellerConfig } from './config-types.js';

/**
 * Load buyer config from JSON file
 */
export function loadBuyerConfig(configPath?: string): BuyerConfig {
  // Priority: 1. explicit path, 2. command line arg, 3. env var, 4. default
  const configFile = configPath || process.argv[2] || process.env.BUYER_CONFIG || 'buyer.json';
  const fullPath = resolve(process.cwd(), configFile);
  
  if (!existsSync(fullPath)) {
    throw new Error(`Buyer config file not found: ${fullPath}`);
  }
  
  try {
    const content = readFileSync(fullPath, 'utf-8');
    const config = JSON.parse(content) as BuyerConfig;
    
    // Validate required fields
    if (!config.name || !config.port || !config.instructions) {
      throw new Error('Config must include: name, port, instructions');
    }
    
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file ${fullPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Load seller config from JSON file
 */
export function loadSellerConfig(configPath?: string): SellerConfig {
  // Priority: 1. explicit path, 2. env var, 3. default
  // Note: command line args are handled in index.ts
  const configFile = configPath || process.env.SELLER_CONFIG || 'seller.json';
  const fullPath = resolve(process.cwd(), configFile);
  
  if (!existsSync(fullPath)) {
    throw new Error(`Seller config file not found: ${fullPath}`);
  }
  
  try {
    const content = readFileSync(fullPath, 'utf-8');
    const config = JSON.parse(content) as SellerConfig;
    
    // Validate required fields
    if (!config.name || !config.port || !config.instructions) {
      throw new Error('Config must include: name, port, instructions');
    }
    
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file ${fullPath}: ${error.message}`);
    }
    throw error;
  }
}

