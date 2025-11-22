// Load environment variables from .env.local first
import './env.js';

import { getAllDMMTopics } from './db.js';
import { getCachedTopicMessages, getCachedLastSequence } from './cache.js';
import { closeRedisClient } from './redis.js';

async function checkCache() {
  console.log('Checking Redis cache...\n');

  try {
    // Get all DMM topics from database
    const dmms = await getAllDMMTopics();
    console.log(`Found ${dmms.length} DMM topics in database\n`);

    let totalMessages = 0;
    let topicsWithData = 0;
    let topicsWithoutData = 0;

    // Check cache for each topic
    for (const dmm of dmms) {
      try {
        const cachedMessages = await getCachedTopicMessages(dmm.topic_id);
        const lastSequence = await getCachedLastSequence(dmm.topic_id);

        const messageCount = cachedMessages.length;
        totalMessages += messageCount;

        if (messageCount > 0) {
          topicsWithData++;
          const firstMessage = cachedMessages[0];
          const lastMessage = cachedMessages[cachedMessages.length - 1];
          
          console.log(`Topic ${dmm.topic_id} (chain: ${dmm.chain_id}):`);
          console.log(`  Messages cached: ${messageCount.toLocaleString()}`);
          console.log(`  Last sequence: ${lastSequence ?? 'N/A'}`);
          console.log(`  First message sequence: ${firstMessage.sequence_number}`);
          console.log(`  Last message sequence: ${lastMessage.sequence_number}`);
          console.log(`  First message timestamp: ${firstMessage.consensus_timestamp}`);
          console.log(`  Last message timestamp: ${lastMessage.consensus_timestamp}`);
          
          // Check for gaps
          const expectedCount = lastMessage.sequence_number - firstMessage.sequence_number + 1;
          if (messageCount !== expectedCount) {
            console.log(`  ⚠️  WARNING: Expected ${expectedCount} messages but found ${messageCount} (gap detected)`);
          }
          console.log('');
        } else {
          topicsWithoutData++;
          console.log(`Topic ${dmm.topic_id} (chain: ${dmm.chain_id}): No cached data\n`);
        }
      } catch (error) {
        console.error(`  Error checking topic ${dmm.topic_id}:`, error);
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total topics: ${dmms.length}`);
    console.log(`Topics with cached data: ${topicsWithData}`);
    console.log(`Topics without cached data: ${topicsWithoutData}`);
    console.log(`Total messages cached: ${totalMessages.toLocaleString()}`);
  } catch (error) {
    console.error('Error during cache check:', error);
    process.exit(1);
  } finally {
    await closeRedisClient();
  }
}

// Run if this is the main module
checkCache().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

