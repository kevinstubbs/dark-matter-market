# First Implementation Outline

## Goal
Create a minimal proof-of-concept that demonstrates:
- User agents (sellers with voting power) connect to multiple buyer agents via A2A
- Buyer agents send vote purchase offers with proposals
- User agents evaluate offers against user's plain text instructions using LLM
- Agents negotiate prices for votes
- **Note**: Vote execution and payment are future work - this MVP focuses only on negotiation

## Project Structure

```
agents/
├── buyer/               # Buyer Agent (A2A Server) - Wants to buy votes
│   ├── src/
│   │   ├── index.ts     # A2A server setup
│   │   ├── executor.ts  # Handles incoming messages from seller agents
│   │   └── llm-evaluator.ts  # Uses LLM to interpret buyer's context and make offers
│   ├── package.json
│   └── tsconfig.json
│
├── seller/              # Seller Agent (A2A Client) - Has voting power, wants to sell
│   ├── src/
│   │   ├── index.ts     # A2A client setup, connects to multiple buyers
│   │   ├── preferences.ts  # Stores user's plain language instructions
│   │   ├── proposal-checker.ts  # Coordinates proposal evaluation
│   │   ├── llm-evaluator.ts  # Uses LLM to evaluate offers against user instructions
│   │   └── negotiation.ts  # Handles negotiation logic
│   ├── package.json
│   └── tsconfig.json
│
└── shared/              # Shared types and utilities
    ├── src/
    │   ├── types.ts     # Shared message types
    │   └── proposal-parser.ts  # Parse proposals from HCS messages
    └── package.json
```

## Implementation Steps

### 1. Shared Types (`agents/shared/src/types.ts`)

Define the message structure for communication:

```typescript
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

// User context - plain language instructions for the seller agent
export interface UserContext {
  instructions: string; // Plain language instructions about what votes are allowed/not allowed
  // e.g., "Always vote no for airdrops"
  // e.g., "I'm willing to sell votes for liquidity proposals but not governance changes"
  // e.g., "Minimum price is 5 HBAR per vote"
}
```

### 2. Proposal Parser (`agents/shared/src/proposal-parser.ts`)

Parse proposals from HCS topic messages:

```typescript
import { TopicMessage } from '../../cli/src/hedera.js';

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
```

### 3. Seller: User Agent (`agents/seller/src/index.ts`)

A2A client that:
- Loads user's plain text instructions
- Connects to multiple buyer agents
- Receives vote purchase offers
- Evaluates offers using LLM against user instructions
- Negotiates prices

```typescript
import { A2AClient } from '@a2a-js/sdk/client';
import { MessageSendParams } from '@a2a-js/sdk';
import { v4 as uuidv4 } from 'uuid';
import { loadUserContext } from './preferences.js';
import { evaluateOffer } from './negotiation.js';
import { VoteOffer, VoteOfferResponse } from '../shared/src/types.js';

// Store connections to multiple buyer agents
const buyerClients: Map<string, A2AClient> = new Map();

async function main() {
  // Load environment variables
  require('dotenv').config();
  
  // Load user's plain language instructions
  const userContext = await loadUserContext();
  console.log('User context loaded:', userContext.instructions);
  
  // Connect to multiple buyer agents
  // In real implementation, this would come from a catalog/discovery service
  const buyerUrls = (process.env.BUYER_AGENT_URLS || 'http://localhost:4000').split(',');
  
  for (const url of buyerUrls) {
    try {
      const client = await A2AClient.fromCardUrl(`${url}/.well-known/agent-card.json`);
      const buyerId = url; // or extract from agent card
      buyerClients.set(buyerId, client);
      console.log(`Connected to buyer agent at ${url}`);
    } catch (error) {
      console.error(`Failed to connect to buyer at ${url}:`, error);
    }
  }
  
  console.log(`Seller agent started. Connected to ${buyerClients.size} buyer agents.`);
  console.log('Waiting for vote purchase offers...');
  
  // In a real implementation, this would be a long-running service
  // that listens for incoming messages from buyer agents
  // For MVP, we'll demonstrate the negotiation pattern
}

// Handle incoming vote offer from a buyer
async function handleVoteOffer(
  buyerId: string,
  offer: VoteOffer,
  userContext: UserContext
): Promise<VoteOfferResponse> {
  // Use LLM to evaluate if proposal aligns with user's instructions
  // and determine if we should accept, reject, or counter-offer
  const evaluation = await evaluateOffer(offer, userContext.instructions);
  
  return evaluation;
}
```

