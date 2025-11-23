import { getRedisClient, getTopicMessagesKey, getTopicTimeseriesKey } from './redis';
import { TopicMessage } from './hedera';

/**
 * Get cached topic messages from Redis
 */
export async function getCachedTopicMessages(topicId: string): Promise<TopicMessage[] | null> {
  try {
    const redis = await getRedisClient();
    const key = getTopicMessagesKey(topicId);
    const value = await redis.get(key);
    
    if (!value) {
      return null;
    }

    return JSON.parse(value) as TopicMessage[];
  } catch (error) {
    console.error(`Error getting cached messages for topic ${topicId}:`, error);
    return null;
  }
}

/**
 * Get cached timeseries data from Redis
 */
export async function getCachedTimeseries(topicId: string): Promise<any[] | null> {
  try {
    const redis = await getRedisClient();
    const key = getTopicTimeseriesKey(topicId);
    const value = await redis.get(key);
    
    if (!value) {
      return null;
    }

    return JSON.parse(value);
  } catch (error) {
    console.error(`Error getting cached timeseries for topic ${topicId}:`, error);
    return null;
  }
}

/**
 * Cache timeseries data in Redis (expires after 5 minutes)
 */
export async function cacheTimeseries(topicId: string, timeseries: any[]): Promise<void> {
  try {
    const redis = await getRedisClient();
    const key = getTopicTimeseriesKey(topicId);
    const value = JSON.stringify(timeseries);
    
    // Cache for 5 minutes
    await redis.setEx(key, 300, value);
  } catch (error) {
    console.error(`Error caching timeseries for topic ${topicId}:`, error);
    // Don't throw - caching is optional
  }
}

