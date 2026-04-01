import React, { useState, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  Tooltip, YAxis, XAxis, Legend,
} from 'recharts';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApi } from '../hooks/useApi.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtPrice(v) {
  if (v == null) return '—';
  return `$${Number(v).toFixed(2)}`;
}

function fmtValue(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtSigned(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${fmtValue(v)}`;
}

function fmtSignedPct(v) {
  if (v == null) return '';
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`;
}

const ACTION_STYLES = {
  buy:   { label: 'BUY',   bg: 'bg-green-500/15',  text: 'text-green-400'  },
  sell:  { label: 'SELL',  bg: 'bg-red-500/15',    text: 'text-red-400'    },
  short: { label: 'SHORT', bg: 'bg-amber-500/15',  text: 'text-amber-400'  },
  cover: { label: 'COVER', bg: 'bg-blue-500/15',   text: 'text-blue-400'   },
};

const TRIGGER_LABELS = { cron: 'Auto', manual: 'Manual', chat: 'Chat' };

// Palette for multi-line holding chart
const LINE_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fb923c', '#f472b6', '#facc15', '#60a5fa', '#4ade80'];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueColor, dark }) {
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const heading = dark ? 'text-slate-100' : 'text-slate-900';
  return (
    <div>
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${muted}`}>{label}</div>
      <div className={`text-base font-mono font-bold ${valueColor || heading}`}>{value}</div>
      {sub && <div className={`text-[11px] font-mono ${muted}`}>{sub}</div>}
    </div>
  );
}

function ActionBadge({ action }) {
  const s = ACTION_STYLES[action] || { label: action.toUpperCase(), bg: 'bg-slate-500/15', text: 'text-slate-400' };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function TradeRow({ trade, dark }) {
  const [expanded, setExpanded] = useState(false);
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const heading = dark ? 'text-slate-200' : 'text-slate-800';
  const rowBorder = dark ? 'border-slate-700/40' : 'border-slate-100';

  return (
    <tr className={`border-t ${rowBorder}`}>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${muted} whitespace-nowrap`}>
        {relativeTime(trade.executed_at)}
        <div className={`text-[9px] ${muted}`}>{new Date(trade.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </td>
      <td className="py-2.5 px-3"><ActionBadge action={trade.action} /></td>
      <td className={`py-2.5 px-3 text-xs font-mono font-bold ${heading}`}>{trade.ticker_symbol}</td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${heading}`}>{trade.quantity} × {fmtPrice(trade.price)}</td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${heading}`}>{fmtValue(trade.total_cost)}</td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${muted}`}>{fmtValue(trade.cash_balance_after)}</td>
      <td className={`py-2.5 px-3 text-[10px] ${muted} max-w-[180px]`}>
        {trade.reasoning ? (
          <button onClick={() => setExpanded(e => !e)} className="text-left transition-colors">
            {expanded ? trade.reasoning : (trade.reasoning.length > 80 ? trade.reasoning.substring(0, 80) + '…' : trade.reasoning)}
          </button>
        ) : <span>—</span>}
      </td>
      <td className="py-2.5 px-3">
        <span className={`text-[9px] px-1.5 py-0.5 rounded ${dark ? 'bg-slate-700/60 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
          {TRIGGER_LABELS[trade.triggered_by] || trade.triggered_by}
        </span>
      </td>
    </tr>
  );
}

function PositionRow({ pos, dark }) {
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const heading = dark ? 'text-slate-200' : 'text-slate-800';
  const rowBorder = dark ? 'border-slate-700/40' : 'border-slate-100';
  const pnlColor = pos.unrealized_pnl == null ? muted : pos.unrealized_pnl >= 0 ? 'text-green-500' : 'text-red-500';
  const typeColor = pos.position_type === 'long' ? 'text-green-400' : 'text-amber-400';
  const typeBg = pos.position_type === 'long' ? 'bg-green-500/10' : 'bg-amber-500/10';

  return (
    <tr className={`border-t ${rowBorder}`}>
      <td className={`py-2.5 px-3 text-xs font-mono font-bold ${heading}`}>
        {pos.ticker_symbol}
        {pos.name && pos.name !== pos.ticker_symbol && (
          <div className={`text-[10px] font-normal ${muted}`}>{pos.name}</div>
        )}
      </td>
      <td className="py-2.5 px-3">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${typeBg} ${typeColor}`}>
          {pos.position_type.toUpperCase()}
        </span>
      </td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${heading}`}>{pos.shares}</td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${muted}`}>{fmtPrice(pos.avg_cost_per_share)}</td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${heading}`}>{fmtPrice(pos.current_price)}</td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${heading}`}>{fmtValue(pos.position_value)}</td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${pnlColor}`}>
        {pos.unrealized_pnl != null ? `${fmtSigned(pos.unrealized_pnl)} (${fmtSignedPct(pos.unrealized_pnl_pct)})` : '—'}
      </td>
    </tr>
  );
}

