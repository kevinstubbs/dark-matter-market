- DMMs are Dark Matter Markets.
- DAOs may have proposals, which have a description and yes/no/abstain outcomes.
- Users can cast their votes for these by submitting a message to a Hedera topic.
- Users can delegate their votes to another address (and undelegate) by sending a message to the topic. It may look like this `{"delegatee":"0.0.xxx","type":"Delegation"}`
- Proposals require a quorum of enough votes in order to pass.
- When the voting deadline passes, all of the votes are tallied (delegatees should count with the weight of those who delegated to them). Voting power is determined based on the # tokens which the user has at the time of the deadline.

VOTING/DELEGATION STRUCTURE
- Votes, delegation and undelegating are messages on HCS
Example of submitting a proposal
https://hashscan.io/mainnet/transaction/1756466339.502721000/message

Sequence number: 5494
```
{
  "options": [
    "against",
    "yes"
  ],
  "title": "Create V2 Pool for gib/HBAR 1.00% ",
  "description": "We propose the creation of a V2 gib/HBAR pool with a 1.00% fee tier on SaucerSwap. This pool will enhance capital efficiency as well as help maintain and encourage liquidity. Gib is currently the most popular memecoin on Hedera. Through this V2 pool we aim to deepen liquidity for gib by offering more options to liquidity providers and traders by bolstering liquidity of the gib/HBAR pair.",
  "discussion": "https://gov.saucerswap.finance/t/create-v2-pool-for-gib-hbar-1-00/300",
  "type": "Proposal",
  "version": 1
}
```

Memo: SaucerSwap Governance V1
https://hashscan.io/mainnet/topic/0.0.6463050

Delegate
https://hashscan.io/mainnet/transaction/1763622033.878267000
{"type":"Delegation","version":1}

Delegatee
https://hashscan.io/mainnet/transaction/1763621994.515954000
```
{
  "delegatee": "0.0.826008",
  "type": "Delegation",
  "version": 1
}
```

Vote
```
{
  "option": "yes",
  "referendumType": "Election",
  "sequenceNumber": 5706,
  "type": "Vote",
  "version": 1
}
```