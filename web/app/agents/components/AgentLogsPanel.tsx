import { AgentInfo, AgentMessage } from './types';
import { MessageItem } from './MessageItem';

interface AgentLogsPanelProps {
  agent: AgentInfo;
  messages: AgentMessage[];
  onClose: () => void;
}

export function AgentLogsPanel({ agent, messages, onClose }: AgentLogsPanelProps) {
  return (
    <div className="absolute top-4 right-4 w-96 h-[350px] bg-white dark:bg-zinc-900 border-2 border-zinc-300 dark:border-zinc-700 rounded-lg shadow-xl z-10 flex flex-col">
      <div className={`p-4 border-b-2 flex-shrink-0 ${agent.type === 'buyer'
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
        : 'border-green-500 bg-green-50 dark:bg-green-950/20'
        }`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
            {agent.name}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ID: {agent.id} | Port: {agent.port}
          {agent.walletAddress && (
            <> | Wallet: {agent.walletAddress}</>
          )}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }}>
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500 italic">
            No messages yet...
          </p>
        ) : (
          messages.map((msg, idx) => (
            <MessageItem key={idx} message={msg} />
          ))
        )}
      </div>
    </div>
  );
}

