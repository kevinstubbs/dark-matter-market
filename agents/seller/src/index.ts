import express from 'express';
import { A2AClient } from '@a2a-js/sdk/client';
import { AgentCard } from '@a2a-js/sdk';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { RequestContext, ExecutionEventBus, AgentExecutor } from '@a2a-js/sdk/server';
import { config } from 'dotenv';
import { Client, PrivateKey, AccountBalanceQuery } from '@hashgraph/sdk';
import { HederaLangchainToolkit, coreQueriesPlugin, coreConsensusPlugin } from 'hedera-agent-kit';
import { loadUserContext, UserContext, getSellerConfig } from './preferences.js';
import { handleIncomingMessage, handleCompetingOfferResponse } from './message-handler.js';
import { AgentLogger, getAgentIdFromUrl } from '@dmm/agents-shared';
import { getHederaSecret } from '@dmm/agents-shared';
import { resolve } from 'path';
import { initializeAgentManager } from './negotiation.js';

// Load environment variables
config();

// Store connections to multiple buyer agents (for sending messages)
const buyerClients: Map<string, A2AClient> = new Map();

// Store user context globally for use in executor
let globalUserContext: UserContext | null = null;

// Store logger globally for use in executor and message handler
let globalLogger: AgentLogger | null = null;

// Store Hedera agent toolkit globally for use in executor and message handler
let globalHederaAgentToolkit: HederaLangchainToolkit | undefined;


