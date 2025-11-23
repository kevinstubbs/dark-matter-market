export const MESSAGE_TYPE_COLORS: Record<string, string> = {
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

// Map message types to edge colors
export const MESSAGE_TYPE_EDGE_COLORS: Record<string, string> = {
  'agent-started': '#3b82f6', // blue
  'agent-ready': '#22c55e', // green
  'message-received': '#6b7280', // gray
  'offer-created': '#a855f7', // purple
  'offer-sent': '#6366f1', // indigo
  'offer-received': '#eab308', // yellow
  'negotiation-started': '#06b6d4', // cyan
  'negotiation-succeeded': '#22c55e', // green
  'negotiation-failed': '#ef4444', // red
  'competing-offer-request': '#f97316', // orange
  'competing-offer-response': '#ec4899', // pink
  'seller-ready': '#10b981', // emerald
  'connection-established': '#14b8a6', // teal
  'connection-failed': '#ef4444', // red
  'error': '#ef4444', // red
  'info': '#6b7280', // gray
};

