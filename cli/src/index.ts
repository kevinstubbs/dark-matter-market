// Load environment variables from .env.local first
import './env.js';

import { getAllDMMTopics } from './db.js';
import { fetchTopicMessages } from './hedera.js';
import { cacheTopicMessages } from './cache.js';
import { closeRedisClient } from './redis.js';

async function cacheAllTopics() {
  console.log('Starting topic cache update...');

  try {
    // Get all DMM topics from database
    const dmms = await getAllDMMTopics();
    console.log(`Found ${dmms.length} DMM topics to cache`);

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

    console.log('\nTopic cache update completed!');
  } catch (error) {
    console.error('Error during cache update:', error);
    process.exit(1);
  } finally {
    await closeRedisClient();
  }
}

// Run if this is the main module (when executed directly)
cacheAllTopics().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Export for use as a module
export { cacheAllTopics };

