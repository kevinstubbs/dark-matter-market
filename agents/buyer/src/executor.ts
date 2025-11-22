import {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';
import { A2AClient } from '@a2a-js/sdk/client';
import { VoteOffer, VoteOfferResponse, ProposalInfo, CompetingOfferRequest, CompetingOfferResponse, AgentLogger, getAgentIdFromUrl } from '@dmm/agents-shared';
import { loadBuyerContext } from './preferences.js';
import { createOfferWithLLM } from './llm-evaluator.js';

export class BuyerExecutor implements AgentExecutor {
  private configPath?: string;
  private logger: AgentLogger;

  constructor(configPath?: string, logger?: AgentLogger) {
    this.configPath = configPath;
    // Create a default logger if none provided (for backward compatibility)
    this.logger = logger || new AgentLogger('buyer-unknown');
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
        const evaluation = await createOfferWithLLM(
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
      
      if (messageData.type === 'seller-ready') {
        // Seller is ready - create a test proposal and send an offer
        const sellerId = getAgentIdFromUrl(messageData.sellerUrl) || 'unknown';
        await this.logger.log(`Received seller-ready message from ${messageData.sellerUrl} (${sellerId})`, 'seller-ready', sellerId);
        await this.logger.log(`Creating vote purchase offer...`, 'info');
        
        proposal = {
          dmmTopicId: '0.0.123456',
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
    const evaluation = await createOfferWithLLM(proposal, buyerContext.instructions, desiredOutcome);
    
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

