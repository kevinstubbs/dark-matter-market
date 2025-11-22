import { getRedisClient, getTopicMessagesKey, getTopicLastSequenceKey } from './redis.js';
import { TopicMessage } from './hedera.js';

export async function getCachedTopicMessages(topicId: string): Promise<TopicMessage[]> {
  const redis = await getRedisClient();
  const key = getTopicMessagesKey(topicId);
  const value = await redis.get(key);
  
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(value) as TopicMessage[];
  } catch (error) {
    console.error(`Error parsing cached messages for topic ${topicId}:`, error);
    return [];
  }
}

export async function cacheTopicMessages(
  topicId: string,
  messages: TopicMessage[]
): Promise<void> {
  const redis = await getRedisClient();
  const key = getTopicMessagesKey(topicId);

  if (messages.length === 0) {
    return;
  }

  // Store messages as JSON array
  // Each message is stored with its sequence number as part of the data
  const messagesJson = JSON.stringify(messages);
  await redis.set(key, messagesJson);

  // Store the last sequence number for incremental updates
  const lastSequence = messages[messages.length - 1].sequence_number;
  const lastSequenceKey = getTopicLastSequenceKey(topicId);
  await redis.set(lastSequenceKey, lastSequence.toString());

  console.log(`Cached ${messages.length} messages for topic ${topicId} (last sequence: ${lastSequence})`);
}

export async function getCachedLastSequence(topicId: string): Promise<number | null> {
  const redis = await getRedisClient();
  const key = getTopicLastSequenceKey(topicId);
  const value = await redis.get(key);
  return value ? parseInt(value, 10) : null;
}

