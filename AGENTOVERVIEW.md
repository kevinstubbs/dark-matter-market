# Agent Architecture Overview

## Individual Agents (A2A Clients)

Individuals run their own agents, running as **A2A clients**:
- Choose which DMMs to run it for
- Agent determines the user's balance of each one (using Hedera Agent Kit)
- Connects to a catalog of well-known agents (via A2A agent discovery)
- Acts as **Bribee agents** - willing to vote in exchange for incentives
- Continuously monitors:
  - Token balances across selected DMMs
  - New proposals on those DMMs
  - Voting power calculations
- Receives bribe offers from incentive provider agents via A2A
- Accepts/rejects offers based on user's natural language preferences
- Automatically executes votes when bribes are accepted
- Manages rewards (auto-sweep to Bonzo vault or buy more tokens)

## Incentive Provider Agents (A2A Servers)

Incentive providers also have agents, which run as **A2A servers**:
- Acts as **Briber agents** - seeking votes for specific outcomes
- Publishes agent card for discovery by individual agents
- Continuously running to:
  - Monitor vote counts on target proposals
  - Calculate needed votes to reach desired outcome
  - Discover and negotiate with available Bribee agents
  - Adapt strategy based on market conditions
- Uses A2A to:
  - Discover available Bribee agents from catalog
  - Send bribe offers with terms (vote needed, payment amount)
  - Negotiate prices with multiple agents
  - Coordinate vote execution timing
- Uses Hedera Agent Kit to:
  - Monitor HCS topics for current vote tallies
  - Execute token transfers for accepted bribes
  - Submit votes once threshold is met
  - Track spending against maximum budget

## Agent Discovery & Communication Flow

1. **Discovery**: Individual agents (clients) discover incentive provider agents (servers) via A2A agent card catalog
2. **Registration**: Bribee agents register their availability and preferences with the catalog
3. **Negotiation**: Briber agents send A2A messages to Bribee agents with bribe offers
4. **Execution**: Accepted offers trigger Hedera transactions (token transfers + votes)
5. **Monitoring**: Both sides use A2A streaming to provide real-time updates on task progress

## Key Integration Points

- **A2A Protocol**: Handles all agent-to-agent communication, discovery, and task coordination
- **Hedera Agent Kit**: Handles all on-chain operations (token checks, transfers, HCS topic interactions)
- **HCS Topics**: Source of truth for proposals, votes, and delegations
- **Redis Cache**: Fast access to topic messages for vote calculationsIncentive provider will determine which proposal they have incentives for, their maximum budget, and what outcome they want.
- The agent needs to negotiate to secure that outcome, spending as little as possible.
