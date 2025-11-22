import express from 'express';
import { AgentCard } from '@a2a-js/sdk';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { config } from 'dotenv';
import { BuyerExecutor } from './executor.js';

// Load environment variables
config();

const PORT = process.env.PORT || 4000;

// Create agent card
const agentCard: AgentCard = {
  name: 'Vote Buyer Agent',
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
  console.log(`Buyer Agent running on http://localhost:${PORT}`);
  console.log(`Agent card available at http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`\nWaiting for sellers to connect...`);
  console.log(`(Buyer will send offers when sellers notify they're ready)\n`);
});

