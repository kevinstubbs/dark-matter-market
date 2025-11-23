export interface BuyerConfig {
  id: string; // Unique agent ID for demo logging
  name: string;
  port: number;
  walletAddress: string; // Hedera wallet address for this agent
  envFile: string; // Path to .env file containing HEDERA_SECRET (relative to config file or absolute)
  instructions: string; // Plain language instructions
  desiredOutcome?: string; // Preferred outcome: "yes" or "no"
  maxPrice?: string; // Maximum HBAR per vote
  topicId?: string; // HCS topic ID for the DMM (can also be set via DMM_TOPIC_ID env var)
  proposalSequenceNumber?: number; // Sequence number of the proposal to vote on (can also be set via PROPOSAL_SEQUENCE_NUMBER env var)
}

export interface SellerConfig {
  id: string; // Unique agent ID for demo logging
  name: string;
  port: number;
  walletAddress: string; // Hedera wallet address for this agent
  envFile: string; // Path to .env file containing HEDERA_SECRET (relative to config file or absolute)
  instructions: string; // Plain language instructions
  minPrice?: string; // Minimum HBAR per vote
  buyerUrls?: string[]; // URLs of buyer agents to connect to
}

