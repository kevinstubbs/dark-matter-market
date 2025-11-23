#!/usr/bin/env node

/**
 * Deployment script for Hedera token, HCS topic, and smart contract
 * 
 * This script:
 * 1. Creates a fungible token
 * 2. Mints tokens to buyer and seller accounts (different amounts, at least 10000 each)
 * 3. Mints tokens to the last three accounts for yes, no, abstain voting power
 * 4. Creates a single HCS topic for proposals, votes, and delegates
 * 5. Deploys VaultRewardVault contract
 * 6. Stores voting power configuration in Redis for agent access
 * 7. Creates a proposal message in the HCS topic
 * 8. Casts votes for the three voting power accounts (yes, no, abstain)
 * 9. Creates or updates DMM and proposal in the database with chain_id 298
 * 
 * Uses localhost accounts from hiero-localhost-accounts.txt
 */

import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  Hbar,
  TokenMintTransaction,
  TokenAssociateTransaction,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TransferTransaction,
  AccountBalanceQuery,
} from "@hashgraph/sdk";
import { network } from "hardhat";
import * as dotenv from "dotenv";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient, RedisClientType } from "redis";
import { Client as PgClient } from "pg";

// Load environment variables
dotenv.config();

interface AccountConfig {
  id: string;
  privateKey: string;
  amount: number;
  label?: string;
}

interface DeploymentInfo {
  network: string;
  tokenId: string;
  topicId: string;
  contractId: string;
  accounts: {
    admin: string;
    buyers: Array<{ id: string; amount: number }>;
    sellers: Array<{ id: string; amount: number }>;
    votingPower: Array<{ id: string; amount: number; label: string }>;
  };
}

// Localhost accounts from hiero-localhost-accounts.txt
// Using ECDSA keys (first 10 accounts: 0.0.1002 - 0.0.1011)
const LOCALHOST_ACCOUNTS = {
  // Admin/Operator account (first account)
  admin: {
    id: "0.0.1002",
    privateKey: "0x7f109a9e3b0d8ecfba9cc23a3614433ce0fa7ddcc80f2a8f10b222179a5a80d6",
  },
  // Buyer accounts
  buyers: [
    {
      id: "0.0.1002", // buyer_1
      privateKey: "0x7f109a9e3b0d8ecfba9cc23a3614433ce0fa7ddcc80f2a8f10b222179a5a80d6",
      amount: 15000, // Different amount for buyer 1
    },
    {
      id: "0.0.1003", // buyer_2
      privateKey: "0x6ec1f2e7d126a74a1d2ff9e1c5d90b92378c725e506651ff8bb8616a5c724628",
      amount: 20000, // Different amount for buyer 2
    },
  ],
  // Seller accounts
  sellers: [
    {
      id: "0.0.1004", // seller_1
      privateKey: "0xb4d7f7e82f61d81c95985771b8abf518f9328d019c36849d4214b5f995d13814",
      amount: 12000,
    },
    {
      id: "0.0.1005", // seller_2
      privateKey: "0x941536648ac10d5734973e94df413c17809d6cc5e24cd11e947e685acfbd12ae",
      amount: 18000,
    },
    {
      id: "0.0.1006", // seller_3
      privateKey: "0x5829cf333ef66b6bdd34950f096cb24e06ef041c5f63e577b4f3362309125863",
      amount: 25000,
    },
    {
      id: "0.0.1007", // seller_4
      privateKey: "0x8fc4bffe2b40b2b7db7fd937736c4575a0925511d7a0a2dfc3274e8c17b41d20",
      amount: 10000,
    },
    {
      id: "0.0.1008", // seller_5
      privateKey: "0xb6c10e2baaeba1fa4a8b73644db4f28f4bf0912cceb6e8959f73bb423c33bd84",
      amount: 30000,
    },
  ],
  // Voting power accounts (last three accounts from ED25519 section: 0.0.1029, 0.0.1030, 0.0.1031)
  // Note: These are ED25519 keys, but we'll use them as account IDs for token distribution
  votingPower: [
    {
      id: "0.0.1029", // yes voting power
      privateKey: "0xcb833706d1df537f59c418a00e36159f67ce3760ce6bf661f11f6da2b11c2c5a",
      amount: 0,
      label: "yes",
    },
    {
      id: "0.0.1030", // no voting power
      privateKey: "0x9b6adacefbbecff03e4359098d084a3af8039ce7f29d95ed28c7ebdb83740c83",
      amount: 0,
      label: "no",
    },
    {
      id: "0.0.1031", // abstain voting power
      privateKey: "0x9a07bbdbb62e24686d2a4259dc88e38438e2c7a1ba167b147ad30ac540b0a3cd",
      amount: 0,
      label: "abstain",
    },
  ],
};

