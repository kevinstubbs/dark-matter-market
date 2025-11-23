'use client';

import { useEffect, useState } from 'react';
import { TopicChart } from './TopicChart';

interface TopicStats {
  totalMessages: number;
  delegations: number;
  votes: number;
}

interface TopicStatsProps {
  topicId: string;
}

export function TopicStats({ topicId }: TopicStatsProps) {
  const [stats, setStats] = useState<TopicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        setError(null);

        // Fetch stats only (more efficient)
        const response = await fetch(`/api/topics/${topicId}/messages?stats=true`);

        if (!response.ok) {
          throw new Error(`Failed to fetch topic messages: ${response.status}`);
        }

        const data = await response.json();
        
        setStats({
          totalMessages: data.totalMessages || 0,
          delegations: data.delegations || 0,
          votes: data.votes || 0,
        });
      } catch (err) {
        console.error('Error fetching topic stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    }

    if (topicId) {
      fetchStats();
    }
  }, [topicId]);

  if (loading) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-500">
        Loading stats...
      </div>
    );
  }

  if (error || !stats) {
    return null; // Silently fail - stats are optional
  }

  return (
    <div>
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 dark:text-zinc-400">Messages:</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {stats.totalMessages.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 dark:text-zinc-400">Delegations:</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {stats.delegations.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 dark:text-zinc-400">Votes:</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {stats.votes.toLocaleString()}
          </span>
        </div>
      </div>
      <TopicChart topicId={topicId} />
    </div>
  );
}

