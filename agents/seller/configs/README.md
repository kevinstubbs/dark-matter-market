# Seller Config Files

Each JSON file defines a seller persona with their preferences and behavior.

## Config Structure

```json
{
  "name": "Seller Name",
  "port": 4001,
  "instructions": "Plain language instructions for the seller's preferences",
  "minPrice": "10" (optional, HBAR per vote),
  "buyerUrls": ["http://localhost:4000", "http://localhost:4002"] (optional)
}
```

## Example Personas

- **seller_1.json**: Airdrop hater, minimum 10 HBAR
- **seller_2.json**: Price conscious, minimum 15 HBAR
- **seller_3.json**: DeFi supporter, minimum 12 HBAR
- **seller_4.json**: Flexible trader, minimum 8 HBAR
- **seller_5.json**: Premium only, minimum 20 HBAR

## Usage

```bash
# Run seller_1
cd agents/seller
node dist/index.js configs/seller_1.json

# Or from root
pnpm agents:seller:1
```

