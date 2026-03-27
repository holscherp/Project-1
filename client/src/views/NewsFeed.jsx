import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import TickerChip from '../components/TickerChip.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { apiPatch } from '../hooks/useApi.js';

export default function NewsFeed() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ ticker: '', source_type: '', search: '' });

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '30' });
      if (filters.ticker) params.set('ticker', filters.ticker);
      if (filters.source_type) params.set('source_type', filters.source_type);
      if (filters.search) params.set('search', filters.search);
      const res = await fetch(`/api/news?${params}`);
      if (!res.ok) throw new Error('Failed to fetch news');
      const data = await res.json();
      setArticles(data.articles);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  const handleFlag = async (id, field, value) => {
    try {
      await apiPatch(`/api/news/${id}`, { [field]: value });
      setArticles(prev => prev.map(a => a.id === id ? { ...a, [field]: value ? 1 : 0 } : a));
    } catch {}
  };

  const totalPages = Math.ceil(total / 30);
  const parseTickers = (str) => { try { return JSON.parse(str || '[]'); } catch { return []; } };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffHrs = Math.floor(diffMs / 3600000);
    if (diffHrs < 1) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';
  const inputCls = dark
    ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-sm font-bold uppercase tracking-wider ${dark ? 'text-slate-300' : 'text-slate-900'}`}>
          News Feed
        </h1>
        <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{total} articles</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <input
          type="text"
          placeholder="Search..."
          value={filters.search}
          onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }}
          className={`flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-sm ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
        />
        <input
          type="text"
          placeholder="Ticker"
          value={filters.ticker}
          onChange={e => { setFilters(f => ({ ...f, ticker: e.target.value.toUpperCase() })); setPage(1); }}
          className={`w-24 px-3 py-2 rounded-lg border text-sm font-mono ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
        />
        <select
          value={filters.source_type}
          onChange={e => { setFilters(f => ({ ...f, source_type: e.target.value })); setPage(1); }}
          className={`px-3 py-2 rounded-lg border text-sm ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
        >
          <option value="">All types</option>
          <option value="news">News</option>
          <option value="filing">SEC Filing</option>
          <option value="social">Social</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading news..." />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchArticles} />
      ) : articles.length === 0 ? (
        <div className="text-center py-16">
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>No articles yet.</p>
          <p className={`text-xs mt-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Click Refresh to trigger a fetch cycle.</p>
        </div>
      ) : (
        <div className="space-y-px">
          {articles.map(article => (
            <article
              key={article.id}
              className={`rounded-lg border p-5 transition-all ${cardBg} ${article.is_read ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                      article.source_type === 'filing' ? 'text-accent-amber' :
                      article.source_type === 'social' ? 'text-accent-purple' :
                      dark ? 'text-slate-500' : 'text-slate-400'
                    }`}>{article.source}</span>
                    <span className={`text-[10px] ${dark ? 'text-slate-600' : 'text-slate-300'}`}>&middot;</span>
                    <span className={`text-[10px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{formatDate(article.published_at)}</span>
                  </div>
                  <h3 className={`text-sm font-semibold leading-snug mb-1.5 ${dark ? 'text-slate-100' : 'text-slate-900'}`}>
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:underline decoration-slate-300">
                      {article.headline}
                    </a>
                  </h3>
                  {article.summary && (
                    <p className={`text-sm leading-relaxed mb-3 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>{article.summary}</p>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {parseTickers(article.tickers).map(t => <TickerChip key={t} symbol={t} />)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleFlag(article.id, 'is_bookmarked', !article.is_bookmarked)}
                    className={`p-1.5 rounded-md transition-colors ${article.is_bookmarked ? 'text-accent-amber' : dark ? 'text-slate-600 hover:text-slate-400' : 'text-slate-300 hover:text-slate-500'}`}
                    title="Bookmark"
                  >
                    <svg className="w-3.5 h-3.5" fill={article.is_bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  </button>
                  <button
                    onClick={() => handleFlag(article.id, 'is_flagged', !article.is_flagged)}
                    className={`p-1.5 rounded-md transition-colors ${article.is_flagged ? 'text-accent-red' : dark ? 'text-slate-600 hover:text-slate-400' : 'text-slate-300 hover:text-slate-500'}`}
                    title="Flag"
                  >
                    <svg className="w-3.5 h-3.5" fill={article.is_flagged ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
                  </button>
                  <button
                    onClick={() => handleFlag(article.id, 'is_read', !article.is_read)}
                    className={`p-1.5 rounded-md transition-colors ${article.is_read ? 'text-accent-green' : dark ? 'text-slate-600 hover:text-slate-400' : 'text-slate-300 hover:text-slate-500'}`}
                    title="Mark read"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border ${dark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'} disabled:opacity-30`}>
            Previous
          </button>
          <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border ${dark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'} disabled:opacity-30`}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