async function main() {
  // Load seller config from JSON file
  // Config file can be specified via:
  // 1. Command line arg: node dist/index.js configs/seller_1.json
  // 2. Environment variable: SELLER_CONFIG=configs/seller_1.json
  // 3. Default: seller.json
  const configPath = process.argv[2] || process.env.SELLER_CONFIG;
  let sellerConfig;
  try {
    sellerConfig = configPath ? getSellerConfig(configPath) : getSellerConfig();
  } catch (error) {
    console.error('Error loading seller config:', error);
    console.error('\nUsage: node dist/index.js <config-file.json>');
    console.error('Example: node dist/index.js configs/seller_1.json');
    console.error('Or set SELLER_CONFIG environment variable');
    process.exit(1);
  }
  
  // Create logger (website URL from env or default to localhost:3000)
  const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
  globalLogger = new AgentLogger(sellerConfig.id, websiteUrl);
  
  // Clear previous messages on startup
  await globalLogger.clearMessages();
  await globalLogger.log(`Starting Seller Agent "${sellerConfig.name}"...`, 'agent-started');
  
  // Load user's plain language instructions
  globalUserContext = await loadUserContext(configPath);
  await globalLogger.log(`Seller Agent "${sellerConfig.name}"`, 'agent-ready');
  await globalLogger.log(`Instructions: ${globalUserContext.instructions}`, 'info');
  
  // Initialize Hedera client and check balance
  let sellerBalance: string | undefined;
  try {
    // Get the config file path to resolve the env file (same logic as config loader)
    const configFile = configPath || process.env.SELLER_CONFIG || 'seller.json';
    const fullConfigPath = resolve(process.cwd(), configFile);
    
    // Load Hedera secret from env file
    const hederaSecret = getHederaSecret(sellerConfig.envFile, fullConfigPath);
    
    if (!hederaSecret) {
      await globalLogger.log(`Warning: No Hedera secret found in ${sellerConfig.envFile}. Hedera features will be unavailable.`, 'error');
    } else {
      // Validate and clean the secret key
      let secretKey: string;
      if (typeof hederaSecret !== 'string') {
        await globalLogger.log(`Error: Hedera secret is not a string (got ${typeof hederaSecret}). Hedera features will be unavailable.`, 'error');
        secretKey = '';
      } else {
        secretKey = hederaSecret.trim();
        if (!secretKey) {
          await globalLogger.log(`Error: Hedera secret is empty. Hedera features will be unavailable.`, 'error');
        }
      }
      
      if (secretKey) {
        try {
          // Initialize Hedera client (Testnet by default)
          const hederaClient = Client.forTestnet().setOperator(
            sellerConfig.walletAddress,
            PrivateKey.fromStringECDSA(secretKey),
          );
      
          // Log wallet ID
          await globalLogger.log(`Hedera Wallet ID: ${sellerConfig.walletAddress}`, 'info');
          
          // Check balance using AccountBalanceQuery
          try {
            const balanceQuery = new AccountBalanceQuery()
              .setAccountId(sellerConfig.walletAddress);
            const balance = await balanceQuery.execute(hederaClient);
            sellerBalance = balance.hbars.toString();
            await globalLogger.log(`Hedera Balance: ${sellerBalance} HBAR`, 'info');
          } catch (balanceError) {
            await globalLogger.log(`Failed to query balance: ${balanceError instanceof Error ? balanceError.message : String(balanceError)}`, 'error');
          }
          
          // Initialize Hedera AgentKit for use with Langchain agent
          globalHederaAgentToolkit = new HederaLangchainToolkit({
            client: hederaClient,
            configuration: {
              plugins: [coreQueriesPlugin, coreConsensusPlugin]
            },
          });
          
          await globalLogger.log(`Hedera AgentKit initialized successfully`, 'info');
          
          // Initialize the agent manager with Hedera tools
          initializeAgentManager(globalHederaAgentToolkit);
        } catch (keyError) {
          await globalLogger.log(`Error creating Hedera private key: ${keyError instanceof Error ? keyError.message : String(keyError)}. Please check that HEDERA_SECRET in ${sellerConfig.envFile} is a valid hex-encoded private key.`, 'error');
        }
      } else {
        // Initialize agent manager without Hedera tools
        initializeAgentManager();
      }
    }
  } catch (hederaError) {
    await globalLogger.log(`Error initializing Hedera: ${hederaError instanceof Error ? hederaError.message : String(hederaError)}`, 'error');
    // Initialize agent manager without Hedera tools as fallback
    initializeAgentManager();
  }
  
  // Agent manager will be initialized by initializeAgentManager() calls above
  
  // Set up A2A server to receive messages from buyers
  const PORT = sellerConfig.port;
  const agentCard: AgentCard = {
    name: sellerConfig.name,
    version: '0.1.0',
    description: 'Agent that sells voting power for DMM proposals',
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
  
  const executor = new SellerExecutor();
  const taskStore = new InMemoryTaskStore();
  const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);
  
  // Create Express app and set up A2A routes
  const app = express();
  app.use(express.json());
  
  const a2aApp = new A2AExpressApp(requestHandler);
  a2aApp.setupRoutes(app);
  
  // Start server
  const server = app.listen(PORT, async () => {
    await globalLogger!.log(`Seller agent server running on http://localhost:${PORT}`, 'agent-ready');
    await globalLogger!.log(`Agent card: http://localhost:${PORT}/.well-known/agent-card.json`, 'info');
  });
  
  // Connect to buyer agents (for sending responses)
  // Use buyerUrls from config, or fall back to environment variable, or default
  const buyerUrls = sellerConfig.buyerUrls || 
                    (process.env.BUYER_AGENT_URLS ? process.env.BUYER_AGENT_URLS.split(',').map(url => url.trim()) : 
                    ['http://localhost:4000']);
  const RETRY_INTERVAL = 5000; // 5 seconds
  const MAX_RETRIES = Infinity; // Retry indefinitely
  
  // Function to connect to a buyer with retry logic
  async function connectToBuyer(url: string, retryCount: number = 0): Promise<void> {
    const buyerId = getAgentIdFromUrl(url) || url;
    
    try {
      await globalLogger!.log(`Connecting to buyer agent at ${url} (${buyerId})...`, 'info', buyerId);
      const client = await A2AClient.fromCardUrl(`${url}/.well-known/agent-card.json`);
      buyerClients.set(buyerId, client);
      await globalLogger!.log(`Connected to buyer agent ${buyerId} at ${url}`, 'connection-established', buyerId);
      
      // Send a "ready" message to trigger the buyer to send an offer
      try {
        const { v4: uuidv4 } = await import('uuid');
        const readyMessage = {
          messageId: uuidv4(),
          role: 'user' as const,
          parts: [
            {
              kind: 'text' as const,
              text: JSON.stringify({
                type: 'seller-ready',
                sellerUrl: `http://localhost:${PORT}`,
                balance: sellerBalance || 'unknown',
                message: 'Seller agent ready to receive vote purchase offers',
              }),
            },
          ],
          kind: 'message' as const,
        };
        
        await client.sendMessage({ message: readyMessage });
        await globalLogger!.log(`Notified buyer ${buyerId} that seller is ready`, 'seller-ready', buyerId, true);
      } catch (error) {
        await globalLogger!.error(`Failed to send ready message to ${buyerId}: ${error instanceof Error ? error.message : String(error)}`, buyerId);
        // Continue anyway - buyer can still send offers
      }
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        await globalLogger!.log(`Buyer counterpart didn't answer at ${url} (attempt ${retryCount + 1})`, 'connection-failed');
        await globalLogger!.log(`Retrying in ${RETRY_INTERVAL / 1000} seconds...`, 'info');
        
        // Retry after interval
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
        return connectToBuyer(url, retryCount + 1);
      } else {
        await globalLogger!.error(`Buyer counterpart didn't answer at ${url} after ${retryCount} attempts`);
        await globalLogger!.log(`Buyer can still send messages to seller server at http://localhost:${PORT}`, 'info');
      }
    }
  }
  
  // Start connection attempts for all buyers (in parallel, with retries)
  const connectionPromises = buyerUrls.map((url: string) => connectToBuyer(url));
  
  // Don't wait for connections - let them retry in background
  Promise.all(connectionPromises).catch(async (error) => {
    await globalLogger!.error(`Error in buyer connection attempts: ${error instanceof Error ? error.message : String(error)}`);
  });
  
  await globalLogger!.log(`Seller agent "${sellerConfig.name}" ready!`, 'agent-ready');
  await globalLogger!.log(`Listening for vote purchase offers on port ${PORT}`, 'info');
  await globalLogger!.log(`Attempting to connect to ${buyerUrls.length} buyer agent(s)...`, 'info');
  await globalLogger!.log(`(Will retry every ${RETRY_INTERVAL / 1000} seconds if connection fails)`, 'info');
  await globalLogger!.log('Waiting for offers... (Press Ctrl+C to stop)', 'info');
  
  // Set up signal handlers for graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGTERM', () => {
    console.log('\n\nReceived SIGTERM, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  // Keep process alive - server handles incoming requests
  // Negotiations will continue even if one fails
}

