import { NextRequest, NextResponse } from 'next/server';
import { fetchTopicMessages, parseMessages } from '@/lib/hedera';
import { getAllDMMs } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { topicId: string } }
) {
  try {
    const { topicId } = await params;
    const { searchParams } = new URL(request.url);
    const statsOnly = searchParams.get('stats') === 'true';
    const timeseries = searchParams.get('timeseries') === 'true';

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

    // If only stats are requested
    if (statsOnly) {
      const stats = {
        totalMessages: parsed.length,
        delegations: parsed.filter((m) => m.type === 'Delegation').length,
        votes: parsed.filter((m) => m.type === 'Vote').length,
      };

      return NextResponse.json(
        stats,
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          },
        }
      );
    }

    // If timeseries is requested
    if (timeseries) {
      // Group by day and count messages, delegations, votes
      const byDay = new Map<string, { messages: number; delegations: number; votes: number }>();

      for (const msg of parsed) {
        // Parse Hedera timestamp
        const timestampParts = msg.timestamp.split('.');
        const seconds = parseInt(timestampParts[0], 10);
        const date = new Date(seconds * 1000);
        
        if (isNaN(date.getTime())) {
          continue;
        }

        const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

        if (!byDay.has(dayKey)) {
          byDay.set(dayKey, { messages: 0, delegations: 0, votes: 0 });
        }

        const day = byDay.get(dayKey)!;
        day.messages++;

        if (msg.type === 'Delegation') {
          day.delegations++;
        } else if (msg.type === 'Vote') {
          day.votes++;
        }
      }

      // Convert to array and sort by date
      const timeSeries = Array.from(byDay.entries())
        .map(([date, counts]) => ({
          timestamp: new Date(date).getTime().toString(),
          date,
          messages: counts.messages,
          delegations: counts.delegations,
          votes: counts.votes,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return NextResponse.json(
        { timeSeries },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          },
        }
      );
    }

    // Default: return all parsed messages
    return NextResponse.json(
      { messages: parsed },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching topic messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch topic messages' },
      { status: 500 }
    );
  }
}

