'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AgentMessage {
  timestamp: string;
  message: string;
  type: string;
  agentId: string;
}

interface AgentInfo {
  id: string;
  name: string;
  type: 'buyer' | 'seller';
  port: number;
}

const MESSAGE_TYPE_COLORS: Record<string, string> = {
  'agent-started': 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200',
  'agent-ready': 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200',
  'message-received': 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
  'offer-created': 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200',
  'offer-sent': 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200',
  'offer-received': 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200',
  'negotiation-started': 'bg-cyan-100 dark:bg-cyan-900/20 text-cyan-800 dark:text-cyan-200',
  'negotiation-succeeded': 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200',
  'negotiation-failed': 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200',
  'competing-offer-request': 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200',
  'competing-offer-response': 'bg-pink-100 dark:bg-pink-900/20 text-pink-800 dark:text-pink-200',
  'seller-ready': 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200',
  'connection-established': 'bg-teal-100 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200',
  'connection-failed': 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200',
  'error': 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200',
  'info': 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [messages, setMessages] = useState<Record<string, AgentMessage[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load agent list
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        setAgents(data.agents || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading agents:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (agents.length === 0) return;

    // Load messages for all agents
    const loadMessages = async () => {
      const messagePromises = agents.map(agent =>
        fetch(`/api/agents/messages?agentId=${agent.id}`)
          .then(res => res.json())
          .then(data => ({ agentId: agent.id, messages: data.messages || [] }))
          .catch(err => {
            console.error(`Error loading messages for ${agent.id}:`, err);
            return { agentId: agent.id, messages: [] };
          })
      );

      const results = await Promise.all(messagePromises);
      const messagesMap: Record<string, AgentMessage[]> = {};
      results.forEach(({ agentId, messages }) => {
        messagesMap[agentId] = messages;
      });
      setMessages(messagesMap);
    };

    loadMessages();

    // Refresh messages every 2 seconds
    const interval = setInterval(loadMessages, 2000);

    return () => clearInterval(interval);
  }, [agents]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading agents...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 mb-4"
          >
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-black dark:text-zinc-50 mb-2">
            Agent Dashboard
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Real-time activity from all agents
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => {
            const agentMessages = messages[agent.id] || [];
            const typeColor = agent.type === 'buyer' 
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' 
              : 'border-green-500 bg-green-50 dark:bg-green-950/20';

            return (
              <div
                key={agent.id}
                className={`rounded-lg border-2 ${typeColor} p-4 flex flex-col h-[600px]`}
              >
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
                      {agent.name}
                    </h2>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      agent.type === 'buyer'
                        ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                        : 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                    }`}>
                      {agent.type}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    ID: {agent.id} | Port: {agent.port}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {agentMessages.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-500 italic">
                      No messages yet...
                    </p>
                  ) : (
                    agentMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            MESSAGE_TYPE_COLORS[msg.type] || MESSAGE_TYPE_COLORS['info']
                          }`}>
                            {msg.type}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                          {msg.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

