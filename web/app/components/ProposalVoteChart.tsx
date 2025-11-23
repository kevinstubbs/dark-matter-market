'use client';

import { useEffect, useState } from 'react';
import { VoteDistributionChart, VoteDistribution } from './VoteDistributionChart';

interface ProposalVoteChartProps {
  proposalId: number;
}

export function ProposalVoteChart({ proposalId }: ProposalVoteChartProps) {
  const [distribution, setDistribution] = useState<VoteDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/proposals/${proposalId}/vote-distribution`);
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const result = await response.json();
        setDistribution(result.distribution || { yes: 0, no: 0, abstain: 0, total: 0 });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [proposalId]);

  if (loading) {
    return (
      <div className="p-4 text-center text-zinc-500 dark:text-zinc-400">
        Loading vote distribution...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500 dark:text-red-400">
        Error: {error}
      </div>
    );
  }

  if (!distribution) {
    return null;
  }

  return (
    <div className="mt-4 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <h4 className="text-md font-semibold text-black dark:text-zinc-50 mb-4">
        Vote Distribution
      </h4>
      <VoteDistributionChart distribution={distribution} />
    </div>
  );
}

