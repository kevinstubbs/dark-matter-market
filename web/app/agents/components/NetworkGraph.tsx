'use client';

import { useMemo, useCallback, useRef } from 'react';
import { ReactFlow, Node, Edge, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AgentInfo, HoveredEdge } from './types';
import { MESSAGE_TYPE_EDGE_COLORS } from './constants';
import { nodeTypes } from './FlowNodes';

// Create a hash of the data that determines nodes and edges
function createDataHash(
  agents: AgentInfo[],
  getLastMessageTypeBetweenAgents: (buyerId: string, sellerId: string) => string | null,
  getA2AMessageCount: (buyerId: string, sellerId: string) => number
): string {
  const buyers = agents.filter(a => a.type === 'buyer');
  const sellers = agents.filter(a => a.type === 'seller');
  
  // Hash agents (id, name, type, port, walletAddress)
  const agentsHash = agents.map(a => `${a.id}:${a.name}:${a.type}:${a.port}:${a.walletAddress || ''}`).join('|');
  
  // Hash edge data (message types and counts)
  const edgesData: string[] = [];
  buyers.forEach(buyer => {
    sellers.forEach(seller => {
      const messageType = getLastMessageTypeBetweenAgents(buyer.id, seller.id);
      const count = getA2AMessageCount(buyer.id, seller.id);
      edgesData.push(`${buyer.id}-${seller.id}:${messageType || ''}:${count}`);
    });
  });
  
  return `${agentsHash}||${edgesData.join('|')}`;
}

interface NetworkGraphProps {
  agents: AgentInfo[];
  hoveredEdge: HoveredEdge | null;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeMouseEnter: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeMouseLeave: () => void;
  onEdgeMouseMove: (event: React.MouseEvent) => void;
  getLastMessageTypeBetweenAgents: (buyerId: string, sellerId: string) => string | null;
  getA2AMessageCount: (buyerId: string, sellerId: string) => number;
}

export function NetworkGraph({
  agents,
  hoveredEdge,
  onNodeClick,
  onEdgeClick,
  onEdgeMouseEnter,
  onEdgeMouseLeave,
  onEdgeMouseMove,
  getLastMessageTypeBetweenAgents,
  getA2AMessageCount,
}: NetworkGraphProps) {
  // Store previous nodes, edges, and hash
  const previousNodesRef = useRef<Node[]>([]);
  const previousEdgesRef = useRef<Edge[]>([]);
  const previousHashRef = useRef<string>('');

  // Generate React Flow nodes and edges
  const { nodes, edges } = useMemo(() => {
    // Create hash of current data
    const currentHash = createDataHash(agents, getLastMessageTypeBetweenAgents, getA2AMessageCount);
    
    // If hash hasn't changed, return previous nodes and edges
    if (currentHash === previousHashRef.current) {
      return { nodes: previousNodesRef.current, edges: previousEdgesRef.current };
    }
    
    // Hash changed, create new nodes and edges
    const buyers = agents.filter(a => a.type === 'buyer');
    const sellers = agents.filter(a => a.type === 'seller');

    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Position 1st buyer on top (centered)
    if (buyers.length > 0) {
      const firstBuyer = buyers[0];
      flowNodes.push({
        id: firstBuyer.id,
        type: 'buyer',
        position: { x: 400, y: 50 },
        data: {
          label: (
            <div className="text-center">
              <div className="font-semibold text-black">{firstBuyer.name}</div>
              <div className="text-xs text-black">Port: {firstBuyer.port}</div>
              {firstBuyer.walletAddress && (
                <div className="text-xs text-black">Wallet: {firstBuyer.walletAddress}</div>
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
    }

    // Position sellers in the middle (spread horizontally)
    sellers.forEach((seller, idx) => {
      flowNodes.push({
        id: seller.id,
        type: 'seller',
        position: { x: 200 + idx * 300, y: 300 },
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

    // Position 2nd buyer on bottom (centered)
    if (buyers.length > 1) {
      const secondBuyer = buyers[1];
      flowNodes.push({
        id: secondBuyer.id,
        type: 'buyerBottom',
        position: { x: 1200, y: 550 },
        data: {
          label: (
            <div className="text-center">
              <div className="font-semibold text-black">{secondBuyer.name}</div>
              <div className="text-xs text-black">Port: {secondBuyer.port}</div>
              {secondBuyer.walletAddress && (
                <div className="text-xs text-black">Wallet: {secondBuyer.walletAddress}</div>
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
    }

    // Connect buyers to sellers
    buyers.forEach((buyer, buyerIdx) => {
      sellers.forEach(seller => {
        const lastMessageType = getLastMessageTypeBetweenAgents(buyer.id, seller.id);
        const edgeColor = lastMessageType
          ? (MESSAGE_TYPE_EDGE_COLORS[lastMessageType] || '#94a3b8')
          : '#94a3b8';
        const messageCount = getA2AMessageCount(buyer.id, seller.id);

        // First buyer (top) connects to sellers (top to bottom)
        // Second buyer (bottom) connects from sellers (bottom to top)
        const isSecondBuyer = buyerIdx === 1;
        const source = isSecondBuyer ? seller.id : buyer.id;
        const target = isSecondBuyer ? buyer.id : seller.id;

        flowEdges.push({
          id: `${buyer.id}-${seller.id}`,
          source: source,
          target: target,
          animated: true,
          data: {
            messageType: lastMessageType,
          },
          style: {
            stroke: edgeColor,
            strokeWidth: 2,
            cursor: 'pointer',
          },
          label: messageCount > 0 ? `${messageCount}` : '',
          labelStyle: {
            fill: edgeColor,
            fontWeight: 800,
            fontSize: 24,
            cursor: 'pointer',
          },
          labelBgStyle: {
            fill: '#ffffff',
            fillOpacity: 1,
            cursor: 'pointer',
            padding: '4px 8px',
            rx: 4,
            ry: 4,
          },
        });
      });
    });

    // Store for next comparison
    previousNodesRef.current = flowNodes;
    previousEdgesRef.current = flowEdges;
    previousHashRef.current = currentHash;

    return { nodes: flowNodes, edges: flowEdges };
  }, [agents, getLastMessageTypeBetweenAgents, getA2AMessageCount]);

  return (
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
    </div>
  );
}

