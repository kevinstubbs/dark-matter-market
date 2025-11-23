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
   || 'postgresql://postgres:postgres@localhost:6100/dark_matter_market'
});

async function seed() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Example: Seed a test DMM
    // Uncomment and modify as needed for your testing
    
    // 295 is hedera mainnet
    // 296 is hedera testnet
    const dmmResult = await client.query(`
      INSERT INTO dmms (name, description, topic_id, token_id, chain_id)
      VALUES 
        ('Testnet Sauce DMM', 'A test Dark Matter Market', '0.0.7305833', '0.0.7305894', 296)
      ON CONFLICT (topic_id) DO NOTHING
      RETURNING id
    `);

    // Get the DMM ID (either newly inserted or existing)
    let dmmId: number;
    if (dmmResult.rows.length > 0) {
      dmmId = dmmResult.rows[0].id;
    } else {
      // DMM already exists, find it
      const existingDmm = await client.query(`
        SELECT id FROM dmms WHERE topic_id = '0.0.7305833'
      `);
      if (existingDmm.rows.length === 0) {
        throw new Error('Failed to find or create DMM');
      }
      dmmId = existingDmm.rows[0].id;
    }
    
    // Check if proposal already exists for this DMM
    const existingProposal = await client.query(`
      SELECT id FROM proposals WHERE dmm_id = $1 AND name = 'Sample Proposal'
    `, [dmmId]);
    
    // Only insert if proposal doesn't exist
    if (existingProposal.rows.length === 0) {
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 24); // 24 hours from now
      
      await client.query(`
        INSERT INTO proposals (dmm_id, name, description, quorum, voting_deadline, status)
        VALUES 
          ($1, 'Create V2 Pool for gib/HBAR 1.00%', '**We propose the creation of a V2 gib/HBAR pool with a 1.00% fee tier on SaucerSwap**. This pool will enhance capital efficiency as well as help maintain and encourage liquidity.\nGib is currently the most popular memecoin on Hedera. Through this V2 pool we aim to deepen liquidity for gib by offering more options to liquidity providers and traders by bolstering liquidity of the gib/HBAR pair.', 100000, $2, 'active')
      `, [dmmId, deadline]);
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