### 4. Seller: Negotiation Handler (`agents/seller/src/negotiation.ts`)

Handles negotiation logic - evaluates offers and determines responses:

```typescript
import { VoteOffer, VoteOfferResponse } from '../shared/src/types.js';
import { evaluateOfferWithLLM } from './llm-evaluator.js';

export async function evaluateOffer(
  offer: VoteOffer,
  userInstructions: string
): Promise<VoteOfferResponse> {
  // Use LLM to evaluate the offer against user's instructions
  // The LLM will determine:
  // - Is this proposal allowed based on user's instructions?
  // - Is the price acceptable?
  // - Should we accept, reject, or counter-offer?
  return await evaluateOfferWithLLM(offer, userInstructions);
}
```

### 4a. Seller: LLM Evaluator (`agents/seller/src/llm-evaluator.ts`)

Uses LangChain with Anthropic to interpret user's plain language context and evaluate proposals:

```typescript
import { VoteOffer, VoteOfferResponse } from '../shared/src/types.js';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';

const llm = new ChatAnthropic({
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.3,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const outputParser = new JsonOutputParser();

export async function evaluateOfferWithLLM(
  offer: VoteOffer,
  userInstructions: string
): Promise<VoteOfferResponse> {
  // The agent receives the user's plain language instructions as context
  // and uses reasoning to determine if the offer should be accepted, rejected, or countered
  
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an agent helping a user sell their voting power. The user has given you plain text instructions about what votes are allowed/not allowed.
Always respond with valid JSON in this exact format:
{
  "accepted": true or false,
  "reason": "explanation of decision",
  "counterOffer": "optional higher price if you want to negotiate" or null,
  "rejectionReason": "why rejected if not accepted" or null
}`,
    ],
    [
      'human',
      `User's instructions about selling votes:
{userInstructions}

Vote purchase offer:
Proposal: {title}
Description: {description}
Desired outcome: {desiredOutcome}
Offered amount: {offeredAmount} HBAR per vote
Voting options: {options}

Based on the user's instructions, should we accept this offer, reject it, or make a counter-offer?`,
    ],
  ]);

  const chain = prompt.pipe(llm).pipe(outputParser);

  try {
    const result = await chain.invoke({
      userInstructions,
      title: offer.proposal.title,
      description: offer.proposal.description,
      desiredOutcome: offer.desiredOutcome,
      offeredAmount: offer.offeredAmount,
      options: offer.proposal.options.join(', '),
    });

    return {
      accepted: result.accepted === true,
      reason: result.reason || 'No reason provided',
      counterOffer: result.counterOffer || undefined,
      rejectionReason: result.rejectionReason || undefined,
    };
  } catch (e) {
    console.error('Error evaluating offer with LLM:', e);
    // Fallback if LLM doesn't return valid JSON
    return {
      accepted: false,
      rejectionReason: 'Unable to evaluate offer',
    };
  }
}
```

### 5. Seller: Preferences (`agents/seller/src/preferences.ts`)

Stores user's plain language context/instructions:

```typescript
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface UserContext {
  instructions: string; // Plain language instructions from user
  // e.g., "Always vote no for airdrops"
  // e.g., "I'm generally in favor of DeFi improvements but against token emissions"
  // e.g., "Vote yes on anything that increases liquidity, vote no on governance changes"
}

export async function loadUserContext(): Promise<UserContext> {
  // For MVP: simple text file with user's plain language instructions
  // Future: database, encrypted storage, etc.
  try {
    const contextPath = join(process.cwd(), 'user-context.txt');
    const instructions = readFileSync(contextPath, 'utf-8').trim();
    return { instructions };
  } catch (e) {
    // Default context if file doesn't exist
    return {
      instructions: 'Always vote no for airdrops',
    };
  }
}

export async function saveUserContext(context: UserContext): Promise<void> {
  const contextPath = join(process.cwd(), 'user-context.txt');
  writeFileSync(contextPath, context.instructions, 'utf-8');
}
```

### 6. Buyer: Buyer Agent (`agents/buyer/src/index.ts`)

A2A server that:
- Serves agent card for discovery
- Accepts connections from seller agents
- Sends vote purchase offers
- Receives responses and negotiates

```typescript
import { A2AServer } from '@a2a-js/sdk/server';
import { AgentCard } from '@a2a-js/sdk';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { BuyerExecutor } from './executor.js';

