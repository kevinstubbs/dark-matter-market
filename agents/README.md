# Agent Implementation

This directory contains the agent implementation for the DMM vote negotiation system.

## Structure

- `shared/` - Shared types and utilities used by both buyer and seller agents
- `buyer/` - Buyer agent (A2A server) that wants to purchase votes
- `seller/` - Seller agent (A2A client) that has voting power and wants to sell
- `test/` - Test suite with sandbox environment and scenarios

## Setup

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Set up environment variables**:
   
   Create `.env` files in `buyer/` and `seller/` directories:
   ```bash
   # Required for LLM
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   
   # Required for Hedera interactions (future)
   HEDERA_ACCOUNT_ID=0.0.xxxxx
   HEDERA_PRIVATE_KEY=your_private_key_here
   HEDERA_NETWORK=testnet  # or mainnet
   ```

3. **Build all packages**:
   ```bash
   pnpm build
   ```

## Running Agents

### Buyer Agent

The buyer agent runs as an A2A server that accepts connections from seller agents.

```bash
# From root
pnpm agents:buyer

# Or from buyer directory
cd agents/buyer
pnpm start
```

The buyer agent will:
- Start an A2A server on port 4000 (or PORT env var)
- Serve an agent card at `http://localhost:4000/.well-known/agent-card.json`
- Load buyer context from `buyer-context.txt` (or use default)
- Accept connections from seller agents
- Evaluate proposals and create vote purchase offers

### Seller Agent

The seller agent runs as an A2A client that connects to buyer agents.

```bash
# From root
pnpm agents:seller

# Or from seller directory
cd agents/seller
pnpm start
```

The seller agent will:
- Load user context from `user-context.txt` (or use default)
- Connect to buyer agents specified in `BUYER_AGENT_URLS` env var (default: `http://localhost:4000`)
- Evaluate incoming vote offers against user's instructions
- Respond with accept/reject/counter-offer

## Configuration

### Buyer Context

Create `agents/buyer/buyer-context.txt` with plain language instructions:

```
I want votes for proposals that increase liquidity
Maximum 20 HBAR per vote
```

### Seller Context

Create `agents/seller/user-context.txt` with plain language instructions:

```
Always vote no for airdrops
Minimum 15 HBAR per vote
Willing to sell for liquidity proposals
```

## Testing

### Setup

1. **Create a `.env` file** in the `agents/test/` directory:
   ```bash
   cd agents/test
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY
   ```

   Or create it manually:
   ```bash
   # In agents/test/.env
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

2. **Run the automated test suite**:
   ```bash
   # From root
   pnpm agents:test

   # Or from test directory
   cd agents/test
   pnpm test
   ```

The test suite includes:
- Sandbox environment for isolated testing
- Multiple test scenarios (accept, reject, counter-offer)
- Integration with actual LLM evaluation

**Note**: The tests require an `ANTHROPIC_API_KEY` environment variable to run LLM evaluations. You can provide it via:
- A `.env` file in `agents/test/` directory (recommended)
- Environment variables in your shell
- Or the test will look for `.env` in the project root

## Development

### Building Individual Packages

```bash
# Build shared package
cd agents/shared
pnpm build

# Build buyer agent
cd agents/buyer
pnpm build

# Build seller agent
cd agents/seller
pnpm build
```

### Watch Mode

```bash
# Watch and rebuild on changes
cd agents/buyer
pnpm dev

cd agents/seller
pnpm dev
```

## Architecture

### Communication Flow

1. Buyer agent starts A2A server
2. Seller agent connects to buyer agent(s)
3. Buyer identifies a proposal they want votes for
4. Buyer's LLM evaluates proposal against buyer context
5. Buyer sends vote purchase offer to seller
6. Seller's LLM evaluates offer against user instructions
7. Seller responds with accept/reject/counter-offer
8. Negotiation continues until agreement or rejection

### LLM Integration

Both agents use LangChain with Anthropic's Claude to:
- Interpret plain language instructions
- Evaluate proposals and offers
- Make negotiation decisions

The LLM prompts are designed to:
- Follow user's instructions strictly
- Consider price constraints
- Provide reasoning for decisions

## Future Enhancements

- Multi-round negotiation with counter-offers
- Agent catalog/discovery mechanism
- Streaming updates for long-running negotiations
- Hedera Agent Kit integration for actual vote execution
- Payment execution when terms are agreed
- Escrow/smart contract integration

