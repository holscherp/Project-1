import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApi } from '../hooks/useApi.js';
import TickerChip from '../components/TickerChip.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ResponsiveContainer, AreaChart, Area, Tooltip, YAxis } from 'recharts';

function ConvictionMeter({ score, dark }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
          Conviction
        </span>
        <span className="text-lg font-mono font-bold" style={{ color }}>{score}%</span>
      </div>
      <div className={`h-1.5 rounded-full ${dark ? 'bg-slate-700' : 'bg-slate-100'}`}>
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function Sparkline({ data, dark }) {
  if (!data || data.length === 0) return null;
  const isPositive = data.length > 1 && data[data.length - 1].price >= data[0].price;
  const color = isPositive ? '#16a34a' : '#dc2626';

  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${isPositive ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <Tooltip
          contentStyle={{
            background: dark ? '#1e293b' : '#fff',
            border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
            borderRadius: '6px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
          }}
          labelFormatter={(i) => data[i]?.date || ''}
          formatter={(val) => [`$${val.toFixed(2)}`, 'Price']}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${isPositive ? 'up' : 'down'})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function TickerDetail() {
  const { symbol } = useParams();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { data, loading, error, refetch } = useApi(`/api/ticker/${symbol}`);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [priceData, setPriceData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);

  // Fetch stock price data
  useEffect(() => {
    async function fetchPrice() {
      try {
        const res = await fetch(`/api/ticker/${symbol}/price`);
        if (res.ok) {
          const d = await res.json();
          if (d.history) setPriceData(d.history);
          if (d.current) setCurrentPrice(d.current);
        }
      } catch {}
    }
    fetchPrice();
  }, [symbol]);

  // Fetch AI analysis
  useEffect(() => {
    async function fetchAnalysis() {
      setAnalysisLoading(true);
      try {
        const res = await fetch(`/api/ticker/${symbol}/analysis`);
        if (res.ok) {
          const d = await res.json();
          setAnalysis(d);
        }
      } catch {}
      setAnalysisLoading(false);
    }
    fetchAnalysis();
  }, [symbol]);

  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const secondary = dark ? 'text-slate-400' : 'text-slate-600';
  const heading = dark ? 'text-slate-100' : 'text-slate-900';

  if (loading) return <LoadingSpinner message={`Loading ${symbol}...`} />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;
  if (!data?.ticker) return <ErrorMessage message="Ticker not found" />;

  const { ticker, articles, filings, earnings } = data;
  const parseTickers = (str) => { try { return JSON.parse(str || '[]'); } catch { return []; } };
  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const priceChange = priceData.length > 1
    ? ((priceData[priceData.length - 1].price - priceData[0].price) / priceData[0].price * 100).toFixed(2)
    : null;

  return (
    <div>
      <Link to="/" className={`text-xs font-medium ${muted} hover:${heading} mb-6 inline-block`}>
        &larr; Back
      </Link>

      {/* Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Company Info */}
        <div className={`lg:col-span-2 rounded-lg border p-6 ${cardBg}`}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className={`text-xl font-bold ${heading}`}>{ticker.name}</h1>
                <span className={`text-sm font-mono font-bold ${muted}`}>{ticker.symbol}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{ticker.sector}</span>
                <span className={`text-[10px] ${dark ? 'text-slate-600' : 'text-slate-300'}`}>&middot;</span>
                <span className={`text-[10px] ${muted}`}>{ticker.market_cap_category}</span>
              </div>
            </div>
            {currentPrice && (
              <div className="text-right">
                <div className={`text-xl font-mono font-bold ${heading}`}>${currentPrice.toFixed(2)}</div>
                {priceChange && (
                  <div className={`text-xs font-mono font-semibold ${Number(priceChange) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {Number(priceChange) >= 0 ? '+' : ''}{priceChange}% 30d
                  </div>
                )}
              </div>
            )}
          </div>
          <p className={`text-sm leading-relaxed mb-4 ${secondary}`}>{ticker.description}</p>
          {ticker.themes && (
            <div className="flex flex-wrap gap-1.5">
              {ticker.themes.split(',').map(t => (
                <span key={t.trim()} className={`text-[10px] px-2 py-0.5 rounded-md ${dark ? 'bg-slate-700/50 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                  {t.trim()}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Price Chart & Metrics */}
        <div className={`rounded-lg border p-5 ${cardBg}`}>
          {priceData.length > 0 ? (
            <div className="mb-4">
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>30-Day Price</span>
              <div className="mt-2">
                <Sparkline data={priceData} dark={dark} />
              </div>
            </div>
          ) : (
            <div className={`text-xs text-center py-6 ${muted}`}>No price data available</div>
          )}
          {earnings && (
            <div className={`pt-3 border-t ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Next Earnings</span>
                <span className={`text-sm font-mono font-semibold ${heading}`}>{formatDate(earnings.earnings_date)}</span>
              </div>
            </div>
          )}
          {analysis?.conviction !== undefined && (
            <div className={`pt-3 mt-3 border-t ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
              <ConvictionMeter score={analysis.conviction} dark={dark} />
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis */}
      {(analysis || analysisLoading) && (
        <div className={`rounded-lg border p-6 mb-6 ${cardBg}`}>
          <h2 className={`text-[10px] font-semibold uppercase tracking-wider mb-4 ${muted}`}>AI Analysis</h2>
          {analysisLoading ? (
            <LoadingSpinner message="Generating analysis..." />
          ) : analysis ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-accent-green text-xs font-bold uppercase">Bull Case</span>
                </div>
                <p className={`text-sm leading-relaxed ${secondary}`}>{analysis.bull}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-accent-red text-xs font-bold uppercase">Bear Case</span>
                </div>
                <p className={`text-sm leading-relaxed ${secondary}`}>{analysis.bear}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* News & Filings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`rounded-lg border p-5 ${cardBg}`}>
          <h2 className={`text-[10px] font-semibold uppercase tracking-wider mb-4 ${muted}`}>
            Recent News ({articles?.length || 0})
          </h2>
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {articles?.length === 0 ? (
              <p className={`text-sm ${muted}`}>No news articles yet.</p>
            ) : articles?.map(article => (
              <div key={article.id} className={`pb-3 border-b last:border-0 ${dark ? 'border-slate-700/50' : 'border-slate-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{article.source}</span>
                  <span className={`text-[10px] ${muted}`}>{formatDate(article.published_at)}</span>
                </div>
                <a href={article.url} target="_blank" rel="noopener noreferrer"
                  className={`text-sm font-medium hover:underline block mb-1 ${heading}`}>
                  {article.headline}
                </a>
                {article.summary && <p className={`text-xs leading-relaxed ${muted}`}>{article.summary}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-lg border p-5 ${cardBg}`}>
          <h2 className={`text-[10px] font-semibold uppercase tracking-wider mb-4 ${muted}`}>
            SEC Filings ({filings?.length || 0})
          </h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filings?.length === 0 ? (
              <p className={`text-sm ${muted}`}>No filings recorded.</p>
            ) : filings?.map(filing => (
              <div key={filing.id} className={`flex items-center gap-3 pb-2 border-b last:border-0 ${dark ? 'border-slate-700/50' : 'border-slate-100'}`}>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  filing.is_material ? 'bg-red-500/10 text-accent-red' : dark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'
                }`}>{filing.filing_type}</span>
                <div className="min-w-0 flex-1">
                  <a href={filing.url} target="_blank" rel="noopener noreferrer"
                    className={`text-sm hover:underline truncate block ${heading}`}>{filing.title}</a>
                  <span className={`text-[10px] ${muted}`}>{formatDate(filing.filed_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
