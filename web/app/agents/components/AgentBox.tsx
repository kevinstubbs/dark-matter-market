import { AgentInfo, AgentMessage } from './types';
import { MessageItem } from './MessageItem';

interface AgentBoxProps {
  agent: AgentInfo;
  messages: AgentMessage[];
}

export function AgentBox({ agent, messages }: AgentBoxProps) {
  const typeColor = agent.type === 'buyer'
    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
    : 'border-green-500 bg-green-50 dark:bg-green-950/20';

  return (
    <div className={`rounded-lg border-2 ${typeColor} p-4 flex flex-col h-[600px]`}>
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
            {agent.name}
          </h2>
          <span className={`px-2 py-1 text-xs font-medium rounded ${agent.type === 'buyer'
            ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
            : 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
            }`}>
            {agent.type}
          </span>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ID: {agent.id} | Port: {agent.port}
          {agent.walletAddress && (
            <> | Wallet: {agent.walletAddress}</>
          )}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }}>
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