/**
 * Seller Executor - handles incoming messages from buyers
 */
class SellerExecutor implements AgentExecutor {
  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage, task } = requestContext;
    
    if (!globalUserContext) {
      if (globalLogger) await globalLogger.error('User context not loaded');
      return;
    }
    
    // Check if this is a competing offer response
    const textPart = userMessage.parts.find((p: any) => p.kind === 'text');
    const messageText = textPart && 'text' in textPart ? textPart.text : '';
    
    try {
      const messageData = JSON.parse(messageText);
      
      // Handle buyer-ready message (response to seller-ready)
      if (messageData.type === 'buyer-ready') {
        const buyerId = getAgentIdFromUrl(messageData.buyerUrl) || 'unknown';
        const buyerBalance = messageData.balance;
        
        if (globalLogger) {
          await globalLogger.log(`Received buyer-ready message from ${messageData.buyerUrl} (${buyerId})`, 'buyer-ready', buyerId);
          if (buyerBalance) {
            await globalLogger.log(`Buyer balance: ${buyerBalance} HBAR`, 'info', buyerId);
          }
        }
        
        eventBus.publish({
          kind: 'task-status-update',
          taskId,
          status: { state: 'completed', timestamp: new Date().toISOString() },
          final: true,
        } as any);
        eventBus.finished();
        return;
      }
      
      if (messageData.type === 'competing-offer-response') {
        // Find which buyer sent this (for now, try to match by checking all buyers)
        // In production, this would come from message metadata
        let buyerId = 'unknown';
        for (const [id] of buyerClients.entries()) {
          buyerId = id;
          break; // For MVP, use first buyer
        }
        
        if (buyerId !== 'unknown') {
          await handleCompetingOfferResponse(buyerId, userMessage);
        }
        
        eventBus.publish({
          kind: 'task-status-update',
          taskId,
          status: { state: 'completed', timestamp: new Date().toISOString() },
          final: true,
        } as any);
        eventBus.finished();
        return;
      }
    } catch (e) {
      // Not a known message type, continue with normal handling
    }
    
    // Extract buyer ID - for MVP, use first connected buyer
    // In production, this would come from message metadata or task context
    const buyerId = Array.from(buyerClients.keys())[0] || 'unknown';
    const client = buyerClients.get(buyerId);
    
    if (!client) {
      if (globalLogger) await globalLogger.error(`No client found for buyer ${buyerId}`);
      return;
    }
    
    // Handle the incoming message (pass all buyer clients for auction mechanism)
    await handleIncomingMessage(buyerId, client, userMessage, task, globalUserContext, buyerClients, globalLogger!, globalHederaAgentToolkit);
    
    // Mark task as completed
    eventBus.publish({
      kind: 'task-status-update',
      taskId,
      status: { state: 'completed', timestamp: new Date().toISOString() },
      final: true,
    } as any);
    
    eventBus.finished();
  }
  
  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    // MVP: no-op
  }
}

// Export for use in other modules
export { main };

// Run main if this file is executed directly
// Check if we're running as the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('index.js') ||
                     process.argv[1]?.endsWith('index.ts');

if (isMainModule || process.env.RUN_SELLER === 'true') {
  main().catch(console.error);
}

