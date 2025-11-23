import { NextRequest, NextResponse } from 'next/server';
import { fetchTopicMessages, parseMessages, getVotesDelegationsOverTime } from '@/lib/hedera';
import { getAllDMMs } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { topicId: string } }
) {
  try {
    const { topicId } = await params;

    // Find the DMM to get chain ID
    const dmms = await getAllDMMs();
    const dmm = dmms.find((d) => d.topic_id === topicId);

    if (!dmm) {
      return NextResponse.json(
        { error: 'DMM not found' },
        { status: 404 }
      );
    }

    // Fetch and parse messages
    const messages = await fetchTopicMessages(topicId, dmm.chain_id);
    const parsed = parseMessages(messages);

    // Get votes and delegations over time
    const data = getVotesDelegationsOverTime(parsed);

    return NextResponse.json(
      { data },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching votes and delegations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch votes and delegations' },
      { status: 500 }
    );
  }
}

