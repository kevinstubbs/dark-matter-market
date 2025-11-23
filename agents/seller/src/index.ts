import express from 'express';
import { A2AClient } from '@a2a-js/sdk/client';
import { AgentCard } from '@a2a-js/sdk';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { RequestContext, ExecutionEventBus, AgentExecutor } from '@a2a-js/sdk/server';
import { config } from 'dotenv';
import { Client, PrivateKey, AccountBalanceQuery, AccountId } from '@hashgraph/sdk';
import { HederaLangchainToolkit, coreQueriesPlugin, coreConsensusPlugin } from 'hedera-agent-kit';
import { loadUserContext, UserContext, getSellerConfig } from './preferences.js';
import type { SellerConfig } from '@dmm/agents-shared';
import { handleIncomingMessage, handleCompetingOfferResponse, submitDelegationToHCSTopic } from './message-handler.js';
import { AgentLogger, getAgentIdFromUrl, getLocalnetTopicId } from '@dmm/agents-shared';
import { getHederaSecret } from '@dmm/agents-shared';
import { resolve } from 'path';
// Import negotiation lazily to avoid loading LLM in diagnose mode
// const { initializeAgentManager } = await import('./negotiation.js');

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

/**
 * Create a Hedera client configured for the appropriate network
 * Supports localhost, testnet, and mainnet based on HEDERA_NETWORK env var
 */
