import React from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApi } from '../hooks/useApi.js';
import TickerChip from '../components/TickerChip.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function EarningsView() {
  const { theme } = useTheme();
  const { data, loading, error, refetch } = useApi('/api/earnings');

  const cardBg = theme === 'dark' ? 'bg-navy-800 border-navy-700' : 'bg-white border-navy-200 shadow-sm';
  const textSecondary = theme === 'dark' ? 'text-navy-400' : 'text-navy-500';
  const textMuted = theme === 'dark' ? 'text-navy-500' : 'text-navy-400';

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const daysUntil = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.ceil((d - now) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `${diff} days`;
  };

  // Group by month
  const groupByMonth = (earnings) => {
    const groups = {};
    for (const e of earnings) {
      const d = new Date(e.earnings_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = { label, items: [] };
      groups[key].items.push(e);
    }
    return Object.values(groups);
  };

  if (loading) return <LoadingSpinner message="Loading earnings calendar..." />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  const earnings = data?.earnings || [];
  const groups = groupByMonth(earnings);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className={`text-lg font-mono font-bold ${theme === 'dark' ? 'text-navy-100' : 'text-navy-900'}`}>
          Earnings Calendar
        </h1>
        <span className={`text-xs font-mono ${textMuted}`}>{earnings.length} upcoming</span>
      </div>

      {earnings.length === 0 ? (
        <div className="text-center py-12">
          <p className={`text-sm ${textSecondary}`}>No upcoming earnings dates recorded yet.</p>
          <p className={`text-xs font-mono mt-2 ${textMuted}`}>Earnings data will be populated during the next fetch cycle.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.label}>
              <h2 className={`text-sm font-mono font-semibold uppercase tracking-wider mb-3 ${textSecondary}`}>
                {group.label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.items.map(e => (
                  <div key={`${e.ticker}-${e.earnings_date}`} className={`rounded-lg border p-4 ${cardBg}`}>
                    <div className="flex items-center justify-between mb-2">
                      <TickerChip symbol={e.ticker} />
                      <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                        daysUntil(e.earnings_date) === 'Today' ? 'bg-accent-green/20 text-accent-green' :
                        daysUntil(e.earnings_date) === 'Tomorrow' ? 'bg-accent-amber/20 text-accent-amber' :
                        theme === 'dark' ? 'bg-navy-700 text-navy-400' : 'bg-navy-100 text-navy-500'
                      }`}>
                        {daysUntil(e.earnings_date)}
                      </span>
                    </div>
                    <div className={`text-sm font-mono ${theme === 'dark' ? 'text-navy-200' : 'text-navy-800'}`}>
                      {formatDate(e.earnings_date)}
                    </div>
                    {e.estimate_eps !== null && e.estimate_eps !== undefined && (
                      <div className={`text-xs font-mono mt-1 ${textMuted}`}>
                        EPS Est: <span className="text-accent-green">${e.estimate_eps}</span>
                      </div>
                    )}
                    {e.fiscal_quarter && (
                      <div className={`text-xs mt-1 ${textMuted}`}>{e.fiscal_quarter}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
