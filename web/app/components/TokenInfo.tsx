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
  tokenId?: string; // Deprecated - use tokenIds instead
  tokenIds?: string[]; // Array of token IDs
  chainId: number;
}

export function TokenInfo({ tokenId, tokenIds, chainId }: TokenInfoProps) {
  // Support both old single tokenId and new tokenIds array
  const tokensToFetch = tokenIds || (tokenId ? [tokenId] : []);
  const [tokensInfo, setTokensInfo] = useState<Map<string, TokenInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    async function fetchTokenInfos() {
      if (tokensToFetch.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrors(new Map());

        // Fetch all tokens in parallel
        const fetchPromises = tokensToFetch.map(async (id) => {
          try {
            const response = await fetch(`/api/tokens/${id}?chainId=${chainId}`);

            if (!response.ok) {
              if (response.status === 404) {
                setErrors((prev) => new Map(prev).set(id, 'Token not found'));
                return null;
              } else {
                throw new Error(`Failed to fetch token info: ${response.status}`);
              }
            }

            const data = await response.json();
            return { id, data };
          } catch (err) {
            console.error(`Error fetching token info for ${id}:`, err);
            setErrors((prev) => new Map(prev).set(id, err instanceof Error ? err.message : 'Failed to load token info'));
            return null;
          }
        });

        const results = await Promise.all(fetchPromises);
        const tokensMap = new Map<string, TokenInfo>();
        
        for (const result of results) {
          if (result) {
            tokensMap.set(result.id, result.data);
          }
        }

        setTokensInfo(tokensMap);
      } catch (err) {
        console.error('Error fetching token infos:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchTokenInfos();
  }, [tokensToFetch.join(','), chainId]);

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

  if (tokensToFetch.length === 0) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        No tokens configured
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {tokensToFetch.length === 1 ? 'Token:' : 'Tokens:'}
        </span>
        <span className="text-sm text-zinc-500 dark:text-zinc-500">Loading...</span>
      </div>
    );
  }

  const loadedTokens = Array.from(tokensInfo.entries());
  const hasErrors = errors.size > 0;
  const hasLoadedTokens = loadedTokens.length > 0;

  if (!hasLoadedTokens && !hasErrors) {
    return null;
  }

  return (
    <div className="space-y-2">
      {loadedTokens.map(([tokenId, tokenInfo]) => {
        const hashscanTokenUrl = getHashscanTokenUrl(tokenId, chainId);
        const formattedSupply = formatSupply(tokenInfo.total_supply, tokenInfo.decimals);

        return (
          <div key={tokenId} className="space-y-1">
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
      })}
      
      {Array.from(errors.entries()).map(([tokenId, error]) => (
        <div key={tokenId} className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Token ID:
          </span>
          <a
            href={getHashscanTokenUrl(tokenId, chainId)}
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
          <span className="text-xs text-zinc-500 dark:text-zinc-500">({error})</span>
        </div>
      ))}
    </div>
  );
}

