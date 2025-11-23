import { NextResponse } from 'next/server';
import { Client } from 'pg';

async function getClient(): Promise<Client> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:6100/dark_matter_market'
  });
  await client.connect();
  return client;
}

/**
 * GET /api/topic-id/localnet
 * Returns the topicId for the latest localnet proposal
 * Localnet is identified by chain_id = 298
 */
export async function GET() {
  const client = await getClient();
  
  try {
    // Find the latest proposal from a localnet DMM (chain_id = 298)
    const result = await client.query(`
      SELECT d.topic_id
      FROM proposals p
      INNER JOIN dmms d ON p.dmm_id = d.id
      WHERE d.chain_id = 298
      ORDER BY p.created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'No localnet proposal found' },
        { status: 404 }
      );
    }

    const topicId = result.rows[0].topic_id;

    return NextResponse.json(
      { topicId },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching localnet topic ID:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}

