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

// Load buyer config from JSON file
// Config file can be specified via:
// 1. Command line arg: node dist/index.js buyer_1.json
// 2. Environment variable: BUYER_CONFIG=buyer_1.json
// 3. Default: buyer.json
let buyerConfig;
try {
  buyerConfig = getBuyerConfig();
} catch (error) {
  console.error('Error loading buyer config:', error);
  console.error('\nUsage: node dist/index.js [config-file.json]');
  console.error('Or set BUYER_CONFIG environment variable');
  process.exit(1);
}

const PORT = buyerConfig.port;

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

// Create executor
const executor = new BuyerExecutor();
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

