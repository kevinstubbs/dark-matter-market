import { config } from './config.js';
import { TopicMessage } from './hedera.js';
import { getRedisClient } from './redis.js';

export interface AccountBalance {
  accountId: string;
  hbarBalance: string; // in tinybars, as string to avoid precision issues
  tokenBalances: Map<string, string>; // tokenId -> balance (as string)
}

export interface DelegationState {
  delegator: string;
  delegatee: string | null; // null means undelegated
  timestamp: string;
}

/**
 * Get the base URL for Hedera mirror node based on chain ID
 */
function getMirrorNodeUrl(chainId: number): string {
  if (chainId === 295) {
    return config.hedera.mirrorNodeUrl.mainnet;
  } else if (chainId === 298) {
    return config.hedera.mirrorNodeUrl.localhost;
  } else {
    return config.hedera.mirrorNodeUrl.testnet;
  }
}

/**
 * Retry a fetch operation with exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Retry on transient errors (429, 500, 502, 503, 504)
      if (!response.ok && [429, 500, 502, 503, 504].includes(response.status)) {
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          console.warn(`  Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1}) for status ${response.status}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`  Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1}) due to error: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch after retries');
}

/**
 * Fetch account balance (HBAR + tokens) from Hedera mirror node
 */
export async function fetchAccountBalance(
  accountId: string,
  chainId: number,
  tokenIds?: string[]
): Promise<AccountBalance> {
  const baseUrl = getMirrorNodeUrl(chainId);
  
  // Fetch account balance with retry logic
  const accountResponse = await fetchWithRetry(
    `${baseUrl}/api/v1/accounts/${accountId}`,
    {
      headers: {
        'Accept': 'application/json',
      },
    }
  );

  if (!accountResponse.ok) {
    if (accountResponse.status === 404) {
      // Account doesn't exist, return zero balance
      return {
        accountId,
        hbarBalance: '0',
        tokenBalances: new Map(),
      };
    }
    throw new Error(`Failed to fetch account ${accountId}: ${accountResponse.status}`);
  }

  const accountData = await accountResponse.json() as { balance?: { balance?: string } };
  const hbarBalance = accountData.balance?.balance || '0';

  // Fetch token balances if tokenIds are provided
  const tokenBalances = new Map<string, string>();
  
  if (tokenIds && tokenIds.length > 0) {
    // Fetch all token balances for the account with retry logic
    const tokenResponse = await fetchWithRetry(
      `${baseUrl}/api/v1/accounts/${accountId}/tokens?limit=100`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json() as { tokens?: Array<{ token_id: string; balance?: string }> };
      const balances = tokenData.tokens || [];
      
      // Create a map of tokenId -> balance
      for (const tokenBalance of balances) {
        const tokenId = tokenBalance.token_id;
        if (tokenIds.includes(tokenId)) {
          tokenBalances.set(tokenId, tokenBalance.balance || '0');
        }
      }
    }

    // Set balance to 0 for tokens not found
    for (const tokenId of tokenIds) {
      if (!tokenBalances.has(tokenId)) {
        tokenBalances.set(tokenId, '0');
      }
    }
  }

  return {
    accountId,
    hbarBalance,
    tokenBalances,
  };
}

/**
 * Parse messages to extract all unique account IDs (voters, delegates, delegees)
 */
