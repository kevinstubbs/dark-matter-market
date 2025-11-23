import { MESSAGE_TYPE_COLORS } from './constants';

export function MessageTypeLegend() {
  return (
    <div className="mb-6 p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
        Message Type Legend
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {Object.entries(MESSAGE_TYPE_COLORS).map(([type, colorClass]) => (
          <div key={type} className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded ${colorClass}`}>
              {type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

