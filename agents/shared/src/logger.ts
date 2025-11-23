export type MessageType = 
  | 'agent-started'
  | 'agent-ready'
  | 'message-received'
  | 'offer-created'
  | 'offer-sent'
  | 'offer-received'
  | 'negotiation-started'
  | 'negotiation-succeeded'
  | 'negotiation-failed'
  | 'competing-offer-request'
  | 'competing-offer-response'
  | 'seller-ready'
  | 'buyer-ready'
  | 'connection-established'
  | 'connection-failed'
  | 'error'
  | 'info';

export interface AgentLogMessage {
  timestamp: string;
  message: string;
  type: MessageType;
  agentId: string;
  targetAgentId?: string; // ID of the agent this message is about/to
  isA2AMessage?: boolean; // Whether this represents an actual A2A message sent
}

/**
 * Logger that both console logs and sends messages to the website
 */
export class AgentLogger {
  private agentId: string;
  private websiteUrl: string;

  constructor(agentId: string, websiteUrl: string = 'http://localhost:3001') {
    this.agentId = agentId;
    this.websiteUrl = websiteUrl;
  }

  /**
   * Log a message both to console and to the website
   */
  async log(message: string, type: MessageType = 'info', targetAgentId?: string, isA2AMessage: boolean = false): Promise<void> {
    const logMessage: AgentLogMessage = {
      timestamp: new Date().toISOString(),
      message,
      type,
      agentId: this.agentId,
      targetAgentId,
      isA2AMessage,
    };

    // Always console log
    console.log(`[${logMessage.timestamp}] [${type.toUpperCase()}] ${message}`);

    // Try to send to website (fail silently if website is not available)
    try {
      const response = await fetch(`${this.websiteUrl}/api/agents/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logMessage),
      });

      if (!response.ok) {
        // Don't throw, just log to console
        console.warn(`Failed to send log to website: ${response.statusText}`);
      }
    } catch (error) {
      // Silently fail - website might not be running
      // This is intentional for demo purposes
    }
  }

  /**
   * Clear all previous messages for this agent on the website
   */
  async clearMessages(): Promise<void> {
    try {
      const response = await fetch(`${this.websiteUrl}/api/agents/messages/${this.agentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        console.warn(`Failed to clear messages on website: ${response.statusText}`);
      } else {
        console.log(`Cleared previous messages for agent ${this.agentId}`);
      }
    } catch (error) {
      // Silently fail - website might not be running
      console.warn(`Could not clear messages on website (website may not be running)`);
    }
  }

  // Convenience methods for common log types
  async info(message: string, targetAgentId?: string): Promise<void> {
    return this.log(message, 'info', targetAgentId);
  }

  async error(message: string, targetAgentId?: string): Promise<void> {
    return this.log(message, 'error', targetAgentId);
  }

  async success(message: string, targetAgentId?: string): Promise<void> {
    return this.log(message, 'negotiation-succeeded', targetAgentId);
  }

  async offerCreated(message: string): Promise<void> {
    return this.log(message, 'offer-created');
  }

  async offerSent(message: string, targetAgentId?: string): Promise<void> {
    return this.log(message, 'offer-sent', targetAgentId, true);
  }

  async offerReceived(message: string, targetAgentId?: string): Promise<void> {
    return this.log(message, 'offer-received', targetAgentId, true);
  }

  async negotiationStarted(message: string, targetAgentId?: string): Promise<void> {
    return this.log(message, 'negotiation-started', targetAgentId);
  }

  async negotiationSucceeded(message: string, targetAgentId?: string): Promise<void> {
    return this.log(message, 'negotiation-succeeded', targetAgentId);
  }

  async negotiationFailed(message: string, targetAgentId?: string): Promise<void> {
    return this.log(message, 'negotiation-failed', targetAgentId);
  }
}

