import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApi } from '../hooks/useApi.js';
import TickerChip from '../components/TickerChip.jsx';
import ShareModal from '../components/ShareModal.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ResponsiveContainer, AreaChart, Area, Tooltip, YAxis } from 'recharts';

// ── Sub-components ──────────────────────────────────────────────────────────

function Sparkline({ data, dark }) {
  if (!data || data.length === 0) return null;
  const isPositive = data.length > 1 && data[data.length - 1].price >= data[0].price;
  const color = isPositive ? '#16a34a' : '#dc2626';
  return (
    <ResponsiveContainer width="100%" height={72}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`tgrad-${isPositive ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
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
        <Area type="monotone" dataKey="price" stroke={color} strokeWidth={1.5}
          fill={`url(#tgrad-${isPositive ? 'up' : 'down'})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ConvictionMeter({ score, dark }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  return (
    <div>
      <div className="flex items-end justify-between mb-1.5">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
          Conviction Score
        </span>
        <span className="text-base font-mono font-bold" style={{ color }}>{score}%</span>
      </div>
      <div className={`h-1.5 rounded-full ${dark ? 'bg-slate-700' : 'bg-slate-100'}`}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function MetricRow({ label, value, dark }) {
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const heading = dark ? 'text-slate-100' : 'text-slate-900';
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className={`text-[11px] ${muted}`}>{label}</span>
      <span className={`text-xs font-mono font-medium tabular-nums ${value == null ? muted : heading}`}>
        {value == null ? '—' : value}
      </span>
    </div>
  );
}

function MetricCard({ title, rows, dark }) {
  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  return (
    <div className={`rounded-lg border p-4 ${cardBg}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 pb-2 border-b ${muted} ${dark ? 'border-slate-700/50' : 'border-slate-100'}`}>
        {title}
      </div>
      <div className={`divide-y ${dark ? 'divide-slate-700/40' : 'divide-slate-50'}`}>
        {rows.map(([label, value]) => (
          <MetricRow key={label} label={label} value={value} dark={dark} />
        ))}
      </div>
    </div>
  );
}

// ── Formatters ───────────────────────────────────────────────────────────────

const fmt = {
  x: (v) => v == null ? null : `${v.toFixed(1)}×`,
  pct: (v) => v == null ? null : `${v.toFixed(1)}%`,
  dollar: (v) => v == null ? null : v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : v >= 0 ? `$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`,
  price: (v) => v == null ? null : `$${v.toFixed(2)}`,
  vol: (v) => v == null ? null : v >= 1 ? `${v.toFixed(1)}M` : `${(v * 1000).toFixed(0)}K`,
  ratio: (v) => v == null ? null : v.toFixed(2),
  signed_pct: (v) => v == null ? null : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
};

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'News', 'AI Analysis', 'Filings'];

function TabBar({ active, setActive, counts, dark }) {
  return (
    <div className={`flex gap-0.5 border-b mb-6 ${dark ? 'border-slate-700/50' : 'border-slate-200'}`}>
      {TABS.map((tab) => {
        const count = counts[tab];
        const isActive = active === tab;
        return (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
              isActive
                ? dark
                  ? 'border-slate-300 text-white'
                  : 'border-slate-900 text-slate-900'
                : dark
                  ? 'border-transparent text-slate-500 hover:text-slate-300'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            {tab}
            {count != null && (
              <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                isActive
                  ? dark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                  : dark ? 'bg-slate-800 text-slate-500' : 'bg-slate-50 text-slate-400'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TickerDetail() {
  const { symbol } = useParams();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { data, loading, error, refetch } = useApi(`/api/ticker/${symbol}`);
  const [activeTab, setActiveTab] = useState('Overview');
  const [shareOpen, setShareOpen] = useState(false);

  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const [priceData, setPriceData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);

  const fetchAnalysis = async (force = false) => {
    setAnalysisLoading(true);
    try {
      const res = await fetch(`/api/ticker/${symbol}/analysis${force ? '?force=true' : ''}`, { credentials: 'include' });
      if (res.ok) setAnalysis(await res.json());
    } catch {}
    setAnalysisLoading(false);
  };

  useEffect(() => {
    async function fetchPrice() {
      try {
        const res = await fetch(`/api/ticker/${symbol}/price`, { credentials: 'include' });
        if (res.ok) {
          const d = await res.json();
          if (d.history) setPriceData(d.history);
          if (d.current) setCurrentPrice(d.current);
        }
      } catch {}
    }
    async function fetchMetrics() {
      setMetricsLoading(true);
      try {
        const res = await fetch(`/api/ticker/${symbol}/metrics`, { credentials: 'include' });
        if (res.ok) {
          const d = await res.json();
          setMetrics(d.metrics);
        }
      } catch {}
      setMetricsLoading(false);
    }
    fetchPrice();
    fetchMetrics();
    fetchAnalysis(false);
  }, [symbol]);

  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const secondary = dark ? 'text-slate-400' : 'text-slate-600';
  const heading = dark ? 'text-slate-100' : 'text-slate-900';

  if (loading) return <LoadingSpinner message={`Loading ${symbol}...`} />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;
  if (!data?.ticker) return <ErrorMessage message="Ticker not found" />;

  const { ticker, articles, filings, earnings } = data;

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const priceChange = priceData.length > 1
    ? ((priceData[priceData.length - 1].price - priceData[0].price) / priceData[0].price * 100).toFixed(2)
    : null;

  const logo = metrics?.logo;

  const tabCounts = {
    'News': articles?.length,
    'Filings': filings?.length,
  };

  return (
    <div>
      <Link to="/" className={`text-xs font-medium ${muted} hover:text-slate-900 mb-5 inline-block`}>
        &larr; Back
      </Link>

      {/* ── Company Header ─────────────────────────────────────────────────── */}
      <div className={`rounded-lg border p-6 mb-6 ${cardBg}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            {/* Logo or fallback badge */}
            {logo ? (
              <img src={logo} alt={ticker.symbol} className="w-10 h-10 rounded-lg object-contain shrink-0 mt-0.5" />
            ) : (
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0 mt-0.5 ${
                dark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500'
              }`}>
                {ticker.symbol.slice(0, 3)}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className={`text-xl font-bold ${heading}`}>{ticker.name}</h1>
                <span className={`text-sm font-mono font-bold ${muted}`}>{ticker.symbol}</span>
                <button
                  onClick={() => setShareOpen(true)}
                  className={`p-1.5 rounded-md transition-colors ${dark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'}`}
                  title="Share ticker"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {ticker.sector && <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{ticker.sector}</span>}
                {metrics?.exchange && (
                  <>
                    <span className={`text-[10px] ${dark ? 'text-slate-600' : 'text-slate-300'}`}>&middot;</span>
                    <span className={`text-[10px] ${muted}`}>{metrics.exchange}</span>
                  </>
                )}
                {metrics?.marketCap && (
                  <>
                    <span className={`text-[10px] ${dark ? 'text-slate-600' : 'text-slate-300'}`}>&middot;</span>
                    <span className={`text-[10px] font-mono ${muted}`}>{metrics.marketCap}</span>
                  </>
                )}
                {metrics?.website && (
                  <>
                    <span className={`text-[10px] ${dark ? 'text-slate-600' : 'text-slate-300'}`}>&middot;</span>
                    <a href={metrics.website} target="_blank" rel="noopener noreferrer"
                      className={`text-[10px] hover:underline ${muted}`}>
                      {metrics.website.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  </>
                )}
              </div>
              {ticker.description && (
                <p className={`text-sm leading-relaxed mb-3 ${secondary} max-w-2xl`}>{ticker.description}</p>
              )}
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
          </div>

          {/* Price block */}
          {currentPrice && (
            <div className="text-right shrink-0">
              <div className={`text-2xl font-mono font-bold ${heading}`}>${currentPrice.toFixed(2)}</div>
              {priceChange && (
                <div className={`text-xs font-mono font-semibold mt-0.5 ${Number(priceChange) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {Number(priceChange) >= 0 ? '+' : ''}{priceChange}% 30d
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <TabBar active={activeTab} setActive={setActiveTab} counts={tabCounts} dark={dark} />

      {/* ── Tab: Overview ────────────────────────────────────────────────── */}
      {activeTab === 'Overview' && (
        <div>
          {priceData.length > 0 && (
            <div className={`rounded-lg border p-4 mb-5 ${cardBg}`}>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>30-Day Price</span>
              <div className="mt-2">
                <Sparkline data={priceData} dark={dark} />
              </div>
            </div>
          )}

          {metricsLoading ? (
            <LoadingSpinner message="Loading metrics..." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MetricCard dark={dark} title="Valuation" rows={[
                ['P/E Ratio', fmt.x(metrics?.peRatio)],
                ['PEG Ratio', fmt.x(metrics?.pegRatio)],
                ['P/S Ratio', fmt.x(metrics?.psRatio)],
                ['P/B Ratio', fmt.x(metrics?.pbRatio)],
                ['EV/EBITDA', fmt.x(metrics?.evEbitda)],
                ['P/FCF', fmt.x(metrics?.pFCF)],
              ]} />

              <MetricCard dark={dark} title="Profitability & Performance" rows={[
                ['EPS', fmt.dollar(metrics?.eps)],
                ['ROE', fmt.pct(metrics?.roe)],
                ['ROIC', fmt.pct(metrics?.roic)],
                ['Operating Margin', fmt.pct(metrics?.operatingMargin)],
                ['Net Margin', fmt.pct(metrics?.netMargin)],
                ['Revenue Growth (YoY)', fmt.signed_pct(metrics?.revenueGrowth)],
              ]} />

              <MetricCard dark={dark} title="Financial Health" rows={[
                ['Debt / Equity', fmt.ratio(metrics?.debtEquity)],
                ['Current Ratio', fmt.ratio(metrics?.currentRatio)],
                ['Quick Ratio', fmt.ratio(metrics?.quickRatio)],
                ['Interest Coverage', fmt.x(metrics?.interestCoverage)],
                ['Net Debt / EBITDA', fmt.ratio(metrics?.netDebtEbitda)],
                ['Free Cash Flow', fmt.dollar(metrics?.fcf)],
                ['Beta', fmt.ratio(metrics?.beta)],
              ]} />

              <div className="flex flex-col gap-4">
                <MetricCard dark={dark} title="Shareholder Returns" rows={[
                  ['Dividend Yield', fmt.pct(metrics?.dividendYield)],
                  ['Payout Ratio', fmt.pct(metrics?.payoutRatio)],
                  ['Buyback Yield', fmt.pct(metrics?.buybackYield)],
                ]} />

                <MetricCard dark={dark} title="Market Activity" rows={[
                  ['Market Cap', metrics?.marketCap ?? null],
                  ['Avg 10-Day Volume', fmt.vol(metrics?.avgVolume)],
                  ['52-Week High', fmt.price(metrics?.week52High)],
                  ['52-Week Low', fmt.price(metrics?.week52Low)],
                  ['Next Earnings', earnings ? formatDate(earnings.earnings_date) : null],
                ]} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: News ────────────────────────────────────────────────────── */}
      {activeTab === 'News' && (
        <div className={`rounded-lg border p-5 ${cardBg}`}>
          {articles?.length === 0 ? (
            <p className={`text-sm ${muted}`}>No news articles for this ticker yet.</p>
          ) : (
            <div className="space-y-5">
              {articles?.map(article => (
                <div key={article.id} className={`pb-5 border-b last:border-0 ${dark ? 'border-slate-700/50' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>{article.source}</span>
                    <span className={`text-[10px] ${dark ? 'text-slate-600' : 'text-slate-300'}`}>&middot;</span>
                    <span className={`text-[10px] ${muted}`}>{formatDate(article.published_at)}</span>
                  </div>
                  <a href={article.url} target="_blank" rel="noopener noreferrer"
                    className={`text-sm font-medium hover:underline block mb-1.5 ${heading}`}>
                    {article.headline} ↗
                  </a>
                  {article.summary && (
                    <p className={`text-xs leading-relaxed ${muted}`}>{article.summary}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: AI Analysis ─────────────────────────────────────────────── */}
      {activeTab === 'AI Analysis' && (
        <div className={`rounded-lg border p-6 ${cardBg}`}>
          {analysisLoading ? (
            <LoadingSpinner message="Generating analysis..." />
          ) : analysis ? (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className={`rounded-lg p-4 ${dark ? 'bg-green-950/30 border border-green-900/30' : 'bg-green-50 border border-green-100'}`}>
                  <div className="mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-green-600">Bull Case</span>
                  </div>
                  <p className={`text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{analysis.bull}</p>
                </div>
                <div className={`rounded-lg p-4 ${dark ? 'bg-red-950/30 border border-red-900/30' : 'bg-red-50 border border-red-100'}`}>
                  <div className="mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">Bear Case</span>
                  </div>
                  <p className={`text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{analysis.bear}</p>
                </div>
              </div>

              <div className={`rounded-lg p-4 mb-4 ${dark ? 'bg-slate-900/50' : 'bg-slate-50'}`}>
                <ConvictionMeter score={analysis.conviction} dark={dark} />
              </div>

              <div className="flex items-center justify-between">
                <span className={`text-[10px] ${muted}`}>
                  {analysis.cached
                    ? `Cached · Generated ${formatDate(analysis.fetched_at)} · Refreshes every 24h`
                    : `Generated ${formatDate(analysis.fetched_at)}`
                  }
                </span>
                <button
                  onClick={() => fetchAnalysis(true)}
                  disabled={analysisLoading}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${
                    dark
                      ? 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                      : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-400'
                  } disabled:opacity-40`}
                >
                  Regenerate ↺
                </button>
              </div>
            </div>
          ) : (
            <p className={`text-sm ${muted}`}>Analysis unavailable.</p>
          )}
        </div>
      )}

      {/* ── Tab: Filings ─────────────────────────────────────────────────── */}
      {activeTab === 'Filings' && (
        <div className={`rounded-lg border p-5 ${cardBg}`}>
          {filings?.length === 0 ? (
            <p className={`text-sm ${muted}`}>No filings recorded for this ticker.</p>
          ) : (
            <div className="space-y-2">
              {filings?.map(filing => (
                <div key={filing.id} className={`flex items-center gap-3 py-2.5 border-b last:border-0 ${dark ? 'border-slate-700/50' : 'border-slate-100'}`}>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    filing.is_material
                      ? 'bg-red-500/10 text-red-500'
                      : dark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {filing.filing_type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a href={filing.url} target="_blank" rel="noopener noreferrer"
                      className={`text-sm hover:underline truncate block ${heading}`}>
                      {filing.title}
                    </a>
                    <span className={`text-[10px] ${muted}`}>{formatDate(filing.filed_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {shareOpen && (
        <ShareModal
          attachment={{ type: 'ticker', data: { symbol: ticker.symbol, name: ticker.name } }}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
