import React from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApi } from '../hooks/useApi.js';
import TickerChip from '../components/TickerChip.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function EarningsView() {
  const { theme } = useTheme();
  const { data, loading, error, refetch } = useApi('/api/earnings');

  const dark = theme === 'dark';

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
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-xs font-bold uppercase tracking-widest ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
          Earnings Calendar
        </h1>
        <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{earnings.length} upcoming</span>
      </div>

      {earnings.length === 0 ? (
        <div className="text-center py-16">
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>No upcoming earnings dates recorded yet.</p>
          <p className={`text-xs mt-2 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Earnings data will be populated during the next fetch cycle.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(group => (
            <div key={group.label}>
              <h2 className={`text-[10px] font-bold uppercase tracking-widest mb-4 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                {group.label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map(e => (
                  <div key={`${e.ticker}-${e.earnings_date}`} className={`rounded-lg border p-5 ${
                    dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <TickerChip symbol={e.ticker} />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                        daysUntil(e.earnings_date) === 'Today'
                          ? 'bg-green-50 text-green-600 border border-green-200'
                          : daysUntil(e.earnings_date) === 'Tomorrow'
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : dark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {daysUntil(e.earnings_date)}
                      </span>
                    </div>
                    <div className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {formatDate(e.earnings_date)}
                    </div>
                    {e.estimate_eps !== null && e.estimate_eps !== undefined && (
                      <div className={`text-xs mt-2 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                        EPS Est: <span className="text-green-600 font-medium">${e.estimate_eps}</span>
                      </div>
                    )}
                    {e.fiscal_quarter && (
                      <div className={`text-xs mt-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{e.fiscal_quarter}</div>
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
