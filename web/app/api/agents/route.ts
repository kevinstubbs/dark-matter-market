import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

export interface AgentInfo {
  id: string;
  name: string;
  type: 'buyer' | 'seller';
  port: number;
  walletAddress?: string;
}

export async function GET() {
  try {
    const agents: AgentInfo[] = [];
    
    // Find all buyer configs
    // Try multiple possible paths (development vs production)
    const possibleBasePaths = [
      resolve(process.cwd(), '../../agents'),
      resolve(process.cwd(), '../agents'),
      resolve(process.cwd(), 'agents'),
    ];
    
    let agentsBasePath: string | null = null;
    for (const basePath of possibleBasePaths) {
      const testPath = join(basePath, 'buyer', 'configs', 'buyer_1.json');
      if (existsSync(testPath)) {
        agentsBasePath = basePath;
        break;
      }
    }
    
    if (!agentsBasePath) {
      return NextResponse.json(
        { error: 'Could not find agents directory' },
        { status: 500 }
      );
    }
    
    const buyerConfigsDir = join(agentsBasePath, 'buyer', 'configs');
    const buyerConfigFiles = ['buyer_1.json', 'buyer_2.json'];
    
    for (const file of buyerConfigFiles) {
      const configPath = join(buyerConfigsDir, file);
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, 'utf-8');
          const config = JSON.parse(content);
          if (config.id && config.name && config.port) {
            agents.push({
              id: config.id,
              name: config.name,
              type: 'buyer',
              port: config.port,
              walletAddress: config.walletAddress,
            });
          }
        } catch (e) {
          console.error(`Error reading buyer config ${file}:`, e);
        }
      }
    }
    
    // Find all seller configs
    const sellerConfigsDir = join(agentsBasePath, 'seller', 'configs');
    const sellerConfigFiles = ['seller_1.json', 'seller_2.json', 'seller_3.json', 'seller_4.json', 'seller_5.json'];
    
    for (const file of sellerConfigFiles) {
      const configPath = join(sellerConfigsDir, file);
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, 'utf-8');
          const config = JSON.parse(content);
          if (config.id && config.name && config.port) {
            agents.push({
              id: config.id,
              name: config.name,
              type: 'seller',
              port: config.port,
              walletAddress: config.walletAddress,
            });
          }
        } catch (e) {
          console.error(`Error reading seller config ${file}:`, e);
        }
      }
    }
    
    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Error loading agent configs:', error);
    return NextResponse.json(
      { error: 'Failed to load agent configs' },
      { status: 500 }
    );
  }
}
