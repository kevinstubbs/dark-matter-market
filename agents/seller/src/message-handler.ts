import { A2AClient } from '@a2a-js/sdk/client';
import { Message, Task } from '@a2a-js/sdk';
import { VoteOffer, VoteOfferResponse, CompetingOfferRequest, CompetingOfferResponse } from '@dmm/agents-shared';
import { UserContext } from './preferences.js';
import { evaluateOffer } from './negotiation.js';

export interface NegotiationState {
  offer: VoteOffer;
  rounds: number;
  lastResponse?: VoteOfferResponse;
  buyerId: string;
  taskId: string;
}

// Track active negotiations
const activeNegotiations = new Map<string, NegotiationState>();

// Track competing offers for auction mechanism
interface CompetingOffer {
  buyerId: string;
  offer: VoteOffer;
  receivedAt: Date;
}

const competingOffers = new Map<string, CompetingOffer[]>(); // taskId -> competing offers

/**
 * Parse a VoteOffer from a message
 */
function parseVoteOffer(message: Message): VoteOffer | null {
  try {
    const textPart = message.parts.find((p: any) => p.kind === 'text');
    if (!textPart || !('text' in textPart)) {
      return null;
    }
    
    const data = JSON.parse(textPart.text);
    if (data.proposal && data.desiredOutcome && data.offeredAmount) {
      return data as VoteOffer;
    }
  } catch (e) {
    // Not a valid vote offer
  }
  return null;
}

/**
 * Notify other buyers about an offer to see if they want to beat it
 */
async function requestCompetingOffers(
  originalBuyerId: string,
  originalOffer: VoteOffer,
  taskId: string,
  allBuyerClients: Map<string, A2AClient>,
  timeoutMs: number = 10000 // 10 seconds
): Promise<CompetingOffer[]> {
  const competing: CompetingOffer[] = [];
  const otherBuyers = Array.from(allBuyerClients.entries()).filter(([id]) => id !== originalBuyerId);
  
  if (otherBuyers.length === 0) {
    console.log(`  No other buyers connected, skipping auction`);
    return competing;
  }
  
  console.log(`  Notifying ${otherBuyers.length} other buyer(s) about this offer...`);
  
  const deadline = new Date(Date.now() + timeoutMs).toISOString();
  const request: CompetingOfferRequest = {
    type: 'competing-offer-request',
    auctionId: taskId, // Use taskId as auction identifier
    proposal: originalOffer.proposal,
    currentOffer: {
      buyerId: originalBuyerId,
      desiredOutcome: originalOffer.desiredOutcome,
      offeredAmount: originalOffer.offeredAmount,
    },
    deadline,
  };
  
  // Send request to all other buyers
  const responsePromises = otherBuyers.map(async ([buyerId, client]) => {
    try {
      const requestMessage: Message = {
        messageId: `competing-request-${Date.now()}-${buyerId}`,
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: JSON.stringify(request),
          },
        ],
        kind: 'message',
      };
      
      await client.sendMessage({ message: requestMessage });
      console.log(`    → Sent competing offer request to ${buyerId}`);
    } catch (error) {
      console.error(`    ✗ Failed to send competing offer request to ${buyerId}:`, error);
    }
  });
  
  await Promise.all(responsePromises);
  
  // Wait for responses (with timeout)
  console.log(`  Waiting ${timeoutMs / 1000}s for competing offers...`);
  await new Promise(resolve => setTimeout(resolve, timeoutMs));
  
  // Collect any responses that came in
  const receivedCompeting = competingOffers.get(taskId) || [];
  competingOffers.delete(taskId); // Clean up
  
  if (receivedCompeting.length > 0) {
    console.log(`  Received ${receivedCompeting.length} competing offer(s)`);
  } else {
    console.log(`  No competing offers received`);
  }
  
  return receivedCompeting;
}

/**
 * Handle a competing offer response from a buyer
 */
