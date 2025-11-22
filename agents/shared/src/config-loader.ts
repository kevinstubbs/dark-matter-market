import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { BuyerConfig, SellerConfig } from './config-types.js';

/**
 * Load environment variables from .env file
 */
function loadEnvFile(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  
  if (!existsSync(envPath)) {
    return env;
  }
  
  try {
    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          // Remove quotes if present
          env[key.trim()] = value.replace(/^["']|["']$/g, '');
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not load env file ${envPath}: ${error}`);
  }
  
  return env;
}

/**
 * Get Hedera secret from .env file specified in config
 * @param envFile - Path to .env file (relative to config file or absolute)
 * @param configFilePath - The path to the config JSON file (used to resolve relative paths)
 * @returns The Hedera secret key or null if not found
 */
export function getHederaSecret(envFile: string, configFilePath: string): string | null {
  // If envFile is absolute, use it directly; otherwise resolve relative to config file directory
  const envPath = envFile.startsWith('/') || envFile.match(/^[A-Z]:/i)
    ? envFile
    : resolve(dirname(configFilePath), envFile);
  const env = loadEnvFile(envPath);
  return env.HEDERA_SECRET || env.HEDERA_SECRET_KEY || null;
}

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
    if (!config.id || !config.name || !config.port || !config.instructions || !config.walletAddress || !config.envFile) {
      throw new Error('Config must include: id, name, port, instructions, walletAddress, envFile');
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
    if (!config.id || !config.name || !config.port || !config.instructions || !config.walletAddress || !config.envFile) {
      throw new Error('Config must include: id, name, port, instructions, walletAddress, envFile');
    }
    
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file ${fullPath}: ${error.message}`);
    }
    throw error;
  }
}

