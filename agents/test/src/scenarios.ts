import { ProposalInfo } from '@dmm/agents-shared';
import { Sandbox } from './sandbox.js';

export interface TestScenario {
  name: string;
  proposal: ProposalInfo;
  buyerContext: string;
  sellerContext: string;
  expectedOutcome: 'accept' | 'reject' | 'counter';
  expectedReason?: string;
}

export const scenarios: TestScenario[] = [
  {
    name: 'Accept - Liquidity proposal, no conflicts',
    proposal: {
      dmmTopicId: '0.0.123456',
      proposalSequenceNumber: 1,
      title: 'Create V2 Pool for gib/HBAR 1.00%',
      description: 'We propose creating a new liquidity pool to increase capital efficiency.',
      options: ['yes', 'no'],
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    buyerContext: 'I want votes for proposals that increase liquidity',
    sellerContext: 'Always vote no for airdrops',
    expectedOutcome: 'accept',
  },
  {
    name: 'Reject - Airdrop proposal violates seller rule',
    proposal: {
      dmmTopicId: '0.0.123456',
      proposalSequenceNumber: 2,
      title: 'Airdrop tokens to all holders',
      description: 'We propose airdropping tokens to reward our community.',
      options: ['yes', 'no'],
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    buyerContext: 'I want votes for any proposal',
    sellerContext: 'Always vote no for airdrops',
    expectedOutcome: 'reject',
    expectedReason: 'airdrop',
  },
  {
    name: 'Counter - Price too low',
    proposal: {
      dmmTopicId: '0.0.123456',
      proposalSequenceNumber: 3,
      title: 'Increase liquidity rewards',
      description: 'We propose increasing rewards for liquidity providers.',
      options: ['yes', 'no'],
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    buyerContext: 'I want votes for liquidity proposals, budget 20 HBAR per vote',
    sellerContext: 'Minimum 15 HBAR per vote',
    expectedOutcome: 'counter',
  },
];

export async function runScenario(scenario: TestScenario): Promise<{
  passed: boolean;
  actualOutcome: string;
  details: any;
}> {
  const sandbox = new Sandbox();
  
  try {
    // Start buyer agent with context
    await sandbox.startBuyerAgent(scenario.buyerContext);
    
    // Start seller agent with context
    await sandbox.startSellerAgent(scenario.sellerContext);
    
    // Simulate negotiation
    const result = await sandbox.simulateNegotiation(
      scenario.proposal,
      scenario.buyerContext,
      scenario.sellerContext
    );
    
    // Determine actual outcome
    let actualOutcome: string;
    if (result.response.accepted) {
      actualOutcome = 'accept';
    } else if (result.response.counterOffer) {
      actualOutcome = 'counter';
    } else {
      actualOutcome = 'reject';
    }
    
    // Check if outcome matches expectation
    const passed = actualOutcome === scenario.expectedOutcome;
    
    // Check reason if specified
    let reasonMatch = true;
    if (scenario.expectedReason && result.response.rejectionReason) {
      reasonMatch = result.response.rejectionReason
        .toLowerCase()
        .includes(scenario.expectedReason.toLowerCase());
    }
    
    return {
      passed: passed && reasonMatch,
      actualOutcome,
      details: result,
    };
  } finally {
    await sandbox.stop();
  }
}