export function extractAccountIds(messages: TopicMessage[]): Set<string> {
  const accountIds = new Set<string>();

  for (const msg of messages) {
    // Extract account ID from chunk_info if available
    if (msg.chunk_info?.initial_transaction_id?.account_id) {
      accountIds.add(msg.chunk_info.initial_transaction_id.account_id);
    }

    // Try to parse message to find delegatee
    try {
      const decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
      const data = JSON.parse(decoded);
      
      if (data.type === 'Delegation' && data.delegatee) {
        accountIds.add(data.delegatee);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  return accountIds;
}

/**
 * Parse messages to extract delegation states
 */
export function extractDelegations(messages: TopicMessage[]): Map<string, DelegationState> {
  const delegations = new Map<string, DelegationState>();

  for (const msg of messages) {
    const accountId = msg.chunk_info?.initial_transaction_id?.account_id;
    if (!accountId) continue;

    try {
      const decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
      const data = JSON.parse(decoded);
      
      if (data.type === 'Delegation') {
        // If delegatee is present, it's a delegation
        // If delegatee is null/undefined, it's an undelegation
        const delegatee = data.delegatee || null;
        
        // Keep the latest delegation state for each account
        delegations.set(accountId, {
          delegator: accountId,
          delegatee,
          timestamp: msg.consensus_timestamp,
        });
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  return delegations;
}

/**
 * Store account balance in Redis with 1 hour expiration
 */
export async function storeAccountBalance(
  accountId: string,
  tokenId: string | null, // null for HBAR
  chainId: number,
  balance: string
): Promise<void> {
  const redis = await getRedisClient();
  const key = tokenId 
    ? `balance:${accountId}:token:${tokenId}:chain:${chainId}`
    : `balance:${accountId}:hbar:chain:${chainId}`;
  
  const value = JSON.stringify({
    balance,
  });
  
  // Set with 1 hour expiration (3600 seconds)
  await redis.setEx(key, 3600, value);
}

/**
 * Get account balance from Redis
 */
export async function getAccountBalance(
  accountId: string,
  tokenId: string | null, // null for HBAR
  chainId: number
): Promise<string | null> {
  const redis = await getRedisClient();
  const key = tokenId 
    ? `balance:${accountId}:token:${tokenId}:chain:${chainId}`
    : `balance:${accountId}:hbar:chain:${chainId}`;
  
  const value = await redis.get(key);
  if (!value) return null;
  
  try {
    const data = JSON.parse(value);
    // Support both old format (just string) and new format (object with balance)
    if (typeof data === 'string') {
      return data;
    }
    return data.balance || null;
  } catch (e) {
    // If parsing fails, assume it's the old format (just a string)
    return value;
  }
}

/**
 * Check if account balance is cached (Redis handles expiration automatically)
 */
export async function isBalanceCached(
  accountId: string,
  tokenId: string | null, // null for HBAR
  chainId: number
): Promise<boolean> {
  const redis = await getRedisClient();
  const key = tokenId 
    ? `balance:${accountId}:token:${tokenId}:chain:${chainId}`
    : `balance:${accountId}:hbar:chain:${chainId}`;
  
  // Redis automatically expires keys after TTL, so if key exists, it's valid
  const exists = await redis.exists(key);
  return exists === 1;
}

/**
 * Store delegation state in Redis
 */
export async function storeDelegation(
  delegator: string,
  delegatee: string | null,
  chainId: number,
  timestamp: string
): Promise<void> {
  const redis = await getRedisClient();
  const key = `delegation:${delegator}:chain:${chainId}`;
  
  const value = JSON.stringify({
    delegator,
    delegatee,
    timestamp,
  });
  
  await redis.set(key, value);
}

/**
 * Get delegation state from Redis
 */
export async function getDelegation(
  delegator: string,
  chainId: number
): Promise<DelegationState | null> {
  const redis = await getRedisClient();
  const key = `delegation:${delegator}:chain:${chainId}`;
  
  const value = await redis.get(key);
  if (!value) return null;
  
  try {
    return JSON.parse(value) as DelegationState;
  } catch (e) {
    return null;
  }
}

/**
 * Store all balances for a DMM topic
 */
export async function storeDMMBalances(
  topicId: string,
  chainId: number,
  messages: TopicMessage[],
  tokenIds: string[]
): Promise<void> {
  const accountIds = extractAccountIds(messages);
  const delegations = extractDelegations(messages);

  console.log(`  Fetching balances for ${accountIds.size} accounts...`);

  // Fetch and store balances for each account
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  
  for (const accountId of accountIds) {
    try {
      // Check if HBAR balance is already cached and not expired
      const hbarCached = await isBalanceCached(accountId, null, chainId);
      
      // Check if all token balances are cached and not expired
      let allTokensCached = true;
      if (tokenIds && tokenIds.length > 0) {
        for (const tokenId of tokenIds) {
          if (!(await isBalanceCached(accountId, tokenId, chainId))) {
            allTokensCached = false;
            break;
          }
        }
      }
      
      // Skip fetching if all balances are cached and fresh
      if (hbarCached && (tokenIds.length === 0 || allTokensCached)) {
        skippedCount++;
        continue;
      }
      
      const balance = await fetchAccountBalance(accountId, chainId, tokenIds);
      
      // Store HBAR balance (only if not cached or expired)
      if (!hbarCached) {
        await storeAccountBalance(accountId, null, chainId, balance.hbarBalance);
      }
      
      // Store token balances (only if not cached or expired)
      for (const [tokenId, tokenBalance] of balance.tokenBalances) {
        if (!(await isBalanceCached(accountId, tokenId, chainId))) {
          await storeAccountBalance(accountId, tokenId, chainId, tokenBalance);
        }
      }
      
      successCount++;
      
      // Add a small delay every 10 requests to avoid rate limiting
      if (successCount % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      errorCount++;
      console.error(`  Error fetching balance for account ${accountId}:`, error);
      // Continue with other accounts
    }
  }
  
  console.log(`  Completed: ${successCount} successful, ${skippedCount} skipped (cached), ${errorCount} errors`);

  // Store delegation states
  // Count unique delegates (delegatees)
  const uniqueDelegates = new Set<string>();
  for (const delegation of delegations.values()) {
    if (delegation.delegatee) {
      uniqueDelegates.add(delegation.delegatee);
    }
  }
  
  console.log(`  Storing ${delegations.size} delegation states (${uniqueDelegates.size} unique delegates)...`);
  for (const [delegator, delegation] of delegations) {
    await storeDelegation(
      delegator,
      delegation.delegatee,
      chainId,
      delegation.timestamp
    );
  }

  // Store a set of all account IDs for this topic
  const redis = await getRedisClient();
  const accountsKey = `topic:${topicId}:accounts:chain:${chainId}`;
  await redis.set(accountsKey, JSON.stringify(Array.from(accountIds)));
}

