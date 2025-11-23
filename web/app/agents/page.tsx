'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ReactFlow, Node, Edge, Background, Controls, MiniMap, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface AgentMessage {
  timestamp: string;
  message: string;
  type: string;
  agentId: string;
  targetAgentId?: string;
  isA2AMessage?: boolean;
}

interface AgentInfo {
  id: string;
  name: string;
  type: 'buyer' | 'seller';
  port: number;
  walletAddress?: string;
}

const MESSAGE_TYPE_COLORS: Record<string, string> = {
  'agent-started': 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200',
  'agent-ready': 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200',
  'message-received': 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
  'offer-created': 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200',
  'offer-sent': 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200',
  'offer-received': 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200',
  'negotiation-started': 'bg-cyan-100 dark:bg-cyan-900/20 text-cyan-800 dark:text-cyan-200',
  'negotiation-succeeded': 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200',
  'negotiation-failed': 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200',
  'competing-offer-request': 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200',
  'competing-offer-response': 'bg-pink-100 dark:bg-pink-900/20 text-pink-800 dark:text-pink-200',
  'seller-ready': 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200',
  'connection-established': 'bg-teal-100 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200',
  'connection-failed': 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200',
  'error': 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200',
  'info': 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
};

// Map message types to edge colors
const MESSAGE_TYPE_EDGE_COLORS: Record<string, string> = {
  'agent-started': '#3b82f6', // blue
  'agent-ready': '#22c55e', // green
  'message-received': '#6b7280', // gray
  'offer-created': '#a855f7', // purple
  'offer-sent': '#6366f1', // indigo
  'offer-received': '#eab308', // yellow
  'negotiation-started': '#06b6d4', // cyan
  'negotiation-succeeded': '#22c55e', // green
  'negotiation-failed': '#ef4444', // red
  'competing-offer-request': '#f97316', // orange
  'competing-offer-response': '#ec4899', // pink
  'seller-ready': '#10b981', // emerald
  'connection-established': '#14b8a6', // teal
  'connection-failed': '#ef4444', // red
  'error': '#ef4444', // red
  'info': '#6b7280', // gray
};

type ViewMode = 'boxes' | 'network';

// Custom node component for buyers (with handle on bottom)
function BuyerNode({ data }: { data: { label: React.ReactNode } }) {
  return (
    <div className="px-3 py-2">
      <Handle type="source" position={Position.Bottom} style={{ background: '#3b82f6' }} />
      {data.label}
    </div>
  );
}

// Custom node component for sellers (with handle on top)
function SellerNode({ data }: { data: { label: React.ReactNode } }) {
  return (
    <div className="px-3 py-2">
      <Handle type="target" position={Position.Top} style={{ background: '#22c55e' }} />
      {data.label}
    </div>
  );
}

