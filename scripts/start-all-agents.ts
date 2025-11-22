#!/usr/bin/env node

import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';

interface AgentConfig {
  type: 'buyer' | 'seller';
  configFile: string;
  id: string;
}

const agents: AgentConfig[] = [
  { type: 'buyer', configFile: 'configs/buyer_1.json', id: 'buyer-1' },
  { type: 'buyer', configFile: 'configs/buyer_2.json', id: 'buyer-2' },
  { type: 'seller', configFile: 'configs/seller_1.json', id: 'seller-1' },
  { type: 'seller', configFile: 'configs/seller_2.json', id: 'seller-2' },
  { type: 'seller', configFile: 'configs/seller_3.json', id: 'seller-3' },
  { type: 'seller', configFile: 'configs/seller_4.json', id: 'seller-4' },
  { type: 'seller', configFile: 'configs/seller_5.json', id: 'seller-5' },
];

const processes: Map<string, ChildProcess> = new Map();

function spawnAgent(agent: AgentConfig): ChildProcess {
  const agentDir = resolve(process.cwd(), 'agents', agent.type);
  const configPath = resolve(agentDir, agent.configFile);
  
  console.log(`[${agent.id}] Starting ${agent.type} agent with config: ${agent.configFile}`);
  
  const child = spawn('node', ['dist/index.js', agent.configFile], {
    cwd: agentDir,
    stdio: 'inherit',
    shell: false,
  });

  child.on('error', (error) => {
    console.error(`[${agent.id}] Error spawning process:`, error);
  });

  child.on('exit', (code, signal) => {
    if (code !== null) {
      console.log(`[${agent.id}] Process exited with code ${code}`);
    } else if (signal) {
      console.log(`[${agent.id}] Process killed with signal ${signal}`);
    }
    processes.delete(agent.id);
  });

  return child;
}

// Spawn all agents
console.log('Starting all agents...\n');
agents.forEach(agent => {
  const process = spawnAgent(agent);
  processes.set(agent.id, process);
});

// Handle termination signals
function cleanup() {
  console.log('\n\nShutting down all agents...');
  
  const killPromises = Array.from(processes.entries()).map(([id, proc]) => {
    return new Promise<void>((resolve) => {
      console.log(`[${id}] Terminating...`);
      proc.kill('SIGTERM');
      
      // Force kill after 5 seconds if still running
      const timeout = setTimeout(() => {
        if (!proc.killed) {
          console.log(`[${id}] Force killing...`);
          proc.kill('SIGKILL');
        }
        resolve();
      }, 5000);
      
      proc.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  });
  
  Promise.all(killPromises).then(() => {
    console.log('All agents terminated.');
    process.exit(0);
  });
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanup();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  cleanup();
});

console.log('\nAll agents started. Press Ctrl+C to stop all agents.\n');

