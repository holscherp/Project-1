import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApi, apiPost, apiDelete } from '../hooks/useApi.js';
import TickerChip from '../components/TickerChip.jsx';
import TickerAutocomplete from '../components/TickerAutocomplete.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';

// ── Sparkline ──────────────────────────────────────────────────────────────────

function Sparkline({ symbol, dark }) {
  const [history, setHistory] = useState([]);
  const [isPositive, setIsPositive] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`/api/ticker/${symbol}/price?range=1m`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.history?.length) return;
        setHistory(d.history);
        setIsPositive(d.history[d.history.length - 1].price >= d.history[0].price);
      })
      .catch(() => {});
  }, [symbol]);

  if (!history.length) return <div className="h-10" />;

  const color = isPositive ? '#16a34a' : '#dc2626';
  const gradId = `spark-${symbol}-${isPositive ? 'up' : 'dn'}`;

  return (
    <div className="h-10 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={['dataMin', 'dataMax']} hide />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function WatchlistView() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { data, loading, error, refetch } = useApi('/api/watchlist');

  // Ticker add form
  const [tickerInput, setTickerInput] = useState('');
  const [tickerAdding, setTickerAdding] = useState(false);

  // Sector add form
  const [sectorInput, setSectorInput] = useState('');

  // Topic add form
  const [topicName, setTopicName] = useState('');
  const [topicKeywords, setTopicKeywords] = useState('');

  // X account add form
  const [xHandle, setXHandle] = useState('');
  const [xName, setXName] = useState('');
  const [xCategory, setXCategory] = useState('');

  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';
  const inputCls = dark
    ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400';
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const secondary = dark ? 'text-slate-400' : 'text-slate-600';
  const heading = dark ? 'text-slate-100' : 'text-slate-900';
  const btnPrimary = dark
    ? 'bg-slate-700 text-white hover:bg-slate-600'
    : 'bg-slate-900 text-white hover:bg-slate-800';

  const handleAddTicker = async (e) => {
    e.preventDefault();
    if (!tickerInput.trim()) return;
    setTickerAdding(true);
    try {
      await apiPost('/api/watchlist/tickers', { symbol: tickerInput.trim() });
      setTickerInput('');
      refetch();
    } catch (err) {
      alert(err.message);
    } finally {
      setTickerAdding(false);
    }
  };

  const handleAddSector = async (e) => {
    e.preventDefault();
    if (!sectorInput.trim()) return;
    try {
      await apiPost('/api/watchlist/sectors', { name: sectorInput.trim() });
      setSectorInput('');
      refetch();
    } catch (err) { alert(err.message); }
  };

  const handleAddTopic = async (e) => {
    e.preventDefault();
    if (!topicName.trim() || !topicKeywords.trim()) return;
    try {
      await apiPost('/api/watchlist/topics', { name: topicName.trim(), keywords: topicKeywords.trim() });
      setTopicName('');
      setTopicKeywords('');
      refetch();
    } catch (err) { alert(err.message); }
  };

  const handleAddXAccount = async (e) => {
    e.preventDefault();
    if (!xHandle.trim() || !xName.trim() || !xCategory) return;
    try {
      await apiPost('/api/watchlist/x-accounts', { handle: xHandle.trim(), display_name: xName.trim(), category: xCategory });
      setXHandle('');
      setXName('');
      setXCategory('');
      refetch();
    } catch (err) { alert(err.message); }
  };

  if (loading) return <LoadingSpinner message="Loading watchlist..." />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  const { tickers = [], sectors = [], topics = [], xAccounts = [] } = data || {};

  const XIcon = () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  return (
    <div className="space-y-8">
      <h1 className={`text-sm font-bold uppercase tracking-wider ${heading}`}>Watchlist</h1>

      {/* Tickers */}
      <section className={`rounded-lg border p-6 ${cardBg}`}>
        <h2 className={`text-[10px] font-semibold uppercase tracking-wider mb-4 ${muted}`}>
          Tickers ({tickers.length})
        </h2>
        <form onSubmit={handleAddTicker} className="flex gap-2 mb-4">
          <TickerAutocomplete
            value={tickerInput}
            onChange={setTickerInput}
            onSelect={(symbol) => setTickerInput(symbol)}
            placeholder="Enter ticker symbol (e.g. AAPL)"
            className="flex-1 max-w-xs"
            inputClassName={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
          />
          <button type="submit" disabled={tickerAdding || !tickerInput.trim()}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${btnPrimary} disabled:opacity-40`}>
            {tickerAdding ? 'Adding...' : 'Add'}
          </button>
        </form>
        <p className={`text-xs mb-4 ${muted}`}>
          Just enter the ticker symbol. Company name, sector, and description will be auto-populated.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {tickers.map(t => (
            <div key={t.symbol} className={`p-3 rounded-lg ${dark ? 'bg-slate-800/80' : 'bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <TickerChip symbol={t.symbol} />
                    <span className={`text-sm truncate ${heading}`}>{t.name}</span>
                  </div>
                  <p className={`text-[10px] truncate ${muted}`}>{t.sector}</p>
                </div>
                <button onClick={() => { if (confirm(`Remove ${t.symbol}?`)) apiDelete(`/api/watchlist/tickers/${t.symbol}`).then(refetch); }}
                  className={`p-1 rounded ${muted} hover:text-accent-red transition-colors shrink-0`}><XIcon /></button>
              </div>
              <Sparkline symbol={t.symbol} dark={dark} />
            </div>
          ))}
        </div>
      </section>

      {/* Sector Groups */}
      <section className={`rounded-lg border p-6 ${cardBg}`}>
        <h2 className={`text-[10px] font-semibold uppercase tracking-wider mb-4 ${muted}`}>
          Sector Groups ({sectors.length})
        </h2>
        <form onSubmit={handleAddSector} className="flex gap-2 mb-4">
          <input type="text" value={sectorInput} onChange={e => setSectorInput(e.target.value)}
            placeholder="e.g. Nuclear energy" className={`flex-1 max-w-sm px-3 py-2 rounded-lg border text-sm ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`} />
          <button type="submit" className={`px-4 py-2 text-xs font-semibold rounded-lg ${btnPrimary}`}>Add</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {sectors.map(s => (
            <span key={s.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${dark ? 'bg-slate-800/80 text-slate-300' : 'bg-slate-50 text-slate-700'}`}>
              {s.name}
              <button onClick={() => apiDelete(`/api/watchlist/sectors/${s.id}`).then(refetch)}
                className={`${muted} hover:text-accent-red`}><XIcon /></button>
            </span>
          ))}
        </div>
      </section>

      {/* Macro Topics */}
      <section className={`rounded-lg border p-6 ${cardBg}`}>
        <h2 className={`text-[10px] font-semibold uppercase tracking-wider mb-4 ${muted}`}>
          Macro Topics ({topics.length})
        </h2>
        <form onSubmit={handleAddTopic} className="flex flex-wrap gap-2 mb-4">
          <input type="text" value={topicName} onChange={e => setTopicName(e.target.value)}
            placeholder="Topic name" className={`w-48 px-3 py-2 rounded-lg border text-sm ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`} />
          <input type="text" value={topicKeywords} onChange={e => setTopicKeywords(e.target.value)}
            placeholder="Keywords (comma-separated)" className={`flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-sm ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`} />
          <button type="submit" className={`px-4 py-2 text-xs font-semibold rounded-lg ${btnPrimary}`}>Add</button>
        </form>
        <div className="space-y-1.5">
          {topics.map(t => (
            <div key={t.id} className={`flex items-center justify-between p-3 rounded-lg ${dark ? 'bg-slate-800/80' : 'bg-slate-50'}`}>
              <div>
                <span className={`text-sm font-medium ${heading}`}>{t.name}</span>
                <span className={`text-xs ml-3 ${muted}`}>{t.keywords}</span>
              </div>
              <button onClick={() => apiDelete(`/api/watchlist/topics/${t.id}`).then(refetch)}
                className={`p-1 ${muted} hover:text-accent-red`}><XIcon /></button>
            </div>
          ))}
        </div>
      </section>

      {/* X Accounts */}
      <section className={`rounded-lg border p-6 ${cardBg}`}>
        <h2 className={`text-[10px] font-semibold uppercase tracking-wider mb-4 ${muted}`}>
          X/Twitter Accounts ({xAccounts.length})
        </h2>
        <form onSubmit={handleAddXAccount} className="flex flex-wrap gap-2 mb-4">
          <input type="text" value={xHandle} onChange={e => setXHandle(e.target.value)}
            placeholder="@handle" className={`w-36 px-3 py-2 rounded-lg border text-sm font-mono ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`} />
          <input type="text" value={xName} onChange={e => setXName(e.target.value)}
            placeholder="Display name" className={`w-40 px-3 py-2 rounded-lg border text-sm ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`} />
          <select value={xCategory} onChange={e => setXCategory(e.target.value)}
            className={`px-3 py-2 rounded-lg border text-sm ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}>
            <option value="">Category...</option>
            <option>Activist Investors</option>
            <option>Macro Analysts</option>
            <option>Official/Institutional</option>
            <option>Financial Journalists</option>
            <option>Commodities</option>
            <option>Sector-Specific</option>
          </select>
          <button type="submit" className={`px-4 py-2 text-xs font-semibold rounded-lg ${btnPrimary}`}>Add</button>
        </form>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {xAccounts.map(a => (
            <div key={a.id} className={`flex items-center justify-between p-3 rounded-lg ${dark ? 'bg-slate-800/80' : 'bg-slate-50'}`}>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono ${heading}`}>@{a.handle}</span>
                <span className={`text-xs ${secondary}`}>{a.display_name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${dark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{a.category}</span>
              </div>
              <button onClick={() => apiDelete(`/api/watchlist/x-accounts/${a.id}`).then(refetch)}
                className={`p-1 ${muted} hover:text-accent-red`}><XIcon /></button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
