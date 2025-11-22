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
  | 'connection-established'
  | 'connection-failed'
  | 'error'
  | 'info';

export interface AgentLogMessage {
  timestamp: string;
  message: string;
  type: MessageType;
  agentId: string;
}

/**
 * Logger that both console logs and sends messages to the website
 */
export class AgentLogger {
  private agentId: string;
  private websiteUrl: string;

  constructor(agentId: string, websiteUrl: string = 'http://localhost:3000') {
    this.agentId = agentId;
    this.websiteUrl = websiteUrl;
  }

  /**
   * Log a message both to console and to the website
   */
  async log(message: string, type: MessageType = 'info'): Promise<void> {
    const logMessage: AgentLogMessage = {
      timestamp: new Date().toISOString(),
      message,
      type,
      agentId: this.agentId,
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
  async info(message: string): Promise<void> {
    return this.log(message, 'info');
  }

  async error(message: string): Promise<void> {
    return this.log(message, 'error');
  }

  async success(message: string): Promise<void> {
    return this.log(message, 'negotiation-succeeded');
  }

  async offerCreated(message: string): Promise<void> {
    return this.log(message, 'offer-created');
  }

  async offerSent(message: string): Promise<void> {
    return this.log(message, 'offer-sent');
  }

  async offerReceived(message: string): Promise<void> {
    return this.log(message, 'offer-received');
  }

  async negotiationStarted(message: string): Promise<void> {
    return this.log(message, 'negotiation-started');
  }

  async negotiationSucceeded(message: string): Promise<void> {
    return this.log(message, 'negotiation-succeeded');
  }

  async negotiationFailed(message: string): Promise<void> {
    return this.log(message, 'negotiation-failed');
  }
}

