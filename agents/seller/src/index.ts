import express from 'express';
import { A2AClient } from '@a2a-js/sdk/client';
import { AgentCard } from '@a2a-js/sdk';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { RequestContext, ExecutionEventBus, AgentExecutor } from '@a2a-js/sdk/server';
import { config } from 'dotenv';
import { loadUserContext, UserContext, getSellerConfig } from './preferences.js';
import { handleIncomingMessage, handleCompetingOfferResponse } from './message-handler.js';

// Load environment variables
config();

// Store connections to multiple buyer agents (for sending messages)
const buyerClients: Map<string, A2AClient> = new Map();

// Store user context globally for use in executor
let globalUserContext: UserContext | null = null;

async function main() {
  console.log('Starting Seller Agent...\n');
  
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
  
  // Load user's plain language instructions
  globalUserContext = await loadUserContext(configPath);
  console.log(`Seller Agent "${sellerConfig.name}"`);
  console.log('Instructions:', globalUserContext.instructions);
  console.log('');
  
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
  const server = app.listen(PORT, () => {
    console.log(`✓ Seller agent server running on http://localhost:${PORT}`);
    console.log(`  Agent card: http://localhost:${PORT}/.well-known/agent-card.json\n`);
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
    const buyerId = url;
    
    try {
      console.log(`Connecting to buyer agent at ${url}...`);
      const client = await A2AClient.fromCardUrl(`${url}/.well-known/agent-card.json`);
      buyerClients.set(buyerId, client);
      console.log(`✓ Connected to buyer agent at ${url}`);
      
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
                message: 'Seller agent ready to receive vote purchase offers',
              }),
            },
          ],
          kind: 'message' as const,
        };
        
        await client.sendMessage({ message: readyMessage });
        console.log(`  → Notified buyer that seller is ready`);
      } catch (error) {
        console.error(`  ⚠ Failed to send ready message:`, error);
        // Continue anyway - buyer can still send offers
      }
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        console.error(`✗ Buyer counterpart didn't answer at ${url} (attempt ${retryCount + 1})`);
        console.log(`  Retrying in ${RETRY_INTERVAL / 1000} seconds...`);
        
        // Retry after interval
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
        return connectToBuyer(url, retryCount + 1);
      } else {
        console.error(`✗ Buyer counterpart didn't answer at ${url} after ${retryCount} attempts`);
        console.error(`  Buyer can still send messages to seller server at http://localhost:${PORT}`);
      }
    }
  }
  
  // Start connection attempts for all buyers (in parallel, with retries)
  const connectionPromises = buyerUrls.map((url: string) => connectToBuyer(url));
  
  // Don't wait for connections - let them retry in background
  Promise.all(connectionPromises).catch((error) => {
    console.error('Error in buyer connection attempts:', error);
  });
  
  console.log(`\n✓ Seller agent "${sellerConfig.name}" ready!`);
  console.log(`  Listening for vote purchase offers on port ${PORT}`);
  console.log(`  Attempting to connect to ${buyerUrls.length} buyer agent(s)...`);
  console.log(`  (Will retry every ${RETRY_INTERVAL / 1000} seconds if connection fails)\n`);
  console.log('Waiting for offers... (Press Ctrl+C to stop)\n');
  
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
      console.error('User context not loaded');
      return;
    }
    
    // Check if this is a competing offer response
    const textPart = userMessage.parts.find((p: any) => p.kind === 'text');
    const messageText = textPart && 'text' in textPart ? textPart.text : '';
    
    try {
      const messageData = JSON.parse(messageText);
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
      // Not a competing offer response, continue with normal handling
    }
    
    // Extract buyer ID - for MVP, use first connected buyer
    // In production, this would come from message metadata or task context
    const buyerId = Array.from(buyerClients.keys())[0] || 'unknown';
    const client = buyerClients.get(buyerId);
    
    if (!client) {
      console.error(`No client found for buyer ${buyerId}`);
      return;
    }
    
    // Handle the incoming message (pass all buyer clients for auction mechanism)
    await handleIncomingMessage(buyerId, client, userMessage, task, globalUserContext, buyerClients);
    
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

