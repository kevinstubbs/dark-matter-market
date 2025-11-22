import {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';
import { A2AClient } from '@a2a-js/sdk/client';
import { VoteOffer, VoteOfferResponse, ProposalInfo } from '@dmm/agents-shared';
import { loadBuyerContext } from './preferences.js';
import { createOfferWithLLM } from './llm-evaluator.js';

export class BuyerExecutor implements AgentExecutor {
  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage } = requestContext;
    
    // Load buyer's plain language context/instructions
    // e.g., "I want votes for proposals that increase liquidity"
    const buyerContext = await loadBuyerContext();
    
    // Extract message content
    const textPart = userMessage.parts.find((p: any) => p.kind === 'text');
    const messageText = textPart && 'text' in textPart ? textPart.text : '';
    
    // Check if this is a "seller-ready" message
    let proposal: ProposalInfo;
    try {
      const messageData = JSON.parse(messageText);
      if (messageData.type === 'seller-ready') {
        // Seller is ready - create a test proposal and send an offer
        console.log(`\n[Buyer] Received seller-ready message from ${messageData.sellerUrl}`);
        console.log(`  Creating vote purchase offer...`);
        
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
    const evaluation = await createOfferWithLLM(proposal, buyerContext.instructions);
    
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
      desiredOutcome: evaluation.desiredOutcome || 'yes',
      offeredAmount: evaluation.suggestedAmount || '10', // HBAR per vote
      quantity: evaluation.quantity || 1, // Number of votes needed
    };
    
    console.log(`  Offer created: ${offer.offeredAmount} HBAR for "${offer.proposal.title}"`);
    console.log(`  Desired outcome: ${offer.desiredOutcome}`);
    
    // Send the offer to the seller's server
    const sellerUrl = (requestContext as any).sellerUrl;
    if (sellerUrl) {
      try {
        console.log(`  Sending offer to seller at ${sellerUrl}...`);
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
        
        console.log(`  ✓ Offer sent to seller successfully`);
      } catch (error) {
        console.error(`  ✗ Failed to send offer to seller:`, error);
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

