# Architectural Diagram Prompts

This document contains prompts you can use with generative AI tools (like ChatGPT, Claude, or diagram generators) to create architectural diagrams for the DMM vote negotiation system.

---

## Diagram 1: Agent Communication Architecture

### Prompt:

Create a high-level architectural diagram showing how buyer and seller agents communicate in a DMM (Dark Matter Market) vote negotiation system. The diagram should be suitable for a 3-minute demo presentation.

**System Overview:**
- This is a decentralized vote marketplace where AI agents negotiate vote purchases
- Buyer agents (A2A servers) want to purchase votes for specific proposal outcomes
- Seller agents (A2A clients) have voting power and want to sell their votes
- All communication happens via the A2A (Agent-to-Agent) protocol over HTTP

**Key Components to Include:**

1. **Buyer Agent (A2A Server)**
   - Runs on a specific port (e.g., port 4000)
   - Publishes agent card at `/.well-known/agent-card.json`
   - Has buyer context/instructions (plain language preferences)
   - Uses LLM (Claude/Anthropic) to evaluate proposals
   - Creates vote purchase offers based on proposals

2. **Seller Agent (A2A Client)**
   - Connects to one or more buyer agents
   - Has user context/instructions (plain language preferences)
   - Uses LLM to evaluate incoming offers
   - Can accept, reject, or counter-offer

3. **Communication Flow:**
   - Seller connects to buyer(s) by fetching agent card
   - Seller sends "ready" message to buyer
   - Buyer evaluates proposal using LLM
   - Buyer sends vote purchase offer (proposal info, desired outcome, price in HBAR)
   - Seller evaluates offer using LLM
   - Seller responds with accept/reject/counter-offer
   - If counter-offer, negotiation continues
   - If multiple buyers, seller can request competing offers (auction mechanism)

4. **Auction Mechanism:**
   - When seller receives an offer, they can notify other buyers
   - Other buyers can submit competing offers
   - Seller selects the best offer
   - Original buyer may be outbid

**Visual Style:**
- Use boxes/rectangles for agents
- Use arrows to show message flow
- Label messages with their type (e.g., "seller-ready", "vote-offer", "accept/reject")
- Show LLM evaluation steps as separate boxes or annotations
- Use different colors for buyer vs seller agents
- Show the A2A protocol layer as a communication channel
- Include a legend if needed

**Key Message Types:**
- `seller-ready`: Seller notifies buyer they're ready
- `vote-offer`: Buyer sends offer with proposal, outcome, price
- `vote-offer-response`: Seller responds (accept/reject/counter)
- `competing-offer-request`: Seller asks other buyers to beat an offer
- `competing-offer-response`: Buyer responds to auction request

**Layout Suggestions:**
- Place buyer agent(s) on the left
- Place seller agent(s) on the right
- Show communication flow horizontally with numbered steps
- Show LLM evaluation as vertical annotations or side boxes
- For auction flow, show a branching diagram

---

## Diagram 2: Voting, Delegation, and Vote Selling Mechanism

### Prompt:

Create a high-level architectural diagram showing how voting, delegation, and vote selling work in a DMM (Dark Matter Market) system built on Hedera Hashgraph. The diagram should be suitable for a 3-minute demo presentation.

**System Overview:**
- DMMs are Dark Matter Markets (DAO governance systems)
- All voting and delegation happens on Hedera Consensus Service (HCS) topics
- Users can vote, delegate votes, or sell their voting power to agents
- Voting power is based on token holdings at proposal deadline

**Key Components to Include:**

1. **Hedera Consensus Service (HCS) Topic**
   - Central message log for all governance actions
   - Stores proposals, votes, and delegations as messages
   - Each message has a sequence number
   - Immutable and timestamped

2. **Proposal Submission**
   - Proposals are submitted as JSON messages to the HCS topic
   - Contains: title, description, options (yes/no/abstain), deadline
   - Has a sequence number and type: "Proposal"

