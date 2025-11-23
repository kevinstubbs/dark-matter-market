import { AgentMessage } from './types';
import { MESSAGE_TYPE_COLORS } from './constants';
import { formatTime } from './utils';

interface MessageItemProps {
  message: AgentMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  return (
    <div className="p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs px-2 py-0.5 rounded ${MESSAGE_TYPE_COLORS[message.type] || MESSAGE_TYPE_COLORS['info']}`}>
          {message.type}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          {formatTime(message.timestamp)}
        </span>
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        {message.message}
      </p>
      {message.targetAgentId && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
          → {message.targetAgentId}
        </p>
      )}
    </div>
  );
}

