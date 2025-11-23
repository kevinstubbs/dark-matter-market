import { Client } from 'pg';
import { config } from './config.js';

export interface DMM {
  id: number;
  topic_id: string;
  chain_id: number;
}

export async function getAllDMMTopics(): Promise<DMM[]> {
  const client = new Client({
    connectionString: config.database.url,
  });

  try {
    await client.connect();
    const result = await client.query<DMM>(
      'SELECT DISTINCT id, topic_id, chain_id FROM dmms ORDER BY id'
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

/**
 * Get token IDs for a DMM
 */
export async function getDMMTokens(dmmId: number): Promise<string[]> {
  const client = new Client({
    connectionString: config.database.url,
  });

  try {
    await client.connect();
    const result = await client.query<{ token_id: string }>(
      'SELECT token_id FROM dmm_tokens WHERE dmm_id = $1 ORDER BY created_at',
      [dmmId]
    );
    return result.rows.map(row => row.token_id);
  } catch (error) {
    // If dmm_tokens table doesn't exist, return empty array
    console.warn(`Error fetching tokens for DMM ${dmmId}:`, error);
    return [];
  } finally {
    await client.end();
  }
}

