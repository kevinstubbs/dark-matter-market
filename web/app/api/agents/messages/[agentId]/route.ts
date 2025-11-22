import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient, getAgentMessagesKey } from '@/lib/redis';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    
    if (!agentId) {
      return NextResponse.json(
        { error: 'Missing agentId parameter' },
        { status: 400 }
      );
    }

    const redis = await getRedisClient();
    const key = getAgentMessagesKey(agentId);
    
    // Delete all messages for this agent
    await redis.del(key);
    
    return NextResponse.json({ success: true, message: `Cleared messages for agent ${agentId}` });
  } catch (error) {
    console.error('Error clearing agent messages:', error);
    return NextResponse.json(
      { error: 'Failed to clear messages' },
      { status: 500 }
    );
  }
}

