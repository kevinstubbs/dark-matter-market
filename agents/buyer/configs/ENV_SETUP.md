# Environment Setup for Buyer Agents

Each buyer agent requires a Hedera wallet secret key stored in a `.env` file. The path to this file is specified in the agent's JSON config file using the `envFile` field.

## Setup Instructions

1. Each agent config (e.g., `buyer_1.json`) specifies an `envFile` field (e.g., `.env.buyer-1`)
2. Create the `.env` file with the name specified in the config's `envFile` field
3. Add the following content, replacing `YOUR_SECRET_KEY_HERE` with the actual Hedera secret key:

```
HEDERA_SECRET=302e020100300506032b657004220420YOUR_SECRET_KEY_HERE
```

4. The secret key should correspond to the `walletAddress` specified in the agent's JSON config file

## Important

- **DO NOT** commit `.env.*` files to git (they are already in .gitignore)
- Each agent must have its own unique `.env` file as specified in the config
- The `envFile` path in the config is relative to the config file's directory
- The secret key format is typically a DER-encoded private key starting with `302e0201...`

## Example

For `buyer-1` with wallet address `0.0.1234567`:
- Config file: `buyer_1.json` 
  - Contains `walletAddress: "0.0.1234567"`
  - Contains `envFile: ".env.buyer-1"`
- Secret file: `.env.buyer-1` (in the same directory as the config)
  - Contains `HEDERA_SECRET=...`
