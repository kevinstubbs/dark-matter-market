// Proposal information sent from server to client
export interface ProposalInfo {
  dmmTopicId: string;
  proposalSequenceNumber: number;
  title: string;
  description: string;
  options: string[];
  deadline: string; // ISO timestamp
}

// Vote purchase offer from buyer to seller
export interface VoteOffer {
  proposal: ProposalInfo;
  desiredOutcome: string; // e.g., "yes", "no", "against"
  offeredAmount: string; // HBAR amount per vote
  quantity?: number; // Number of votes needed (optional)
}

// Response from seller to buyer
export interface VoteOfferResponse {
  accepted: boolean;
  reason?: string; // e.g., "Proposal violates user instructions: Always vote no for airdrops"
  counterOffer?: string; // Optional: seller's counter offer amount (higher price)
  rejectionReason?: string; // If rejected, why
}

// Message from seller to other buyers asking if they want to beat an offer
export interface CompetingOfferRequest {
  type: 'competing-offer-request';
  auctionId: string; // Unique ID for this auction/negotiation
  proposal: ProposalInfo;
  currentOffer: {
    buyerId: string;
    desiredOutcome: string;
    offeredAmount: string;
  };
  deadline: string; // ISO timestamp - when to respond by
}

// Response from buyer indicating if they want to beat the offer
export interface CompetingOfferResponse {
  type: 'competing-offer-response';
  auctionId: string; // Must match the auctionId from the request
  wantsToBeat: boolean;
  newOffer?: VoteOffer; // If wantsToBeat is true, include the new offer
  reason?: string;
}

// User context - plain language instructions for the seller agent
export interface UserContext {
  instructions: string; // Plain language instructions about what votes are allowed/not allowed
  // e.g., "Always vote no for airdrops"
  // e.g., "I'm willing to sell votes for liquidity proposals but not governance changes"
  // e.g., "Minimum price is 5 HBAR per vote"
}

