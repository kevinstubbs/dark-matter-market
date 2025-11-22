# Buyer Config Files

Each JSON file defines a buyer persona with their preferences and behavior.

## Config Structure

```json
{
  "name": "Buyer Name",
  "port": 4000,
  "instructions": "Plain language instructions for the buyer's goals",
  "desiredOutcome": "yes" | "no" (optional),
  "maxPrice": "20" (optional, HBAR per vote)
}
```

## Example Personas

- **buyer_1.json**: Wants "yes" outcomes, supports liquidity proposals
- **buyer_2.json**: Wants "no" outcomes, opposes token dilution

## Usage

```bash
# Run buyer_1
cd agents/buyer
node dist/index.js configs/buyer_1.json

# Or from root
pnpm agents:buyer:1
```

