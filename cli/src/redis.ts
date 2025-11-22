import { createClient, RedisClientType } from 'redis';
import { config } from './config.js';

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({
      url: config.redis.url,
    });

    redisClient.on('error', (err: Error) => {
      console.error('Redis Client Error:', err);
    });

    await redisClient.connect();
    console.log('Connected to Redis');
  }

  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Disconnected from Redis');
  }
}

// Topic message cache keys
export function getTopicMessagesKey(topicId: string): string {
  return `topic:${topicId}:messages`;
}

export function getTopicLastSequenceKey(topicId: string): string {
  return `topic:${topicId}:last_sequence`;
}