function createHederaClient(): { client: Client; network: string } {
  const network = process.env.HEDERA_NETWORK || "localhost";

  let client: Client;
  if (network === "localhost" || network === "localnet") {
    // For localhost/localnet, create a custom client pointing to local node
    // Default local node addresses: 127.0.0.1:50211 (node 0), 127.0.0.1:50212 (node 1), etc.
    client = Client.forNetwork({
      "127.0.0.1:50211": AccountId.fromString("0.0.3"),
    });
    // Set the operator account as the node account for localhost
    client.setMirrorNetwork(["127.0.0.1:5600"]);
    // Increase timeout for localhost deployments
    client.setRequestTimeout(120000); // 2 minutes
  } else if (network === "testnet") {
    client = Client.forTestnet();
    client.setRequestTimeout(60000); // 1 minute
  } else {
    client = Client.forMainnet();
    client.setRequestTimeout(60000); // 1 minute
  }

  return { client, network };
}

function getAdminCredentials(): { accountId: AccountId; privateKey: PrivateKey } {
  const adminAccountId = AccountId.fromString(LOCALHOST_ACCOUNTS.admin.id);
  const adminPrivateKey = PrivateKey.fromStringECDSA(
    LOCALHOST_ACCOUNTS.admin.privateKey.replace("0x", "")
  );
  return { accountId: adminAccountId, privateKey: adminPrivateKey };
}

async function associateAccountWithToken(
  tokenId: any,
  accountId: AccountId,
  accountPrivateKey: PrivateKey,
  client: Client
): Promise<void> {
  const associateTx = await new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([tokenId])
    .freezeWith(client);

  const associateSign = await associateTx.sign(accountPrivateKey);
  const associateSubmit = await associateSign.execute(client);
  await associateSubmit.getReceipt(client);
}

async function mintAndTransferTokens(
  tokenId: any,
  recipientAccountId: string,
  recipientPrivateKey: string,
  amount: number,
  adminAccountId: AccountId,
  adminPrivateKey: PrivateKey,
  client: Client
): Promise<void> {
  if (amount === 0) {
    return; // Skip if amount is 0
  }

  const recipientId = AccountId.fromString(recipientAccountId);

  // Associate account with token (required before receiving tokens)
  // Skip if recipient is the admin account (treasury is automatically associated)
  if (recipientId.toString() !== adminAccountId.toString()) {
    const recipientKey = PrivateKey.fromStringECDSA(recipientPrivateKey.replace("0x", ""));
    await associateAccountWithToken(tokenId, recipientId, recipientKey, client);
  }

  // Mint tokens
  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(amount)
    .freezeWith(client);

  const mintSign = await mintTx.sign(adminPrivateKey);
  const mintSubmit = await mintSign.execute(client);
  await mintSubmit.getReceipt(client);

  // Transfer to recipient account
  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, adminAccountId, -amount)
    .addTokenTransfer(tokenId, recipientId, amount)
    .freezeWith(client);

  const transferSign = await transferTx.sign(adminPrivateKey);
  const transferSubmit = await transferSign.execute(client);
  await transferSubmit.getReceipt(client);
}

