import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { BuyerConfig, SellerConfig } from './config-types.js';

// Cache for agent ID lookups
let agentIdCache: Map<number, string> | null = null;

/**
 * Get agent ID from port number by reading config files
 */
export function getAgentIdFromPort(port: number): string | null {
  if (!agentIdCache) {
    agentIdCache = new Map();
    
    // Try to find agents directory
    const possibleBasePaths = [
      resolve(process.cwd(), '../../agents'),
      resolve(process.cwd(), '../agents'),
      resolve(process.cwd(), 'agents'),
      resolve(process.cwd()),
    ];
    
    let agentsBasePath: string | null = null;
    for (const basePath of possibleBasePaths) {
      const testPath = join(basePath, 'buyer', 'configs', 'buyer_1.json');
      if (existsSync(testPath)) {
        agentsBasePath = basePath;
        break;
      }
    }
    
    if (agentsBasePath) {
      // Load buyer configs
      const buyerConfigsDir = join(agentsBasePath, 'buyer', 'configs');
      const buyerConfigFiles = ['buyer_1.json', 'buyer_2.json'];
      
      for (const file of buyerConfigFiles) {
        const configPath = join(buyerConfigsDir, file);
        if (existsSync(configPath)) {
          try {
            const content = readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content) as BuyerConfig;
            if (config.port && config.id) {
              agentIdCache.set(config.port, config.id);
            }
          } catch (e) {
            // Ignore errors
          }
        }
      }
      
      // Load seller configs
      const sellerConfigsDir = join(agentsBasePath, 'seller', 'configs');
      const sellerConfigFiles = ['seller_1.json', 'seller_2.json', 'seller_3.json', 'seller_4.json', 'seller_5.json'];
      
      for (const file of sellerConfigFiles) {
        const configPath = join(sellerConfigsDir, file);
        if (existsSync(configPath)) {
          try {
            const content = readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content) as SellerConfig;
            if (config.port && config.id) {
              agentIdCache.set(config.port, config.id);
            }
          } catch (e) {
            // Ignore errors
          }
        }
      }
    }
  }
  
  return agentIdCache.get(port) || null;
}

/**
 * Extract port from URL and get agent ID
 */
export function getAgentIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const port = parseInt(urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80'), 10);
    if (!isNaN(port)) {
      return getAgentIdFromPort(port);
    }
  } catch (e) {
    // Invalid URL
  }
  return null;
}

