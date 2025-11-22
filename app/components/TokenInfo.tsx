'use client';

import { useEffect, useState } from 'react';
import { getHashscanTokenUrl } from '@/lib/utils';

interface TokenInfo {
  token_id: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
  type: string;
  created_timestamp: string;
}

interface TokenInfoProps {
  tokenId: string;
  chainId: number;
}

export function TokenInfo({ tokenId, chainId }: TokenInfoProps) {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTokenInfo() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/tokens/${tokenId}?chainId=${chainId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('Token not found');
          } else {
            throw new Error(`Failed to fetch token info: ${response.status}`);
          }
          return;
        }

        const data = await response.json();
        setTokenInfo(data);
      } catch (err) {
        console.error('Error fetching token info:', err);
        setError(err instanceof Error ? err.message : 'Failed to load token info');
      } finally {
        setLoading(false);
      }
    }

    if (tokenId) {
      fetchTokenInfo();
    }
  }, [tokenId]);

  const hashscanTokenUrl = getHashscanTokenUrl(tokenId, chainId);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Token:
        </span>
        <span className="text-sm text-zinc-500 dark:text-zinc-500">Loading...</span>
      </div>
    );
  }

  if (error || !tokenInfo) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Token ID:
        </span>
        <a
          href={hashscanTokenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          <code>{tokenId}</code>
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
        {error && (
          <span className="text-xs text-zinc-500 dark:text-zinc-500">({error})</span>
        )}
      </div>
    );
  }

  // Format total supply with decimals
  const formatSupply = (supply: string, decimals: number): string => {
    try {
      const num = BigInt(supply);
      const divisor = BigInt(10 ** decimals);
      const whole = num / divisor;
      const remainder = num % divisor;

      if (remainder === BigInt(0)) {
        return whole.toString();
      }

      const remainderStr = remainder.toString().padStart(decimals, '0');
      const trimmed = remainderStr.replace(/0+$/, '');
      return `${whole}.${trimmed}`;
    } catch {
      return supply;
    }
  };

  const formattedSupply = formatSupply(tokenInfo.total_supply, tokenInfo.decimals);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Token:
        </span>
        <a
          href={hashscanTokenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          <span className="font-semibold">{tokenInfo.name}</span>
          <span className="text-zinc-600 dark:text-zinc-400">({tokenInfo.symbol})</span>
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
        <span>ID: <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{tokenId}</code></span>
        <span>•</span>
        <span>Supply: {parseFloat(formattedSupply).toLocaleString()} {tokenInfo.symbol}</span>
      </div>
    </div>
  );
}

