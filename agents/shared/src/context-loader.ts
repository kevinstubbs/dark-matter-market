import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface AgentContext {
  instructions: string;
}

/**
 * Generic utility to load context from a text file
 */
export async function loadContext(
  filename: string,
  defaultInstructions: string
): Promise<AgentContext> {
  try {
    const contextPath = join(process.cwd(), filename);
    const instructions = readFileSync(contextPath, 'utf-8').trim();
    return { instructions };
  } catch (e) {
    return {
      instructions: defaultInstructions,
    };
  }
}

/**
 * Generic utility to save context to a text file
 */
export async function saveContext(
  filename: string,
  context: AgentContext
): Promise<void> {
  const contextPath = join(process.cwd(), filename);
  writeFileSync(contextPath, context.instructions, 'utf-8');
}

