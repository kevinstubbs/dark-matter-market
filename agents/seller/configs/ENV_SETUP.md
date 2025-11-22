# Environment Setup for Seller Agents

Each seller agent requires a Hedera wallet secret key stored in a `.env.{agent-id}` file.

## Setup Instructions

1. For each agent (e.g., `seller-1`), create a file named `.env.seller-1` in this directory
2. Add the following content, replacing `YOUR_SECRET_KEY_HERE` with the actual Hedera secret key:

```
HEDERA_SECRET=302e020100300506032b657004220420YOUR_SECRET_KEY_HERE
```

3. The secret key should correspond to the `walletAddress` specified in the agent's JSON config file

## Important

- **DO NOT** commit `.env.*` files to git (they are already in .gitignore)
- Each agent must have its own unique `.env.{agent-id}` file
- The secret key format is typically a DER-encoded private key starting with `302e0201...`

## Example

For `seller-1` with wallet address `0.0.1234567`:
- Config file: `seller_1.json` (contains `walletAddress: "0.0.1234567"`)
- Secret file: `.env.seller-1` (contains `HEDERA_SECRET=...`)
