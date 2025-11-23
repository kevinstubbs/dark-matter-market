// Load environment variables from .env.local first
import './env.js';

import { getAllDMMTopics, type DMM } from './db.js';
import { fetchTopicMessages } from './hedera.js';
import { cacheTopicMessages } from './cache.js';
import { closeRedisClient } from './redis.js';

const LOCALHOST_CHAIN_ID = 298;
const LOCALHOST_POLL_INTERVAL = 2000; // 2 seconds

async function cacheTopics(dmms: DMM[]) {
  // Cache messages for each topic
  for (const dmm of dmms) {
    try {
      console.log(`\nProcessing topic ${dmm.topic_id} (chain: ${dmm.chain_id})...`);
      console.log(`  Fetching all messages...`);
      
      // Always fetch all messages from the beginning
      const messages = await fetchTopicMessages(dmm.topic_id, dmm.chain_id);
      
      if (messages.length > 0) {
        await cacheTopicMessages(dmm.topic_id, messages);
        console.log(`  Cached ${messages.length} messages for topic ${dmm.topic_id}`);
      } else {
        console.log(`  No messages found for topic ${dmm.topic_id}`);
      }
    } catch (error) {
      console.error(`  Error processing topic ${dmm.topic_id}:`, error);
      // Continue with next topic even if one fails
    }
  }
}

async function cacheAllTopics() {
  console.log('Starting topic cache update...');

  try {
    // Get all DMM topics from database
    const dmms = await getAllDMMTopics();
    console.log(`Found ${dmms.length} DMM topics to cache`);

    // Separate localhost topics from other topics
    const localhostTopics = dmms.filter(dmm => dmm.chain_id === LOCALHOST_CHAIN_ID);
    const otherTopics = dmms.filter(dmm => dmm.chain_id !== LOCALHOST_CHAIN_ID);

    // Cache non-localhost topics once
    if (otherTopics.length > 0) {
      console.log(`\nCaching ${otherTopics.length} non-localhost topics...`);
      await cacheTopics(otherTopics);
      console.log('\nNon-localhost topic cache update completed!');
    }

    // Poll localhost topics every 2 seconds
    if (localhostTopics.length > 0) {
      console.log(`\nStarting polling for ${localhostTopics.length} localhost topics (every ${LOCALHOST_POLL_INTERVAL}ms)...`);
      
      // Initial cache
      await cacheTopics(localhostTopics);
      
      // Set up polling interval
      const pollInterval = setInterval(async () => {
        try {
          await cacheTopics(localhostTopics);
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
    } else {
      console.log('\nNo localhost topics to poll.');
      await closeRedisClient();
    }
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

