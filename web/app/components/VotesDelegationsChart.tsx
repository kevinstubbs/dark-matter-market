'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface VotesDelegationsDataPoint {
  date: string;
  timestamp: number;
  votes: number;
  delegations: number;
  cumulativeVotes: number;
  cumulativeDelegations: number;
}

interface VotesDelegationsChartProps {
  data: VotesDelegationsDataPoint[];
}

export function VotesDelegationsChart({ data }: VotesDelegationsChartProps) {
  if (data.length === 0) {
    return (
      <div className="p-4 text-center text-zinc-500 dark:text-zinc-400">
        No votes or delegations data available yet.
      </div>
    );
  }

  // Format date for display
  const formattedData = data.map((point) => ({
    ...point,
    dateFormatted: new Date(point.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
          <XAxis
            dataKey="dateFormatted"
            className="text-xs text-zinc-600 dark:text-zinc-400"
            tick={{ fill: 'currentColor' }}
          />
          <YAxis
            className="text-xs text-zinc-600 dark:text-zinc-400"
            tick={{ fill: 'currentColor' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e4e4e7',
              borderRadius: '6px',
            }}
            labelStyle={{ color: '#18181b' }}
            formatter={(value: number) => [value, '']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="cumulativeVotes"
            stroke="#3b82f6"
            strokeWidth={2}
            name="Cumulative Votes"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="cumulativeDelegations"
            stroke="#10b981"
            strokeWidth={2}
            name="Cumulative Delegations"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