const PORT = process.env.PORT || 4000;

// Create agent card
const agentCard: AgentCard = {
  name: 'Vote Buyer Agent',
  version: '0.1.0',
  description: 'Agent that purchases votes for DMM proposals',
  instructions: 'I want to buy votes for specific proposals. Connect to negotiate prices.',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
};

// Create executor
const executor = new BuyerExecutor();
const taskStore = new InMemoryTaskStore();
const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);

// Create and start server
const server = new A2AServer(requestHandler);
server.listen(PORT, () => {
  console.log(`Buyer Agent running on http://localhost:${PORT}`);
  console.log(`Agent card available at http://localhost:${PORT}/.well-known/agent-card.json`);
});
```

### 7. Buyer: Executor (`agents/buyer/src/executor.ts`)

Handles incoming messages from seller agents (responses to offers). Uses LLM to interpret buyer's context and create offers:

```typescript
import {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';
import { VoteOffer, VoteOfferResponse, ProposalInfo } from '../shared/src/types.js';
import { loadBuyerContext } from './preferences.js';
import { createOfferWithLLM } from './llm-evaluator.js';

export class BuyerExecutor implements AgentExecutor {
  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, message } = requestContext;
    
    // Load buyer's plain language context/instructions
    // e.g., "I want votes for proposals that increase liquidity"
    const buyerContext = await loadBuyerContext();
    
    // Parse the incoming message - could be a response to an offer, or a request for an offer
    // For MVP: expect a simple text message with proposal info
    // Future: structured message with ProposalInfo object
    
    // Extract proposal info from message
    const proposalText = message.parts.find(p => p.kind === 'text')?.text || '';
    
    // Parse proposal (simplified for MVP)
    const proposal: ProposalInfo = {
      dmmTopicId: '0.0.123456', // Would come from actual proposal
      proposalSequenceNumber: 1,
      title: 'Example Proposal',
      description: proposalText,
      options: ['yes', 'no'],
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    
    // Use LLM to evaluate if this proposal aligns with buyer's context
    // and determine what offer to make
    const evaluation = await createOfferWithLLM(proposal, buyerContext.instructions);
    
    if (!evaluation.shouldPursue) {
      // Buyer's context indicates this proposal isn't worth pursuing
      eventBus.publish({
        kind: 'status-update',
        taskId,
        contextId,
        status: { 
          state: 'completed', 
          timestamp: new Date().toISOString() 
        },
        final: true,
      });
      eventBus.finished();
      return;
    }
    
    // Create vote purchase offer based on LLM's evaluation
    // In real implementation, would:
    // 1. Check current vote counts
    // 2. Calculate needed votes
    // 3. Determine offer amount based on market conditions
    
    const offer: VoteOffer = {
      proposal,
      desiredOutcome: evaluation.desiredOutcome || 'yes',
      offeredAmount: evaluation.suggestedAmount || '10', // HBAR per vote
      quantity: evaluation.quantity || 1, // Number of votes needed
    };
    
    // Publish the offer as an artifact
    eventBus.publish({
      kind: 'artifact-update',
      taskId,
      contextId,
      artifact: {
        artifactId: `offer-${taskId}`,
        mimeType: 'application/json',
        data: JSON.stringify(offer),
      },
    });
    
    // Mark as completed
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId,
      status: { state: 'completed', timestamp: new Date().toISOString() },
      final: true,
    });
    
    eventBus.finished();
  }
  
  async cancelTask(): Promise<void> {
    // MVP: no-op
  }
}
```

### 7a. Buyer: LLM Evaluator (`agents/buyer/src/llm-evaluator.ts`)

Uses LangChain with Anthropic to interpret provider's plain language context and evaluate proposals:

```typescript
import { ProposalInfo } from '../shared/src/types.js';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';

export interface ProviderEvaluation {
  shouldPursue: boolean;
  desiredOutcome?: string; // e.g., "yes", "no"
  suggestedAmount?: string; // Suggested bribe amount in HBAR
  reason?: string;
}

