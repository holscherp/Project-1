import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useNavigate } from 'react-router-dom';
import TickerChip from '../components/TickerChip.jsx';
import TickerAutocomplete from '../components/TickerAutocomplete.jsx';
import ShareModal from '../components/ShareModal.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { apiPatch } from '../hooks/useApi.js';

export default function NewsFeed() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const navigate = useNavigate();
  const [shareTarget, setShareTarget] = useState(null);
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emptyWatchlist, setEmptyWatchlist] = useState(false);
  const [filters, setFilters] = useState({ ticker: '', source_type: '', search: '' });
  const [activeTab, setActiveTab] = useState('watchlist'); // 'watchlist' | 'market'

  const [digest, setDigest] = useState([]);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestOpen, setDigestOpen] = useState(true);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmptyWatchlist(false);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '30', tab: activeTab });
      if (filters.ticker) params.set('ticker', filters.ticker);
      if (filters.source_type) params.set('source_type', filters.source_type);
      if (filters.search) params.set('search', filters.search);
      const res = await fetch(`/api/news?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch news');
      const data = await res.json();
      setArticles(data.articles);
      setTotal(data.total);
      if (data.empty_watchlist) setEmptyWatchlist(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, activeTab]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  // Fetch daily digest when on watchlist tab
  useEffect(() => {
    if (activeTab !== 'watchlist') return;
    setDigestLoading(true);
    fetch('/api/digest', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { summaries: [] })
      .then(data => setDigest(data.summaries || []))
      .catch(() => setDigest([]))
      .finally(() => setDigestLoading(false));
  }, [activeTab]);

  // Reset to page 1 when tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
    setFilters({ ticker: '', source_type: '', search: '' });
  };

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

  const formatDigestTime = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return isToday ? `Today at ${time}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
  };

  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';
  const inputCls = dark
    ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400';

  const hasActiveFilters = filters.ticker || filters.source_type || filters.search;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-sm font-bold uppercase tracking-wider ${dark ? 'text-slate-300' : 'text-slate-900'}`}>
          News Feed
        </h1>
        <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{total} articles</span>
      </div>

      {/* Tabs */}
      <div className={`flex items-center gap-1 mb-5 p-1 rounded-lg w-fit ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
        <button
          onClick={() => handleTabChange('watchlist')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
            activeTab === 'watchlist'
              ? dark ? 'bg-slate-700 text-white' : 'bg-white text-slate-900 shadow-sm'
              : dark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          My Watchlist
        </button>
        <button
          onClick={() => handleTabChange('market')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
            activeTab === 'market'
              ? dark ? 'bg-slate-700 text-white' : 'bg-white text-slate-900 shadow-sm'
              : dark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Market News
        </button>
      </div>

      {/* Daily Digest Panel — only on My Watchlist tab */}
      {activeTab === 'watchlist' && (
        <div className={`mb-5 rounded-lg border ${dark ? 'border-slate-700/50 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
          <button
            onClick={() => setDigestOpen(o => !o)}
            className={`w-full flex items-center justify-between px-4 py-3 text-left`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                Daily Digest
              </span>
              {digest.length > 0 && digest[0].generated_at && (
                <span className={`text-[10px] ${dark ? 'text-slate-600' : 'text-slate-400'}`}>
                  — {formatDigestTime(digest[0].generated_at)}
                </span>
              )}
              {digestLoading && (
                <span className={`text-[10px] ${dark ? 'text-slate-600' : 'text-slate-400'}`}>Loading…</span>
              )}
            </div>
            <svg
              className={`w-3.5 h-3.5 transition-transform ${digestOpen ? 'rotate-180' : ''} ${dark ? 'text-slate-500' : 'text-slate-400'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {digestOpen && (
            <div className={`border-t ${dark ? 'border-slate-700/50' : 'border-slate-200'}`}>
              {digestLoading ? (
                <p className={`px-4 py-3 text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Loading digest…</p>
              ) : digest.length === 0 ? (
                <p className={`px-4 py-3 text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Add tickers to your watchlist to see daily summaries here.
                </p>
              ) : digest.every(d => !d.summary) ? (
                <p className={`px-4 py-3 text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Digest not yet available — summaries generate daily at 6:00 AM UTC.
                </p>
              ) : (
                <div className="divide-y divide-slate-700/30">
                  {digest.map(item => (
                    <div key={item.symbol} className="px-4 py-3 flex gap-3">
                      <button
                        onClick={() => navigate(`/ticker/${item.symbol}`)}
                        className={`shrink-0 text-xs font-bold font-mono w-14 text-left pt-0.5 ${dark ? 'text-slate-300 hover:text-white' : 'text-slate-700 hover:text-slate-900'}`}
                      >
                        {item.symbol}
                      </button>
                      <p className={`text-xs leading-relaxed flex-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {item.summary ?? (
                          <span className={dark ? 'text-slate-600' : 'text-slate-400'}>
                            No summary yet — generates daily at 6:00 AM UTC.
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <input
          type="text"
          placeholder="Search..."
          value={filters.search}
          onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }}
          className={`flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-sm ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
        />
        <TickerAutocomplete
          value={filters.ticker}
          onChange={val => { setFilters(f => ({ ...f, ticker: val })); setPage(1); }}
          onSelect={(symbol) => { setFilters(f => ({ ...f, ticker: symbol })); setPage(1); }}
          placeholder="Ticker"
          className="w-28"
          inputClassName={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
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
      ) : emptyWatchlist && !hasActiveFilters ? (
        <div className="text-center py-16">
          <p className={`text-sm font-medium mb-2 ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
            Your watchlist is empty
          </p>
          <p className={`text-xs mb-5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
            Add tickers to your watchlist to see personalized news here.
          </p>
          <button
            onClick={() => navigate('/watchlist')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              dark
                ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            Go to Watchlist →
          </button>
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16">
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>No articles found.</p>
          {activeTab === 'watchlist' && (
            <p className={`text-xs mt-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
              Click Refresh to trigger a fetch cycle.
            </p>
          )}
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
                  <button
                    onClick={() => setShareTarget({ type: 'article', data: { id: article.id, headline: article.headline, url: article.url, source: article.source, published_at: article.published_at, tickers: article.tickers } })}
                    className={`p-1.5 rounded-md transition-colors ${dark ? 'text-slate-600 hover:text-slate-400' : 'text-slate-300 hover:text-slate-500'}`}
                    title="Share"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
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

      {shareTarget && (
        <ShareModal attachment={shareTarget} onClose={() => setShareTarget(null)} />
      )}
    </div>
  );
}
