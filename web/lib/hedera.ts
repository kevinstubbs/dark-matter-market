// Utility functions for fetching and parsing HCS topic messages

export interface TopicMessage {
  consensus_timestamp: string;
  message: string; // base64 encoded
  running_hash: string;
  sequence_number: number;
  topic_id: string;
  chunk_info?: {
    initial_transaction_id: {
      account_id: string;
      nonce: number;
      scheduled: boolean;
      transaction_valid_start: string;
    };
    number: number;
    total: number;
  };
}

export interface TopicMessagesResponse {
  messages: TopicMessage[];
  links?: {
    next?: string;
  };
}

export interface VoteMessage {
  option: 'yes' | 'no' | 'abstain' | 'against';
  sequenceNumber?: number;
  type: 'Vote';
  version?: number;
  referendumType?: string;
}

export interface DelegationMessage {
  delegatee?: string;
  type: 'Delegation';
  version?: number;
}

export interface ParsedMessage {
  type: 'Vote' | 'Delegation' | 'Proposal' | 'Unknown';
  timestamp: string;
  sequenceNumber: number;
  data: VoteMessage | DelegationMessage | any;
  accountId?: string;
}

/**
 * Convert Hedera consensus timestamp to JavaScript Date
 * Hedera timestamps are in format "1234567890.123456789" (seconds.nanoseconds)
 */
function parseHederaTimestamp(timestamp: string): Date {
  // Split by decimal point
  const parts = timestamp.split('.');
  const seconds = parseInt(parts[0], 10);
  // Convert seconds to milliseconds for JavaScript Date
  return new Date(seconds * 1000);
}

/**
 * Get the base URL for Hedera mirror node based on chain ID
 */
function getMirrorNodeUrl(chainId: number): string {
  if (chainId === 295) {
    return process.env.HEDERA_MIRROR_NODE_MAINNET_URL || 'https://mainnet-public.mirrornode.hedera.com';
  } else if (chainId === 298) {
    return process.env.HEDERA_MIRROR_NODE_URL || 'http://localhost:5551';
  } else {
    return process.env.HEDERA_MIRROR_NODE_TESTNET_URL || 'https://testnet.mirrornode.hedera.com';
  }
}

/**
 * Fetch all messages from an HCS topic
 */
