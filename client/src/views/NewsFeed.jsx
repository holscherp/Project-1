import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import TickerChip from '../components/TickerChip.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { apiPatch } from '../hooks/useApi.js';

export default function NewsFeed() {
  const { theme } = useTheme();
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    ticker: '', source_type: '', search: '',
  });

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

  const parseTickers = (tickersStr) => {
    try { return JSON.parse(tickersStr || '[]'); }
    catch { return []; }
  };

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

  const cardBg = theme === 'dark' ? 'bg-navy-800 border-navy-700' : 'bg-white border-navy-200 shadow-sm';
  const inputBg = theme === 'dark' ? 'bg-navy-700 border-navy-600 text-navy-200' : 'bg-navy-50 border-navy-200 text-navy-800';
  const textSecondary = theme === 'dark' ? 'text-navy-400' : 'text-navy-500';
  const textMuted = theme === 'dark' ? 'text-navy-500' : 'text-navy-400';

  return (
    <div>
      {/* Filters */}
      <div className={`rounded-lg border p-3 mb-4 ${cardBg}`}>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search articles..."
              value={filters.search}
              onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }}
              className={`w-full px-3 py-1.5 rounded border text-sm ${inputBg} placeholder:text-navy-500 focus:outline-none focus:ring-1 focus:ring-accent-blue`}
            />
          </div>
          <input
            type="text"
            placeholder="Filter ticker..."
            value={filters.ticker}
            onChange={e => { setFilters(f => ({ ...f, ticker: e.target.value.toUpperCase() })); setPage(1); }}
            className={`w-28 px-3 py-1.5 rounded border text-sm font-mono ${inputBg} placeholder:text-navy-500 focus:outline-none focus:ring-1 focus:ring-accent-blue`}
          />
          <select
            value={filters.source_type}
            onChange={e => { setFilters(f => ({ ...f, source_type: e.target.value })); setPage(1); }}
            className={`px-3 py-1.5 rounded border text-sm ${inputBg} focus:outline-none focus:ring-1 focus:ring-accent-blue`}
          >
            <option value="">All types</option>
            <option value="news">News</option>
            <option value="filing">SEC Filing</option>
            <option value="social">Social</option>
            <option value="earnings">Earnings</option>
          </select>
          <span className={`text-xs font-mono ${textMuted}`}>{total} articles</span>
        </div>
      </div>

      {/* Articles */}
      {loading ? (
        <LoadingSpinner message="Loading news feed..." />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchArticles} />
      ) : articles.length === 0 ? (
        <div className="text-center py-12">
          <p className={`text-sm ${textSecondary}`}>No articles yet. Data will appear after the first fetch cycle completes.</p>
          <p className={`text-xs font-mono mt-2 ${textMuted}`}>Trigger a manual refresh from the header to pull news now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map(article => (
            <article key={article.id} className={`rounded-lg border p-4 transition-colors ${cardBg} ${article.is_read ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-mono uppercase tracking-wide ${
                      article.source_type === 'filing' ? 'text-accent-amber' :
                      article.source_type === 'social' ? 'text-accent-purple' :
                      'text-accent-blue'
                    }`}>{article.source}</span>
                    <span className={`text-xs ${textMuted}`}>{formatDate(article.published_at)}</span>
                  </div>
                  <h3 className={`text-sm font-semibold mb-2 ${theme === 'dark' ? 'text-navy-100' : 'text-navy-900'}`}>
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent-blue transition-colors">
                      {article.headline}
                    </a>
                  </h3>
                  {article.summary && (
                    <p className={`text-sm leading-relaxed mb-2 ${textSecondary}`}>{article.summary}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {parseTickers(article.tickers).map(t => (
                      <TickerChip key={t} symbol={t} />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => handleFlag(article.id, 'is_bookmarked', !article.is_bookmarked)}
                    className={`p-1 rounded transition-colors ${article.is_bookmarked ? 'text-accent-amber' : textMuted + ' hover:text-accent-amber'}`}
                    title="Bookmark"
                  >
                    <svg className="w-4 h-4" fill={article.is_bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  </button>
                  <button
                    onClick={() => handleFlag(article.id, 'is_flagged', !article.is_flagged)}
                    className={`p-1 rounded transition-colors ${article.is_flagged ? 'text-accent-red' : textMuted + ' hover:text-accent-red'}`}
                    title="Flag for follow-up"
                  >
                    <svg className="w-4 h-4" fill={article.is_flagged ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
                  </button>
                  <button
                    onClick={() => handleFlag(article.id, 'is_read', !article.is_read)}
                    className={`p-1 rounded transition-colors ${article.is_read ? 'text-accent-green' : textMuted + ' hover:text-accent-green'}`}
                    title="Mark as read"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className={`px-3 py-1 text-xs font-mono rounded border ${inputBg} disabled:opacity-30`}
          >
            Prev
          </button>
          <span className={`text-xs font-mono ${textMuted}`}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className={`px-3 py-1 text-xs font-mono rounded border ${inputBg} disabled:opacity-30`}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
