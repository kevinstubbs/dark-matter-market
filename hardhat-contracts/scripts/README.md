# Deployment Scripts

## deploy-hedera.ts

This script deploys Hedera native resources (tokens and HCS topics) for the governance system.

### What it does:

1. **Creates a fungible token** (GOV - Governance Token)
2. **Mints tokens to accounts**:
   - Buyer accounts (0.0.1002, 0.0.1003): 15,000 and 20,000 tokens respectively
   - Seller accounts (0.0.1004-0.0.1008): 12,000, 18,000, 25,000, 10,000, and 30,000 tokens respectively
   - Voting power accounts (0.0.1029, 0.0.1030, 0.0.1031): 50,000 tokens each for yes, no, and abstain votes
3. **Creates a single HCS topic**:
   - Governance topic: For proposals, votes, and delegates

### Usage:

```bash
# For localhost (default)
cd hardhat-contracts
HEDERA_NETWORK=localhost pnpm tsx scripts/deploy-hedera.ts

# For testnet
HEDERA_NETWORK=testnet pnpm tsx scripts/deploy-hedera.ts

# For mainnet
HEDERA_NETWORK=mainnet pnpm tsx scripts/deploy-hedera.ts
```

### Environment Variables:

- `HEDERA_NETWORK`: Network to deploy to (`localhost`, `testnet`, or `mainnet`). Defaults to `localhost`.
- `HEDERA_RPC_URL`: RPC URL for the network (optional, defaults based on network)

### Output:

The script will:
- Print deployment progress to the console
- Save deployment information to `deployment-info.json` in the `hardhat-contracts` directory

### Accounts Used:

All accounts are from `hiero-localhost-accounts.txt`:

- **Admin/Operator**: 0.0.1002 (creates token and topics)
- **Buyers**: 0.0.1002, 0.0.1003
- **Sellers**: 0.0.1004, 0.0.1005, 0.0.1006, 0.0.1007, 0.0.1008
- **Voting Power**: 0.0.1029 (yes), 0.0.1030 (no), 0.0.1031 (abstain)

### Notes:

- The script uses the first account (0.0.1002) as the operator/admin account
- All accounts must have sufficient HBAR balance for transaction fees
- The token is created with infinite supply and can be minted by the admin account
- HCS topics are created without any submit keys, meaning anyone can submit messages

