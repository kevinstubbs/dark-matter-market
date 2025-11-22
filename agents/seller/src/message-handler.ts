import { A2AClient } from '@a2a-js/sdk/client';
import { Message, Task } from '@a2a-js/sdk';
import { VoteOffer, VoteOfferResponse } from '@dmm/agents-shared';
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
 * Handle an incoming message from a buyer
 */
export async function handleIncomingMessage(
  buyerId: string,
  client: A2AClient,
  message: Message,
  task: Task | undefined,
  userContext: UserContext
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

  if (existingNegotiation) {
    // This is a counter-offer from the buyer
    negotiationState = {
      ...existingNegotiation,
      offer,
      rounds: existingNegotiation.rounds + 1,
    };
    console.log(`  Round ${negotiationState.rounds} of negotiation`);
  } else {
    // New negotiation
    negotiationState = {
      offer,
      rounds: 1,
      buyerId,
      taskId,
    };
    console.log(`  Starting new negotiation (Round 1)`);
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

