# Agent Test Suite

Automated test suite for the agent negotiation system.

## Setup

### Environment Variables

The tests require an `ANTHROPIC_API_KEY` environment variable for LLM evaluation. You can provide it this way:

1. **Create a `.env` file** in the `agents/test/` directory:
   ```bash
   cd agents/test
   echo "ANTHROPIC_API_KEY=your_key_here" > .env
   ```

The test code will look for `.env` files in this order:
1. `agents/test/.env`
2. Project root `.env`
3. Environment variables from your shell

## Running Tests

```bash
# From project root
pnpm agents:test

# Or from test directory
cd agents/test
pnpm test
```

## Test Scenarios

The test suite includes scenarios for:
- **Accept**: Proposals that align with both buyer and seller contexts
- **Reject**: Proposals that violate seller's rules (e.g., airdrops)
- **Counter-offer**: Price negotiations where seller wants a higher price

## Test Structure

- `src/index.ts` - Main test runner
- `src/scenarios.ts` - Test scenario definitions
- `src/sandbox.ts` - Sandbox environment for isolated testing
- `src/mock-seller.ts` - Mock seller agent for testing
- `fixtures/` - Sample proposals and contexts

