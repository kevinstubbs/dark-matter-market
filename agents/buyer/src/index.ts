import express from 'express';
import { AgentCard } from '@a2a-js/sdk';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { config } from 'dotenv';
import { BuyerExecutor } from './executor.js';
import { getBuyerConfig } from './preferences.js';

// Load environment variables (for ANTHROPIC_API_KEY, etc.)
config();

// Parse command line arguments
// Usage: node dist/index.js [config-file.json] [--port PORT]
const args = process.argv.slice(2);
let configPath: string | undefined;
let portOverride: number | undefined;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && i + 1 < args.length) {
    portOverride = parseInt(args[i + 1], 10);
    if (isNaN(portOverride)) {
      console.error(`Error: Invalid port number: ${args[i + 1]}`);
      process.exit(1);
    }
    i++; // Skip the port value
  } else if (!configPath && !args[i].startsWith('--')) {
    // First non-flag argument is the config path
    configPath = args[i];
  }
}

// Load buyer config from JSON file
// Config file can be specified via:
// 1. Command line arg: node dist/index.js configs/buyer_1.json
// 2. Environment variable: BUYER_CONFIG=configs/buyer_1.json
// 3. Default: buyer.json
let buyerConfig;
try {
  buyerConfig = getBuyerConfig(configPath);
} catch (error) {
  console.error('Error loading buyer config:', error);
  console.error('\nUsage: node dist/index.js [config-file.json] [--port PORT]');
  console.error('Example: node dist/index.js configs/buyer_1.json --port 4000');
  console.error('Or set BUYER_CONFIG environment variable');
  process.exit(1);
}

// Use port from command line if provided, otherwise from config, otherwise default to 4000
const PORT = portOverride ?? buyerConfig.port ?? 4000;

// Create agent card
const agentCard: AgentCard = {
  name: buyerConfig.name,
  version: '0.1.0',
  description: 'Agent that purchases votes for DMM proposals',
  defaultInputModes: ['streaming'],
  defaultOutputModes: ['streaming'],
  protocolVersion: '1.0',
  skills: [],
  url: `http://localhost:${PORT}`,
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
};

// Create executor (pass config path so it uses the same config)
const executor = new BuyerExecutor(configPath);
const taskStore = new InMemoryTaskStore();
const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);

// Create Express app and set up A2A routes
const app = express();
app.use(express.json());

const a2aApp = new A2AExpressApp(requestHandler);
a2aApp.setupRoutes(app);

// Start server
app.listen(PORT, () => {
  console.log(`Buyer Agent "${buyerConfig.name}" running on http://localhost:${PORT}`);
  console.log(`Agent card available at http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`Instructions: ${buyerConfig.instructions}`);
  if (buyerConfig.desiredOutcome) {
    console.log(`Desired outcome: ${buyerConfig.desiredOutcome}`);
  }
  console.log(`\nWaiting for sellers to connect...`);
  console.log(`(Buyer will send offers when sellers notify they're ready)\n`);
});