// ── Portfolio Value Over Time chart ───────────────────────────────────────────

function PortfolioValueChart({ snapshots, startingCapital, dark }) {
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className={`rounded-lg border p-5 ${cardBg}`}>
        <div className={`text-[10px] font-semibold uppercase tracking-wider mb-3 ${muted}`}>Portfolio Value Over Time</div>
        <div className={`h-32 flex items-center justify-center text-xs ${muted}`}>
          No data yet — trigger an analysis to start tracking
        </div>
      </div>
    );
  }

  // Include starting point if first snapshot came after portfolio creation
  const chartData = snapshots.map(s => ({
    date: new Date(s.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: s.total_value,
  }));

  // Prepend a $15k starting point if we have data
  if (chartData.length > 0) {
    const firstSnap = snapshots[0];
    const firstDate = new Date(firstSnap.recorded_at);
    firstDate.setMinutes(firstDate.getMinutes() - 5);
    chartData.unshift({
      date: new Date(firstDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: startingCapital,
    });
  }

  const latest = chartData[chartData.length - 1]?.value;
  const isPositive = latest >= startingCapital;
  const lineColor = isPositive ? '#16a34a' : '#dc2626';
  const gradId = 'shlob-pv-grad';

  return (
    <div className={`rounded-lg border p-5 ${cardBg}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-3 ${muted}`}>Portfolio Value Over Time</div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={['dataMin - 200', 'dataMax + 200']} hide />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: dark ? '#64748b' : '#94a3b8', fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <Tooltip
            contentStyle={{
              background: dark ? '#1e293b' : '#fff',
              border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
            }}
            formatter={(val) => [`$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Portfolio Value']}
          />
          <Area type="monotone" dataKey="value" stroke={lineColor} strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 3, fill: lineColor }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Holding Value by Company chart ────────────────────────────────────────────

function HoldingsChart({ snapshots, dark }) {
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className={`rounded-lg border p-5 ${cardBg}`}>
        <div className={`text-[10px] font-semibold uppercase tracking-wider mb-3 ${muted}`}>Holding Value by Company</div>
        <div className={`h-32 flex items-center justify-center text-xs ${muted}`}>
          No data yet — trigger an analysis to start tracking
        </div>
      </div>
    );
  }

  // Collect all tickers ever held across snapshots
  const allTickers = new Set();
  for (const s of snapshots) {
    for (const p of s.positions) allTickers.add(p.ticker);
  }
  const tickers = Array.from(allTickers);

  // Build chart data: one point per snapshot, one key per ticker
  const chartData = snapshots.map(s => {
    const point = {
      date: new Date(s.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
    const posMap = {};
    for (const p of s.positions) posMap[p.ticker] = p.value;
    for (const t of tickers) point[t] = posMap[t] ?? 0;
    return point;
  });

  return (
    <div className={`rounded-lg border p-5 ${cardBg}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-3 ${muted}`}>Holding Value by Company</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <YAxis hide domain={['dataMin - 100', 'dataMax + 100']} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: dark ? '#64748b' : '#94a3b8', fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <Tooltip
            contentStyle={{
              background: dark ? '#1e293b' : '#fff',
              border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
            }}
            formatter={(val, name) => [`$${Number(val).toFixed(2)}`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: '10px', paddingTop: '8px', fontFamily: 'var(--font-mono)' }}
          />
          {tickers.map((t, i) => (
            <Line
              key={t}
              type="monotone"
              dataKey={t}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ShlobPortfolio() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { data, loading, error, refetch } = useApi('/api/shlob-portfolio');
  const { data: snapshotData } = useApi('/api/shlob-portfolio/snapshots');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [showAllTrades, setShowAllTrades] = useState(false);

  const cardBg = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200';
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const heading = dark ? 'text-slate-100' : 'text-slate-900';
  const subheading = dark ? 'text-slate-400' : 'text-slate-600';
  const tableBg = dark ? 'bg-slate-900/30' : 'bg-slate-50/50';
  const thCls = `py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-left ${muted}`;

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const res = await fetch('/api/shlob-portfolio/analyze', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Analysis failed');
      setAnalysisResult(json);
      refetch();
    } catch (err) {
      setAnalysisResult({ error: err.message });
    } finally {
      setAnalyzing(false);
    }
  }, [refetch]);

  if (loading) {
    return (
      <div className={`rounded-lg border p-6 ${cardBg}`}>
        <div className={`text-xs ${muted}`}>Loading Shlob's portfolio…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border p-6 ${cardBg}`}>
        <div className="text-xs text-red-400">Failed to load Shlob's portfolio: {error}</div>
      </div>
    );
  }

  const { portfolio, positions = [], recent_trades = [] } = data || {};
  const pnlPositive = portfolio?.total_pnl >= 0;
  const tradesToShow = showAllTrades ? recent_trades : recent_trades.slice(0, 20);
  const snapshots = snapshotData?.snapshots || [];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className={`rounded-lg border p-5 ${cardBg}`}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className={`text-sm font-bold uppercase tracking-wider ${heading}`}>Shlob's Portfolio</h2>
            <div className={`text-[11px] mt-0.5 ${muted}`}>Fully autonomous · Paper trading · $15,000 starting capital</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-[11px] ${muted}`}>Last run: {relativeTime(portfolio?.last_analysis_at)}</span>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 ${
                dark ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {analyzing ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Analyzing…
                </>
              ) : 'Analyze Now'}
            </button>
          </div>
        </div>

        {analysisResult && (
          <div className={`mb-4 px-3 py-2 rounded-md text-xs ${
            analysisResult.error
              ? dark ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600'
              : dark ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-50 text-slate-700'
          }`}>
            {analysisResult.error
              ? `Error: ${analysisResult.error}`
              : analysisResult.trades?.length > 0
                ? `Executed ${analysisResult.trades.length} trade${analysisResult.trades.length !== 1 ? 's' : ''}: ${analysisResult.trades.map(t => `${t.action.toUpperCase()} ${t.quantity} ${t.ticker}`).join(', ')}${analysisResult.overall_notes ? ` — ${analysisResult.overall_notes}` : ''}`
                : `No trades this cycle.${analysisResult.overall_notes ? ` ${analysisResult.overall_notes}` : ''}`
            }
          </div>
        )}

        <div className={`grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t ${dark ? 'border-slate-700/40' : 'border-slate-100'}`}>
          <StatCard label="Starting Capital" value={fmtValue(portfolio?.starting_capital)} dark={dark} />
          <StatCard label="Total Value" value={fmtValue(portfolio?.total_value)} valueColor={pnlPositive ? 'text-green-500' : 'text-red-500'} dark={dark} />
          <StatCard
            label="Total P&L"
            value={fmtSigned(portfolio?.total_pnl)}
            sub={fmtSignedPct(portfolio?.total_pnl_pct)}
            valueColor={portfolio?.total_pnl == null ? undefined : pnlPositive ? 'text-green-500' : 'text-red-500'}
            dark={dark}
          />
          <StatCard label="Cash" value={fmtValue(portfolio?.cash_balance)} dark={dark} />
          <StatCard label="Open Positions" value={positions.length} dark={dark} />
        </div>
      </div>

      {/* ── Portfolio charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PortfolioValueChart snapshots={snapshots} startingCapital={portfolio?.starting_capital || 15000} dark={dark} />
        <HoldingsChart snapshots={snapshots} dark={dark} />
      </div>

      {/* ── Open Positions ── */}
      {positions.length > 0 && (
        <div className={`rounded-lg border overflow-hidden ${cardBg}`}>
          <div className={`px-5 py-3 border-b ${dark ? 'border-slate-700/50' : 'border-slate-200'}`}>
            <h3 className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Open Positions ({positions.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={tableBg}>
                <tr>
                  <th className={thCls}>Ticker</th>
                  <th className={thCls}>Type</th>
                  <th className={thCls}>Shares</th>
                  <th className={thCls}>Avg Cost</th>
                  <th className={thCls}>Current</th>
                  <th className={thCls}>Value</th>
                  <th className={thCls}>Unrealized P&L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(p => <PositionRow key={p.ticker_symbol} pos={p} dark={dark} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Trade History ── */}
      <div className={`rounded-lg border overflow-hidden ${cardBg}`}>
        <div className={`px-5 py-3 border-b flex items-center justify-between ${dark ? 'border-slate-700/50' : 'border-slate-200'}`}>
          <h3 className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Trade Log ({recent_trades.length} total)</h3>
          {recent_trades.length === 0 && (
            <span className={`text-[11px] ${muted}`}>No trades yet — trigger an analysis above</span>
          )}
        </div>

        {recent_trades.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={tableBg}>
                  <tr>
                    <th className={thCls}>Time</th>
                    <th className={thCls}>Action</th>
                    <th className={thCls}>Ticker</th>
                    <th className={thCls}>Qty × Price</th>
                    <th className={thCls}>Total</th>
                    <th className={thCls}>Cash After</th>
                    <th className={thCls}>Reasoning</th>
                    <th className={thCls}>Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {tradesToShow.map(t => <TradeRow key={t.id} trade={t} dark={dark} />)}
                </tbody>
              </table>
            </div>
            {recent_trades.length > 20 && (
              <div className={`px-5 py-3 border-t text-center ${dark ? 'border-slate-700/40' : 'border-slate-100'}`}>
                <button
                  onClick={() => setShowAllTrades(v => !v)}
                  className={`text-xs font-medium ${subheading} transition-colors`}
                >
                  {showAllTrades ? 'Show less' : `Show all ${recent_trades.length} trades`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