3. **Vote Casting**
   - Users submit votes as JSON messages to the HCS topic
   - Contains: option (yes/no/abstain), sequenceNumber (proposal ID), type: "Vote"
   - Voting power = token balance at deadline
   - Votes are tallied after deadline

4. **Vote Delegation**
   - Users can delegate voting power to another address
   - Delegation message: `{"delegatee": "0.0.xxx", "type": "Delegation", "version": 1}`
   - Delegated votes count toward the delegatee's voting power
   - Users can undelegate by sending a new delegation message
   - Delegations are cumulative (delegatee gets all delegated votes)

5. **Vote Selling via Agents**
   - Seller agent represents a user with voting power
   - When a vote purchase is agreed:
     - User delegates votes to buyer's address (or buyer's agent address)
     - Buyer pays HBAR to seller
     - Buyer (or their agent) casts the vote as the delegatee
   - The delegation happens on-chain via HCS topic
   - Payment happens via Hedera token transfer

6. **Vote Tallying**
   - After proposal deadline, votes are counted
   - Direct votes + delegated votes = total voting power
   - Quorum must be met for proposal to pass
   - Outcome determined by majority vote

**Visual Style:**
- Show HCS Topic as a central vertical column or box
- Show messages flowing into the topic (proposals, votes, delegations)
- Use different shapes/colors for different message types:
  - Proposals: Rectangle
  - Votes: Circle
  - Delegations: Diamond or arrow
- Show the flow: User → Agent → Negotiation → Delegation → Vote → Tally
- Include token balance calculation
- Show timeline/deadline concept
- Use arrows to show delegation relationships

**Key Flows to Show:**

1. **Normal Voting Flow:**
   - Proposal submitted to HCS topic
   - User casts vote directly to HCS topic
   - Votes tallied at deadline

2. **Delegation Flow:**
   - User A delegates to User B (message to HCS topic)
   - User B casts vote (counts with User A's voting power)
   - Votes tallied with combined power

3. **Vote Selling Flow:**
   - Seller agent negotiates with buyer agent (off-chain)
   - Agreement reached on price and proposal
   - Seller delegates votes to buyer's address (on-chain via HCS)
   - Buyer pays HBAR to seller (on-chain via Hedera)
   - Buyer casts vote as delegatee (on-chain via HCS)
   - Votes tallied with seller's voting power

**Layout Suggestions:**
- Place HCS Topic in the center
- Show on-chain actions (HCS messages) on the left side
- Show off-chain actions (agent negotiation) on the right side
- Use a timeline or sequence flow to show the order of operations
- Show the relationship between delegation and vote casting
- Include a section showing vote tallying at the bottom

**Important Details:**
- Voting power = token balance at proposal deadline (not at vote time)
- Delegations can be changed (new delegation message overwrites)
- All actions are messages on the same HCS topic
- Proposals have sequence numbers that votes reference
- Quorum requirement must be met

---

## Usage Instructions

1. **For Diagram 1 (Agent Communication):**
   - Copy the "Diagram 1" prompt above
   - Paste into your preferred AI diagram generator (ChatGPT, Claude, Mermaid, draw.io AI, etc.)
   - Request the diagram in your preferred format (Mermaid, PlantUML, SVG, PNG, etc.)

2. **For Diagram 2 (Voting & Delegation):**
   - Copy the "Diagram 2" prompt above
   - Follow the same process

3. **Recommended Tools:**
   - **Mermaid Live Editor**: For code-based diagrams
   - **ChatGPT/Claude**: For natural language to diagram conversion
   - **draw.io**: For manual refinement
   - **Excalidraw**: For hand-drawn style diagrams
   - **Lucidchart**: For professional presentations

4. **Customization:**
   - Adjust colors to match your brand
   - Add specific port numbers or addresses if needed
   - Include actual proposal examples if helpful
   - Add more detail for technical audiences, or simplify for business audiences

