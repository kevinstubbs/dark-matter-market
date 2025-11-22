import { loadContext, saveContext, AgentContext } from '@dmm/agents-shared';

export interface UserContext extends AgentContext {
  instructions: string; // Plain language instructions from user
  // e.g., "Always vote no for airdrops"
  // e.g., "I'm generally in favor of DeFi improvements but against token emissions"
  // e.g., "Vote yes on anything that increases liquidity, vote no on governance changes"
}

const USER_CONTEXT_FILE = 'user-context.txt';
const DEFAULT_USER_INSTRUCTIONS = 'Always vote no for airdrops';

export async function loadUserContext(): Promise<UserContext> {
  // For MVP: simple text file with user's plain language instructions
  // Future: database, encrypted storage, etc.
  return loadContext(USER_CONTEXT_FILE, DEFAULT_USER_INSTRUCTIONS) as Promise<UserContext>;
}

export async function saveUserContext(context: UserContext): Promise<void> {
  return saveContext(USER_CONTEXT_FILE, context);
}

