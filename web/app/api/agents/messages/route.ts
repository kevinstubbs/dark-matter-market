import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient, getAgentMessagesKey } from '@/lib/redis';

export interface AgentMessage {
  timestamp: string;
  message: string;
  type: string;
  agentId: string;
  targetAgentId?: string;
  isA2AMessage?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: AgentMessage = await request.json();
    
    // Validate required fields
    if (!body.agentId || !body.message || !body.type || !body.timestamp) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, message, type, timestamp' },
        { status: 400 }
      );
    }

    const redis = await getRedisClient();
    const key = getAgentMessagesKey(body.agentId);
    
    // Add message to list (prepend so newest messages appear first)
    await redis.lPush(key, JSON.stringify(body));
    
    // Keep only last 1000 messages per agent
    await redis.lTrim(key, 0, 999);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing agent message:', error);
    return NextResponse.json(
      { error: 'Failed to store message' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    
    if (!agentId) {
      return NextResponse.json(
        { error: 'Missing agentId parameter' },
        { status: 400 }
      );
    }

    const redis = await getRedisClient();
    const key = getAgentMessagesKey(agentId);
    
    // Get all messages for this agent
    const messages = await redis.lRange(key, 0, -1);
    
    // Parse JSON strings back to objects
    const parsedMessages = messages.map(msg => JSON.parse(msg));
    
    return NextResponse.json({ messages: parsedMessages });
  } catch (error) {
    console.error('Error retrieving agent messages:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve messages' },
      { status: 500 }
    );
  }
}

