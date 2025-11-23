import { A2AClient } from '@a2a-js/sdk/client';
import { Message, Task } from '@a2a-js/sdk';
import { VoteOffer, VoteOfferResponse, CompetingOfferRequest, CompetingOfferResponse, AgentLogger } from '@dmm/agents-shared';
import { UserContext } from './preferences.js';
import { evaluateOffer } from './negotiation.js';
import type { HederaLangchainToolkit } from 'hedera-agent-kit';

export interface NegotiationState {
  offer: VoteOffer;
  rounds: number;
  lastResponse?: VoteOfferResponse;
  buyerId: string;
  taskId: string;
  allBuyerIds: Set<string>; // Track all buyers involved in this negotiation
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
 * Submit a delegation message to an HCS topic using the Hedera Agent Kit
 */
export async function submitDelegationToHCSTopic(
  hederaAgentToolkit: HederaLangchainToolkit,
  topicId: string,
  delegateeAddress: string,
  logger?: AgentLogger
): Promise<void> {
  try {
    // Create delegation message in the format expected by the governance system
    const delegationMessage = {
      delegatee: delegateeAddress,
      type: 'Delegation',
      version: 1,
    };

    const messageJson = JSON.stringify(delegationMessage);

    // Get the tools from the toolkit
    const tools = hederaAgentToolkit.getTools();
    
    // Find the submit topic message tool from the consensus plugin
    const submitTool = tools.find((tool: any) => 
      tool.name && (
        tool.name.includes('submit') && 
        tool.name.includes('topic') && 
        tool.name.includes('message')
      )
    );

    if (!submitTool) {
      throw new Error('Could not find submit topic message tool in Hedera Agent Kit');
    }

    // Invoke the tool to submit the delegation message
    const result = await submitTool.invoke({
      topicId: topicId,
      message: messageJson,
    });

    if (logger) {
      await logger.log(
        `Delegation submitted to HCS topic ${topicId} for delegatee ${delegateeAddress}`,
        'info'
      );
      if (result && typeof result === 'object') {
        if (result.transactionId) {
          await logger.log(`Transaction ID: ${result.transactionId}`, 'info');
        }
        if (result.sequenceNumber !== undefined) {
          await logger.log(`Message sequence number: ${result.sequenceNumber}`, 'info');
        }
      }
    }
  } catch (error) {
    if (logger) {
      await logger.error(
        `Failed to submit delegation to HCS topic: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    throw error;
  }
}

/**
 * Submit a vote message to an HCS topic using the Hedera Agent Kit
 */
async function submitVoteToHCSTopic(
  hederaAgentToolkit: HederaLangchainToolkit,
  topicId: string,
  proposalSequenceNumber: number,
  desiredOutcome: string,
  logger?: AgentLogger
): Promise<void> {
  try {
    // Normalize the desired outcome to match vote format
    // Map common variations to standard options
    let voteOption = desiredOutcome.toLowerCase();
    if (voteOption === 'against' || voteOption === 'no') {
      voteOption = 'against';
    } else if (voteOption === 'yes' || voteOption === 'for' || voteOption === 'approve') {
      voteOption = 'yes';
    } else if (voteOption === 'abstain' || voteOption === 'abstention') {
      voteOption = 'abstain';
    }

    // Create vote message in the format expected by the governance system
    const voteMessage = {
      option: voteOption,
      referendumType: 'Election',
      sequenceNumber: proposalSequenceNumber,
      type: 'Vote',
      version: 1,
    };

    const messageJson = JSON.stringify(voteMessage);

    // Get the tools from the toolkit
    const tools = hederaAgentToolkit.getTools();
    
    // Find the submit topic message tool from the consensus plugin
    const submitTool = tools.find((tool: any) => 
      tool.name && (
        tool.name.includes('submit') && 
        tool.name.includes('topic') && 
        tool.name.includes('message')
      )
    );

    if (!submitTool) {
      throw new Error('Could not find submit topic message tool in Hedera Agent Kit');
    }

    // Invoke the tool to submit the message
    const result = await submitTool.invoke({
      topicId: topicId,
      message: messageJson,
    });

    if (logger) {
      await logger.log(
        `Vote submitted to HCS topic ${topicId} for proposal ${proposalSequenceNumber}`,
        'info'
      );
      await logger.log(`Vote option: ${voteOption}`, 'info');
      if (result && typeof result === 'object') {
        if (result.transactionId) {
          await logger.log(`Transaction ID: ${result.transactionId}`, 'info');
        }
        if (result.sequenceNumber !== undefined) {
          await logger.log(`Message sequence number: ${result.sequenceNumber}`, 'info');
        }
      }
    }
  } catch (error) {
    if (logger) {
      await logger.error(
        `Failed to submit vote to HCS topic: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    throw error;
  }
}

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
  timeoutMs: number = 10000, // 10 seconds
  logger?: AgentLogger
): Promise<CompetingOffer[]> {
  const competing: CompetingOffer[] = [];
  const otherBuyers = Array.from(allBuyerClients.entries()).filter(([id]) => id !== originalBuyerId);
  
  if (otherBuyers.length === 0) {
    if (logger) await logger.log(`No other buyers connected, skipping auction`, 'info');
    return competing;
  }
  
  if (logger) await logger.log(`Notifying ${otherBuyers.length} other buyer(s) about this offer...`, 'competing-offer-request');
  
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
      if (logger) await logger.log(`Sent competing offer request to ${buyerId}`, 'competing-offer-request', buyerId, true);
    } catch (error) {
      if (logger) await logger.error(`Failed to send competing offer request to ${buyerId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  
  await Promise.all(responsePromises);
  
  // Wait for responses (with timeout)
  if (logger) await logger.log(`Waiting ${timeoutMs / 1000}s for competing offers...`, 'info');
  await new Promise(resolve => setTimeout(resolve, timeoutMs));
  
  // Collect any responses that came in
  const receivedCompeting = competingOffers.get(taskId) || [];
  competingOffers.delete(taskId); // Clean up
  
  if (receivedCompeting.length > 0) {
    if (logger) await logger.log(`Received ${receivedCompeting.length} competing offer(s)`, 'competing-offer-response');
  } else {
    if (logger) await logger.log(`No competing offers received`, 'info');
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
  allBuyerClients?: Map<string, A2AClient>,
  logger?: AgentLogger,
  hederaAgentToolkit?: HederaLangchainToolkit
): Promise<void> {
  const offer = parseVoteOffer(message);
  
  if (!offer) {
    if (logger) await logger.log(`[${buyerId}] Received non-offer message, ignoring`, 'message-received');
    return;
  }

  const taskId = task?.id || `task-${Date.now()}`;
  if (logger) await logger.offerReceived(`Received vote offer from ${buyerId} for proposal: "${offer.proposal.title}"`, buyerId);
  if (logger) await logger.log(`Desired outcome: ${offer.desiredOutcome}`, 'info', buyerId);
  if (logger) await logger.log(`Offered amount: ${offer.offeredAmount} HBAR per vote`, 'info', buyerId);

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
      allBuyerIds: existingNegotiation.allBuyerIds, // Keep existing buyers
    };
    // Add current buyer if not already tracked
    negotiationState.allBuyerIds.add(buyerId);
    if (logger) await logger.log(`Round ${negotiationState.rounds} of negotiation`, 'negotiation-started');
  } else {
    // New negotiation - check for competing offers
    isNewNegotiation = true;
    negotiationState = {
      offer,
      rounds: 1,
      buyerId,
      taskId,
      allBuyerIds: new Set([buyerId]), // Start with current buyer
    };
    if (logger) await logger.negotiationStarted(`Starting new negotiation (Round 1)`);
    
    // Request competing offers from other buyers
    if (allBuyerClients && allBuyerClients.size > 1) {
      const competing = await requestCompetingOffers(
        buyerId,
        offer,
        taskId,
        allBuyerClients,
        10000,
        logger
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
          if (logger) await logger.log(`Best offer is from ${bestOffer.buyerId} (${bestOffer.offer.offeredAmount} HBAR)`, 'competing-offer-response');
          if (logger) await logger.log(`Original offer from ${buyerId} (${offer.offeredAmount} HBAR) was beaten`, 'info');
          
          // Update negotiation state with best offer
          negotiationState.offer = bestOffer.offer;
          negotiationState.buyerId = bestOffer.buyerId;
          // Track all buyers involved
          negotiationState.allBuyerIds.add(buyerId);
          competing.forEach(c => negotiationState.allBuyerIds.add(c.buyerId));
          
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
            if (logger) await logger.log(`Notified original buyer ${buyerId} that offer was beaten`, 'info', buyerId, true);
          } catch (error) {
            if (logger) await logger.error(`Failed to notify original buyer ${buyerId}: ${error instanceof Error ? error.message : String(error)}`, buyerId);
          }
          
          // Update client reference to the winning buyer
          const winningClient = allBuyerClients.get(bestOffer.buyerId);
          if (winningClient) {
            client = winningClient;
            buyerId = bestOffer.buyerId;
          }
        } else {
          if (logger) await logger.log(`Original offer from ${buyerId} is still the best`, 'info');
          // Track all buyers involved
          competing.forEach(c => negotiationState.allBuyerIds.add(c.buyerId));
          
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
                if (logger) await logger.log(`Notified losing buyer ${competingOffer.buyerId}`, 'info', competingOffer.buyerId, true);
              }
            } catch (error) {
              if (logger) await logger.error(`Failed to notify losing buyer ${competingOffer.buyerId}: ${error instanceof Error ? error.message : String(error)}`, competingOffer.buyerId);
            }
          }
        }
      }
    }
  }

  // Evaluate the offer
  const response = await evaluateOffer(offer, userContext.instructions);
  negotiationState.lastResponse = response;

  if (logger) await logger.log(`Evaluation: ${response.accepted ? 'ACCEPTED' : response.counterOffer ? 'COUNTER-OFFER' : 'REJECTED'}`, 'info');
  if (response.reason && logger) {
    await logger.log(`Reason: ${response.reason}`, 'info');
  }
  if (response.counterOffer && logger) {
    await logger.log(`Counter-offer: ${response.counterOffer} HBAR per vote`, 'info');
  }
  if (response.rejectionReason && logger) {
    await logger.log(`Rejection reason: ${response.rejectionReason}`, 'info');
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
      if (logger) await logger.negotiationSucceeded(`Negotiation completed successfully with ${buyerId}!`, buyerId);
      
      // Send "negotiation-success" to the buyer we agreed with
      try {
        const successMessage: Message = {
          messageId: `negotiation-success-${Date.now()}`,
          role: 'agent',
          parts: [
            {
              kind: 'text',
              text: JSON.stringify({
                type: 'negotiation-success',
                message: 'Negotiation completed successfully',
              }),
            },
          ],
          kind: 'message',
        };
        await client.sendMessage({ message: successMessage });
        if (logger) await logger.log(`Sent negotiation-success to ${buyerId}`, 'info', buyerId, true);
      } catch (error) {
        if (logger) await logger.error(`Failed to send negotiation-success to ${buyerId}: ${error instanceof Error ? error.message : String(error)}`, buyerId);
      }
      
      // Send "negotiation-failed" to all other buyers involved in this negotiation
      if (allBuyerClients && negotiationState.allBuyerIds.size > 1) {
        const otherBuyers = Array.from(negotiationState.allBuyerIds).filter(id => id !== buyerId);
        for (const otherBuyerId of otherBuyers) {
          try {
            const otherClient = allBuyerClients.get(otherBuyerId);
            if (otherClient) {
              const failedMessage: Message = {
                messageId: `negotiation-failed-${Date.now()}-${otherBuyerId}`,
                role: 'agent',
                parts: [
                  {
                    kind: 'text',
                    text: JSON.stringify({
                      type: 'negotiation-failed',
                      message: 'Negotiation ended - agreement reached with another buyer',
                    }),
                  },
                ],
                kind: 'message',
              };
              await otherClient.sendMessage({ message: failedMessage });
              if (logger) await logger.log(`Sent negotiation-failed to ${otherBuyerId}`, 'info', otherBuyerId, true);
            }
          } catch (error) {
            if (logger) await logger.error(`Failed to send negotiation-failed to ${otherBuyerId}: ${error instanceof Error ? error.message : String(error)}`, otherBuyerId);
          }
        }
      }
      
      // Submit vote to HCS topic when agreement is reached
      if (hederaAgentToolkit && offer.proposal.dmmTopicId && offer.proposal.proposalSequenceNumber) {
        try {
          await submitVoteToHCSTopic(
            hederaAgentToolkit,
            offer.proposal.dmmTopicId,
            offer.proposal.proposalSequenceNumber,
            offer.desiredOutcome,
            logger
          );
        } catch (error) {
          if (logger) {
            await logger.error(
              `Failed to submit vote to HCS topic after agreement: ${error instanceof Error ? error.message : String(error)}`,
              buyerId
            );
          }
          // Don't fail the negotiation if vote submission fails - log and continue
        }
      } else {
        if (logger) {
          if (!hederaAgentToolkit) {
            await logger.log('Hedera Agent Toolkit not available, skipping HCS topic vote submission', 'info', buyerId);
          } else if (!offer.proposal.dmmTopicId) {
            await logger.log('Topic ID not available in proposal, skipping HCS topic vote submission', 'info', buyerId);
          } else if (!offer.proposal.proposalSequenceNumber) {
            await logger.log('Proposal sequence number not available, skipping HCS topic vote submission', 'info', buyerId);
          }
        }
      }
      
      activeNegotiations.delete(taskId);
    } else if (response.counterOffer) {
      // Continue negotiation - wait for buyer's response
      activeNegotiations.set(taskId, negotiationState);
      if (logger) await logger.log(`Sent counter-offer to ${buyerId}: ${response.counterOffer} HBAR`, 'info', buyerId, true);
      if (logger) await logger.log(`Waiting for buyer's response to counter-offer...`, 'negotiation-started', buyerId);
    } else {
      // Rejected - negotiation ended
      if (logger) await logger.negotiationFailed(`Negotiation ended (rejected) with ${buyerId}`);
      if (logger) await logger.log(`Sent rejection to ${buyerId}`, 'info', buyerId, true);
      activeNegotiations.delete(taskId);
    }
  } catch (error) {
    if (logger) await logger.error(`Error sending response to buyer ${buyerId}: ${error instanceof Error ? error.message : String(error)}`, buyerId);
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
  // Polling function - logger would be passed if needed
  
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
      // Error polling - logger would be passed if needed
      // Continue polling even on error
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
}