const llm = new ChatAnthropic({
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.3,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const outputParser = new JsonOutputParser();

export interface BuyerEvaluation {
  shouldPursue: boolean;
  desiredOutcome?: string; // e.g., "yes", "no"
  suggestedAmount?: string; // Suggested offer amount in HBAR per vote
  quantity?: number; // Number of votes needed
  reason?: string;
}

export async function createOfferWithLLM(
  proposal: ProposalInfo,
  buyerContext: string
): Promise<BuyerEvaluation> {
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an agent helping a buyer decide whether to purchase votes for a governance proposal.
Always respond with valid JSON in this exact format:
{
  "shouldPursue": true or false,
  "desiredOutcome": "yes" or "no" or "against",
  "suggestedAmount": "10" (HBAR amount per vote as string),
  "quantity": 1 (number of votes needed),
  "reason": "explanation"
}`,
    ],
    [
      'human',
      `Buyer's goals and context:
{buyerContext}

Proposal details:
Title: {title}
Description: {description}
Voting options: {options}

Based on the buyer's context, should they pursue purchasing votes for this proposal? What outcome do they want? What's a reasonable price to offer per vote?`,
    ],
  ]);

  const chain = prompt.pipe(llm).pipe(outputParser);

  try {
    const result = await chain.invoke({
      buyerContext,
      title: proposal.title,
      description: proposal.description,
      options: proposal.options.join(', '),
    });

    return {
      shouldPursue: result.shouldPursue === true,
      desiredOutcome: result.desiredOutcome,
      suggestedAmount: result.suggestedAmount || '10',
      quantity: result.quantity || 1,
      reason: result.reason || 'No reason provided',
    };
  } catch (e) {
    console.error('Error evaluating proposal with LLM:', e);
    return {
      shouldPursue: false,
      reason: 'Unable to evaluate proposal',
    };
  }
}
```

### 7b. Buyer: Preferences (`agents/buyer/src/preferences.ts`)

Stores buyer's plain language context:

```typescript
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface BuyerContext {
  instructions: string; // Plain language instructions from buyer
  // e.g., "I want votes for proposals that increase liquidity"
  // e.g., "I'm against any proposal that reduces token emissions"
  // e.g., "Support DeFi improvements, oppose governance changes"
  // e.g., "Maximum 20 HBAR per vote, need 100 votes"
}

export async function loadBuyerContext(): Promise<BuyerContext> {
  try {
    const contextPath = join(process.cwd(), 'buyer-context.txt');
    const instructions = readFileSync(contextPath, 'utf-8').trim();
    return { instructions };
  } catch (e) {
    return {
      instructions: 'I want votes for proposals that benefit the ecosystem',
    };
  }
}

export async function saveBuyerContext(context: BuyerContext): Promise<void> {
  const contextPath = join(process.cwd(), 'buyer-context.txt');
  writeFileSync(contextPath, context.instructions, 'utf-8');
}
```

## MVP Communication Flow

1. **Setup**:
   - Buyer agent starts A2A server on port 4000
   - Buyer configures context: `buyer-context.txt` with plain language instructions (e.g., "I want votes for proposals that increase liquidity")
   - Seller agent (user) starts A2A client, connects to one or more buyer agents
   - User configures context: `user-context.txt` with plain language instructions (e.g., "Always vote no for airdrops", "Minimum 5 HBAR per vote")

2. **Negotiation Flow**:
   - Buyer agent receives/identifies a proposal they want votes for
   - Buyer's LLM evaluates proposal against buyer's context to determine if worth pursuing
   - Buyer sends vote purchase offer with proposal info via A2A message to seller
   - Seller receives offer, uses LLM to evaluate against user's instructions
   - Seller responds with accept/reject/counter-offer (generated by LLM)
   - If counter-offer, buyer can accept/reject/counter again (negotiation continues)
   - **Note**: Once terms are agreed, execution (vote + payment) is future work

3. **Simple Example - Accepted**:
   ```
   Buyer context: "I want votes for proposals that increase liquidity"
   User context: "Always vote no for airdrops"
   
   Proposal: "Create V2 Pool for gib/HBAR 1.00%"
   
   Buyer LLM: "This proposal increases liquidity, aligns with buyer goals. Should pursue with 'yes' vote. Offer 10 HBAR per vote."
   Buyer → Seller: Vote offer - "yes" vote, 10 HBAR per vote
   
   Seller LLM: "This proposal is about creating a pool, not an airdrop. User's rule about airdrops doesn't apply. Price is acceptable. Can accept."
   Seller → Buyer: "Accepted"
   ```

4. **Example with Rejection**:
   ```
   Proposal: "Airdrop tokens to all holders"
   
   Buyer LLM: "This is an airdrop, may not align with liquidity goals. But let's try offering 15 HBAR per vote."
   Buyer → Seller: Vote offer - "yes" vote, 15 HBAR per vote
   
   Seller LLM: "This proposal is explicitly about an airdrop. User's context says 'Always vote no for airdrops'. Must reject regardless of price."
   Seller → Buyer: "Rejected. Reason: This proposal is about an airdrop, and I always vote no for airdrops."
   ```

5. **Example with Counter-Offer**:
   ```
   Proposal: "Increase liquidity rewards"
   
   Buyer → Seller: Vote offer - "yes" vote, 8 HBAR per vote
   
   Seller LLM: "Proposal is acceptable, but user's context says minimum 10 HBAR per vote. Should counter-offer."
   Seller → Buyer: "Counter-offer: 12 HBAR per vote. Reason: Minimum acceptable price is 10 HBAR, and this proposal requires 12."
   
   Buyer LLM: "12 HBAR is within budget. Should accept."
   Buyer → Seller: "Accepted at 12 HBAR per vote"
   ```

## Hedera Agent Kit Integration (Future)

For checking token balances and interacting with HCS topics, use Hedera Agent Kit:

```typescript
// Example: Initialize Hedera Agent Kit
import { HederaAgentKit } from 'hedera-agent-kit';
import { Client, AccountId, PrivateKey } from '@hashgraph/sdk';

async function initializeHederaAgent() {
  const client = Client.forTestnet(); // or forMainnet()
  client.setOperator(
    AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!),
    PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY!)
  );
  
  const agentKit = new HederaAgentKit({
    client,
    // Additional configuration
  });
  
  return agentKit;
}

// Example: Check token balance
async function checkTokenBalance(agentKit: HederaAgentKit, tokenId: string, accountId: string) {
  // Use Hedera Agent Kit to check balance
  // This will be used to determine voting power
}

// Example: Submit vote to HCS topic
async function submitVote(agentKit: HederaAgentKit, topicId: string, vote: any) {
  // Use Hedera Agent Kit to submit vote message to HCS topic
}
```

## Next Steps (Post-MVP)

**Note**: The MVP focuses only on negotiation. Execution is future work.

### Immediate Post-MVP:
- Add actual HCS topic integration to fetch real proposals using Hedera Agent Kit
- Enhance negotiation flow with multiple rounds of counter-offers
- Add agent catalog/discovery mechanism for sellers to find buyers
- Add streaming updates for long-running negotiations
- Cache LLM responses for similar proposals to reduce API costs

### Future - Execution Phase:
- Add Hedera Agent Kit integration for checking token balances (voting power)
- Implement vote execution on Hedera using Hedera Agent Kit
- Implement payment execution (token transfers) when terms are agreed
- Add escrow/smart contract integration for secure vote-for-payment
- Enhance LLM prompts with more context (token balances, vote counts, market conditions)

## Dependencies

### Seller Package (`agents/seller/package.json`)
```json
{
  "dependencies": {
    "@a2a-js/sdk": "^0.3.5",
    "uuid": "^9.0.0",
    "@types/uuid": "^9.0.0",
    "@langchain/core": "^0.3.0",
    "langchain": "^0.3.0",
    "@langchain/anthropic": "^0.3.0",
    "dotenv": "^16.0.0",
    "hedera-agent-kit": "latest",
    "@hashgraph/sdk": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Buyer Package (`agents/buyer/package.json`)
```json
{
  "dependencies": {
    "@a2a-js/sdk": "^0.3.5",
    "uuid": "^9.0.0",
    "@types/uuid": "^9.0.0",
    "@langchain/core": "^0.3.0",
    "langchain": "^0.3.0",
    "@langchain/anthropic": "^0.3.0",
    "dotenv": "^16.0.0",
    "hedera-agent-kit": "latest",
    "@hashgraph/sdk": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Shared Package (`agents/shared/package.json`)
```json
{
  "dependencies": {
    "@hashgraph/sdk": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Environment Variables

Create `.env` files in both `agents/seller/` and `agents/buyer/`:

```bash
# Required for LLM
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Required for Hedera interactions
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=your_private_key_here
HEDERA_NETWORK=testnet  # or mainnet

# Optional: Hedera Agent Kit configuration
HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=your_operator_key_here
```

## Testing the MVP

### Automated Sandbox Testing

Create a test suite that simulates the full negotiation flow in a sandbox environment.

#### Test Structure

```
agents/
├── test/
│   ├── src/
│   │   ├── sandbox.ts          # Main test orchestrator
│   │   ├── mock-buyer.ts       # Mock buyer agent for testing
│   │   ├── mock-seller.ts      # Mock seller agent for testing
│   │   ├── scenarios.ts        # Test scenarios
│   │   └── assertions.ts       # Test assertions
│   ├── fixtures/
│   │   ├── proposals.json      # Sample proposals
│   │   ├── buyer-contexts.txt  # Sample buyer contexts
│   │   └── seller-contexts.txt # Sample seller contexts
│   └── package.json
```

#### Test Orchestrator (`agents/test/src/sandbox.ts`)

```typescript
import { A2AServer } from '@a2a-js/sdk/server';
import { A2AClient } from '@a2a-js/sdk/client';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { AgentCard } from '@a2a-js/sdk';
import { BuyerExecutor } from '../../buyer/src/executor.js';
import { SellerAgent } from './mock-seller.js';
import { ProposalInfo, VoteOffer, VoteOfferResponse } from '../../shared/src/types.js';

export class Sandbox {
  private buyerServer: A2AServer | null = null;
  private sellerClient: A2AClient | null = null;
  private buyerPort: number;
  private buyerUrl: string;

  constructor(port: number = 4000) {
    this.buyerPort = port;
    this.buyerUrl = `http://localhost:${port}`;
  }

  async startBuyerAgent(buyerContext: string): Promise<void> {
    const agentCard: AgentCard = {
      name: 'Test Buyer Agent',
      version: '0.1.0',
      description: 'Test buyer agent for sandbox',
      instructions: buyerContext,
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
    };

    const executor = new BuyerExecutor();
    const taskStore = new InMemoryTaskStore();
    const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);
    this.buyerServer = new A2AServer(requestHandler);

    await new Promise<void>((resolve) => {
      this.buyerServer!.listen(this.buyerPort, () => {
        console.log(`[Sandbox] Buyer agent started on ${this.buyerUrl}`);
        resolve();
      });
    });
  }

  async startSellerAgent(sellerContext: string): Promise<void> {
    this.sellerClient = await A2AClient.fromCardUrl(
      `${this.buyerUrl}/.well-known/agent-card.json`
    );
    console.log('[Sandbox] Seller agent connected to buyer');
  }

  async simulateNegotiation(
    proposal: ProposalInfo,
    buyerContext: string,
    sellerContext: string
  ): Promise<{
    offer: VoteOffer;
    response: VoteOfferResponse;
    rounds: number;
  }> {
    if (!this.buyerServer || !this.sellerClient) {
      throw new Error('Agents not started. Call startBuyerAgent and startSellerAgent first.');
    }

    // Simulate buyer creating an offer
    const offer: VoteOffer = {
      proposal,
      desiredOutcome: 'yes',
      offeredAmount: '10',
      quantity: 1,
    };

    console.log(`[Sandbox] Buyer sends offer: ${offer.offeredAmount} HBAR for "${proposal.title}"`);

    // Simulate seller evaluating and responding
    const sellerAgent = new SellerAgent(sellerContext);
    const response = await sellerAgent.evaluateOffer(offer);

    console.log(`[Sandbox] Seller responds: ${response.accepted ? 'ACCEPTED' : 'REJECTED'}`);
    if (response.counterOffer) {
      console.log(`[Sandbox] Counter-offer: ${response.counterOffer} HBAR`);
    }
    if (response.rejectionReason) {
      console.log(`[Sandbox] Reason: ${response.rejectionReason}`);
    }

    return {
      offer,
      response,
      rounds: 1, // For MVP, single round. Can extend for multi-round negotiation
    };
  }

  async stop(): Promise<void> {
    if (this.buyerServer) {
      await this.buyerServer.close();
      console.log('[Sandbox] Buyer agent stopped');
    }
  }
}
```

#### Mock Seller Agent (`agents/test/src/mock-seller.ts`)

```typescript
import { VoteOffer, VoteOfferResponse } from '../../shared/src/types.js';
import { evaluateOfferWithLLM } from '../../seller/src/llm-evaluator.js';

export class SellerAgent {
  constructor(private userContext: string) {}

  async evaluateOffer(offer: VoteOffer): Promise<VoteOfferResponse> {
    // Use the actual LLM evaluator from seller agent
    return await evaluateOfferWithLLM(offer, this.userContext);
  }
}
```

#### Test Scenarios (`agents/test/src/scenarios.ts`)

```typescript
import { ProposalInfo } from '../../shared/src/types.js';
import { Sandbox } from './sandbox.js';

export interface TestScenario {
  name: string;
  proposal: ProposalInfo;
  buyerContext: string;
  sellerContext: string;
  expectedOutcome: 'accept' | 'reject' | 'counter';
  expectedReason?: string;
}

export const scenarios: TestScenario[] = [
  {
    name: 'Accept - Liquidity proposal, no conflicts',
    proposal: {
      dmmTopicId: '0.0.123456',
      proposalSequenceNumber: 1,
      title: 'Create V2 Pool for gib/HBAR 1.00%',
      description: 'We propose creating a new liquidity pool to increase capital efficiency.',
      options: ['yes', 'no'],
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    buyerContext: 'I want votes for proposals that increase liquidity',
    sellerContext: 'Always vote no for airdrops',
    expectedOutcome: 'accept',
  },
  {
    name: 'Reject - Airdrop proposal violates seller rule',
    proposal: {
      dmmTopicId: '0.0.123456',
      proposalSequenceNumber: 2,
      title: 'Airdrop tokens to all holders',
      description: 'We propose airdropping tokens to reward our community.',
      options: ['yes', 'no'],
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    buyerContext: 'I want votes for any proposal',
    sellerContext: 'Always vote no for airdrops',
    expectedOutcome: 'reject',
    expectedReason: 'airdrop',
  },
  {
    name: 'Counter - Price too low',
    proposal: {
      dmmTopicId: '0.0.123456',
      proposalSequenceNumber: 3,
      title: 'Increase liquidity rewards',
      description: 'We propose increasing rewards for liquidity providers.',
      options: ['yes', 'no'],
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    buyerContext: 'I want votes for liquidity proposals, budget 20 HBAR per vote',
    sellerContext: 'Minimum 15 HBAR per vote',
    expectedOutcome: 'counter',
  },
];

export async function runScenario(scenario: TestScenario): Promise<{
  passed: boolean;
  actualOutcome: string;
  details: any;
}> {
  const sandbox = new Sandbox();
  
  try {
    // Start buyer agent with context
    await sandbox.startBuyerAgent(scenario.buyerContext);
    
    // Start seller agent with context
    await sandbox.startSellerAgent(scenario.sellerContext);
    
    // Simulate negotiation
    const result = await sandbox.simulateNegotiation(
      scenario.proposal,
      scenario.buyerContext,
      scenario.sellerContext
    );
    
    // Determine actual outcome
    let actualOutcome: string;
    if (result.response.accepted) {
      actualOutcome = 'accept';
    } else if (result.response.counterOffer) {
      actualOutcome = 'counter';
    } else {
      actualOutcome = 'reject';
    }
    
    // Check if outcome matches expectation
    const passed = actualOutcome === scenario.expectedOutcome;
    
    // Check reason if specified
    let reasonMatch = true;
    if (scenario.expectedReason && result.response.rejectionReason) {
      reasonMatch = result.response.rejectionReason
        .toLowerCase()
        .includes(scenario.expectedReason.toLowerCase());
    }
    
    return {
      passed: passed && reasonMatch,
      actualOutcome,
      details: result,
    };
  } finally {
    await sandbox.stop();
  }
}
```

#### Test Runner (`agents/test/src/index.ts`)

```typescript
import { scenarios, runScenario } from './scenarios.js';
import * as colors from 'colors'; // or use chalk

async function runAllTests() {
  console.log('Starting Agent Negotiation Sandbox Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const scenario of scenarios) {
    console.log(`\nTest: ${scenario.name}`);
    console.log(`   Proposal: ${scenario.proposal.title}`);
    console.log(`   Expected: ${scenario.expectedOutcome}`);
    
    try {
      const result = await runScenario(scenario);
      
      if (result.passed) {
        console.log(`   PASSED - Actual: ${result.actualOutcome}`);
        passed++;
      } else {
        console.log(`   FAILED - Expected: ${scenario.expectedOutcome}, Actual: ${result.actualOutcome}`);
        console.log(`   Details:`, JSON.stringify(result.details, null, 2));
        failed++;
      }
    } catch (error) {
      console.log(`   ERROR: ${error}`);
      failed++;
    }
  }
  
  console.log(`\n\nTest Results:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${scenarios.length}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

#### Test Package Configuration (`agents/test/package.json`)

```json
{
  "name": "@dmm/agent-test",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "tsx src/index.ts",
    "test:watch": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@a2a-js/sdk": "^0.3.5",
    "uuid": "^9.0.0",
    "@langchain/core": "^0.3.0",
    "langchain": "^0.3.0",
    "@langchain/anthropic": "^0.3.0",
    "dotenv": "^16.0.0",
    "colors": "^1.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  }
}
```

### Running Tests

1. **Install dependencies**:
   ```bash
   cd agents/test
   pnpm install
   ```

2. **Set up environment**:
   ```bash
   # Create .env file
   echo "ANTHROPIC_API_KEY=your_key_here" > .env
   ```

3. **Run all scenarios**:
   ```bash
   pnpm test
   ```

4. **Run specific scenario** (modify `index.ts` to filter):
   ```typescript
   // In index.ts, filter scenarios:
   const scenarioToTest = scenarios.find(s => s.name === 'Accept - Liquidity proposal');
   if (scenarioToTest) {
     await runScenario(scenarioToTest);
   }
   ```

### Manual Testing

For manual testing and debugging:

1. **Start buyer agent**:
   ```bash
   cd agents/buyer
   pnpm start
   ```

2. **In another terminal, start seller agent**:
   ```bash
   cd agents/seller
   pnpm start
   ```

3. **Send test offer** (create a simple script or use curl):
   ```typescript
   // test-manual.ts
   import { A2AClient } from '@a2a-js/sdk/client';
   import { v4 as uuidv4 } from 'uuid';
   
   const client = await A2AClient.fromCardUrl('http://localhost:4000/.well-known/agent-card.json');
   
   const response = await client.sendMessage({
     message: {
       messageId: uuidv4(),
       role: 'user',
       parts: [{ 
         kind: 'text', 
         text: JSON.stringify({
           title: 'Test Proposal',
           description: 'This is a test proposal',
           options: ['yes', 'no']
         })
       }],
       kind: 'message',
     },
   });
   
   console.log('Response:', response);
   ```

### Test Fixtures

Create sample data files for easy testing:

**`agents/test/fixtures/proposals.json`**:
```json
{
  "liquidity": {
    "dmmTopicId": "0.0.123456",
    "proposalSequenceNumber": 1,
    "title": "Create V2 Pool for gib/HBAR 1.00%",
    "description": "We propose creating a new liquidity pool...",
    "options": ["yes", "no"],
    "deadline": "2024-12-31T23:59:59Z"
  },
  "airdrop": {
    "dmmTopicId": "0.0.123456",
    "proposalSequenceNumber": 2,
    "title": "Airdrop tokens to all holders",
    "description": "We propose airdropping tokens...",
    "options": ["yes", "no"],
    "deadline": "2024-12-31T23:59:59Z"
  }
}
```

**`agents/test/fixtures/seller-contexts.txt`**:
```
# Context 1: Airdrop hater
Always vote no for airdrops

# Context 2: Price conscious
Minimum 15 HBAR per vote. Willing to sell for any proposal if price is right.

# Context 3: DeFi supporter
Vote yes on liquidity and DeFi proposals. Vote no on governance changes.
```

### Benefits of This Approach

1. **Automated**: Run all scenarios with one command
2. **Isolated**: Each test runs in its own sandbox
3. **Realistic**: Uses actual agent code and LLM evaluation
4. **Extensible**: Easy to add new scenarios
5. **Debuggable**: Can run individual scenarios or manual tests
6. **CI/CD Ready**: Can be integrated into CI pipelines

### Future Enhancements

- Add multi-round negotiation tests
- Add performance/load testing
- Add integration with actual Hedera testnet
- Add visual test reports
- Add test coverage metrics

