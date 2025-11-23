import { AgentInfo, AgentMessage, SelectedEdge } from './types';
import { MESSAGE_TYPE_COLORS } from './constants';
import { formatTime } from './utils';

interface EdgeMessagesPanelProps {
  selectedEdge: SelectedEdge;
  sourceAgent: AgentInfo;
  targetAgent: AgentInfo;
  messages: AgentMessage[];
  onClose: () => void;
}

export function EdgeMessagesPanel({
  selectedEdge,
  sourceAgent,
  targetAgent,
  messages,
  onClose,
}: EdgeMessagesPanelProps) {
  return (
    <div className="absolute top-4 right-4 w-96 h-[350px] bg-white dark:bg-zinc-900 border-2 border-zinc-300 dark:border-zinc-700 rounded-lg shadow-xl z-10 flex flex-col">
      <div className="p-4 border-b-2 flex-shrink-0 border-purple-500 bg-purple-50 dark:bg-purple-950/20">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
            Messages Between
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className={`font-semibold ${sourceAgent.type === 'buyer' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
              {sourceAgent.name}
            </span>
            {' ↔ '}
            <span className={`font-semibold ${targetAgent.type === 'buyer' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
              {targetAgent.name}
            </span>
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }}>
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500 italic">
            No messages between these agents yet...
          </p>
        ) : (
          messages.map((msg, idx) => {
            const isFromSource = msg.agentId === selectedEdge.source;
            const agent = isFromSource ? sourceAgent : targetAgent;
            return (
              <div
                key={idx}
                className={`p-2 rounded border ${isFromSource
                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20'
                  : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
                  }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${isFromSource
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-green-700 dark:text-green-300'
                      }`}>
                      {agent?.name}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${MESSAGE_TYPE_COLORS[msg.type] || MESSAGE_TYPE_COLORS['info']}`}>
                      {msg.type}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {msg.message}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

