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

  const dark = theme === 'dark';
  const totalPages = Math.ceil(total / 50);

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-xs font-bold uppercase tracking-widest ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
          SEC Filings
        </h1>
        <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{total} filings</span>
      </div>

      {/* Filters */}
      <div className={`rounded-lg border p-4 mb-6 ${dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Filter by ticker..."
            value={tickerFilter}
            onChange={e => { setTickerFilter(e.target.value.toUpperCase()); setPage(1); }}
            className={`w-36 px-3 py-2 rounded-md border text-sm ${
              dark
                ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder:text-slate-500'
                : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'
            } focus:outline-none focus:ring-1 focus:ring-slate-400`}
          />
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className={`px-3 py-2 rounded-md border text-sm ${
              dark
                ? 'bg-slate-800 border-slate-600 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            } focus:outline-none focus:ring-1 focus:ring-slate-400`}
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
        <div className="text-center py-16">
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>No SEC filings recorded yet.</p>
          <p className={`text-xs mt-2 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Filings will be fetched during the next hourly update cycle.</p>
        </div>
      ) : (
        <div className={`rounded-lg border overflow-hidden ${dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
          <table className="w-full">
            <thead>
              <tr className={dark ? 'bg-slate-800' : 'bg-slate-50'}>
                <th className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Type</th>
                <th className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Ticker</th>
                <th className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Title</th>
                <th className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Filed</th>
              </tr>
            </thead>
            <tbody>
              {filings.map(filing => (
                <tr key={filing.id} className={`border-t ${dark ? 'border-slate-700 hover:bg-slate-800/80' : 'border-slate-100 hover:bg-slate-50'}`}>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      filing.is_material
                        ? 'bg-red-50 text-red-600 border border-red-200'
                        : dark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
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
                      className={`text-sm hover:underline ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {filing.title}
                    </a>
                    {filing.description && (
                      <p className={`text-xs mt-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{filing.description}</p>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-xs whitespace-nowrap ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {formatDate(filing.filed_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border ${
              dark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'
            } disabled:opacity-30 hover:border-slate-400 transition-colors`}>Prev</button>
          <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border ${
              dark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'
            } disabled:opacity-30 hover:border-slate-400 transition-colors`}>Next</button>
        </div>
      )}
    </div>
  );
}