export async function fetchTopicMessages(
  topicId: string,
  chainId: number
): Promise<TopicMessage[]> {
  const baseUrl = getMirrorNodeUrl(chainId);
  const allMessages: TopicMessage[] = [];
  let nextUrl: string | null = null;

  const params = new URLSearchParams({
    limit: '100',
    order: 'asc',
  });

  nextUrl = `${baseUrl}/api/v1/topics/${topicId}/messages?${params.toString()}`;

  let pageCount = 0;
  while (nextUrl) {
    try {
      pageCount++;
      const response = await fetch(nextUrl, {
        headers: {
          'Accept': 'application/json',
        },
        // Cache for 30 seconds (Next.js fetch API)
        cache: 'no-store', // We'll handle caching at the API route level if needed
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Topic ${topicId} not found or has no messages`);
          break;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as TopicMessagesResponse;

      if (data.messages && data.messages.length > 0) {
        allMessages.push(...data.messages);
      }

      if (data.links?.next) {
        if (data.links.next.startsWith('http://') || data.links.next.startsWith('https://')) {
          nextUrl = data.links.next;
        } else if (data.links.next.startsWith('/')) {
          nextUrl = `${baseUrl}${data.links.next}`;
        } else {
          nextUrl = `${baseUrl}/${data.links.next}`;
        }
      } else {
        nextUrl = null;
      }

      if (pageCount > 10000) {
        console.warn(`Stopped pagination after ${pageCount} pages for topic ${topicId}`);
        break;
      }
    } catch (error) {
      console.error(`Error fetching messages for topic ${topicId} on page ${pageCount}:`, error);
      throw error;
    }
  }

  return allMessages;
}

/**
 * Decode base64 message and parse JSON
 */
function decodeMessage(message: string): any {
  try {
    const decoded = Buffer.from(message, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    return null;
  }
}

/**
 * Parse topic messages to extract votes and delegations
 */
export function parseMessages(messages: TopicMessage[]): ParsedMessage[] {
  return messages
    .map((msg) => {
      const decoded = decodeMessage(msg.message);
      if (!decoded) return null;

      const parsed: ParsedMessage = {
        timestamp: msg.consensus_timestamp,
        sequenceNumber: msg.sequence_number,
        type: 'Unknown',
        data: decoded,
      };

      if (decoded.type === 'Vote') {
        parsed.type = 'Vote';
        parsed.data = decoded as VoteMessage;
      } else if (decoded.type === 'Delegation') {
        parsed.type = 'Delegation';
        parsed.data = decoded as DelegationMessage;
      } else if (decoded.type === 'Proposal') {
        parsed.type = 'Proposal';
      }

      // Extract account ID from chunk_info if available
      if (msg.chunk_info?.initial_transaction_id?.account_id) {
        parsed.accountId = msg.chunk_info.initial_transaction_id.account_id;
      }

      return parsed;
    })
    .filter((msg): msg is ParsedMessage => msg !== null);
}

/**
 * Get votes and delegations over time for a DMM
 */
export interface VotesDelegationsDataPoint {
  date: string;
  timestamp: number;
  votes: number;
  delegations: number;
  cumulativeVotes: number;
  cumulativeDelegations: number;
}

export function getVotesDelegationsOverTime(
  messages: ParsedMessage[]
): VotesDelegationsDataPoint[] {
  // Sort by timestamp
  const sorted = [...messages].sort((a, b) => {
    const dateA = parseHederaTimestamp(a.timestamp);
    const dateB = parseHederaTimestamp(b.timestamp);
    return dateA.getTime() - dateB.getTime();
  });

  // Group by day
  const byDay = new Map<string, { votes: number; delegations: number }>();

  for (const msg of sorted) {
    const date = parseHederaTimestamp(msg.timestamp);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn(`Invalid timestamp: ${msg.timestamp}, skipping message`);
      continue;
    }
    const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, { votes: 0, delegations: 0 });
    }

    const day = byDay.get(dayKey)!;
    if (msg.type === 'Vote') {
      day.votes++;
    } else if (msg.type === 'Delegation') {
      day.delegations++;
    }
  }

  // Convert to array and calculate cumulative
  const result: VotesDelegationsDataPoint[] = [];
  let cumulativeVotes = 0;
  let cumulativeDelegations = 0;

  const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [date, counts] of sortedDays) {
    cumulativeVotes += counts.votes;
    cumulativeDelegations += counts.delegations;

    const dateObj = new Date(date);
    result.push({
      date,
      timestamp: dateObj.getTime(),
      votes: counts.votes,
      delegations: counts.delegations,
      cumulativeVotes,
      cumulativeDelegations,
    });
  }

  return result;
}

/**
 * Find proposal sequence number by matching proposal data
 */
export function findProposalSequenceNumber(
  messages: ParsedMessage[],
  proposalTitle?: string,
  proposalDescription?: string
): number | null {
  // Look for proposal messages that match
  for (const msg of messages) {
    if (msg.type === 'Proposal') {
      const proposal = msg.data as any;
      // Try to match by title or description
      if (proposalTitle && proposal.title && proposal.title.includes(proposalTitle)) {
        return msg.sequenceNumber;
      }
      if (proposalDescription && proposal.description && proposal.description.includes(proposalDescription)) {
        return msg.sequenceNumber;
      }
    }
  }
  return null;
}

/**
 * Get vote distribution for a specific proposal
 */
export interface VoteDistribution {
  yes: number;
  no: number;
  abstain: number;
  total: number;
}

export function getVoteDistributionForProposal(
  messages: ParsedMessage[],
  proposalSequenceNumber: number | null
): VoteDistribution {
  const distribution: VoteDistribution = {
    yes: 0,
    no: 0,
    abstain: 0,
    total: 0,
  };

  if (proposalSequenceNumber === null) {
    return distribution;
  }

  // Track which accounts have voted (latest vote per account)
  const accountVotes = new Map<string, 'yes' | 'no' | 'abstain' | 'against'>();

  for (const msg of messages) {
    if (msg.type === 'Vote') {
      const vote = msg.data as VoteMessage;
      // Check if this vote is for the proposal
      // Votes can reference the proposal by sequenceNumber in the vote message
      // or we can infer from the message sequence number if it's after the proposal
      const voteSequenceNumber = vote.sequenceNumber ?? msg.sequenceNumber;
      if (voteSequenceNumber === proposalSequenceNumber) {
        const option = vote.option;
        // Normalize 'against' to 'no'
        const normalizedOption = option === 'against' ? 'no' : option;
        
        // Use account ID if available, otherwise use sequence number as fallback
        const key = msg.accountId || `seq-${msg.sequenceNumber}`;
        // Keep the latest vote from each account
        accountVotes.set(key, normalizedOption);
      }
    }
  }

  // Count unique votes
  for (const [_, option] of accountVotes) {
    if (option === 'yes') {
      distribution.yes++;
    } else if (option === 'no') {
      distribution.no++;
    } else if (option === 'abstain') {
      distribution.abstain++;
    }
    distribution.total++;
  }

  return distribution;
}

