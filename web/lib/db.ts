import { Client } from 'pg';

export interface DMM {
  id: number;
  name: string;
  description: string | null;
  topic_id: string;
  token_id: string;
  chain_id: number;
  created_at: Date;
  updated_at: Date;
}

export interface Proposal {
  id: number;
  dmm_id: number;
  name: string;
  description: string;
  quorum: string; // bigint comes as string from pg
  voting_deadline: Date;
  status: 'active' | 'passed' | 'failed' | 'expired';
  created_at: Date;
  updated_at: Date;
}

export interface DMMWithProposals extends DMM {
  proposals: Proposal[];
}

async function getClient(): Promise<Client> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dark_matter_market'
  });
  await client.connect();
  return client;
}

export async function getAllDMMs(): Promise<DMM[]> {
  const client = await getClient();
  
  try {
    const result = await client.query<DMM>(
      'SELECT id, name, description, topic_id, token_id, chain_id, created_at, updated_at FROM dmms ORDER BY created_at DESC'
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching DMMs:', error);
    throw error;
  } finally {
    await client.end();
  }
}

export async function getAllDMMsWithProposals(): Promise<DMMWithProposals[]> {
  const client = await getClient();
  
  try {
    // Fetch all DMMs
    const dmmsResult = await client.query<DMM>(
      'SELECT id, name, description, topic_id, token_id, chain_id, created_at, updated_at FROM dmms ORDER BY created_at DESC'
    );
    
    // Fetch all proposals
    const proposalsResult = await client.query<Proposal>(
      'SELECT id, dmm_id, name, description, quorum, voting_deadline, status, created_at, updated_at FROM proposals ORDER BY created_at DESC'
    );
    
    // Group proposals by DMM
    const proposalsByDmm = new Map<number, Proposal[]>();
    for (const proposal of proposalsResult.rows) {
      const existing = proposalsByDmm.get(proposal.dmm_id) || [];
      existing.push(proposal);
      proposalsByDmm.set(proposal.dmm_id, existing);
    }
    
    // Combine DMMs with their proposals
    return dmmsResult.rows.map(dmm => ({
      ...dmm,
      proposals: proposalsByDmm.get(dmm.id) || [],
    }));
  } catch (error) {
    console.error('Error fetching DMMs with proposals:', error);
    throw error;
  } finally {
    await client.end();
  }
}

