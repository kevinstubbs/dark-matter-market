import express from 'express';
import { AgentCard } from '@a2a-js/sdk';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { config } from 'dotenv';
import { Client, PrivateKey, AccountBalanceQuery, AccountId } from '@hashgraph/sdk';
import { HederaLangchainToolkit, coreQueriesPlugin, coreConsensusPlugin } from 'hedera-agent-kit';
import { BuyerExecutor } from './executor.js';
import { getBuyerConfig } from './preferences.js';
import type { BuyerConfig } from '@dmm/agents-shared';
import { AgentLogger, getHederaSecret, getLocalnetTopicId } from '@dmm/agents-shared';
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
let buyerConfig: BuyerConfig;
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

// Create logger (website URL from env or default to localhost:3001)
const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3001';
const logger = new AgentLogger(buyerConfig.id, websiteUrl);

/**
 * Create a Hedera client configured for the appropriate network
 * Supports localhost, testnet, and mainnet based on HEDERA_NETWORK env var
 */
function createHederaClient(accountId: string, privateKey: PrivateKey): Client {
  const network = process.env.HEDERA_NETWORK || 'localhost';
  
  let client: Client;
  if (network === 'localhost' || network === 'localnet') {
    // For localhost/localnet, create a custom client pointing to local nodes
    // Localhost typically has nodes at 0.0.3, 0.0.4, 0.0.5, 0.0.6, etc.
    client = Client.forNetwork({
      '127.0.0.1:50211': AccountId.fromString('0.0.3'),
      '127.0.0.1:50212': AccountId.fromString('0.0.4'),
      '127.0.0.1:50213': AccountId.fromString('0.0.5'),
      '127.0.0.1:50214': AccountId.fromString('0.0.6'),
    });
    // Set the mirror network for localhost
    client.setMirrorNetwork(['127.0.0.1:5600']);
    // Increase timeout for localhost deployments
    client.setRequestTimeout(120000); // 2 minutes
  } else if (network === 'testnet') {
    client = Client.forTestnet();
    client.setRequestTimeout(60000); // 1 minute
  } else {
    client = Client.forMainnet();
    client.setRequestTimeout(60000); // 1 minute
  }
  
  // Set the operator (account and private key)
  client.setOperator(accountId, privateKey);
  
  return client;
}

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
    await logger.log(`Looking for secret in: ${fullConfigPath}`, 'info');
  } else {
    await logger.log(`Hedera secret found in ${buyerConfig.envFile}`, 'info');
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
        // Handle different private key formats:
        // 1. DER-encoded (starts with 302e0201...) - use as-is
        // 2. Hex with 0x prefix - remove 0x
        // 3. Hex without prefix - use as-is
        let cleanSecretKey = secretKey;
        if (secretKey.startsWith('0x')) {
          cleanSecretKey = secretKey.slice(2);
        }
        
        // Initialize Hedera client (supports localhost, testnet, mainnet)
        const privateKey = PrivateKey.fromStringECDSA(cleanSecretKey);
        const network = process.env.HEDERA_NETWORK || 'localhost';
        await logger.log(`Using Hedera network: ${network}`, 'info');
        await logger.log(`Private key format: ${secretKey.startsWith('302e0201') ? 'DER-encoded' : secretKey.startsWith('0x') ? 'Hex with 0x' : 'Hex'}, length: ${cleanSecretKey.length}`, 'info');
        const hederaClient = createHederaClient(buyerConfig.walletAddress, privateKey);
    
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
        // The client is already configured with .setOperator() which enables autonomous execution
        // Transactions will execute automatically using the operator account (buyerConfig.walletAddress)
        hederaAgentToolkit = new HederaLangchainToolkit({
          client: hederaClient,
          configuration: {
            plugins: [coreQueriesPlugin, coreConsensusPlugin]
          },
        });
        
        await logger.log(`Hedera AgentKit initialized successfully`, 'info');
        await logger.log(`hederaAgentToolkit variable is: ${hederaAgentToolkit ? 'set' : 'undefined'}`, 'info');
        
        // Check if buyer needs to cast a vote at startup
        // Get topic ID from website and proposal sequence number from environment or config
        await logger.log(`Fetching topic ID from website...`, 'info');
        const topicId = await getLocalnetTopicId(websiteUrl);
        await logger.log(`Topic ID from website: ${topicId || 'not found'}`, 'info');
        
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
              await logger.log(`Vote successfully cast at startup`, 'info');
            }
          } catch (voteError) {
            await logger.error(
              `Failed to check/cast vote at startup: ${voteError instanceof Error ? voteError.message : String(voteError)}`
            );
            // Don't fail startup if vote check fails - log and continue
          }
        } else {
          if (!topicId) {
            await logger.log(`Topic ID not found from website, skipping vote check`, 'info');
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
        await logger.log(`hederaAgentToolkit after keyError: ${hederaAgentToolkit ? 'set' : 'undefined'}`, 'info');
      }
    } else {
      await logger.log(`Secret key is empty, hederaAgentToolkit will remain undefined`, 'info');
    }
  }
} catch (hederaError) {
  await logger.log(`Error initializing Hedera: ${hederaError instanceof Error ? hederaError.message : String(hederaError)}`, 'error');
  await logger.log(`hederaAgentToolkit after hederaError: ${hederaAgentToolkit ? 'set' : 'undefined'}`, 'info');
}

// Log final status before creating executor
await logger.log(`Final hederaAgentToolkit status before creating executor: ${hederaAgentToolkit ? 'available' : 'undefined'}`, 'info');

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
await logger.log(`Creating BuyerExecutor with hederaAgentToolkit: ${hederaAgentToolkit ? 'available' : 'undefined'}`, 'info');
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

