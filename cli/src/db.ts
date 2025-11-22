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

