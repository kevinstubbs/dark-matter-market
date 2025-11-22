# Agent Demo Guide

This guide shows how to run multiple buyer and seller personas for demos.

## Configuration Files

All personas are configured via JSON files in:
- `agents/buyer/configs/` - Buyer personas
- `agents/seller/configs/` - Seller personas

## Quick Start

### 1. Build all agents

```bash
pnpm build
```

### 2. Set up environment

Create a `.env` file in the project root or in `agents/` directory:

```bash
ANTHROPIC_API_KEY=your_key_here
```

### 3. Run Buyers

In separate terminals:

```bash
# Terminal 1: Buyer 1 (wants "yes" outcomes)
cd agents/buyer
node dist/index.js configs/buyer_1.json

# Terminal 2: Buyer 2 (wants "no" outcomes)  
cd agents/buyer
node dist/index.js configs/buyer_2.json
```

Or use the npm scripts:

```bash
# From project root
pnpm agents:buyer:1  # Buyer 1 on port 4000
pnpm agents:buyer:2  # Buyer 2 on port 4002
```

### 4. Run Sellers

In separate terminals:

```bash
# Terminal 3: Seller 1
cd agents/seller
node dist/index.js configs/seller_1.json

# Terminal 4: Seller 2
cd agents/seller
node dist/index.js configs/seller_2.json

# Terminal 5: Seller 3
cd agents/seller
node dist/index.js configs/seller_3.json

# Terminal 6: Seller 4
cd agents/seller
node dist/index.js configs/seller_4.json

# Terminal 7: Seller 5
cd agents/seller
node dist/index.js configs/seller_5.json
```

Or use the npm scripts:

```bash
# From project root
pnpm agents:seller:1  # Seller 1 on port 4001
pnpm agents:seller:2  # Seller 2 on port 4003
pnpm agents:seller:3  # Seller 3 on port 4004
pnpm agents:seller:4  # Seller 4 on port 4005
pnpm agents:seller:5  # Seller 5 on port 4006
```

## Demo Personas

### Buyers

- **buyer_1** (port 4000): Wants "yes" outcomes, supports liquidity proposals, max 20 HBAR
- **buyer_2** (port 4002): Wants "no" outcomes, opposes token dilution, max 25 HBAR

### Sellers

- **seller_1** (port 4001): Airdrop hater, minimum 10 HBAR
- **seller_2** (port 4003): Price conscious, minimum 15 HBAR
- **seller_3** (port 4004): DeFi supporter, minimum 12 HBAR
- **seller_4** (port 4005): Flexible trader, minimum 8 HBAR
- **seller_5** (port 4006): Premium only, minimum 20 HBAR

## What Happens

1. Sellers start and connect to buyers (with retry logic)
2. Each seller sends a "ready" message to connected buyers
3. Buyers receive "ready" messages and create offers based on their config
4. Sellers evaluate offers using LLM against their instructions
5. Negotiations proceed (accept/reject/counter-offer)
6. Agents continue running and handle multiple negotiations

## Customizing Personas

Edit the JSON config files to change:
- Instructions/preferences
- Port numbers
- Price limits
- Desired outcomes (for buyers)
- Minimum prices (for sellers)
- Which buyers to connect to (for sellers)

## Example Config

```json
{
  "name": "My Buyer",
  "port": 4010,
  "instructions": "I want votes for proposals that increase token value",
  "desiredOutcome": "yes",
  "maxPrice": "30"
}
```

