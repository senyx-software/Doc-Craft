import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

interface ProgressIndicatorProps {
  totalRequired: number;
  collectedCount: number;
  pendingRequired: string[];
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  totalRequired,
  collectedCount,
  pendingRequired,
}) => {
  const percent = totalRequired > 0 ? Math.min(100, Math.round((collectedCount / totalRequired) * 100)) : 0;

  return (
    <div className="px-4 py-3 border-t border-appBorder bg-appSurface" id="progress-indicator">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-appTextSecondary">Progress</span>
        <span className="text-xs font-semibold text-brand-500">{percent}%</span>
      </div>
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-appBorder rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-400 to-accent-purple-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      {/* Field status */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Array.from({ length: totalRequired }).map((_, i) => {
          const filled = i < collectedCount;
          return filled ? (
            <CheckCircle2 key={i} size={12} className="text-accent-green-500" />
          ) : (
            <Circle key={i} size={12} className="text-appBorder" />
          );
        })}
      </div>
      {pendingRequired.length > 0 && (
        <p className="text-xs text-appTextSecondary mt-1.5">
          {pendingRequired.length} required field{pendingRequired.length !== 1 ? 's' : ''} remaining
        </p>
      )}
    </div>
  );
};

export default ProgressIndicator;
