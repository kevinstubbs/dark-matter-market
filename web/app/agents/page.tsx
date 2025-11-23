'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Node, Edge } from '@xyflow/react';
import { AgentInfo, AgentMessage, ViewMode, HoveredEdge, SelectedEdge } from './components/types';
import { MessageTypeLegend } from './components/MessageTypeLegend';
import { ViewModeTabs } from './components/ViewModeTabs';
import { AgentBox } from './components/AgentBox';
import { PlaybackControls } from './components/PlaybackControls';
import { NetworkGraph } from './components/NetworkGraph';
import { AgentLogsPanel } from './components/AgentLogsPanel';
import { EdgeMessagesPanel } from './components/EdgeMessagesPanel';

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [messages, setMessages] = useState<Record<string, AgentMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('boxes');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdge | null>(null);

  // Playback controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);
  const [isManuallyScrubbed, setIsManuallyScrubbed] = useState(false);

  useEffect(() => {
    // Load agent list
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        setAgents(data.agents || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading agents:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (agents.length === 0) return;

    // Load messages for all agents
    const loadMessages = async () => {
      const messagePromises = agents.map(agent =>
        fetch(`/api/agents/messages?agentId=${agent.id}`)
          .then(res => res.json())
          .then(data => ({ agentId: agent.id, messages: data.messages || [] }))
          .catch(err => {
            console.error(`Error loading messages for ${agent.id}:`, err);
            return { agentId: agent.id, messages: [] };
          })
      );

      const results = await Promise.all(messagePromises);
      const messagesMap: Record<string, AgentMessage[]> = {};
      results.forEach(({ agentId, messages }) => {
        // Sort by timestamp (oldest first) since Redis returns newest first
        messagesMap[agentId] = messages.sort((a: AgentMessage, b: AgentMessage) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      });
      setMessages(messagesMap);

      // Initialize currentTime to real time if not set
      if (currentTime === null) {
        setCurrentTime(Date.now());
      }
    };

    loadMessages();

    // Refresh messages every 2 seconds
    const interval = setInterval(loadMessages, 2000);

    return () => clearInterval(interval);
  }, [agents, currentTime]);

  // Current real time state (updates every second)
  const [realTime, setRealTime] = useState(Date.now());

  // Update real time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setRealTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate time range: min = oldest message, max = current real time
  const timeRange = useMemo(() => {
    const allMessages = Object.values(messages).flat();
    if (allMessages.length === 0) {
      return { min: realTime, max: realTime };
    }
    const timestamps = allMessages.map(m => new Date(m.timestamp).getTime());
    return {
      min: Math.min(...timestamps),
      max: realTime,
    };
  }, [messages, realTime]);

  // Filter messages based on currentTime
  const filterMessagesByTime = useCallback((msgs: AgentMessage[]): AgentMessage[] => {
    if (currentTime === null) return msgs;
    return msgs.filter(msg => new Date(msg.timestamp).getTime() <= currentTime);
  }, [currentTime]);

  // Filtered messages for display
  const filteredMessages = useMemo(() => {
    if (currentTime === null) return messages;
    const filtered: Record<string, AgentMessage[]> = {};
    Object.entries(messages).forEach(([agentId, msgs]) => {
      filtered[agentId] = filterMessagesByTime(msgs);
    });
    return filtered;
  }, [messages, currentTime, filterMessagesByTime]);

  // Find the last message type between two agents (using filtered messages)
  const getLastMessageTypeBetweenAgents = useCallback((buyerId: string, sellerId: string): string | null => {
    const buyerMessages = filteredMessages[buyerId] || [];
    const sellerMessages = filteredMessages[sellerId] || [];

    // Find messages that are between these two agents
    const relevantMessages = [
      ...buyerMessages.filter(m => m.targetAgentId === sellerId),
      ...sellerMessages.filter(m => m.targetAgentId === buyerId),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (relevantMessages.length > 0) {
      return relevantMessages[0].type;
    }

    return null;
  }, [filteredMessages]);

  // Count A2A messages between two agents (using filtered messages)
  const getA2AMessageCount = useCallback((buyerId: string, sellerId: string): number => {
    const buyerMessages = filteredMessages[buyerId] || [];
    const sellerMessages = filteredMessages[sellerId] || [];

    // Count A2A messages where targetAgentId matches
    const count = [
      ...buyerMessages.filter(m => m.isA2AMessage && m.targetAgentId === sellerId),
      ...sellerMessages.filter(m => m.isA2AMessage && m.targetAgentId === buyerId),
    ].length;

    return count;
  }, [filteredMessages]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedAgentId(node.id);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    const target = event.target as HTMLElement;
    if (target && (
      target.classList.contains('react-flow__edge-label') ||
      target.closest('.react-flow__edge-label') ||
      target.classList.contains('react-flow__edge-labelbg') ||
      target.closest('.react-flow__edge-labelbg')
    )) {
      setSelectedEdge({ source: edge.source, target: edge.target });
      setSelectedAgentId(null);
    } else {
      setSelectedEdge({ source: edge.source, target: edge.target });
      setSelectedAgentId(null);
    }
  }, []);

  const onEdgeMouseEnter = useCallback((event: React.MouseEvent, edge: Edge) => {
    const messageType = (edge.data as { messageType?: string | null })?.messageType || null;
    setHoveredEdge({
      id: edge.id,
      messageType,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const onEdgeMouseMove = useCallback((event: React.MouseEvent) => {
    if (hoveredEdge) {
      setHoveredEdge({
        ...hoveredEdge,
        x: event.clientX,
        y: event.clientY,
      });
    }
  }, [hoveredEdge]);

  // Update currentTime to track real time when not playing and not manually scrubbed
  useEffect(() => {
    if (!isPlaying && !isManuallyScrubbed && currentTime !== null) {
      setCurrentTime(realTime);
    }
  }, [realTime, isPlaying, isManuallyScrubbed]);

  // Playback effect
  const playbackStartTimeRef = useRef<number | null>(null);
  const playbackStartPositionRef = useRef<number | null>(null);
  const playbackStartTimeRangeMinRef = useRef<number | null>(null);
  const playbackStartTimeRangeMaxRef = useRef<number | null>(null);
  const currentTimeRef = useRef<number | null>(null);

  // Keep currentTimeRef in sync with currentTime
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (!isPlaying) {
      playbackStartTimeRef.current = null;
      playbackStartPositionRef.current = null;
      playbackStartTimeRangeMinRef.current = null;
      playbackStartTimeRangeMaxRef.current = null;
      return;
    }

    if (currentTimeRef.current === null) {
      return;
    }

    const duration = timeRange.max - timeRange.min;
    if (duration <= 0) return;

    // Only initialize start time/position when playback first starts
    if (playbackStartTimeRef.current === null) {
      playbackStartTimeRef.current = Date.now();
      playbackStartPositionRef.current = currentTimeRef.current - timeRange.min;
      playbackStartTimeRangeMinRef.current = timeRange.min;
      playbackStartTimeRangeMaxRef.current = timeRange.max;
    }

    const startTime = playbackStartTimeRef.current;
    const startPosition = playbackStartPositionRef.current!;
    const startMin = playbackStartTimeRangeMinRef.current!;
    const startMax = playbackStartTimeRangeMaxRef.current!;
    const startDuration = startMax - startMin;
    const playbackDuration = startDuration / playbackSpeed;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / playbackDuration;

      const targetTime = startMin + startPosition + (progress * startDuration);
      const newTime = Math.min(targetTime, realTime);
      setCurrentTime(newTime);

      if (newTime >= realTime) {
        setIsPlaying(false);
        playbackStartTimeRef.current = null;
        playbackStartPositionRef.current = null;
        playbackStartTimeRangeMinRef.current = null;
        playbackStartTimeRangeMaxRef.current = null;
      }
    }, 16);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, realTime, timeRange]);

  const handlePlayPause = () => {
    if (currentTime === null) {
      setCurrentTime(realTime);
    }
    if (!isPlaying) {
      playbackStartTimeRef.current = null;
      playbackStartPositionRef.current = null;
      setIsManuallyScrubbed(false);
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number) => {
    const newTime = timeRange.min + (value / 100) * (timeRange.max - timeRange.min);
    setCurrentTime(newTime);
    setIsPlaying(false);
    setIsManuallyScrubbed(true);
  };

  const handleReset = () => {
    setCurrentTime(timeRange.min);
    setIsPlaying(false);
    setIsManuallyScrubbed(false);
  };

  const selectedAgent = selectedAgentId ? agents.find(a => a.id === selectedAgentId) : null;
  const selectedMessages = selectedAgentId ? (filteredMessages[selectedAgentId] || []) : [];

  // Get messages between two agents for edge view
  const getMessagesBetweenAgents = useCallback((sourceId: string, targetId: string): AgentMessage[] => {
    const sourceMessages = filteredMessages[sourceId] || [];
    const targetMessages = filteredMessages[targetId] || [];

    const filtered = [
      ...sourceMessages.filter((m: AgentMessage) => m.targetAgentId === targetId),
      ...targetMessages.filter((m: AgentMessage) => m.targetAgentId === sourceId),
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return filtered;
  }, [filteredMessages]);

  const edgeMessages = selectedEdge
    ? getMessagesBetweenAgents(selectedEdge.source, selectedEdge.target)
    : [];

  const edgeSourceAgent = selectedEdge ? agents.find(a => a.id === selectedEdge.source) : null;
  const edgeTargetAgent = selectedEdge ? agents.find(a => a.id === selectedEdge.target) : null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading agents...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 mb-4"
          >
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-black dark:text-zinc-50 mb-2">
            Agent Dashboard
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-4">
            Real-time activity from all agents
          </p>

          <ViewModeTabs viewMode={viewMode} onViewModeChange={setViewMode} />
          <MessageTypeLegend />
        </div>

        {viewMode === 'boxes' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map(agent => (
              <AgentBox
                key={agent.id}
                agent={agent}
                messages={filteredMessages[agent.id] || []}
              />
            ))}
          </div>
        ) : (
          <div className="flex gap-4">
            <PlaybackControls
              isPlaying={isPlaying}
              currentTime={currentTime}
              playbackSpeed={playbackSpeed}
              timeRange={timeRange}
              onPlayPause={handlePlayPause}
              onReset={handleReset}
              onSpeedChange={setPlaybackSpeed}
              onSeek={handleSeek}
            />

            <div className="relative flex-1">
              <NetworkGraph
                agents={agents}
                hoveredEdge={hoveredEdge}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                onEdgeMouseEnter={onEdgeMouseEnter}
                onEdgeMouseLeave={onEdgeMouseLeave}
                onEdgeMouseMove={onEdgeMouseMove}
                getLastMessageTypeBetweenAgents={getLastMessageTypeBetweenAgents}
                getA2AMessageCount={getA2AMessageCount}
              />

              {selectedAgent && (
                <AgentLogsPanel
                  agent={selectedAgent}
                  messages={selectedMessages}
                  onClose={() => setSelectedAgentId(null)}
                />
              )}

              {selectedEdge && edgeSourceAgent && edgeTargetAgent && (
                <EdgeMessagesPanel
                  selectedEdge={selectedEdge}
                  sourceAgent={edgeSourceAgent}
                  targetAgent={edgeTargetAgent}
                  messages={edgeMessages}
                  onClose={() => setSelectedEdge(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
