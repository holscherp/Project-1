import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import TickerChip from '../components/TickerChip.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function FilingsView() {
  const { theme } = useTheme();
  const [filings, setFilings] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tickerFilter, setTickerFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const fetchFilings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '50' });
      if (tickerFilter) params.set('ticker', tickerFilter);
      if (typeFilter) params.set('filing_type', typeFilter);
      const res = await fetch(`/api/filings?${params}`);
      if (!res.ok) throw new Error('Failed to fetch filings');
      const data = await res.json();
      setFilings(data.filings);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, tickerFilter, typeFilter]);

  useEffect(() => { fetchFilings(); }, [fetchFilings]);

  const cardBg = theme === 'dark' ? 'bg-navy-800 border-navy-700' : 'bg-white border-navy-200 shadow-sm';
  const inputBg = theme === 'dark' ? 'bg-navy-700 border-navy-600 text-navy-200' : 'bg-navy-50 border-navy-200 text-navy-800';
  const textSecondary = theme === 'dark' ? 'text-navy-400' : 'text-navy-500';
  const textMuted = theme === 'dark' ? 'text-navy-500' : 'text-navy-400';
  const totalPages = Math.ceil(total / 50);

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className={`text-lg font-mono font-bold ${theme === 'dark' ? 'text-navy-100' : 'text-navy-900'}`}>
          SEC Filings Tracker
        </h1>
        <span className={`text-xs font-mono ${textMuted}`}>{total} filings</span>
      </div>

      {/* Filters */}
      <div className={`rounded-lg border p-3 mb-4 ${cardBg}`}>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Filter by ticker..."
            value={tickerFilter}
            onChange={e => { setTickerFilter(e.target.value.toUpperCase()); setPage(1); }}
            className={`w-32 px-3 py-1.5 rounded border text-sm font-mono ${inputBg} placeholder:text-navy-500 focus:outline-none focus:ring-1 focus:ring-accent-blue`}
          />
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className={`px-3 py-1.5 rounded border text-sm ${inputBg} focus:outline-none focus:ring-1 focus:ring-accent-blue`}
          >
            <option value="">All types</option>
            <option value="8-K">8-K (Material Events)</option>
            <option value="10-K">10-K (Annual Report)</option>
            <option value="10-Q">10-Q (Quarterly Report)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading filings..." />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchFilings} />
      ) : filings.length === 0 ? (
        <div className="text-center py-12">
          <p className={`text-sm ${textSecondary}`}>No SEC filings recorded yet.</p>
          <p className={`text-xs font-mono mt-2 ${textMuted}`}>Filings will be fetched during the next hourly update cycle.</p>
        </div>
      ) : (
        <div className={`rounded-lg border overflow-hidden ${cardBg}`}>
          <table className="w-full">
            <thead>
              <tr className={theme === 'dark' ? 'bg-navy-700/50' : 'bg-navy-50'}>
                <th className={`px-4 py-2 text-left text-xs font-mono uppercase tracking-wider ${textMuted}`}>Type</th>
                <th className={`px-4 py-2 text-left text-xs font-mono uppercase tracking-wider ${textMuted}`}>Ticker</th>
                <th className={`px-4 py-2 text-left text-xs font-mono uppercase tracking-wider ${textMuted}`}>Title</th>
                <th className={`px-4 py-2 text-left text-xs font-mono uppercase tracking-wider ${textMuted}`}>Filed</th>
              </tr>
            </thead>
            <tbody>
              {filings.map(filing => (
                <tr key={filing.id} className={`border-t ${theme === 'dark' ? 'border-navy-700 hover:bg-navy-700/30' : 'border-navy-100 hover:bg-navy-50'}`}>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      filing.is_material
                        ? 'bg-accent-red/20 text-accent-red border border-accent-red/30'
                        : theme === 'dark' ? 'bg-navy-700 text-navy-300' : 'bg-navy-100 text-navy-600'
                    }`}>
                      {filing.filing_type}
                      {filing.is_material ? ' !' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <TickerChip symbol={filing.ticker} />
                  </td>
                  <td className="px-4 py-3">
                    <a href={filing.url} target="_blank" rel="noopener noreferrer"
                      className={`text-sm hover:text-accent-blue transition-colors ${theme === 'dark' ? 'text-navy-200' : 'text-navy-800'}`}>
                      {filing.title}
                    </a>
                    {filing.description && (
                      <p className={`text-xs mt-0.5 ${textMuted}`}>{filing.description}</p>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-xs font-mono whitespace-nowrap ${textMuted}`}>
                    {formatDate(filing.filed_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className={`px-3 py-1 text-xs font-mono rounded border ${inputBg} disabled:opacity-30`}>Prev</button>
          <span className={`text-xs font-mono ${textMuted}`}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className={`px-3 py-1 text-xs font-mono rounded border ${inputBg} disabled:opacity-30`}>Next</button>
        </div>
      )}
    </div>
  );
}
