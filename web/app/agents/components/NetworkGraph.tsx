'use client';

import { useMemo, useCallback } from 'react';
import { ReactFlow, Node, Edge, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AgentInfo, HoveredEdge } from './types';
import { MESSAGE_TYPE_EDGE_COLORS } from './constants';
import { nodeTypes } from './FlowNodes';

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
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          },
          labelBgStyle: {
            fill: '#ffffff',
            fillOpacity: 0.8,
            cursor: 'pointer',
          },
        });
      });
    });

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