function createHederaClient(accountId: string, privateKey: PrivateKey): Client {
  const network = process.env.HEDERA_NETWORK || 'localhost';
  
  let client: Client;
  if (network === 'localhost' || network === 'localnet') {
    // // For localhost/localnet, create a custom client pointing to local nodes
    // // Localhost typically has nodes at 0.0.3, 0.0.4, 0.0.5, 0.0.6, etc.
    // client = Client.forNetwork({
    //   '127.0.0.1:50211': AccountId.fromString('0.0.3'),
    //   '127.0.0.1:50212': AccountId.fromString('0.0.4'),
    //   '127.0.0.1:50213': AccountId.fromString('0.0.5'),
    //   '127.0.0.1:50214': AccountId.fromString('0.0.6'),
    // });
    // // Set the mirror network for localhost
    // client.setMirrorNetwork(['127.0.0.1:5600']);
    client = Client.forLocalNode();
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

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let configPath: string | undefined;
  let diagnoseMode = false;
  
  // Check for --diagnose or -d flag
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--diagnose' || args[i] === '-d') {
      diagnoseMode = true;
    } else if (!args[i].startsWith('--') && !args[i].startsWith('-')) {
      // First non-flag argument is the config path
      if (!configPath) {
        configPath = args[i];
      }
    }
  }
  
  // Load seller config from JSON file
  // Config file can be specified via:
  // 1. Command line arg: node dist/index.js configs/seller_1.json
  // 2. Environment variable: SELLER_CONFIG=configs/seller_1.json
  // 3. Default: seller.json
  configPath = configPath || process.env.SELLER_CONFIG;
  let sellerConfig: SellerConfig;
  try {
    sellerConfig = configPath ? getSellerConfig(configPath) : getSellerConfig();
  } catch (error) {
    console.error('Error loading seller config:', error);
    console.error('\nUsage: node dist/index.js [config-file.json] [--diagnose|-d]');
    console.error('Example: node dist/index.js configs/seller_1.json');
    console.error('Example: node dist/index.js configs/seller_1.json --diagnose');
    console.error('Or set SELLER_CONFIG environment variable');
    process.exit(1);
  }
  
  // Create logger (website URL from env or default to localhost:3001)
  const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3001';
  globalLogger = new AgentLogger(sellerConfig.id, websiteUrl);
  
  // Clear previous messages on startup
  await globalLogger.clearMessages();
  
  if (diagnoseMode) {
    await globalLogger.log(`Running in DIAGNOSE mode for Seller Agent "${sellerConfig.name}"...`, 'agent-started');
    await globalLogger.log(`Only checking if Hedera Agent Toolkit can be loaded.`, 'info');
    
    // Only check Hedera Agent Toolkit initialization
    try {
      // Get the config file path to resolve the env file
      const configFile = configPath || process.env.SELLER_CONFIG || 'seller.json';
      const fullConfigPath = resolve(process.cwd(), configFile);
      
      await globalLogger.log(`Looking for Hedera secret in: ${sellerConfig.envFile}`, 'info');
      await globalLogger.log(`Full config path: ${fullConfigPath}`, 'info');
      
      // Load Hedera secret from env file
      const hederaSecret = getHederaSecret(sellerConfig.envFile, fullConfigPath);
      
      if (!hederaSecret) {
        await globalLogger.log(`FAILED: No Hedera secret found in ${sellerConfig.envFile}`, 'error');
        await globalLogger.log(`Expected file location: ${fullConfigPath}`, 'info');
        process.exit(1);
      } else {
        await globalLogger.log(`Hedera secret found`, 'info');
        
        // Validate and clean the secret key
        let secretKey: string;
        if (typeof hederaSecret !== 'string') {
          await globalLogger.log(`FAILED: Hedera secret is not a string (got ${typeof hederaSecret})`, 'error');
          process.exit(1);
        } else {
          secretKey = hederaSecret.trim();
          if (!secretKey) {
            await globalLogger.log(`FAILED: Hedera secret is empty`, 'error');
            process.exit(1);
          } else {
            await globalLogger.log(`Hedera secret is valid string format`, 'info');
          }
        }
        
        if (secretKey) {
          try {
            await globalLogger.log(`Attempting to create Hedera client...`, 'info');
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
          await globalLogger.log(`Using Hedera network: ${network}`, 'info');
          await globalLogger.log(`Private key format: ${secretKey.startsWith('302e0201') ? 'DER-encoded' : secretKey.startsWith('0x') ? 'Hex with 0x' : 'Hex'}, length: ${cleanSecretKey.length}`, 'info');
          const hederaClient = createHederaClient(sellerConfig.walletAddress, privateKey);
            
            await globalLogger.log(`Hedera client created successfully`, 'info');
            await globalLogger.log(`Wallet address: ${sellerConfig.walletAddress}`, 'info');
            
            await globalLogger.log(`Attempting to initialize Hedera Agent Toolkit...`, 'info');
            // Initialize Hedera AgentKit
            globalHederaAgentToolkit = new HederaLangchainToolkit({
              client: hederaClient,
              configuration: {
                plugins: [coreQueriesPlugin, coreConsensusPlugin]
              },
            });
            
            await globalLogger.log(`Hedera Agent Toolkit initialized successfully`, 'info');
            
            // Try to get tools to verify it's working
            const tools = globalHederaAgentToolkit.getTools();
            await globalLogger.log(`Hedera Agent Toolkit has ${tools.length} tools available`, 'info');
            
            // Test sending a message to HCS topic
            await globalLogger.log(`\nTesting HCS topic message submission...`, 'info');
            try {
              const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3001';
              await globalLogger.log(`Fetching topic ID from website...`, 'info');
              const topicId = await getLocalnetTopicId(websiteUrl);
              
              if (!topicId) {
                await globalLogger.log(`WARNING: No topic ID found from website. Skipping message submission test.`, 'error');
                await globalLogger.log(`\nDIAGNOSIS PASSED (partial): Hedera Agent Toolkit can be loaded, but topic ID not available for message test.`, 'agent-ready');
                process.exit(0);
              }
              
              await globalLogger.log(`Topic ID found: ${topicId}`, 'info');
              await globalLogger.log(`Attempting to submit test delegation message...`, 'info');
              
              // Submit a test delegation message (delegating to self)
              await submitDelegationToHCSTopic(
                globalHederaAgentToolkit,
                topicId,
                sellerConfig.walletAddress,
                globalLogger
              );
              
              await globalLogger.log(`Test message submitted successfully!`, 'info');
              await globalLogger.log(`\nDIAGNOSIS PASSED: Hedera Agent Toolkit can be loaded and can submit messages to HCS topic!`, 'agent-ready');
              process.exit(0);
            } catch (messageError) {
              await globalLogger.log(`FAILED: Error submitting test message to HCS topic`, 'error');
              await globalLogger.log(`Error: ${messageError instanceof Error ? messageError.message : String(messageError)}`, 'error');
              if (messageError instanceof Error && messageError.stack) {
                await globalLogger.log(`Stack: ${messageError.stack}`, 'error');
              }
              await globalLogger.log(`\nDIAGNOSIS PARTIAL: Hedera Agent Toolkit can be loaded, but message submission failed.`, 'agent-ready');
              process.exit(1);
            }
          } catch (keyError) {
            await globalLogger.log(`FAILED: Error creating Hedera client or toolkit`, 'error');
            await globalLogger.log(`Error: ${keyError instanceof Error ? keyError.message : String(keyError)}`, 'error');
            if (keyError instanceof Error && keyError.stack) {
              await globalLogger.log(`Stack: ${keyError.stack}`, 'error');
            }
            process.exit(1);
          }
        }
      }
    } catch (hederaError) {
      await globalLogger.log(`FAILED: Error during diagnosis`, 'error');
      await globalLogger.log(`Error: ${hederaError instanceof Error ? hederaError.message : String(hederaError)}`, 'error');
      if (hederaError instanceof Error && hederaError.stack) {
        await globalLogger.log(`Stack: ${hederaError.stack}`, 'error');
      }
      process.exit(1);
    }
  }
  
  // Normal mode - continue with full initialization
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
          // Remove 0x prefix if present (for hex-encoded keys)
          const cleanSecretKey = secretKey.startsWith('0x') ? secretKey.slice(2) : secretKey;
          
          // Initialize Hedera client (supports localhost, testnet, mainnet)
          const privateKey = PrivateKey.fromStringECDSA(cleanSecretKey);
          const hederaClient = createHederaClient(sellerConfig.walletAddress, privateKey);
      
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
          
          // Initialize the agent manager with Hedera tools (lazy import to avoid loading LLM in diagnose mode)
          const { initializeAgentManager } = await import('./negotiation.js');
          initializeAgentManager(globalHederaAgentToolkit);
        } catch (keyError) {
          await globalLogger.log(`Error creating Hedera private key: ${keyError instanceof Error ? keyError.message : String(keyError)}. Please check that HEDERA_SECRET in ${sellerConfig.envFile} is a valid hex-encoded private key.`, 'error');
        }
      } else {
        // Initialize agent manager without Hedera tools (lazy import to avoid loading LLM in diagnose mode)
        const { initializeAgentManager } = await import('./negotiation.js');
        initializeAgentManager();
      }
    }
  } catch (hederaError) {
    await globalLogger.log(`Error initializing Hedera: ${hederaError instanceof Error ? hederaError.message : String(hederaError)}`, 'error');
    // Initialize agent manager without Hedera tools as fallback
    const { initializeAgentManager } = await import('./negotiation.js');
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
    
    // Send delegation message on HCS when seller is ready
    await globalLogger!.log(`Checking if delegation is needed when seller is ready...`, 'info');
    
    if (globalHederaAgentToolkit) {
      await globalLogger!.log(`Hedera Agent Toolkit is available`, 'info');
      await globalLogger!.log(`Fetching topic ID from website...`, 'info');
      
      const topicId = await getLocalnetTopicId(websiteUrl);
      
      await globalLogger!.log(`Topic ID from website: ${topicId || 'not found'}`, 'info');
      
      if (topicId) {
        try {
          // Delegate to self (seller's wallet address) to signal readiness
          await globalLogger!.log(`Using topic ID: ${topicId} for delegation`, 'info');
          await globalLogger!.log(`Seller wallet address: ${sellerConfig.walletAddress}`, 'info');
          await globalLogger!.log(`Preparing to delegate to self (${sellerConfig.walletAddress}) on topic ${topicId}...`, 'info');
          await globalLogger!.log(`Sending delegation message to HCS topic ${topicId}...`, 'info');
          
          await submitDelegationToHCSTopic(
            globalHederaAgentToolkit,
            topicId,
            sellerConfig.walletAddress,
            globalLogger || undefined
          );
          
          await globalLogger!.log(`Successfully delegated to self (${sellerConfig.walletAddress}) on topic ${topicId}`, 'info');
        } catch (error) {
          await globalLogger!.error(
            `Failed to send delegation message on HCS: ${error instanceof Error ? error.message : String(error)}`
          );
          if (error instanceof Error && error.stack) {
            await globalLogger!.log(`Error stack: ${error.stack}`, 'error');
          }
          // Don't fail startup if delegation fails - log and continue
        }
        } else {
          await globalLogger!.log(`Topic ID not found from website, skipping delegation message`, 'info');
        }
    } else {
      await globalLogger!.log(`Hedera Agent Toolkit not available, skipping delegation message`, 'info');
    }
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
      
      // Send delegation message on HCS when seller is ready (before sending ready message to buyer)
      if (globalHederaAgentToolkit && globalLogger) {
        await globalLogger.log(`Fetching topic ID from website...`, 'info', buyerId);
        const topicId = await getLocalnetTopicId(websiteUrl);
        await globalLogger.log(`Topic ID from website: ${topicId || 'not found'}`, 'info', buyerId);
        
        if (topicId) {
          try {
            await globalLogger.log(`Sending delegation message to HCS topic ${topicId} before notifying buyer...`, 'info', buyerId);
            await globalLogger.log(`Delegating to self (${sellerConfig.walletAddress}) on topic ${topicId}`, 'info', buyerId);
            
            await submitDelegationToHCSTopic(
              globalHederaAgentToolkit,
              topicId,
              sellerConfig.walletAddress,
              globalLogger || undefined
            );
            
            await globalLogger.log(`Successfully delegated to self (${sellerConfig.walletAddress}) on topic ${topicId}`, 'info', buyerId);
          } catch (error) {
            await globalLogger.error(
              `Failed to send delegation message on HCS: ${error instanceof Error ? error.message : String(error)}`,
              buyerId
            );
            // Continue anyway - send ready message even if delegation fails
          }
        } else {
          await globalLogger.log(`Topic ID not found from website, skipping delegation before notifying buyer`, 'info', buyerId);
        }
      } else {
        if (globalLogger) {
          if (!globalHederaAgentToolkit) {
            await globalLogger.log(`Hedera Agent Toolkit not available, skipping delegation before notifying buyer`, 'info', buyerId);
          }
        }
      }
      
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