async function deployGovernanceToken(
  client: Client,
  adminAccountId: AccountId,
  adminPrivateKey: PrivateKey
): Promise<any> {
  console.log("Step 1: Creating fungible token...");

  const tokenCreateTx = await new TokenCreateTransaction()
    .setTokenName("Governance Token")
    .setTokenSymbol("GOV")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(0)
    .setInitialSupply(0)
    .setTreasuryAccountId(adminAccountId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setAdminKey(adminPrivateKey.publicKey)
    .setSupplyKey(adminPrivateKey.publicKey)
    .setFreezeDefault(false)
    .freezeWith(client);

  const tokenCreateSign = await tokenCreateTx.sign(adminPrivateKey);
  const tokenCreateSubmit = await tokenCreateSign.execute(client);
  const tokenCreateRx = await tokenCreateSubmit.getReceipt(client);
  const tokenId = tokenCreateRx.tokenId;

  if (!tokenId) {
    throw new Error("Token creation failed - no token ID returned");
  }

  console.log(`Token created: ${tokenId.toString()}\n`);
  return tokenId;
}

async function mintTokensToAccounts(
  tokenId: any,
  accounts: AccountConfig[],
  accountType: string,
  adminAccountId: AccountId,
  adminPrivateKey: PrivateKey,
  client: Client
): Promise<void> {
  console.log(`Step ${accountType === "buyer" ? "2" : "3"}: Minting tokens to ${accountType} accounts...`);

  for (const account of accounts) {
    await mintAndTransferTokens(
      tokenId,
      account.id,
      account.privateKey,
      account.amount,
      adminAccountId,
      adminPrivateKey,
      client
    );
    console.log(`  Minted ${account.amount} tokens to ${account.id}`);
  }
  console.log();
}

async function deployGovernanceTopic(
  client: Client,
  adminPrivateKey: PrivateKey
): Promise<any> {
  console.log("Step 4: Creating HCS topic...");

  const governanceTopicTx = await new TopicCreateTransaction()
    .setTopicMemo("Governance Topic - Proposals, Votes, and Delegates")
    .freezeWith(client);

  const governanceTopicSign = await governanceTopicTx.sign(adminPrivateKey);
  const governanceTopicSubmit = await governanceTopicSign.execute(client);
  const governanceTopicRx = await governanceTopicSubmit.getReceipt(client);
  const governanceTopicId = governanceTopicRx.topicId;

  if (!governanceTopicId) {
    throw new Error("Governance topic creation failed");
  }

  console.log(`  Governance topic created: ${governanceTopicId.toString()}\n`);
  return governanceTopicId;
}

/**
 * Deploy VaultRewardVault contract using Hardhat's ethers provider (same approach as deploytest.ts)
 * @param adminAccountId The account ID deploying the contract (for logging)
 * @returns Contract address in a format compatible with the rest of the script
 */
async function deployVaultRewardVault(
  adminAccountId: AccountId
): Promise<any> {
  console.log("Step 5: Deploying VaultRewardVault contract...");

  try {
    // Connect to the hedera network using Hardhat's network provider
    const { ethers } = await network.connect({
      network: "hedera"
    });

    // Get the signer (deployer)
    const [deployer] = await ethers.getSigners();
    console.log(`  Deploying contract with account: ${deployer.address}`);

    // Get the contract factory and deploy
    const VaultRewardVault = await ethers.getContractFactory("VaultRewardVault", deployer);
    const contract = await VaultRewardVault.deploy();

    // Wait for deployment to complete
    await contract.waitForDeployment();

    // Get the deployed contract address
    const address = await contract.getAddress();
    
    console.log(`  VaultRewardVault contract deployed at: ${address}\n`);
    
    // The deployer is the trusted wallet (set in constructor)
    console.log(`  Trusted wallet (deployer): ${adminAccountId.toString()}\n`);

    // Return address in a format compatible with the rest of the script
    // Convert the address string to a format that can be used like ContractId
    return {
      toString: () => address,
      toSolidityAddress: () => address,
    };
  } catch (error: any) {
    console.error(`  Contract deployment failed:`);
    console.error(`  Error: ${error.message || error}`);
    if (error.reason) {
      console.error(`  Reason: ${error.reason}`);
    }
    throw error;
  }
}


function printDeploymentSummary(tokenId: any, topicId: any, contractId: any): void {
  console.log("Deployment Summary:");
  console.log("=".repeat(50));
  console.log(`Token ID: ${tokenId.toString()}`);
  console.log(`Governance Topic ID: ${topicId.toString()}`);
  console.log(`VaultRewardVault Contract ID: ${contractId.toString()}`);
  console.log("=".repeat(50));
  console.log("\nDeployment completed successfully!");
}

async function storeVotingPowerInRedis(): Promise<void> {
  console.log("Step 6: Storing voting power config in Redis...");

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6380";
  const redis = createClient({ url: redisUrl });

  try {
    redis.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    await redis.connect();

    const votingPowerData = LOCALHOST_ACCOUNTS.votingPower.map((v) => ({
      id: v.id,
      label: v.label!,
      amount: v.amount,
    }));

    const key = "governance:voting_power";
    await redis.set(key, JSON.stringify(votingPowerData));

    console.log(`  Stored ${votingPowerData.length} voting power accounts in Redis`);
    console.log(`  Key: ${key}\n`);

    await redis.quit();
  } catch (error) {
    console.error("Error storing voting power in Redis:", error);
    await redis.quit();
    throw error;
  }
}

async function createProposalMessage(
  client: Client,
  topicId: any,
  adminPrivateKey: PrivateKey
): Promise<number> {
  console.log("Step 7: Creating proposal message in HCS topic...");

  const proposalMessage = {
    options: ["against", "yes", "abstain"],
    title: "Create V2 Pool for gib/HBAR 1.00%",
    description: "We propose the creation of a V2 gib/HBAR pool with a 1.00% fee tier on SaucerSwap. This pool will enhance capital efficiency as well as help maintain and encourage liquidity. Gib is currently the most popular memecoin on Hedera. Through this V2 pool we aim to deepen liquidity for gib by offering more options to liquidity providers and traders by bolstering liquidity of the gib/HBAR pair.",
    discussion: "https://gov.saucerswap.finance/t/create-v2-pool-for-gib-hbar-1-00/300",
    type: "Proposal",
    version: 1,
  };

  const messageJson = JSON.stringify(proposalMessage);
  const messageBytes = Buffer.from(messageJson, "utf-8");

  const submitTx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(messageBytes)
    .freezeWith(client);

  const submitSign = await submitTx.sign(adminPrivateKey);
  const submitSubmit = await submitSign.execute(client);
  const submitRx = await submitSubmit.getReceipt(client);

  const sequenceNumber = submitRx.topicSequenceNumber?.toNumber() || 0;

  console.log(`  Proposal message submitted to topic ${topicId.toString()}`);
  console.log(`  Transaction ID: ${submitSubmit.transactionId.toString()}`);
  console.log(`  Sequence Number: ${sequenceNumber}\n`);

  return sequenceNumber;
}

async function castVotesForVotingPowerAccounts(
  client: Client,
  topicId: any,
  proposalSequenceNumber: number,
  adminAccountId: AccountId,
  adminPrivateKey: PrivateKey
): Promise<void> {
  console.log("Step 8: Casting votes for voting power accounts...");

  const votes = [
    {
      account: LOCALHOST_ACCOUNTS.votingPower[0], // yes
      option: "yes",
    },
    {
      account: LOCALHOST_ACCOUNTS.votingPower[1], // no
      option: "no",
    },
    {
      account: LOCALHOST_ACCOUNTS.votingPower[2], // abstain
      option: "abstain",
    },
  ];

  for (const vote of votes) {
    const voteMessage = {
      option: vote.option,
      referendumType: "Election",
      sequenceNumber: proposalSequenceNumber,
      type: "Vote",
      version: 1,
    };

    const messageJson = JSON.stringify(voteMessage);
    const messageBytes = Buffer.from(messageJson, "utf-8");

    // Get the account ID and private key for this voting power account
    const accountId = AccountId.fromString(vote.account.id);
    const privateKey = PrivateKey.fromStringED25519(
      vote.account.privateKey.replace("0x", "")
    );

    // Store original operator
    const originalOperator = client.operatorAccountId;
    const originalOperatorKey = adminPrivateKey;

    // Set operator for this account to sign the transaction
    client.setOperator(accountId, privateKey);

    const submitTx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(messageBytes)
      .freezeWith(client);

    const submitSign = await submitTx.sign(privateKey);
    const submitSubmit = await submitSign.execute(client);
    const submitRx = await submitSubmit.getReceipt(client);

    console.log(`  ${vote.account.label} vote cast by ${vote.account.id}`);
    console.log(`    Option: ${vote.option}, Transaction ID: ${submitSubmit.transactionId.toString()}`);

    // Restore original operator
    if (originalOperator && originalOperatorKey) {
      client.setOperator(originalOperator, originalOperatorKey);
    }
  }

  console.log();
}

async function createOrUpdateDMMAndProposal(
  topicId: any,
  tokenId: any,
  chainId: number = 298
): Promise<void> {
  console.log("Step 9: Creating/updating DMM and proposal in database...");

  const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:6100/dark_matter_market";
  const pgClient = new PgClient({ connectionString: dbUrl });

  try {
    await pgClient.connect();

    // Create or update DMM (token_id is now in dmm_tokens junction table)
    const dmmResult = await pgClient.query(`
      INSERT INTO dmms (name, description, topic_id, chain_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (topic_id) 
      DO UPDATE SET 
        chain_id = EXCLUDED.chain_id,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `, [
      "Localhost Governance DMM",
      "Dark Matter Market for localhost governance",
      topicId.toString(),
      chainId,
    ]);

    const dmmId = dmmResult.rows[0].id;

    // Insert or update token association in dmm_tokens junction table
    await pgClient.query(`
      INSERT INTO dmm_tokens (dmm_id, token_id)
      VALUES ($1, $2)
      ON CONFLICT (dmm_id, token_id) DO NOTHING
    `, [dmmId, tokenId.toString()]);

    // Check if proposal already exists
    const proposalName = "Create V2 Pool for gib/HBAR 1.00%";
    const existingProposal = await pgClient.query(`
      SELECT id FROM proposals WHERE dmm_id = $1 AND name = $2
    `, [dmmId, proposalName]);

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7); // 7 days from now

    if (existingProposal.rows.length > 0) {
      // Update existing proposal
      await pgClient.query(`
        UPDATE proposals 
        SET description = $1, quorum = $2, voting_deadline = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [
        "We propose the creation of a V2 gib/HBAR pool with a 1.00% fee tier on SaucerSwap. This pool will enhance capital efficiency as well as help maintain and encourage liquidity. Gib is currently the most popular memecoin on Hedera. Through this V2 pool we aim to deepen liquidity for gib by offering more options to liquidity providers and traders by bolstering liquidity of the gib/HBAR pair.",
        100000,
        deadline,
        existingProposal.rows[0].id,
      ]);
      console.log(`  Proposal updated (ID: ${existingProposal.rows[0].id})`);
    } else {
      // Insert new proposal
      await pgClient.query(`
        INSERT INTO proposals (dmm_id, name, description, quorum, voting_deadline, status)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        dmmId,
        proposalName,
        "We propose the creation of a V2 gib/HBAR pool with a 1.00% fee tier on SaucerSwap. This pool will enhance capital efficiency as well as help maintain and encourage liquidity. Gib is currently the most popular memecoin on Hedera. Through this V2 pool we aim to deepen liquidity for gib by offering more options to liquidity providers and traders by bolstering liquidity of the gib/HBAR pair.",
        100000,
        deadline,
        "active",
      ]);
      console.log(`  Proposal created`);
    }

    console.log(`  DMM and proposal created/updated in database`);
    console.log(`  DMM ID: ${dmmId}, Chain ID: ${chainId}`);
    console.log();
  } catch (error) {
    console.error("Error creating/updating DMM and proposal:", error);
    throw error;
  } finally {
    await pgClient.end();
  }
}

