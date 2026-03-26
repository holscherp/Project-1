import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApi } from '../hooks/useApi.js';
import TickerChip from '../components/TickerChip.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function TickerDetail() {
  const { symbol } = useParams();
  const { theme } = useTheme();
  const { data, loading, error, refetch } = useApi(`/api/ticker/${symbol}`);

  const cardBg = theme === 'dark' ? 'bg-navy-800 border-navy-700' : 'bg-white border-navy-200 shadow-sm';
  const textSecondary = theme === 'dark' ? 'text-navy-400' : 'text-navy-500';
  const textMuted = theme === 'dark' ? 'text-navy-500' : 'text-navy-400';

  if (loading) return <LoadingSpinner message={`Loading ${symbol}...`} />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;
  if (!data?.ticker) return <ErrorMessage message="Ticker not found" />;

  const { ticker, articles, filings, earnings } = data;
  const parseTickers = (str) => { try { return JSON.parse(str || '[]'); } catch { return []; } };

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div>
      <Link to="/" className={`text-sm ${textSecondary} hover:text-accent-blue mb-4 inline-block`}>
        &larr; Back to News
      </Link>

      {/* Ticker Header */}
      <div className={`rounded-lg border p-5 mb-4 ${cardBg}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-mono font-bold text-accent-green">{ticker.symbol}</h1>
              <span className={`text-lg ${theme === 'dark' ? 'text-navy-200' : 'text-navy-700'}`}>{ticker.name}</span>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-xs font-mono px-2 py-0.5 rounded ${theme === 'dark' ? 'bg-navy-700 text-navy-300' : 'bg-navy-100 text-navy-600'}`}>
                {ticker.sector}
              </span>
              <span className={`text-xs font-mono ${textMuted}`}>{ticker.market_cap_category}</span>
            </div>
            <p className={`text-sm leading-relaxed max-w-2xl ${textSecondary}`}>{ticker.description}</p>
            {ticker.themes && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {ticker.themes.split(',').map(t => (
                  <span key={t.trim()} className={`text-xs px-2 py-0.5 rounded ${theme === 'dark' ? 'bg-navy-700 text-navy-400' : 'bg-navy-100 text-navy-500'}`}>
                    {t.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
          {earnings && (
            <div className={`text-right shrink-0 rounded-lg border p-3 ${theme === 'dark' ? 'border-accent-amber/30 bg-accent-amber/10' : 'border-amber-200 bg-amber-50'}`}>
              <div className="text-xs font-mono text-accent-amber mb-1">Next Earnings</div>
              <div className={`text-sm font-mono font-semibold ${theme === 'dark' ? 'text-navy-200' : 'text-navy-800'}`}>
                {formatDate(earnings.earnings_date)}
              </div>
              {earnings.estimate_eps !== null && (
                <div className={`text-xs font-mono ${textMuted}`}>Est. EPS: ${earnings.estimate_eps}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent News */}
        <div className={`rounded-lg border p-4 ${cardBg}`}>
          <h2 className={`text-sm font-mono font-semibold uppercase tracking-wider mb-3 ${textSecondary}`}>
            Recent News ({articles?.length || 0})
          </h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {articles?.length === 0 ? (
              <p className={`text-sm ${textMuted}`}>No news articles yet.</p>
            ) : articles?.map(article => (
              <div key={article.id} className={`border-b pb-3 last:border-0 ${theme === 'dark' ? 'border-navy-700' : 'border-navy-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-accent-blue">{article.source}</span>
                  <span className={`text-xs ${textMuted}`}>{formatDate(article.published_at)}</span>
                </div>
                <a href={article.url} target="_blank" rel="noopener noreferrer"
                  className={`text-sm font-medium hover:text-accent-blue transition-colors block mb-1 ${theme === 'dark' ? 'text-navy-200' : 'text-navy-800'}`}>
                  {article.headline}
                </a>
                {article.summary && (
                  <p className={`text-xs leading-relaxed ${textMuted}`}>{article.summary}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* SEC Filings */}
        <div className={`rounded-lg border p-4 ${cardBg}`}>
          <h2 className={`text-sm font-mono font-semibold uppercase tracking-wider mb-3 ${textSecondary}`}>
            SEC Filings ({filings?.length || 0})
          </h2>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filings?.length === 0 ? (
              <p className={`text-sm ${textMuted}`}>No SEC filings recorded yet.</p>
            ) : filings?.map(filing => (
              <div key={filing.id} className={`flex items-center gap-3 border-b pb-2 last:border-0 ${theme === 'dark' ? 'border-navy-700' : 'border-navy-100'}`}>
                <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded shrink-0 ${
                  filing.is_material ? 'bg-accent-red/20 text-accent-red' : theme === 'dark' ? 'bg-navy-700 text-navy-300' : 'bg-navy-100 text-navy-600'
                }`}>
                  {filing.filing_type}
                </span>
                <div className="min-w-0 flex-1">
                  <a href={filing.url} target="_blank" rel="noopener noreferrer"
                    className={`text-sm hover:text-accent-blue transition-colors truncate block ${theme === 'dark' ? 'text-navy-200' : 'text-navy-800'}`}>
                    {filing.title}
                  </a>
                  <span className={`text-xs ${textMuted}`}>{formatDate(filing.filed_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
