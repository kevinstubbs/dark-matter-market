import express from 'express';
import { AgentCard } from '@a2a-js/sdk';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { config } from 'dotenv';
import { Client, PrivateKey, AccountBalanceQuery } from '@hashgraph/sdk';
import { HederaLangchainToolkit, coreQueriesPlugin, coreConsensusPlugin } from 'hedera-agent-kit';
import { BuyerExecutor } from './executor.js';
import { getBuyerConfig } from './preferences.js';
import { AgentLogger, getHederaSecret } from '@dmm/agents-shared';
import { resolve } from 'path';
import { ensureVoteCast } from './vote-handler.js';

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

// Create logger (website URL from env or default to localhost:3000)
const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
const logger = new AgentLogger(buyerConfig.id, websiteUrl);

// Clear previous messages on startup
await logger.clearMessages();
await logger.log(`Buyer Agent "${buyerConfig.name}" starting...`, 'agent-started');

// Initialize Hedera client and check balance
let hederaAgentToolkit: HederaLangchainToolkit | undefined;
let buyerBalance: string | undefined;
try {
  // Get the config file path to resolve the env file (same logic as config loader)
  const configFile = configPath || process.env.BUYER_CONFIG || 'buyer.json';
  const fullConfigPath = resolve(process.cwd(), configFile);
  
  // Load Hedera secret from env file
  const hederaSecret = getHederaSecret(buyerConfig.envFile, fullConfigPath);
  
  if (!hederaSecret) {
    await logger.log(`Warning: No Hedera secret found in ${buyerConfig.envFile}. Hedera features will be unavailable.`, 'error');
  } else {
    // Validate and clean the secret key
    let secretKey: string;
    if (typeof hederaSecret !== 'string') {
      await logger.log(`Error: Hedera secret is not a string (got ${typeof hederaSecret}). Hedera features will be unavailable.`, 'error');
      secretKey = '';
    } else {
      secretKey = hederaSecret.trim();
      if (!secretKey) {
        await logger.log(`Error: Hedera secret is empty. Hedera features will be unavailable.`, 'error');
      }
    }
    
    if (secretKey) {
      try {
        // Initialize Hedera client (Testnet by default)
        const hederaClient = Client.forTestnet().setOperator(
          buyerConfig.walletAddress,
          PrivateKey.fromStringECDSA(secretKey),
        );
    
        // Log wallet ID
        await logger.log(`Hedera Wallet ID: ${buyerConfig.walletAddress}`, 'info');
        
        // Check balance using AccountBalanceQuery
        try {
          const balanceQuery = new AccountBalanceQuery()
            .setAccountId(buyerConfig.walletAddress);
          const balance = await balanceQuery.execute(hederaClient);
          buyerBalance = balance.hbars.toString();
          await logger.log(`Hedera Balance: ${buyerBalance} HBAR`, 'info');
        } catch (balanceError) {
          await logger.log(`Failed to query balance: ${balanceError instanceof Error ? balanceError.message : String(balanceError)}`, 'error');
        }
        
        // Initialize Hedera AgentKit for use with Langchain agent
        hederaAgentToolkit = new HederaLangchainToolkit({
          client: hederaClient,
          configuration: {
            plugins: [coreQueriesPlugin, coreConsensusPlugin]
          },
        });
        
        await logger.log(`Hedera AgentKit initialized successfully`, 'info');
        
        // Check if buyer needs to cast a vote at startup
        // Get topic ID and proposal sequence number from environment or config
        const topicId = process.env.DMM_TOPIC_ID || buyerConfig.topicId;
        const proposalSequenceNumber = process.env.PROPOSAL_SEQUENCE_NUMBER 
          ? parseInt(process.env.PROPOSAL_SEQUENCE_NUMBER, 10) 
          : buyerConfig.proposalSequenceNumber;
        
        if (topicId && proposalSequenceNumber && buyerConfig.desiredOutcome) {
          try {
            await logger.log(`Checking if vote needs to be cast for proposal ${proposalSequenceNumber}...`, 'info');
            const voteCast = await ensureVoteCast(
              hederaAgentToolkit,
              topicId,
              proposalSequenceNumber,
              buyerConfig.walletAddress,
              buyerConfig.desiredOutcome,
              logger
            );
            if (voteCast) {
              await logger.log(`Vote successfully cast at startup`, 'vote-cast');
            }
          } catch (voteError) {
            await logger.error(
              `Failed to check/cast vote at startup: ${voteError instanceof Error ? voteError.message : String(voteError)}`
            );
            // Don't fail startup if vote check fails - log and continue
          }
        } else {
          if (!topicId) {
            await logger.log(`DMM_TOPIC_ID not set, skipping vote check`, 'info');
          }
          if (!proposalSequenceNumber) {
            await logger.log(`PROPOSAL_SEQUENCE_NUMBER not set, skipping vote check`, 'info');
          }
          if (!buyerConfig.desiredOutcome) {
            await logger.log(`No desiredOutcome in config, skipping vote check`, 'info');
          }
        }
      } catch (keyError) {
        await logger.log(`Error creating Hedera private key: ${keyError instanceof Error ? keyError.message : String(keyError)}. Please check that HEDERA_SECRET in ${buyerConfig.envFile} is a valid hex-encoded private key.`, 'error');
      }
    }
  }
} catch (hederaError) {
  await logger.log(`Error initializing Hedera: ${hederaError instanceof Error ? hederaError.message : String(hederaError)}`, 'error');
}

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

// Create executor (pass config path, logger, Hedera toolkit, balance, and buyer URL)
const buyerUrl = `http://localhost:${PORT}`;
const executor = new BuyerExecutor(configPath, logger, hederaAgentToolkit, buyerBalance, buyerUrl);
const taskStore = new InMemoryTaskStore();
const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);

// Create Express app and set up A2A routes
const app = express();
app.use(express.json());

const a2aApp = new A2AExpressApp(requestHandler);
a2aApp.setupRoutes(app);

// Start server
app.listen(PORT, async () => {
  await logger.log(`Buyer Agent "${buyerConfig.name}" running on http://localhost:${PORT}`, 'agent-ready');
  await logger.log(`Agent card available at http://localhost:${PORT}/.well-known/agent-card.json`, 'info');
  await logger.log(`Instructions: ${buyerConfig.instructions}`, 'info');
  if (buyerConfig.desiredOutcome) {
    await logger.log(`Desired outcome: ${buyerConfig.desiredOutcome}`, 'info');
  }
  await logger.log(`Waiting for sellers to connect...`, 'info');
  await logger.log(`(Buyer will send offers when sellers notify they're ready)`, 'info');
});