async function saveDeploymentInfo(
  network: string,
  tokenId: any,
  topicId: any,
  contractId: any
): Promise<void> {
  const deploymentInfo: DeploymentInfo = {
    network,
    tokenId: tokenId.toString(),
    topicId: topicId.toString(),
    contractId: contractId.toString(),
    accounts: {
      admin: LOCALHOST_ACCOUNTS.admin.id,
      buyers: LOCALHOST_ACCOUNTS.buyers.map((b) => ({
        id: b.id,
        amount: b.amount,
      })),
      sellers: LOCALHOST_ACCOUNTS.sellers.map((s) => ({
        id: s.id,
        amount: s.amount,
      })),
      votingPower: LOCALHOST_ACCOUNTS.votingPower.map((v) => ({
        id: v.id,
        amount: v.amount,
        label: v.label!,
      })),
    },
  };

  const fs = await import("fs");
  const deploymentPath = join(process.cwd(), "deployment-info.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to: ${deploymentPath}`);
}

async function main() {
  console.log("Starting Hedera deployment...\n");

  const { client, network } = createHederaClient();
  const { accountId: adminAccountId, privateKey: adminPrivateKey } = getAdminCredentials();

  client.setOperator(adminAccountId, adminPrivateKey);

  console.log(`Connected to ${network}`);
  console.log(`Operator: ${adminAccountId.toString()}\n`);

  try {
    const tokenId = await deployGovernanceToken(client, adminAccountId, adminPrivateKey);

    const governanceTopicId = await deployGovernanceTopic(client, adminPrivateKey);

    // Deploy VaultRewardVault contract
    const contractId = await deployVaultRewardVault(adminAccountId);

    await mintTokensToAccounts(
      tokenId,
      LOCALHOST_ACCOUNTS.buyers,
      "buyer",
      adminAccountId,
      adminPrivateKey,
      client
    );

    await mintTokensToAccounts(
      tokenId,
      LOCALHOST_ACCOUNTS.sellers,
      "seller",
      adminAccountId,
      adminPrivateKey,
      client
    );

    await storeVotingPowerInRedis();

    const proposalSequenceNumber = await createProposalMessage(client, governanceTopicId, adminPrivateKey);

    await castVotesForVotingPowerAccounts(client, governanceTopicId, proposalSequenceNumber, adminAccountId, adminPrivateKey);

    await createOrUpdateDMMAndProposal(governanceTopicId, tokenId, 298);

    printDeploymentSummary(tokenId, governanceTopicId, contractId);
    await saveDeploymentInfo(network, tokenId, governanceTopicId, contractId);
  } catch (error) {
    console.error("Deployment failed:", error);
    throw error;
  } finally {
    client.close();
  }
}

main()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nError:", error);
    process.exit(1);
  });