export async function handleCompetingOfferResponse(
  buyerId: string,
  message: Message
): Promise<void> {
  try {
    const textPart = message.parts.find((p: any) => p.kind === 'text');
    if (!textPart || !('text' in textPart)) {
      return;
    }
    
    const response = JSON.parse(textPart.text) as CompetingOfferResponse;
    
    if (response.type === 'competing-offer-response' && response.wantsToBeat && response.newOffer) {
      const auctionId = response.auctionId;
      console.log(`[${buyerId}] Received competing offer for auction ${auctionId}: ${response.newOffer.offeredAmount} HBAR`);
      
      // Store the competing offer using the auctionId from the response
      if (!competingOffers.has(auctionId)) {
        competingOffers.set(auctionId, []);
      }
      
      competingOffers.get(auctionId)!.push({
        buyerId,
        offer: response.newOffer,
        receivedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(`Error handling competing offer response from ${buyerId}:`, error);
  }
}

/**
 * Handle an incoming message from a buyer
 */
export async function handleIncomingMessage(
  buyerId: string,
  client: A2AClient,
  message: Message,
  task: Task | undefined,
  userContext: UserContext,
  allBuyerClients?: Map<string, A2AClient>
): Promise<void> {
  const offer = parseVoteOffer(message);
  
  if (!offer) {
    console.log(`[${buyerId}] Received non-offer message, ignoring`);
    return;
  }

  const taskId = task?.id || `task-${Date.now()}`;
  console.log(`\n[${buyerId}] Received vote offer for proposal: "${offer.proposal.title}"`);
  console.log(`  Desired outcome: ${offer.desiredOutcome}`);
  console.log(`  Offered amount: ${offer.offeredAmount} HBAR per vote`);

  // Check if this is a continuation of an existing negotiation
  const existingNegotiation = activeNegotiations.get(taskId);
  let negotiationState: NegotiationState;
  let isNewNegotiation = false;

  if (existingNegotiation) {
    // This is a counter-offer from the buyer
    negotiationState = {
      ...existingNegotiation,
      offer,
      rounds: existingNegotiation.rounds + 1,
    };
    console.log(`  Round ${negotiationState.rounds} of negotiation`);
  } else {
    // New negotiation - check for competing offers
    isNewNegotiation = true;
    negotiationState = {
      offer,
      rounds: 1,
      buyerId,
      taskId,
    };
    console.log(`  Starting new negotiation (Round 1)`);
    
    // Request competing offers from other buyers
    if (allBuyerClients && allBuyerClients.size > 1) {
      const competing = await requestCompetingOffers(
        buyerId,
        offer,
        taskId,
        allBuyerClients
      );
      
      // If we have competing offers, compare them
      if (competing.length > 0) {
        // Find the best offer (highest price)
        const allOffers = [
          { buyerId, offer, isOriginal: true },
          ...competing.map(c => ({ buyerId: c.buyerId, offer: c.offer, isOriginal: false }))
        ];
        
        // Sort by offered amount (descending)
        allOffers.sort((a, b) => {
          const amountA = parseFloat(a.offer.offeredAmount);
          const amountB = parseFloat(b.offer.offeredAmount);
          return amountB - amountA;
        });
        
        const bestOffer = allOffers[0];
        
        if (!bestOffer.isOriginal) {
          console.log(`  ⚠ Best offer is from ${bestOffer.buyerId} (${bestOffer.offer.offeredAmount} HBAR)`);
          console.log(`  Original offer from ${buyerId} (${offer.offeredAmount} HBAR) was beaten`);
          
          // Update negotiation state with best offer
          negotiationState.offer = bestOffer.offer;
          negotiationState.buyerId = bestOffer.buyerId;
          
          // Notify original buyer that their offer was beaten
          try {
            const beatenMessage: Message = {
              messageId: `beaten-${Date.now()}`,
              role: 'agent',
              parts: [
                {
                  kind: 'text',
                  text: JSON.stringify({
                    type: 'offer-beaten',
                    reason: `Another buyer offered ${bestOffer.offer.offeredAmount} HBAR (you offered ${offer.offeredAmount} HBAR)`,
                    winningOffer: bestOffer.offer.offeredAmount,
                  }),
                },
              ],
              kind: 'message',
            };
            await client.sendMessage({ message: beatenMessage });
          } catch (error) {
            console.error(`  ✗ Failed to notify original buyer:`, error);
          }
          
          // Update client reference to the winning buyer
          const winningClient = allBuyerClients.get(bestOffer.buyerId);
          if (winningClient) {
            client = winningClient;
            buyerId = bestOffer.buyerId;
          }
        } else {
          console.log(`  ✓ Original offer from ${buyerId} is still the best`);
          
          // Notify competing buyers that they didn't win
          for (const competingOffer of competing) {
            try {
              const losingClient = allBuyerClients.get(competingOffer.buyerId);
              if (losingClient) {
                const losingMessage: Message = {
                  messageId: `losing-${Date.now()}`,
                  role: 'agent',
                  parts: [
                    {
                      kind: 'text',
                      text: JSON.stringify({
                        type: 'offer-not-selected',
                        reason: `Another buyer's offer was selected`,
                      }),
                    },
                  ],
                  kind: 'message',
                };
                await losingClient.sendMessage({ message: losingMessage });
              }
            } catch (error) {
              console.error(`  ✗ Failed to notify losing buyer:`, error);
            }
          }
        }
      }
    }
  }

  // Evaluate the offer
  const response = await evaluateOffer(offer, userContext.instructions);
  negotiationState.lastResponse = response;

  console.log(`  Evaluation: ${response.accepted ? 'ACCEPTED' : response.counterOffer ? 'COUNTER-OFFER' : 'REJECTED'}`);
  if (response.reason) {
    console.log(`  Reason: ${response.reason}`);
  }
  if (response.counterOffer) {
    console.log(`  Counter-offer: ${response.counterOffer} HBAR per vote`);
  }
  if (response.rejectionReason) {
    console.log(`  Rejection reason: ${response.rejectionReason}`);
  }

  // Send response back to buyer
  try {
    const responseMessage: Message = {
      messageId: `response-${Date.now()}`,
      role: 'agent',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify(response),
        },
      ],
      kind: 'message',
    };

    await client.sendMessage({
      message: responseMessage,
    });

    if (response.accepted) {
      console.log(`  ✓ Negotiation completed successfully!`);
      activeNegotiations.delete(taskId);
    } else if (response.counterOffer) {
      // Continue negotiation - wait for buyer's response
      activeNegotiations.set(taskId, negotiationState);
      console.log(`  → Waiting for buyer's response to counter-offer...`);
    } else {
      // Rejected - negotiation ended
      console.log(`  ✗ Negotiation ended (rejected)`);
      activeNegotiations.delete(taskId);
    }
  } catch (error) {
    console.error(`  ✗ Error sending response to buyer:`, error);
    // Keep negotiation active in case we can retry
    activeNegotiations.set(taskId, negotiationState);
  }
}

/**
 * Poll for new messages from a buyer agent
 */
export async function pollForMessages(
  buyerId: string,
  client: A2AClient,
  userContext: UserContext,
  pollInterval: number = 5000
): Promise<void> {
  console.log(`[${buyerId}] Starting message polling (interval: ${pollInterval}ms)`);
  
  // Track last checked task to avoid reprocessing
  let lastCheckedTaskId: string | undefined;
  
  while (true) {
    try {
      // Get tasks from the buyer
      // Note: This is a simplified polling mechanism
      // In a real implementation, you'd use push notifications or webhooks
      
      // For now, we'll check if there are any new tasks
      // The buyer executor creates tasks when it receives messages
      // We need to check for tasks that we haven't seen yet
      
      // This is a placeholder - actual implementation would depend on A2A SDK's task polling API
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      // TODO: Implement actual task polling when A2A SDK provides this capability
      // For MVP, we'll rely on the buyer sending messages directly
      
    } catch (error) {
      console.error(`[${buyerId}] Error polling for messages:`, error);
      // Continue polling even on error
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
}

