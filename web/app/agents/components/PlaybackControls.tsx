import { formatTime } from './utils';

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number | null;
  playbackSpeed: 0.5 | 1 | 2;
  timeRange: { min: number; max: number };
  onPlayPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: 0.5 | 1 | 2) => void;
  onSeek: (value: number) => void;
}

export function PlaybackControls({
  isPlaying,
  currentTime,
  playbackSpeed,
  timeRange,
  onPlayPause,
  onReset,
  onSpeedChange,
  onSeek,
}: PlaybackControlsProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 flex-shrink-0" style={{ width: '160px', height: '400px' }}>
      <div className="flex flex-col items-center gap-2 h-full">
        {/* Play/Pause Button */}
        <button
          onClick={onPlayPause}
          className="w-full px-2 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded font-medium transition-colors"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Reset Button */}
        <button
          onClick={onReset}
          className="w-full px-2 py-1.5 text-sm bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded font-medium transition-colors"
        >
          ⏮
        </button>

        {/* Speed Controls */}
        <div className="flex flex-col items-center gap-1 w-full">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">Speed</span>
          <div className="flex flex-row gap-1 w-full">
            {([0.5, 1, 2] as const).map((speed) => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`w-full px-2 py-1 text-xs rounded font-medium transition-colors ${playbackSpeed === speed
                  ? 'bg-blue-600 text-white dark:bg-blue-500'
                  : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                  }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Time Slider - Vertical */}
        <div className="flex-1 flex flex-col items-center justify-center w-full relative">
          {/* Current time above the bar */}
          <div className="mb-2">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {currentTime !== null && formatTime(new Date(currentTime).toISOString())}
            </span>
          </div>

          {/* Slider */}
          <div className="flex flex-1 w-full flex-row gap-x-4">
            <div className="flex flex-col justify-between py-0.5">
              {/* Max label at top, offset horizontally */}
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-500 whitespace-nowrap">
                  {formatTime(new Date(timeRange.max).toISOString())} -
                </span>
              </div>
              {/* Min label at bottom, offset horizontally */}
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-500 whitespace-nowrap">
                  {formatTime(new Date(timeRange.min).toISOString())} -
                </span>
              </div>
            </div>
            <div className="flex-1 flex items-center w-full relative">
              <input
                type="range"
                min="0"
                max="100"
                value={currentTime === null ? 0 : ((currentTime - timeRange.min) / (timeRange.max - timeRange.min || 1)) * 100}
                onChange={(e) => onSeek(parseFloat(e.target.value))}
                className="w-2 h-[200px] bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-500"
                style={{
                  writingMode: 'vertical-lr',
                  transform: 'rotate(180deg)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

