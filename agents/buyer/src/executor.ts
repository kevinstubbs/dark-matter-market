import {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';
import { A2AClient } from '@a2a-js/sdk/client';
import { VoteOffer, VoteOfferResponse, ProposalInfo, CompetingOfferRequest, CompetingOfferResponse, AgentLogger, getAgentIdFromUrl, getVotingPowerAccountByLabel, getLocalnetTopicId } from '@dmm/agents-shared';
import { loadBuyerContext, getBuyerConfig } from './preferences.js';
import { BuyerAgentManager } from './llm-evaluator.js';
import type { HederaLangchainToolkit } from 'hedera-agent-kit';
import { submitDelegationToHCSTopic } from './vote-handler.js';

export class BuyerExecutor implements AgentExecutor {
  private configPath?: string;
  private logger: AgentLogger;
  private agentManager: BuyerAgentManager;
  private balance?: string;
  private buyerUrl?: string;
  private hederaAgentToolkit?: HederaLangchainToolkit;
  private walletAddress?: string;

  constructor(configPath?: string, logger?: AgentLogger, hederaAgentToolkit?: HederaLangchainToolkit, balance?: string, buyerUrl?: string) {
    this.configPath = configPath;
    // Create a default logger if none provided (for backward compatibility)
    this.logger = logger || new AgentLogger('buyer-unknown');
    // Create and reuse the agent manager for the entire session
    this.agentManager = new BuyerAgentManager(hederaAgentToolkit);
    this.balance = balance;
    this.buyerUrl = buyerUrl;
    this.hederaAgentToolkit = hederaAgentToolkit;
    
    // Log toolkit status for debugging
    if (this.logger) {
      // Use a synchronous log or store for async logging later
      console.log(`[BuyerExecutor] hederaAgentToolkit in constructor: ${hederaAgentToolkit ? 'available' : 'undefined'}`);
    }
    
    // Load wallet address from config
    try {
      const config = getBuyerConfig(configPath);
      this.walletAddress = config.walletAddress;
    } catch (e) {
      // Config might not be available, that's okay
    }
  }

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage } = requestContext;
    
    // Load buyer's plain language context/instructions
    // e.g., "I want votes for proposals that increase liquidity"
    const buyerContext = await loadBuyerContext(this.configPath);
    const desiredOutcome = buyerContext.desiredOutcome;
    
    // Extract message content
    const textPart = userMessage.parts.find((p: any) => p.kind === 'text');
    const messageText = textPart && 'text' in textPart ? textPart.text : '';
    
    // Check message type
    let proposal: ProposalInfo;
    try {
      const messageData = JSON.parse(messageText);
      
      // Handle competing offer request
      if (messageData.type === 'competing-offer-request') {
        const request = messageData as CompetingOfferRequest;
        await this.logger.log(`Received competing offer request`, 'competing-offer-request');
        await this.logger.log(`Current offer: ${request.currentOffer.offeredAmount} HBAR from ${request.currentOffer.buyerId}`, 'info');
        await this.logger.log(`Proposal: "${request.proposal.title}"`, 'info');
        await this.logger.log(`Deadline: ${request.deadline}`, 'info');
        
        // Check if we want to beat this offer
        const currentAmount = parseFloat(request.currentOffer.offeredAmount);
        const maxPrice = buyerContext.maxPrice ? parseFloat(buyerContext.maxPrice) : Infinity;
        
        // Use LLM to evaluate if we should beat this offer
        const evaluation = await this.agentManager.evaluateProposal(
          request.proposal,
          buyerContext.instructions,
          desiredOutcome
        );
        
        if (!evaluation.shouldPursue) {
          await this.logger.log(`Decision: Not interested in this proposal`, 'negotiation-failed');
          // Send response that we don't want to beat
          eventBus.publish({
            kind: 'message',
            messageId: `competing-response-${taskId}`,
            role: 'agent',
            parts: [
              {
                kind: 'text',
                  text: JSON.stringify({
                    type: 'competing-offer-response',
                    auctionId: request.auctionId,
                    wantsToBeat: false,
                    reason: evaluation.reason || 'Not interested in this proposal',
                  } as CompetingOfferResponse),
              },
            ],
          } as any);
        } else {
          // Calculate a competitive offer (slightly higher than current)
          const suggestedAmount = parseFloat(evaluation.suggestedAmount || '10');
          const competitiveAmount = Math.max(suggestedAmount, currentAmount + 1); // At least 1 HBAR more
          
          if (competitiveAmount > maxPrice) {
            await this.logger.log(`Decision: Cannot beat offer (would exceed max price of ${maxPrice} HBAR)`, 'negotiation-failed');
            eventBus.publish({
              kind: 'message',
              messageId: `competing-response-${taskId}`,
              role: 'agent',
              parts: [
                {
                  kind: 'text',
                  text: JSON.stringify({
                    type: 'competing-offer-response',
                    auctionId: request.auctionId,
                    wantsToBeat: false,
                    reason: `Would exceed maximum price of ${maxPrice} HBAR`,
                  } as CompetingOfferResponse),
                },
              ],
            } as any);
          } else {
            await this.logger.log(`Decision: Will beat with ${competitiveAmount} HBAR`, 'competing-offer-response');
            
            const competingOffer: VoteOffer = {
              proposal: request.proposal,
              desiredOutcome: desiredOutcome || evaluation.desiredOutcome || 'yes',
              offeredAmount: competitiveAmount.toString(),
              quantity: evaluation.quantity || 1,
            };
            
            // Send competing offer response
            eventBus.publish({
              kind: 'message',
              messageId: `competing-response-${taskId}`,
              role: 'agent',
              parts: [
                {
                  kind: 'text',
                  text: JSON.stringify({
                    type: 'competing-offer-response',
                    auctionId: request.auctionId,
                    wantsToBeat: true,
                    newOffer: competingOffer,
                    reason: `Offering ${competitiveAmount} HBAR to beat ${currentAmount} HBAR`,
                  } as CompetingOfferResponse),
                },
              ],
            } as any);
          }
        }
        
        // Mark as completed
        eventBus.publish({
          kind: 'task-status-update',
          taskId,
          status: { state: 'completed', timestamp: new Date().toISOString() },
          final: true,
        } as any);
        eventBus.finished();
        return;
      }
      
      // Handle VoteOfferResponse (acceptance/rejection/counter-offer from seller)
      if (messageData.accepted !== undefined || messageData.counterOffer !== undefined || messageData.rejected !== undefined) {
        const response = messageData as VoteOfferResponse;
        const sellerId = getAgentIdFromUrl((requestContext as any).sellerUrl) || 'unknown';
        
        if (response.accepted) {
          await this.logger.negotiationSucceeded(`Negotiation completed successfully with ${sellerId}!`, sellerId);
          await this.logger.log(`Offer accepted by seller ${sellerId}`, 'info', sellerId);
          
          // When agreement is reached, delegate to the correct wallet from Redis
          // Get the original offer from context (we need to know the desired outcome)
          const originalOffer = (requestContext as any).originalOffer as VoteOffer | undefined;
          
          if (originalOffer && this.hederaAgentToolkit && originalOffer.proposal.dmmTopicId) {
            try {
              // Get the voting power account from Redis based on desired outcome
              // Map desired outcome to voting power account label
              let accountLabel = originalOffer.desiredOutcome?.toLowerCase();
              if (accountLabel === 'against' || accountLabel === 'no') {
                accountLabel = 'no';
              } else if (accountLabel === 'yes' || accountLabel === 'for' || accountLabel === 'approve') {
                accountLabel = 'yes';
              } else if (accountLabel === 'abstain' || accountLabel === 'abstention') {
                accountLabel = 'abstain';
              }
              
              if (accountLabel) {
                const votingPowerAccount = await getVotingPowerAccountByLabel(accountLabel);
                
                if (votingPowerAccount && votingPowerAccount.id) {
                  await this.logger.log(`Delegating to voting power account: ${votingPowerAccount.id} (${votingPowerAccount.label})`, 'info', sellerId);
                  
                  // Submit delegation message to HCS topic
                  await submitDelegationToHCSTopic(
                    this.hederaAgentToolkit,
                    originalOffer.proposal.dmmTopicId,
                    votingPowerAccount.id,
                    this.logger
                  );
                  
                  await this.logger.log(`Successfully delegated to ${votingPowerAccount.id} on topic ${originalOffer.proposal.dmmTopicId}`, 'info', sellerId);
                } else {
                  await this.logger.log(`No voting power account found for label "${accountLabel}" in Redis`, 'info', sellerId);
                }
              } else {
                await this.logger.log(`Could not determine account label from desired outcome: ${originalOffer.desiredOutcome}`, 'info', sellerId);
              }
            } catch (error) {
              await this.logger.error(
                `Failed to delegate after agreement: ${error instanceof Error ? error.message : String(error)}`,
                sellerId
              );
              // Don't fail the negotiation if delegation fails - log and continue
            }
          } else {
            if (!this.hederaAgentToolkit) {
              await this.logger.log('Hedera Agent Toolkit not available, skipping delegation', 'info', sellerId);
            } else if (!originalOffer) {
              await this.logger.log('Original offer not available in context, skipping delegation', 'info', sellerId);
            } else if (!originalOffer.proposal.dmmTopicId) {
              await this.logger.log('Topic ID not available in proposal, skipping delegation', 'info', sellerId);
            }
          }
        } else if (response.counterOffer) {
          await this.logger.log(`Received counter-offer from ${sellerId}: ${response.counterOffer} HBAR`, 'info', sellerId);
          // TODO: Handle counter-offer (continue negotiation)
        } else {
          await this.logger.negotiationFailed(`Negotiation ended (rejected) with ${sellerId}`);
          await this.logger.log(`Offer rejected by seller ${sellerId}`, 'info', sellerId);
          if (response.rejectionReason) {
            await this.logger.log(`Rejection reason: ${response.rejectionReason}`, 'info', sellerId);
          }
        }
        
        // Mark as completed
        eventBus.publish({
          kind: 'task-status-update',
          taskId,
          status: { state: 'completed', timestamp: new Date().toISOString() },
          final: true,
        } as any);
        eventBus.finished();
        return;
      }
      
      if (messageData.type === 'seller-ready') {
        // Seller is ready - respond with buyer-ready message including balance
        const sellerId = getAgentIdFromUrl(messageData.sellerUrl) || 'unknown';
        const sellerBalance = messageData.balance;
        
        await this.logger.log(`Received seller-ready message from ${messageData.sellerUrl} (${sellerId})`, 'seller-ready', sellerId);
        if (sellerBalance) {
          await this.logger.log(`Seller balance: ${sellerBalance} HBAR`, 'info', sellerId);
        }
        
        // Respond with buyer-ready message including our balance
        try {
          const sellerClient = await A2AClient.fromCardUrl(`${messageData.sellerUrl}/.well-known/agent-card.json`);
          const { v4: uuidv4 } = await import('uuid');
          
          await sellerClient.sendMessage({
            message: {
              messageId: uuidv4(),
              role: 'user',
              parts: [
                {
                  kind: 'text',
                  text: JSON.stringify({
                    type: 'buyer-ready',
                    buyerUrl: this.buyerUrl || 'unknown',
                    balance: this.balance || 'unknown',
                    message: 'Buyer agent ready to send vote purchase offers',
                  }),
                },
              ],
              kind: 'message',
            },
          });
          
          if (this.balance) {
            await this.logger.log(`Sent buyer-ready message to seller ${sellerId} with balance: ${this.balance} HBAR`, 'info', sellerId);
          } else {
            await this.logger.log(`Sent buyer-ready message to seller ${sellerId} (balance unknown)`, 'info', sellerId);
          }
        } catch (error) {
          await this.logger.error(`Failed to send buyer-ready message to seller ${sellerId}: ${error instanceof Error ? error.message : String(error)}`, sellerId);
        }
        
        // Create a test proposal and send an offer
        await this.logger.log(`Creating vote purchase offer...`, 'info');
        
        // Get topic ID from website for the proposal
        const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3001';
        await this.logger.log(`Fetching topic ID from website...`, 'info', sellerId);
        const topicId = await getLocalnetTopicId(websiteUrl);
        await this.logger.log(`Topic ID from website: ${topicId || 'not found'}`, 'info', sellerId);
        
        if (!topicId) {
          await this.logger.log(`Cannot create proposal without topic ID, skipping offer`, 'error', sellerId);
          eventBus.publish({
            kind: 'task-status-update',
            taskId,
            status: { state: 'completed', timestamp: new Date().toISOString() },
            final: true,
          } as any);
          eventBus.finished();
          return;
        }
        
        proposal = {
          dmmTopicId: topicId,
          proposalSequenceNumber: 1,
          title: 'Create V2 Pool for gib/HBAR 1.00%',
          description: 'We propose creating a new liquidity pool to increase capital efficiency and provide better trading opportunities.',
          options: ['yes', 'no'],
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        
        // Store seller URL for sending the offer
        (requestContext as any).sellerUrl = messageData.sellerUrl;
        (requestContext as any).sellerId = sellerId;
      } else {
        // This might be a response to our offer - parse it
        throw new Error('Not a seller-ready message');
      }
    } catch (e) {
      // Not a seller-ready message - treat as proposal info or response
      // For MVP, create a default proposal
      proposal = {
        dmmTopicId: '0.0.123456',
        proposalSequenceNumber: 1,
        title: 'Example Proposal',
        description: messageText || 'A proposal that needs votes',
        options: ['yes', 'no'],
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    
    // Use LLM to evaluate if this proposal aligns with buyer's context
    // and determine what offer to make
    const evaluation = await this.agentManager.evaluateProposal(proposal, buyerContext.instructions, desiredOutcome);
    
    if (!evaluation.shouldPursue) {
      // Buyer's context indicates this proposal isn't worth pursuing
      eventBus.publish({
        kind: 'task-status-update',
        taskId,
        status: { 
          state: 'completed', 
          timestamp: new Date().toISOString() 
        },
        final: true,
      } as any);
      eventBus.finished();
      return;
    }
    
    // Create vote purchase offer based on LLM's evaluation
    // In real implementation, would:
    // 1. Check current vote counts
    // 2. Calculate needed votes
    // 3. Determine offer amount based on market conditions
    
    const offer: VoteOffer = {
      proposal,
      desiredOutcome: desiredOutcome || evaluation.desiredOutcome || 'yes',
      offeredAmount: evaluation.suggestedAmount || '10', // HBAR per vote
      quantity: evaluation.quantity || 1, // Number of votes needed
    };
    
    // Store the offer in context so we can access it when we receive the response
    (requestContext as any).originalOffer = offer;
    
    await this.logger.offerCreated(`Offer created: ${offer.offeredAmount} HBAR for "${offer.proposal.title}"`);
    await this.logger.log(`Desired outcome: ${offer.desiredOutcome}`, 'info');
    
    // Send the offer to the seller's server
    const sellerUrl = (requestContext as any).sellerUrl;
    const sellerId = (requestContext as any).sellerId || getAgentIdFromUrl(sellerUrl) || 'unknown';
    if (sellerUrl) {
      try {
        await this.logger.log(`Sending offer to seller at ${sellerUrl} (${sellerId})...`, 'info', sellerId);
        const sellerClient = await A2AClient.fromCardUrl(`${sellerUrl}/.well-known/agent-card.json`);
        const { v4: uuidv4 } = await import('uuid');
        
        await sellerClient.sendMessage({
          message: {
            messageId: uuidv4(),
            role: 'user',
            parts: [
              {
                kind: 'text',
                text: JSON.stringify(offer),
              },
            ],
            kind: 'message',
          },
        });
        
        await this.logger.offerSent(`Offer sent to seller ${sellerId}: ${offer.offeredAmount} HBAR for "${offer.proposal.title}"`, sellerId);
      } catch (error) {
        await this.logger.error(`Failed to send offer to seller ${sellerId}: ${error instanceof Error ? error.message : String(error)}`, sellerId);
      }
    }
    
    // Also publish as a message event for tracking
    eventBus.publish({
      kind: 'message',
      messageId: `offer-${taskId}`,
      role: 'agent',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify(offer),
        },
      ],
    } as any);
    
    // Also publish as an artifact for tracking
    eventBus.publish({
      kind: 'task-artifact-update',
      taskId,
      artifact: {
        artifactId: `offer-${taskId}`,
        data: JSON.stringify(offer),
      },
    } as any);
    
    // Mark as completed
    eventBus.publish({
      kind: 'task-status-update',
      taskId,
      status: { state: 'completed', timestamp: new Date().toISOString() },
      final: true,
    } as any);
    
    eventBus.finished();
  }
  
  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    // MVP: no-op
  }
}

