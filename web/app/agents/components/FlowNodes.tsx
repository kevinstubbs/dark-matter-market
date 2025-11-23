import { Handle, Position } from '@xyflow/react';

// Custom node component for buyers (with handle on bottom)
export function BuyerNode({ data }: { data: { label: React.ReactNode } }) {
  return (
    <div className="px-3 py-2">
      <Handle type="source" position={Position.Bottom} style={{ background: '#3b82f6' }} />
      {data.label}
    </div>
  );
}

// Custom node component for sellers (with handle on top)
export function SellerNode({ data }: { data: { label: React.ReactNode } }) {
  return (
    <div className="px-3 py-2">
      <Handle type="target" position={Position.Top} style={{ background: '#22c55e' }} />
      {data.label}
    </div>
  );
}

export const nodeTypes = {
  buyer: BuyerNode,
  seller: SellerNode,
};

