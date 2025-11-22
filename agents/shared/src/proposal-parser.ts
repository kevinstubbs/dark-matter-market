import { ProposalInfo } from './types.js';

// TopicMessage interface - matches the structure from cli/src/hedera.ts
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

export function parseProposal(message: TopicMessage): ProposalInfo | null {
  try {
    const data = JSON.parse(message.message);
    if (data.type === 'Proposal' && data.version === 1) {
      return {
        dmmTopicId: message.topic_id,
        proposalSequenceNumber: message.sequence_number,
        title: data.title,
        description: data.description,
        options: data.options,
        deadline: data.deadline || '', // May need to calculate from proposal
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

