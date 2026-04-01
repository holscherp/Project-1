import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi.js';
import TickerAutocomplete from '../components/TickerAutocomplete.jsx';
import TickerChip from '../components/TickerChip.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import ShlobPortfolio from '../components/ShlobPortfolio.jsx';
import {
  ResponsiveContainer, AreaChart, Area, Tooltip, YAxis, XAxis, Brush,
} from 'recharts';

// ── Price Chart ────────────────────────────────────────────────────────────────

const RANGES = [
  { key: '1d',  label: '1D' },
  { key: '1w',  label: '1W' },
  { key: '1m',  label: '1M' },
  { key: '3m',  label: '3M' },
  { key: '1y',  label: '1Y' },
  { key: 'all', label: 'ALL' },
];

function PriceChart({ symbol, dark }) {
  const [range, setRange] = useState('1m');
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchChart = useCallback(async (r) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ticker/${symbol}/price?range=${r}`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setChartData(d);
      }
    } catch {}
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    fetchChart(range);
  }, [range, fetchChart]);

  const handleRange = (r) => {
    setRange(r);
    // useEffect watches `range` and will call fetchChart automatically
  };

  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const history = chartData?.history || [];
  const yearHigh = chartData?.rangeHigh;
  const yearLow = chartData?.rangeLow;

  const isPositive = history.length > 1 &&
    history[history.length - 1].price >= history[0].price;
  const lineColor = isPositive ? '#16a34a' : '#dc2626';

  return (
    <div className="mt-4">
      {/* Range toggles */}
      <div className="flex items-center gap-1 mb-3">
        {RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => handleRange(r.key)}
            className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${
              range === r.key
                ? dark ? 'bg-slate-600 text-white' : 'bg-slate-900 text-white'
                : dark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart area */}
      {loading ? (
        <div className={`h-24 flex items-center justify-center text-xs ${muted}`}>Loading…</div>
      ) : history.length === 0 ? (
        <div className={`h-24 flex items-center justify-center text-xs ${muted}`}>
          No intraday data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={136}>
          <AreaChart data={history} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`pg-${symbol}-${isPositive ? 'up' : 'dn'}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.15} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Tooltip
              contentStyle={{
                background: dark ? '#1e293b' : '#fff',
                border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}
              labelFormatter={(label) => label}
              formatter={(val) => [`$${Number(val).toFixed(2)}`, 'Price']}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={lineColor}
              strokeWidth={1.5}
              fill={`url(#pg-${symbol}-${isPositive ? 'up' : 'dn'})`}
              dot={false}
            />
            <Brush
              dataKey="date"
              height={20}
              stroke={dark ? '#334155' : '#e2e8f0'}
              fill={dark ? '#1e293b' : '#f8fafc'}
              travellerWidth={6}
              tick={{ fontSize: 8, fill: dark ? '#64748b' : '#94a3b8', fontFamily: 'var(--font-mono)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* 52-Week High/Low — only shown when range=1y and data is available */}
      {range === '1y' && (yearHigh || yearLow) && (
        <div className={`mt-3 flex gap-6 text-xs border-t pt-3 ${dark ? 'border-slate-700/50' : 'border-slate-100'}`}>
          {yearHigh && (
            <div>
              <span className={`text-[10px] font-semibold uppercase tracking-wider block mb-0.5 ${muted}`}>
                52-Week High
              </span>
              <span className="text-green-500 font-mono font-bold">${yearHigh.price.toFixed(2)}</span>
              <span className={`ml-2 ${muted}`}>{yearHigh.date}</span>
            </div>
          )}
          {yearLow && (
            <div>
              <span className={`text-[10px] font-semibold uppercase tracking-wider block mb-0.5 ${muted}`}>
                52-Week Low
              </span>
              <span className="text-red-500 font-mono font-bold">${yearLow.price.toFixed(2)}</span>
              <span className={`ml-2 ${muted}`}>{yearLow.date}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Position Card ──────────────────────────────────────────────────────────────

function PositionCard({ position, totalValue, dark, onRemove, onEdit }) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editShares, setEditShares] = useState(String(position.shares));
  const [editCost, setEditCost] = useState(
    position.cost_basis_per_share != null ? String(position.cost_basis_per_share) : ''
  );
  const [saving, setSaving] = useState(false);

  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const heading = dark ? 'text-slate-100' : 'text-slate-900';
  const secondary = dark ? 'text-slate-400' : 'text-slate-600';
  const inputCls = dark
    ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400';

  const fmt = {
    price: (v) => v == null ? '—' : `$${Number(v).toFixed(2)}`,
    signed: (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`,
    signedPct: (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${Math.abs(v).toFixed(2)}%`,
    pct: (v) => v == null ? '—' : `${Number(v).toFixed(1)}%`,
    value: (v) => v == null ? '—' : v >= 1000 ? `$${(v / 1000).toFixed(2)}K` : `$${v.toFixed(2)}`,
    shares: (v) => Number(v) % 1 === 0 ? String(v) : Number(v).toFixed(4),
  };

  const changePositive = position.price_change_pct != null && position.price_change_pct >= 0;
  const gainPositive = position.total_gain_loss != null && position.total_gain_loss >= 0;

  const handleSaveEdit = async () => {
    const s = Number(editShares);
    if (!s || s <= 0) return;
    setSaving(true);
    try {
      await onEdit(position.symbol, {
        shares: s,
        cost_basis_per_share: editCost !== '' ? Number(editCost) : null,
      });
      setEditing(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-lg border ${cardBg}`}>
      {/* Main row */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left: ticker + name */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="mt-0.5">
              <TickerChip symbol={position.symbol} />
            </div>
            <div className="min-w-0">
              <div className={`text-sm font-semibold truncate ${heading}`}>{position.name}</div>
              {position.sector && (
                <div className={`text-[10px] truncate ${muted}`}>{position.sector}</div>
              )}
            </div>
          </div>

          {/* Right: current price + daily change */}
          <div className="text-right shrink-0">
            <div className={`text-sm font-mono font-bold ${heading}`}>
              {fmt.price(position.current_price)}
            </div>
            {position.price_change_pct != null && (
              <div className={`text-[11px] font-mono ${changePositive ? 'text-green-500' : 'text-red-500'}`}>
                {fmt.signedPct(position.price_change_pct)}
              </div>
            )}
          </div>
        </div>

        {/* Metrics grid */}
        <div className={`mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t ${dark ? 'border-slate-700/40' : 'border-slate-100'}`}>
          <div>
            <div className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Shares</div>
            <div className={`text-xs font-mono font-medium mt-0.5 ${heading}`}>{fmt.shares(position.shares)}</div>
          </div>
          <div>
            <div className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Position Value</div>
            <div className={`text-xs font-mono font-medium mt-0.5 ${heading}`}>{fmt.value(position.position_value)}</div>
          </div>
          <div>
            <div className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Total Gain/Loss</div>
            <div className={`text-xs font-mono font-medium mt-0.5 ${
              position.total_gain_loss == null ? muted : gainPositive ? 'text-green-500' : 'text-red-500'
            }`}>
              {position.total_gain_loss == null
                ? '—'
                : `${fmt.signed(position.total_gain_loss)} (${fmt.signedPct(position.total_gain_loss_pct)})`
              }
            </div>
          </div>
          <div>
            <div className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Allocation</div>
            <div className={`text-xs font-mono font-medium mt-0.5 ${heading}`}>{fmt.pct(position.allocation_pct)}</div>
          </div>
        </div>

        {/* Cost basis row */}
        <div className={`mt-2 text-[11px] ${muted}`}>
          Cost basis: {position.cost_basis_per_share != null
            ? <span className={secondary}>${Number(position.cost_basis_per_share).toFixed(2)}/share</span>
            : <span>not set</span>
          }
        </div>

        {/* Action row */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setExpanded(e => !e)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all ${
              dark
                ? 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-400'
            }`}
          >
            {expanded ? 'Hide chart' : 'Show chart'}
          </button>
          <button
            onClick={() => { setEditing(e => !e); setEditShares(String(position.shares)); setEditCost(position.cost_basis_per_share != null ? String(position.cost_basis_per_share) : ''); }}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all ${
              dark
                ? 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-400'
            }`}
          >
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm(`Remove ${position.symbol} from portfolio?`)) onRemove(position.symbol);
            }}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all ml-auto ${
              dark
                ? 'border-slate-700/60 text-slate-600 hover:text-red-400 hover:border-red-800/60'
                : 'border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200'
            }`}
          >
            Remove
          </button>
        </div>

        {/* Inline edit form */}
        {editing && (
          <div className={`mt-3 pt-3 border-t flex flex-wrap gap-2 items-end ${dark ? 'border-slate-700/40' : 'border-slate-100'}`}>
            <div>
              <label className={`text-[10px] font-semibold uppercase tracking-wider block mb-1 ${muted}`}>Shares</label>
              <input
                type="number"
                min="0.0001"
                step="any"
                value={editShares}
                onChange={e => setEditShares(e.target.value)}
                className={`w-28 px-2.5 py-1.5 rounded-md border text-xs font-mono ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
              />
            </div>
            <div>
              <label className={`text-[10px] font-semibold uppercase tracking-wider block mb-1 ${muted}`}>Cost Basis/Share (optional)</label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 142.50"
                value={editCost}
                onChange={e => setEditCost(e.target.value)}
                className={`w-36 px-2.5 py-1.5 rounded-md border text-xs font-mono ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
              />
            </div>
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                dark ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-900 text-white hover:bg-slate-800'
              } disabled:opacity-40`}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className={`text-xs px-3 py-1.5 rounded-md border ${
                dark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'
              }`}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Expandable chart panel */}
      {expanded && (
        <div className={`px-5 pb-5 border-t ${dark ? 'border-slate-700/40' : 'border-slate-100'}`}>
          <PriceChart symbol={position.symbol} dark={dark} />
        </div>
      )}
    </div>
  );
}

// ── My Portfolio sub-tab ──────────────────────────────────────────────────────

function MyPortfolio({ dark }) {
  const { data, loading, error, refetch } = useApi('/api/portfolio');

  const [tickerInput, setTickerInput] = useState('');
  const [sharesInput, setSharesInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [adding, setAdding] = useState(false);

  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const heading = dark ? 'text-slate-100' : 'text-slate-900';
  const inputCls = dark
    ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400';
  const btnPrimary = dark
    ? 'bg-slate-700 text-white hover:bg-slate-600'
    : 'bg-slate-900 text-white hover:bg-slate-800';

  const handleAdd = async (e) => {
    e.preventDefault();
    const sym = tickerInput.trim().toUpperCase();
    const sh = Number(sharesInput);
    if (!sym || !sh || sh <= 0) return;
    setAdding(true);
    try {
      await apiPost('/api/portfolio/positions', {
        symbol: sym,
        shares: sh,
        cost_basis_per_share: costInput !== '' ? Number(costInput) : undefined,
      });
      setTickerInput('');
      setSharesInput('');
      setCostInput('');
      refetch();
    } catch (err) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (symbol) => {
    try {
      await apiDelete(`/api/portfolio/positions/${symbol}`);
      refetch();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEdit = async (symbol, updates) => {
    await apiPatch(`/api/portfolio/positions/${symbol}`, updates);
    refetch();
  };

  if (loading) return <LoadingSpinner message="Loading portfolio…" />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  const { positions = [], total_value = 0 } = data || {};

  const totalGainLoss = positions.reduce((sum, p) => {
    if (p.total_gain_loss == null) return sum;
    return sum + p.total_gain_loss;
  }, 0);
  const hasAnyCostBasis = positions.some(p => p.cost_basis_per_share != null);
  const totalCost = hasAnyCostBasis
    ? positions.reduce((sum, p) => {
        if (p.cost_basis_per_share == null || p.position_value == null) return sum;
        return sum + p.cost_basis_per_share * p.shares;
      }, 0)
    : null;
  const totalGainLossPct = totalCost && totalCost > 0 ? (totalGainLoss / totalCost) * 100 : null;

  const fmtLarge = (v) => {
    if (v == null) return '—';
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
    return `$${v.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <section className={`rounded-lg border p-6 ${cardBg}`}>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${muted}`}>
              Total Portfolio Value
            </div>
            <div className={`text-3xl font-mono font-bold ${heading}`}>
              {fmtLarge(total_value)}
            </div>
          </div>
          {hasAnyCostBasis && (
            <div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${muted}`}>
                Total Gain / Loss
              </div>
              <div className={`text-xl font-mono font-bold ${totalGainLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {totalGainLoss >= 0 ? '+' : ''}{fmtLarge(totalGainLoss)}
                {totalGainLossPct != null && (
                  <span className="text-sm ml-2">
                    ({totalGainLossPct >= 0 ? '+' : ''}{totalGainLossPct.toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="ml-auto text-right">
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${muted}`}>
              Positions
            </div>
            <div className={`text-xl font-mono font-bold ${heading}`}>{positions.length}</div>
          </div>
        </div>
      </section>

      {/* Add position form */}
      <section className={`rounded-lg border p-6 ${cardBg}`}>
        <h2 className={`text-[10px] font-semibold uppercase tracking-wider mb-4 ${muted}`}>
          Add Position
        </h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end">
          <div>
            <label className={`text-[10px] font-semibold uppercase tracking-wider block mb-1 ${muted}`}>
              Ticker
            </label>
            <TickerAutocomplete
              value={tickerInput}
              onChange={setTickerInput}
              onSelect={(symbol) => setTickerInput(symbol)}
              placeholder="e.g. AAPL"
              className="w-36"
              inputClassName={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
            />
          </div>
          <div>
            <label className={`text-[10px] font-semibold uppercase tracking-wider block mb-1 ${muted}`}>
              Shares
            </label>
            <input
              type="number"
              min="0.0001"
              step="any"
              placeholder="e.g. 10"
              value={sharesInput}
              onChange={e => setSharesInput(e.target.value)}
              required
              className={`w-28 px-3 py-2 rounded-lg border text-sm font-mono ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
            />
          </div>
          <div>
            <label className={`text-[10px] font-semibold uppercase tracking-wider block mb-1 ${muted}`}>
              Cost Basis/Share <span className={muted}>(optional)</span>
            </label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 142.50"
              value={costInput}
              onChange={e => setCostInput(e.target.value)}
              className={`w-36 px-3 py-2 rounded-lg border text-sm font-mono ${inputCls} focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
            />
          </div>
          <button
            type="submit"
            disabled={adding || !tickerInput.trim() || !sharesInput}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${btnPrimary} disabled:opacity-40`}
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>
      </section>

      {/* Positions list */}
      {positions.length === 0 ? (
        <div className={`text-center py-16 text-sm ${muted}`}>
          No positions yet. Add your first stock above.
        </div>
      ) : (
        <div className="space-y-4">
          {positions.map(p => (
            <PositionCard
              key={p.symbol}
              position={p}
              totalValue={total_value}
              dark={dark}
              onRemove={handleRemove}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export default function PortfolioView() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [activeTab, setActiveTab] = useState('shlob');

  const heading = dark ? 'text-slate-100' : 'text-slate-900';
  const muted = dark ? 'text-slate-500' : 'text-slate-400';

  const TABS = [
    { key: 'shlob', label: "Shlob's Portfolio" },
    { key: 'mine',  label: 'My Portfolio' },
  ];

  return (
    <div className="space-y-6">
      {/* Header + sub-tab bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className={`text-sm font-bold uppercase tracking-wider ${heading}`}>Portfolio</h1>
        <div className={`flex gap-0.5 p-0.5 rounded-lg ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === t.key
                  ? dark ? 'bg-slate-600 text-white' : 'bg-white text-slate-900 shadow-sm'
                  : dark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'shlob' && <ShlobPortfolio />}
      {activeTab === 'mine'  && <MyPortfolio dark={dark} />}
    </div>
  );
}
