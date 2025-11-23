import { NextRequest, NextResponse } from 'next/server';
import { fetchTopicMessages, parseMessages, getVoteDistributionForProposal, findProposalSequenceNumber } from '@/lib/hedera';
import { Client } from 'pg';

async function getClient(): Promise<Client> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:6100/dark_matter_market'
  });
  await client.connect();
  return client;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const client = await getClient();
  
  try {
    const { proposalId } = await params;

    // Get proposal to find DMM, name, and description
    const proposalResult = await client.query(
      'SELECT dmm_id, name, description FROM proposals WHERE id = $1',
      [proposalId]
    );

    if (proposalResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Proposal not found' },
        { status: 404 }
      );
    }

    const proposal = proposalResult.rows[0];

    // Get DMM to find topic ID and chain ID
    const dmmResult = await client.query(
      'SELECT topic_id, chain_id FROM dmms WHERE id = $1',
      [proposal.dmm_id]
    );

    if (dmmResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'DMM not found' },
        { status: 404 }
      );
    }

    const dmm = dmmResult.rows[0];

    // Fetch and parse messages
    const messages = await fetchTopicMessages(dmm.topic_id, dmm.chain_id);
    const parsed = parseMessages(messages);

    // Find the proposal sequence number by matching title/description
    const proposalSequenceNumber = findProposalSequenceNumber(
      parsed,
      proposal.name,
      proposal.description
    );

    // Get vote distribution
    const distribution = getVoteDistributionForProposal(parsed, proposalSequenceNumber);

    return NextResponse.json(
      { distribution },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching vote distribution:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vote distribution' },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}

