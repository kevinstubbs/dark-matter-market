import { NextRequest, NextResponse } from 'next/server';
import { parseMessages } from '@/lib/hedera';
import { getAllDMMs } from '@/lib/db';
import { getCachedTopicMessages, getCachedTimeseries, cacheTimeseries } from '@/lib/topic-cache';

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

    // Get messages from Redis cache only
    let messages: any[] | null = null;
    try {
      messages = await getCachedTopicMessages(topicId);
    } catch (error) {
      console.error('Error accessing Redis cache:', error);
      return NextResponse.json(
        { error: 'Redis cache unavailable. Please ensure Redis is running and the cache CLI tool has been executed.' },
        { status: 503 }
      );
    }
    
    // If no messages, return empty data instead of error
    if (!messages || messages.length === 0) {
      if (statsOnly) {
        return NextResponse.json(
          { totalMessages: 0, delegations: 0, votes: 0 },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            },
          }
        );
      }
      
      if (timeseries) {
        return NextResponse.json(
          { timeSeries: [] },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            },
          }
        );
      }
      
      return NextResponse.json(
        { messages: [] },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          },
        }
      );
    }
    
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
      // Try to get cached timeseries first (gracefully handle Redis failures)
      let timeSeries: any[] | null = null;
      try {
        timeSeries = await getCachedTimeseries(topicId);
      } catch (error) {
        console.warn('Redis cache unavailable for timeseries, computing:', error);
      }
      
      if (!timeSeries) {
        // Pre-parse timestamps once for sorting
        const messagesWithTimestamps = parsed.map(msg => {
          const timestampParts = msg.timestamp.split('.');
          const seconds = parseInt(timestampParts[0], 10);
          return {
            msg,
            seconds,
            date: new Date(seconds * 1000),
          };
        }).filter(item => !isNaN(item.date.getTime()));

        // Sort by timestamp
        messagesWithTimestamps.sort((a, b) => a.seconds - b.seconds);

        // Group by day and calculate cumulative totals
        const byDay = new Map<string, { messages: number; delegations: number; votes: number }>();
        let cumulativeMessages = 0;
        let cumulativeDelegations = 0;
        let cumulativeVotes = 0;

        for (const { msg, date } of messagesWithTimestamps) {
          const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

          // Increment cumulative counters
          cumulativeMessages++;
          if (msg.type === 'Delegation') {
            cumulativeDelegations++;
          } else if (msg.type === 'Vote') {
            cumulativeVotes++;
          }

          // Store cumulative values for this day (will be overwritten if multiple messages on same day)
          byDay.set(dayKey, {
            messages: cumulativeMessages,
            delegations: cumulativeDelegations,
            votes: cumulativeVotes,
          });
        }

        // Convert to array and sort by date
        timeSeries = Array.from(byDay.entries())
          .map(([date, counts]) => ({
            timestamp: new Date(date).getTime().toString(),
            date,
            messages: counts.messages,
            delegations: counts.delegations,
            votes: counts.votes,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        // Cache the processed timeseries
        await cacheTimeseries(topicId, timeSeries);
      }

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

