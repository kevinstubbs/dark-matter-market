export interface AgentMessage {
  timestamp: string;
  message: string;
  type: string;
  agentId: string;
  targetAgentId?: string;
  isA2AMessage?: boolean;
}

export interface AgentInfo {
  id: string;
  name: string;
  type: 'buyer' | 'seller';
  port: number;
  walletAddress?: string;
}

export type ViewMode = 'boxes' | 'network';

export interface HoveredEdge {
  id: string;
  messageType: string | null;
  x: number;
  y: number;
}

export interface SelectedEdge {
  source: string;
  target: string;
}