const nodeTypes = {
  buyer: BuyerNode,
  seller: SellerNode,
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [messages, setMessages] = useState<Record<string, AgentMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('boxes');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ source: string; target: string } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ id: string; messageType: string | null; x: number; y: number } | null>(null);
  
  // Playback controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null); // Timestamp in milliseconds
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);
  const [isManuallyScrubbed, setIsManuallyScrubbed] = useState(false); // Track if user manually scrubbed

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
      max: realTime, // Always use current real time as max
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

  // Generate React Flow nodes and edges
  const { nodes, edges } = useMemo(() => {
    const buyers = agents.filter(a => a.type === 'buyer');
    const sellers = agents.filter(a => a.type === 'seller');

    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Position buyers on top (spread horizontally)
    buyers.forEach((buyer, idx) => {
      flowNodes.push({
        id: buyer.id,
        type: 'buyer',
        position: { x: 200 + idx * 800, y: 50 },
        data: {
          label: (
            <div className="text-center">
              <div className="font-semibold text-black">{buyer.name}</div>
              <div className="text-xs text-black">Port: {buyer.port}</div>
              {buyer.walletAddress && (
                <div className="text-xs text-black">Wallet: {buyer.walletAddress}</div>
              )}
            </div>
          ),
        },
        style: {
          background: '#dbeafe',
          border: '2px solid #3b82f6',
          borderRadius: '8px',
          padding: '10px',
          minWidth: '150px',
          color: '#1e40af',
          cursor: 'pointer',
        },
        draggable: false,
        connectable: false,
      });
    });

    // Position sellers on bottom (spread horizontally)
    sellers.forEach((seller, idx) => {
      flowNodes.push({
        id: seller.id,
        type: 'seller',
        position: { x: 200 + idx * 300, y: 500 },
        data: {
          label: (
            <div className="text-center">
              <div className="font-semibold text-black">{seller.name}</div>
              <div className="text-xs text-black">Port: {seller.port}</div>
              {seller.walletAddress && (
                <div className="text-xs text-black">Wallet: {seller.walletAddress}</div>
              )}
            </div>
          ),
        },
        style: {
          background: '#dcfce7',
          border: '2px solid #22c55e',
          borderRadius: '8px',
          padding: '10px',
          minWidth: '150px',
          color: '#166534',
          cursor: 'pointer',
        },
        draggable: false,
        connectable: false,
      });
    });

    // Connect all buyers to all sellers (many-to-many)
    buyers.forEach(buyer => {
      sellers.forEach(seller => {
        const lastMessageType = getLastMessageTypeBetweenAgents(buyer.id, seller.id);
        const edgeColor = lastMessageType 
          ? (MESSAGE_TYPE_EDGE_COLORS[lastMessageType] || '#94a3b8')
          : '#94a3b8';
        const messageCount = getA2AMessageCount(buyer.id, seller.id);
        
        flowEdges.push({
          id: `${buyer.id}-${seller.id}`,
          source: buyer.id,
          target: seller.id,
          // type: 'smoothstep',
          animated: true,
          data: {
            messageType: lastMessageType,
          },
          style: { 
            stroke: edgeColor, 
            strokeWidth: 2,
            cursor: 'pointer', // Show pointer cursor on edge
          },
          label: messageCount > 0 ? `${messageCount}` : '',
          labelStyle: {
            fill: edgeColor,
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer', // Show pointer cursor on label
          },
          labelBgStyle: {
            fill: '#ffffff',
            fillOpacity: 0.8,
            cursor: 'pointer', // Show pointer cursor on label background
          },
        });
      });
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [agents, getLastMessageTypeBetweenAgents, getA2AMessageCount]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedAgentId(node.id);
    setSelectedEdge(null); // Clear edge selection when clicking node
  }, []);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    // Check if the click was on the label (not the edge itself)
    const target = event.target as HTMLElement;
    // React Flow labels are clickable, so we can check for label-related classes
    if (target && (
      target.classList.contains('react-flow__edge-label') || 
      target.closest('.react-flow__edge-label') ||
      target.classList.contains('react-flow__edge-labelbg') ||
      target.closest('.react-flow__edge-labelbg')
    )) {
      setSelectedEdge({ source: edge.source, target: edge.target });
      setSelectedAgentId(null); // Clear agent selection when clicking edge
    } else {
      // If clicking on the edge itself (not the label), also open the panel
      // This makes it easier to click
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

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // Update currentTime to track real time when not playing and not manually scrubbed
  useEffect(() => {
    if (!isPlaying && !isManuallyScrubbed && currentTime !== null) {
      // When not playing and not manually scrubbed, currentTime should track real time
      setCurrentTime(realTime);
    }
  }, [realTime, isPlaying, isManuallyScrubbed]); // Update when real time changes and we're not playing

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
      playbackStartTimeRangeMinRef.current = timeRange.min; // Store the min at start of playback
      playbackStartTimeRangeMaxRef.current = timeRange.max; // Store the max at start of playback
    }
    
    const startTime = playbackStartTimeRef.current;
    const startPosition = playbackStartPositionRef.current!;
    const startMin = playbackStartTimeRangeMinRef.current!;
    const startMax = playbackStartTimeRangeMaxRef.current!;
    const startDuration = startMax - startMin;
    const playbackDuration = startDuration / playbackSpeed; // Adjust duration based on speed
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / playbackDuration;
      
      // Calculate target time based on playback using the original min and max
      const targetTime = startMin + startPosition + (progress * startDuration);
      
      // Don't exceed current real time
      const newTime = Math.min(targetTime, realTime);
      setCurrentTime(newTime);
      
      // If we've reached real time, stop playing
      if (newTime >= realTime) {
        setIsPlaying(false);
        playbackStartTimeRef.current = null;
        playbackStartPositionRef.current = null;
        playbackStartTimeRangeMinRef.current = null;
        playbackStartTimeRangeMaxRef.current = null;
      }
    }, 16); // ~60fps updates
    
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, realTime]); // Only depend on isPlaying, playbackSpeed, and realTime

  const handlePlayPause = () => {
    if (currentTime === null) {
      setCurrentTime(realTime);
    }
    // Reset playback refs when toggling play/pause
    if (!isPlaying) {
      playbackStartTimeRef.current = null;
      playbackStartPositionRef.current = null;
      setIsManuallyScrubbed(false); // Clear manual scrub flag when starting to play
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number) => {
    const newTime = timeRange.min + (value / 100) * (timeRange.max - timeRange.min);
    setCurrentTime(newTime);
    setIsPlaying(false); // Pause when scrubbing
    setIsManuallyScrubbed(true); // Mark as manually scrubbed
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
    
    // Filter messages where targetAgentId matches the other agent
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

          {/* View Mode Tabs */}
          <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 mb-4">
            <button
              onClick={() => setViewMode('boxes')}
              className={`px-4 py-2 font-medium transition-colors ${
                viewMode === 'boxes'
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50'
              }`}
            >
              Boxes View
            </button>
            <button
              onClick={() => setViewMode('network')}
              className={`px-4 py-2 font-medium transition-colors ${
                viewMode === 'network'
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50'
              }`}
            >
              Network View
            </button>
          </div>


          {/* Legend */}
          <div className="mb-6 p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              Message Type Legend
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.entries(MESSAGE_TYPE_COLORS).map(([type, colorClass]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${colorClass}`}>
                    {type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {viewMode === 'boxes' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map(agent => {
              const agentMessages = filteredMessages[agent.id] || [];
              const typeColor = agent.type === 'buyer' 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' 
                : 'border-green-500 bg-green-50 dark:bg-green-950/20';

              return (
                <div
                  key={agent.id}
                  className={`rounded-lg border-2 ${typeColor} p-4 flex flex-col h-[600px]`}
                >
                  <div className="mb-4 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                        {agent.name}
                      </h2>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        agent.type === 'buyer'
                          ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                          : 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                      }`}>
                        {agent.type}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      ID: {agent.id} | Port: {agent.port}
                      {agent.walletAddress && (
                        <> | Wallet: {agent.walletAddress}</>
                      )}
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }}>
                    {agentMessages.length === 0 ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-500 italic">
                        No messages yet...
                      </p>
                    ) : (
                      agentMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              MESSAGE_TYPE_COLORS[msg.type] || MESSAGE_TYPE_COLORS['info']
                            }`}>
                              {msg.type}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-500">
                              {formatTime(msg.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">
                            {msg.message}
                          </p>
                          {msg.targetAgentId && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                              → {msg.targetAgentId}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex gap-4">
            {/* Playback Controls - Vertical on the left */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 flex-shrink-0" style={{ width: '160px', height: '400px' }}>
              <div className="flex flex-col items-center gap-2 h-full">
                {/* Play/Pause Button */}
                <button
                  onClick={handlePlayPause}
                  className="w-full px-2 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded font-medium transition-colors"
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>

                {/* Reset Button */}
                <button
                  onClick={handleReset}
                  className="w-full px-2 py-1.5 text-sm bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded font-medium transition-colors"
                >
                  ⏮
                </button>

                {/* Speed Controls */}
                <div className="flex flex-col items-center gap-1 w-full">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">Speed</span>
                  <div className="flex flex-row gap-1 w-full">
                    {([0.5, 1, 2] as const).map((speed) => (
                      <button
                        key={speed}
                        onClick={() => setPlaybackSpeed(speed)}
                        className={`w-full px-2 py-1 text-xs rounded font-medium transition-colors ${
                          playbackSpeed === speed
                            ? 'bg-blue-600 text-white dark:bg-blue-500'
                            : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time Slider - Vertical */}
                <div className="flex-1 flex flex-col items-center justify-center w-full relative">
                  {/* Max label at top, offset horizontally */}
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-full mb-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-500 whitespace-nowrap">
                      {formatTime(new Date(timeRange.max).toISOString())}
                    </span>
                  </div>
                  
                  {/* Current time above the bar */}
                  <div className="mb-2">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {currentTime !== null && formatTime(new Date(currentTime).toISOString())}
                    </span>
                  </div>
                  
                  {/* Slider */}
                  <div className="flex-1 flex items-center justify-center w-full relative">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={currentTime === null ? 0 : ((currentTime - timeRange.min) / (timeRange.max - timeRange.min || 1)) * 100}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      className="w-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-500"
                      style={{ 
                        writingMode: 'vertical-lr',
                        transform: 'rotate(180deg)',
                      }}
                    />
                    
                    {/* Min label at bottom, offset horizontally */}
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full mt-1">
                      <span className="text-xs text-zinc-500 dark:text-zinc-500 whitespace-nowrap">
                        {formatTime(new Date(timeRange.min).toISOString())}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Network Graph */}
            <div className="relative flex-1">
              <div className="h-[400px] border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodeClick={onNodeClick}
                  onEdgeClick={onEdgeClick}
                  onEdgeMouseEnter={onEdgeMouseEnter}
                  onEdgeMouseLeave={onEdgeMouseLeave}
                  onEdgeMouseMove={onEdgeMouseMove}
                  fitView
                  className="bg-white dark:bg-zinc-900"
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  panOnDrag={true}
                  zoomOnScroll={true}
                  zoomOnPinch={true}
                  zoomOnDoubleClick={false}
                  preventScrolling={false}
                >
                  <Background />
                  <Controls />
                  <MiniMap />
                </ReactFlow>
              </div>

              {/* Edge Tooltip */}
              {hoveredEdge && hoveredEdge.messageType && (
                <div
                  className="fixed z-50 px-2 py-1 text-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded shadow-lg pointer-events-none"
                  style={{
                    left: `${hoveredEdge.x + 10}px`,
                    top: `${hoveredEdge.y - 10}px`,
                  }}
                >
                  {hoveredEdge.messageType}
                </div>
              )}

              {/* Agent Logs Panel */}
            {selectedAgent && (
              <div className="absolute top-4 right-4 w-96 h-[350px] bg-white dark:bg-zinc-900 border-2 border-zinc-300 dark:border-zinc-700 rounded-lg shadow-xl z-10 flex flex-col">
                <div className={`p-4 border-b-2 flex-shrink-0 ${
                  selectedAgent.type === 'buyer'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : 'border-green-500 bg-green-50 dark:bg-green-950/20'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
                      {selectedAgent.name}
                    </h3>
                    <button
                      onClick={() => setSelectedAgentId(null)}
                      className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    ID: {selectedAgent.id} | Port: {selectedAgent.port}
                    {selectedAgent.walletAddress && (
                      <> | Wallet: {selectedAgent.walletAddress}</>
                    )}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }}>
                  {selectedMessages.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-500 italic">
                      No messages yet...
                    </p>
                  ) : (
                    selectedMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            MESSAGE_TYPE_COLORS[msg.type] || MESSAGE_TYPE_COLORS['info']
                          }`}>
                            {msg.type}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                          {msg.message}
                        </p>
                        {msg.targetAgentId && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                            → {msg.targetAgentId}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Edge Messages Panel */}
            {selectedEdge && edgeSourceAgent && edgeTargetAgent && (
              <div className="absolute top-4 right-4 w-96 h-[350px] bg-white dark:bg-zinc-900 border-2 border-zinc-300 dark:border-zinc-700 rounded-lg shadow-xl z-10 flex flex-col">
                <div className="p-4 border-b-2 flex-shrink-0 border-purple-500 bg-purple-50 dark:bg-purple-950/20">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
                      Messages Between
                    </h3>
                    <button
                      onClick={() => setSelectedEdge(null)}
                      className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      <span className={`font-semibold ${edgeSourceAgent.type === 'buyer' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                        {edgeSourceAgent.name}
                      </span>
                      {' ↔ '}
                      <span className={`font-semibold ${edgeTargetAgent.type === 'buyer' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                        {edgeTargetAgent.name}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                      {edgeMessages.length} message{edgeMessages.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }}>
                  {edgeMessages.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-500 italic">
                      No messages between these agents yet...
                    </p>
                  ) : (
                    edgeMessages.map((msg, idx) => {
                      const isFromSource = msg.agentId === selectedEdge.source;
                      const agent = isFromSource ? edgeSourceAgent : edgeTargetAgent;
                      return (
                        <div
                          key={idx}
                          className={`p-2 rounded border ${
                            isFromSource
                              ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20'
                              : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${
                                isFromSource
                                  ? 'text-blue-700 dark:text-blue-300'
                                  : 'text-green-700 dark:text-green-300'
                              }`}>
                                {agent?.name}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                MESSAGE_TYPE_COLORS[msg.type] || MESSAGE_TYPE_COLORS['info']
                              }`}>
                                {msg.type}
                              </span>
                            </div>
                            <span className="text-xs text-zinc-500 dark:text-zinc-500">
                              {formatTime(msg.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">
                            {msg.message}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
