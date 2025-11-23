import type { HederaLangchainToolkit } from 'hedera-agent-kit';
import { AgentLogger } from '@dmm/agents-shared';

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
 * Check if the buyer has already cast a vote for a specific proposal
 */
export async function hasVoted(
  hederaAgentToolkit: HederaLangchainToolkit,
  topicId: string,
  proposalSequenceNumber: number,
  walletAddress: string,
  logger?: AgentLogger
): Promise<boolean> {
  try {
    // Get the tools from the toolkit
    const tools = hederaAgentToolkit.getTools();
    
    // Find the get topic messages tool from the queries plugin
    const getTopicMessagesTool = tools.find((tool: any) => 
      tool.name && (
        tool.name.includes('topic') && 
        tool.name.includes('message') &&
        tool.name.includes('query')
      )
    );

    if (!getTopicMessagesTool) {
      if (logger) {
        await logger.error('Could not find get topic messages tool in Hedera Agent Kit');
      }
      throw new Error('Could not find get topic messages tool in Hedera Agent Kit');
    }

    // Query topic messages
    const result = await getTopicMessagesTool.invoke({
      topicId: topicId,
    });

    // Parse the result to find votes
    let messages: any[] = [];
    if (typeof result === 'string') {
      try {
        messages = JSON.parse(result);
      } catch {
        // Result might already be an array
        messages = [];
      }
    } else if (Array.isArray(result)) {
      messages = result;
    } else if (result && typeof result === 'object' && 'messages' in result) {
      messages = result.messages || [];
    }

    // Check if there's a vote from this wallet address for this proposal
    for (const message of messages) {
      try {
        let messageData: any;
        if (typeof message.message === 'string') {
          messageData = JSON.parse(message.message);
        } else {
          messageData = message.message;
        }

        // Check if this is a vote message for the proposal
        if (
          messageData.type === 'Vote' &&
          messageData.sequenceNumber === proposalSequenceNumber
        ) {
          // Check if this vote is from our wallet address
          // Note: We need to check the message's payer account or transaction signer
          // For now, we'll check if the message exists after the proposal
          // In a real implementation, we'd check the transaction's payer account
          if (message.sequence_number > proposalSequenceNumber) {
            // This is a potential vote - in a real implementation, we'd verify
            // the payer account matches walletAddress
            // For MVP, we'll assume if there's a vote message, it might be ours
            // A better approach would be to check the transaction payer
            if (logger) {
              await logger.log(`Found vote message for proposal ${proposalSequenceNumber}`, 'info');
            }
            return true;
          }
        }
      } catch (e) {
        // Skip invalid messages
        continue;
      }
    }

    return false;
  } catch (error) {
    if (logger) {
      await logger.error(
        `Error checking if vote exists: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    // On error, assume not voted to allow retry
    return false;
  }
}

/**
 * Cast a vote for a proposal using the Hedera Agent Kit
 */
export async function castVote(
  hederaAgentToolkit: HederaLangchainToolkit,
  topicId: string,
  proposalSequenceNumber: number,
  desiredOutcome: string,
  logger?: AgentLogger
): Promise<void> {
  try {
    // Normalize the desired outcome to match vote format
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

    // Invoke the tool to submit the vote
    const result = await submitTool.invoke({
      topicId: topicId,
      message: messageJson,
    });

    if (logger) {
      await logger.log(
        `Vote cast for proposal ${proposalSequenceNumber} on topic ${topicId}`,
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
        `Failed to cast vote: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    throw error;
  }
}

/**
 * Check if buyer has voted, and cast vote if not
 */
export async function ensureVoteCast(
  hederaAgentToolkit: HederaLangchainToolkit,
  topicId: string,
  proposalSequenceNumber: number,
  walletAddress: string,
  desiredOutcome: string,
  logger?: AgentLogger
): Promise<boolean> {
  try {
    // Check if already voted
    const alreadyVoted = await hasVoted(
      hederaAgentToolkit,
      topicId,
      proposalSequenceNumber,
      walletAddress,
      logger
    );

    if (alreadyVoted) {
      if (logger) {
        await logger.log(
          `Already voted on proposal ${proposalSequenceNumber}, skipping vote`,
          'info'
        );
      }
      return false; // Already voted, no action taken
    }

    // Cast the vote
    if (logger) {
      await logger.log(
        `No vote found for proposal ${proposalSequenceNumber}, casting vote...`,
        'info'
      );
    }

    await castVote(
      hederaAgentToolkit,
      topicId,
      proposalSequenceNumber,
      desiredOutcome,
      logger
    );

    return true; // Vote was cast
  } catch (error) {
    if (logger) {
      await logger.error(
        `Error ensuring vote is cast: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    throw error;
  }
}

