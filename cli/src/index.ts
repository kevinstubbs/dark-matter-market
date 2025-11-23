// Load environment variables from .env.local first
import './env.js';

import { getAllDMMTopics, getDMMTokens, type DMM } from './db.js';
import { fetchTopicMessages } from './hedera.js';
import { cacheTopicMessages } from './cache.js';
import { closeRedisClient } from './redis.js';
import { storeDMMBalances } from './balances.js';

const LOCALHOST_CHAIN_ID = 298;
const LOCALHOST_POLL_INTERVAL = 2000; // 2 seconds

async function cacheTopics(dmms: DMM[]) {
  // Step 1: Fetch and cache all messages for all topics first
  const topicMessages = new Map<string, { messages: any[], dmm: DMM }>();
  
  for (const dmm of dmms) {
    try {
      console.log(`\nProcessing topic ${dmm.topic_id} (chain: ${dmm.chain_id})...`);
      console.log(`  Fetching all messages...`);
      
      // Always fetch all messages from the beginning
      const messages = await fetchTopicMessages(dmm.topic_id, dmm.chain_id);
      
      if (messages.length > 0) {
        await cacheTopicMessages(dmm.topic_id, messages);
        console.log(`  Cached ${messages.length} messages for topic ${dmm.topic_id}`);
        
        // Store messages for balance checking later
        topicMessages.set(dmm.topic_id, { messages, dmm });
      } else {
        console.log(`  No messages found for topic ${dmm.topic_id}`);
      }
    } catch (error) {
      console.error(`  Error processing topic ${dmm.topic_id}:`, error);
      // Continue with next topic even if one fails
    }
  }
  
  // Step 2: After all messages are fetched, check balances for all topics
  if (topicMessages.size > 0) {
    console.log(`\nChecking account balances for ${topicMessages.size} topics...`);
    
    for (const [topicId, { messages, dmm }] of topicMessages) {
      try {
        console.log(`\n  Processing balances for topic ${topicId}...`);
        const tokenIds = await getDMMTokens(dmm.id);
        if (tokenIds.length > 0) {
          console.log(`  Found ${tokenIds.length} tokens for DMM ${dmm.id}: ${tokenIds.join(', ')}`);
        } else {
          console.log(`  No tokens configured for DMM ${dmm.id}`);
        }
        await storeDMMBalances(topicId, dmm.chain_id, messages, tokenIds);
        console.log(`  Stored balances for topic ${topicId}`);
      } catch (error) {
        console.error(`  Error storing balances for topic ${topicId}:`, error);
        // Continue with next topic even if one fails
      }
    }
  }
}

async function cacheAllTopics() {
  console.log('Starting topic cache update...');

  try {
    // Get all DMM topics from database, but only process chainId 298 (localhost)
    const allDmms = await getAllDMMTopics();
    const dmms = allDmms.filter(dmm => dmm.chain_id === LOCALHOST_CHAIN_ID);
    console.log(`Found ${dmms.length} DMM topics for chainId ${LOCALHOST_CHAIN_ID} (localhost) to cache`);

    if (dmms.length === 0) {
      console.log(`\nNo topics found for chainId ${LOCALHOST_CHAIN_ID}.`);
      await closeRedisClient();
      return;
    }

    // Poll localhost topics every 2 seconds
    console.log(`\nStarting polling for ${dmms.length} localhost topics (every ${LOCALHOST_POLL_INTERVAL}ms)...`);
    
    // Initial cache
    await cacheTopics(dmms);
    
    // Set up polling interval
    const pollInterval = setInterval(async () => {
      try {
        await cacheTopics(dmms);
      } catch (error) {
        console.error('Error during localhost polling:', error);
      }
    }, LOCALHOST_POLL_INTERVAL);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\nShutting down...');
      clearInterval(pollInterval);
      closeRedisClient().then(() => {
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\n\nShutting down...');
      clearInterval(pollInterval);
      closeRedisClient().then(() => {
        process.exit(0);
      });
    });

    // Keep the process running
    console.log('Polling started. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('Error during cache update:', error);
    await closeRedisClient();
    process.exit(1);
  }
}

// Run if this is the main module (when executed directly)
cacheAllTopics().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Export for use as a module
export { cacheAllTopics };

