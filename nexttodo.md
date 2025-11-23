1. Use the localhost accounts for the buyer and seller agents
2. Update ignition script to create a token and mint it to the accounts. Each one should have a different amount, but at least 10000.
3. The last three accounts should be used for yes, no, abstain voting power.
4. Script should create an HCS topic for the proposal, votes, delegates.
5. Create a contract which lets buyers deposit incentive money in escrow for a particular proposal and outcome, and has a function where a trusted wallet can  - if the proposal completed then allocate rewards to each user who voted for that outcome.


1. Deploy all on chain stuff, and seed the proposal & DMM in database
2. Open website and should see the seeded data.
  2a. I should see votes, but no delegates and actually no voting power behind anything
3. Start the agents and I should see 2 more votes + voting power behind the results should go up
4. As agents settle, I should see numbers change further.

STRETCH: DAO owner can end the proposal, and trigger reward payouts.
