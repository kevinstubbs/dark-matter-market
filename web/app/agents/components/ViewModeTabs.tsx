import { ViewMode } from './types';

interface ViewModeTabsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ViewModeTabs({ viewMode, onViewModeChange }: ViewModeTabsProps) {
  return (
    <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 mb-4">
      <button
        onClick={() => onViewModeChange('boxes')}
        className={`px-4 py-2 font-medium transition-colors ${viewMode === 'boxes'
          ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50'
          }`}
      >
        Boxes View
      </button>
      <button
        onClick={() => onViewModeChange('network')}
        className={`px-4 py-2 font-medium transition-colors ${viewMode === 'network'
          ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50'
          }`}
      >
        Network View
      </button>
    </div>
  );
}

