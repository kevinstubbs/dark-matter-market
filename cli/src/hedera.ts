import { config } from './config.js';

export interface TopicMessage {
  consensus_timestamp: string;
  message: string;
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

export async function fetchTopicMessages(
  topicId: string,
  chainId: number
): Promise<TopicMessage[]> {
  // Chain ID 295 = mainnet, 296 = testnet, 298 = localhost
  let baseUrl: string;
  if (chainId === 295) {
    baseUrl = config.hedera.mirrorNodeUrl.mainnet;
  } else if (chainId === 298) {
    baseUrl = config.hedera.mirrorNodeUrl.localhost;
  } else {
    baseUrl = config.hedera.mirrorNodeUrl.testnet;
  }

  const allMessages: TopicMessage[] = [];
  let nextUrl: string | null = null;

  // Build initial URL - fetch all messages from the beginning
  const params = new URLSearchParams({
    limit: '100',
    order: 'asc',
  });

  nextUrl = `${baseUrl}/api/v1/topics/${topicId}/messages?${params.toString()}`;

  // Fetch all messages (handle pagination)
  let pageCount = 0;
  while (nextUrl) {
    try {
      pageCount++;
      const response = await fetch(nextUrl, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Topic ${topicId} not found or has no messages`);
          break;
        }
        console.error(`HTTP error! status: ${response.status}`, await response.text(), { nextUrl });
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as TopicMessagesResponse;

      if (data.messages && data.messages.length > 0) {
        allMessages.push(...data.messages);
      }

      // Check for next page - handle both relative and absolute URLs
      if (data.links?.next) {
        // If the next link is already a full URL, use it directly
        // Otherwise, prepend the base URL
        if (data.links.next.startsWith('http://') || data.links.next.startsWith('https://')) {
          nextUrl = data.links.next;
        } else if (data.links.next.startsWith('/')) {
          // Relative URL starting with / - prepend base URL
          nextUrl = `${baseUrl}${data.links.next}`;
        } else {
          // Relative URL - prepend base URL with /
          nextUrl = `${baseUrl}/${data.links.next}`;
        }
      } else {
        nextUrl = null;
      }

      // Safety check to prevent infinite loops
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

