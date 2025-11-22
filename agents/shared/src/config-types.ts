export interface BuyerConfig {
  name: string;
  port: number;
  instructions: string; // Plain language instructions
  desiredOutcome?: string; // Preferred outcome: "yes" or "no"
  maxPrice?: string; // Maximum HBAR per vote
}

export interface SellerConfig {
  name: string;
  port: number;
  instructions: string; // Plain language instructions
  minPrice?: string; // Minimum HBAR per vote
  buyerUrls?: string[]; // URLs of buyer agents to connect to
}

