import React from 'react';

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="inline-block w-6 h-6 border-2 border-accent-green border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-sm font-mono text-navy-500">{message}</p>
      </div>
    </div>
  );
}
