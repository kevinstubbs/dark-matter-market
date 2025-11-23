/**
 * Database seeding script
 * Run with: pnpm db:seed
 * 
 * This script can be used to seed your database with initial data
 * after migrations have been run.
 */

import { Client } from 'pg';

const client = new Client({
  connectionString: process.env.DATABASE_URL
   || 'postgresql://postg55res:postg33res@localhost:5432/dark_matter_market'
});

async function seed() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Example: Seed a test DMM
    // Uncomment and modify as needed for your testing
    
    // 295 is hedera mainnet
    // 296 is hedera testnet
    
    // Seed Testnet Sauce DMM
    const testnetDmmResult = await client.query(`
      INSERT INTO dmms (name, description, topic_id, chain_id)
      VALUES 
        ('Testnet Sauce DMM', 'A test Dark Matter Market', '0.0.7305833', 296)
      ON CONFLICT (topic_id) DO NOTHING
      RETURNING id
    `);

    // Get the Testnet DMM ID (either newly inserted or existing)
    let testnetDmmId: number;
    if (testnetDmmResult.rows.length > 0) {
      testnetDmmId = testnetDmmResult.rows[0].id;
    } else {
      // DMM already exists, find it
      const existingDmm = await client.query(`
        SELECT id FROM dmms WHERE topic_id = '0.0.7305833'
      `);
      if (existingDmm.rows.length === 0) {
        throw new Error('Failed to find or create Testnet DMM');
      }
      testnetDmmId = existingDmm.rows[0].id;
    }

    // Insert token for Testnet DMM
    await client.query(`
      INSERT INTO dmm_tokens (dmm_id, token_id)
      VALUES ($1, '0.0.7305894')
      ON CONFLICT (dmm_id, token_id) DO NOTHING
    `, [testnetDmmId]);

    // Seed SaucerSwap Governance V1 DMM
    const saucerswapDmmResult = await client.query(`
      INSERT INTO dmms (name, description, topic_id, chain_id)
      VALUES 
        ('SaucerSwap Governance V1', 'The SaucerSwap decentralized autonomous organization (DAO) governs key aspects of the protocol, including the allocation of rewards, creation of liquidity pools, adjustments to tokenomics, and management of the protocol''s treasury. The DAO''s decisions are made collectively by community members who hold SAUCE and xSAUCE tokens.', '0.0.6463050', 295)
      ON CONFLICT (topic_id) DO NOTHING
      RETURNING id
    `);

    // Get the SaucerSwap DMM ID (either newly inserted or existing)
    let saucerswapDmmId: number;
    if (saucerswapDmmResult.rows.length > 0) {
      saucerswapDmmId = saucerswapDmmResult.rows[0].id;
    } else {
      // DMM already exists, find it
      const existingDmm = await client.query(`
        SELECT id FROM dmms WHERE topic_id = '0.0.6463050'
      `);
      if (existingDmm.rows.length === 0) {
        throw new Error('Failed to find or create SaucerSwap DMM');
      }
      saucerswapDmmId = existingDmm.rows[0].id;
    }

    // Insert tokens for SaucerSwap DMM
    const saucerswapTokens = ['0.0.731861', '0.0.1460200'];
    for (const tokenId of saucerswapTokens) {
      await client.query(`
        INSERT INTO dmm_tokens (dmm_id, token_id)
        VALUES ($1, $2)
        ON CONFLICT (dmm_id, token_id) DO NOTHING
      `, [saucerswapDmmId, tokenId]);
    }

    // Add proposal for Testnet DMM
    const testnetProposalCheck = await client.query(`
      SELECT id FROM proposals WHERE dmm_id = $1 AND sequence_number IS NULL AND name = 'Create V2 Pool for gib/HBAR 1.00%'
    `, [testnetDmmId]);
    
    if (testnetProposalCheck.rows.length === 0) {
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 24); // 24 hours from now
      
      // Note: sequence_number comes from HCS (Hedera Consensus Service) message sequence numbers
      // It should be set when the proposal is created via HCS, not calculated here
      // For seed data, we leave it as NULL
      await client.query(`
        INSERT INTO proposals (dmm_id, sequence_number, name, description, quorum, voting_deadline, status)
        VALUES 
          ($1, NULL, 'Create V2 Pool for gib/HBAR 1.00%', '**We propose the creation of a V2 gib/HBAR pool with a 1.00% fee tier on SaucerSwap**. This pool will enhance capital efficiency as well as help maintain and encourage liquidity.\nGib is currently the most popular memecoin on Hedera. Through this V2 pool we aim to deepen liquidity for gib by offering more options to liquidity providers and traders by bolstering liquidity of the gib/HBAR pair.', 100000, $2, 'active')
      `, [testnetDmmId, deadline]);
    }

    // Add proposal for SaucerSwap Governance V1 DMM
    // This proposal has sequence_number 5640 from HCS
    const saucerswapProposalCheck = await client.query(`
      SELECT id FROM proposals WHERE dmm_id = $1 AND sequence_number = $2
    `, [saucerswapDmmId, 5640]);
    
    if (saucerswapProposalCheck.rows.length === 0) {
      // Set voting deadline to 7 days from now (typical DAO proposal duration)
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7);
      
      await client.query(`
        INSERT INTO proposals (dmm_id, sequence_number, name, description, quorum, voting_deadline, status)
        VALUES 
          ($1, $2, 'Treasury-Backed CEX Listings and Liquidity Framework', $3, 0, $4, 'active')
      `, [
        saucerswapDmmId,
        5640,
        'This proposal creates a standing, treasury-backed framework to fund CEX listings and provide/maintain liquidity for spot and derivatives. It establishes a SAUCE/WETH pool on Base (Uniswap) to broaden access. It allows asset conversions (including OTC), with per-draw memos and on-chain transparency. Centralizing liquidity under the DAO enables faster execution, deeper markets, and wider reach. Includes 55% total allocation: 50% cap for CEX (spot/derivatives) and 5% for Base liquidity.',
        deadline
      ]);
    }

    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();

