import React from 'react';

export default function ErrorMessage({ message, onRetry }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="text-accent-red text-sm font-mono mb-2">Error</div>
        <p className="text-sm text-navy-400 mb-3">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1 text-xs font-mono rounded border border-navy-600 text-navy-400 hover:text-accent-green hover:border-accent-green transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
