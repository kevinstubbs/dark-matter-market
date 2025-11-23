import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export interface VotingPowerAccount {
  id: string;
  label: string;
  amount: number;
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
const VOTING_POWER_KEY = 'governance:voting_power';

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({
      url: REDIS_URL,
    });

    redisClient.on('error', (err: Error) => {
      console.error('Redis Client Error:', err);
    });

    await redisClient.connect();
  }

  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Get voting power accounts from Redis
 * @returns Array of voting power accounts (yes, no, abstain)
 */
export async function getVotingPowerAccounts(): Promise<VotingPowerAccount[]> {
  const redis = await getRedisClient();
  const value = await redis.get(VOTING_POWER_KEY);
  
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(value) as VotingPowerAccount[];
  } catch (error) {
    console.error('Error parsing voting power accounts from Redis:', error);
    return [];
  }
}

/**
 * Get a specific voting power account by label (yes, no, or abstain)
 * @param label The label of the voting power account
 * @returns The voting power account or null if not found
 */
export async function getVotingPowerAccountByLabel(label: string): Promise<VotingPowerAccount | null> {
  const accounts = await getVotingPowerAccounts();
  return accounts.find(account => account.label === label) || null;
}

