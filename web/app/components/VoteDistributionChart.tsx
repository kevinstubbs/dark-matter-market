'use client';

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface VoteDistribution {
  yes: number;
  no: number;
  abstain: number;
  total: number;
  // Weighted votes (based on token balances)
  yesWeight: string; // BigInt as string to avoid precision issues
  noWeight: string;
  abstainWeight: string;
  totalWeight: string;
}

interface VoteDistributionChartProps {
  distribution: VoteDistribution;
}

/**
 * Format a large number (as string) to a readable format
 */
function formatWeight(weightStr: string): string {
  try {
    const weight = BigInt(weightStr);
    if (weight === BigInt(0)) return '0';
    
    // Convert to number for display (may lose precision for very large numbers)
    const num = Number(weight);
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(2) + 'K';
    if (num < 1000000000) return (num / 1000000).toFixed(2) + 'M';
    return (num / 1000000000).toFixed(2) + 'B';
  } catch (e) {
    return weightStr;
  }
}

const COLORS = {
  yes: '#10b981', // green
  no: '#ef4444', // red
  abstain: '#6b7280', // gray
};

export function VoteDistributionChart({ distribution }: VoteDistributionChartProps) {
  if (distribution.total === 0) {
    return (
      <div className="p-4 text-center text-zinc-500 dark:text-zinc-400">
        No votes cast yet.
      </div>
    );
  }

  const pieData = [
    { name: 'Yes', value: distribution.yes, color: COLORS.yes },
    { name: 'No', value: distribution.no, color: COLORS.no },
    { name: 'Abstain', value: distribution.abstain, color: COLORS.abstain },
  ].filter((item) => item.value > 0);

  const barData = [
    { option: 'Yes', votes: distribution.yes },
    { option: 'No', votes: distribution.no },
    { option: 'Abstain', votes: distribution.abstain },
  ];

  // Calculate weight percentages
  const totalWeight = BigInt(distribution.totalWeight || '0');
  const yesWeight = BigInt(distribution.yesWeight || '0');
  const noWeight = BigInt(distribution.noWeight || '0');
  const abstainWeight = BigInt(distribution.abstainWeight || '0');
  
  const yesWeightPercent = totalWeight > 0 
    ? (Number(yesWeight * BigInt(10000) / totalWeight) / 100).toFixed(1)
    : '0';
  const noWeightPercent = totalWeight > 0
    ? (Number(noWeight * BigInt(10000) / totalWeight) / 100).toFixed(1)
    : '0';
  const abstainWeightPercent = totalWeight > 0
    ? (Number(abstainWeight * BigInt(10000) / totalWeight) / 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Pie Chart */}
      <div>
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
          Vote Distribution (Pie Chart)
        </h4>
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e4e4e7',
                  borderRadius: '6px',
                }}
                formatter={(value: number) => [value, 'Votes']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar Chart */}
      <div>
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
          Vote Distribution (Bar Chart)
        </h4>
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
              <XAxis
                dataKey="option"
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
                formatter={(value: number) => [value, 'Votes']}
              />
              <Bar dataKey="votes" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.option === 'Yes'
                        ? COLORS.yes
                        : entry.option === 'No'
                        ? COLORS.no
                        : COLORS.abstain
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Vote Counts (Number of Vote Messages)
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {distribution.yes}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Yes</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-500">
              {distribution.total > 0
                ? `${((distribution.yes / distribution.total) * 100).toFixed(1)}%`
                : '0%'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {distribution.no}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">No</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-500">
              {distribution.total > 0
                ? `${((distribution.no / distribution.total) * 100).toFixed(1)}%`
                : '0%'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-zinc-600 dark:text-zinc-400">
              {distribution.abstain}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Abstain</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-500">
              {distribution.total > 0
                ? `${((distribution.abstain / distribution.total) * 100).toFixed(1)}%`
                : '0%'}
            </div>
          </div>
        </div>
        
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mt-6">
          Voting Weight (Token Balances)
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatWeight(distribution.yesWeight)}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Yes Weight</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-500">
              {yesWeightPercent}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatWeight(distribution.noWeight)}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">No Weight</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-500">
              {noWeightPercent}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-zinc-600 dark:text-zinc-400">
              {formatWeight(distribution.abstainWeight)}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Abstain Weight</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-500">
              {abstainWeightPercent}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

