import express from 'express';
import { A2AClient } from '@a2a-js/sdk/client';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { AgentCard } from '@a2a-js/sdk';
import { BuyerExecutor } from '../../buyer/src/executor.js';
import { SellerAgent } from './mock-seller.js';
import { ProposalInfo, VoteOffer, VoteOfferResponse } from '@dmm/agents-shared';

export class Sandbox {
  private buyerServer: express.Application | null = null;
  private httpServer: any = null;
  private sellerClient: A2AClient | null = null;
  private buyerPort: number;
  private buyerUrl: string;

  constructor(port: number = 4000) {
    this.buyerPort = port;
    this.buyerUrl = `http://localhost:${port}`;
  }

  async startBuyerAgent(buyerContext: string): Promise<void> {
    const agentCard: AgentCard = {
      name: 'Test Buyer Agent',
      version: '0.1.0',
      description: 'Test buyer agent for sandbox',
      defaultInputModes: ['streaming'],
      defaultOutputModes: ['streaming'],
      protocolVersion: '1.0',
      skills: [],
      url: this.buyerUrl,
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
    };

    const executor = new BuyerExecutor();
    const taskStore = new InMemoryTaskStore();
    const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);
    
    const app = express();
    app.use(express.json());
    const a2aApp = new A2AExpressApp(requestHandler);
    a2aApp.setupRoutes(app);
    
    this.buyerServer = app;

    await new Promise<void>((resolve) => {
      this.httpServer = app.listen(this.buyerPort, () => {
        console.log(`[Sandbox] Buyer agent started on ${this.buyerUrl}`);
        resolve();
      });
    });
  }

  async startSellerAgent(sellerContext: string): Promise<void> {
    this.sellerClient = await A2AClient.fromCardUrl(
      `${this.buyerUrl}/.well-known/agent-card.json`
    );
    console.log('[Sandbox] Seller agent connected to buyer');
  }

  async simulateNegotiation(
    proposal: ProposalInfo,
    buyerContext: string,
    sellerContext: string
  ): Promise<{
    offer: VoteOffer;
    response: VoteOfferResponse;
    rounds: number;
  }> {
    if (!this.buyerServer || !this.sellerClient) {
      throw new Error('Agents not started. Call startBuyerAgent and startSellerAgent first.');
    }

    // Simulate buyer creating an offer
    const offer: VoteOffer = {
      proposal,
      desiredOutcome: 'yes',
      offeredAmount: '10',
      quantity: 1,
    };

    console.log(`[Sandbox] Buyer sends offer: ${offer.offeredAmount} HBAR for "${proposal.title}"`);

    // Simulate seller evaluating and responding
    const sellerAgent = new SellerAgent(sellerContext);
    const response = await sellerAgent.evaluateOffer(offer);

    console.log(`[Sandbox] Seller responds: ${response.accepted ? 'ACCEPTED' : 'REJECTED'}`);
    if (response.counterOffer) {
      console.log(`[Sandbox] Counter-offer: ${response.counterOffer} HBAR`);
    }
    if (response.rejectionReason) {
      console.log(`[Sandbox] Reason: ${response.rejectionReason}`);
    }

    return {
      offer,
      response,
      rounds: 1, // For MVP, single round. Can extend for multi-round negotiation
    };
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer.close(() => {
          console.log('[Sandbox] Buyer agent stopped');
          resolve();
        });
      });
    }
  }
}

