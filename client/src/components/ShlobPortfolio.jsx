import React, { useState, useCallback } from 'react';
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
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
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

const TRIGGER_LABELS = {
  cron:   'Auto',
  manual: 'Manual',
  chat:   'Chat',
};

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
  const triggerLabel = TRIGGER_LABELS[trade.triggered_by] || trade.triggered_by;

  return (
    <>
      <tr className={`border-t ${rowBorder}`}>
        <td className={`py-2.5 px-3 text-[11px] font-mono ${muted} whitespace-nowrap`}>
          {relativeTime(trade.executed_at)}
          <div className={`text-[9px] ${muted}`}>{new Date(trade.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </td>
        <td className="py-2.5 px-3">
          <ActionBadge action={trade.action} />
        </td>
        <td className={`py-2.5 px-3 text-xs font-mono font-bold ${heading}`}>
          {trade.ticker_symbol}
        </td>
        <td className={`py-2.5 px-3 text-[11px] font-mono ${heading}`}>
          {trade.quantity} × {fmtPrice(trade.price)}
        </td>
        <td className={`py-2.5 px-3 text-[11px] font-mono ${heading}`}>
          {fmtValue(trade.total_cost)}
        </td>
        <td className={`py-2.5 px-3 text-[11px] font-mono ${muted}`}>
          {fmtValue(trade.cash_balance_after)}
        </td>
        <td className={`py-2.5 px-3 text-[10px] ${muted} max-w-[180px]`}>
          {trade.reasoning ? (
            <button
              onClick={() => setExpanded(e => !e)}
              className={`text-left hover:${dark ? 'text-slate-300' : 'text-slate-700'} transition-colors`}
            >
              {expanded ? trade.reasoning : (trade.reasoning.length > 80 ? trade.reasoning.substring(0, 80) + '…' : trade.reasoning)}
            </button>
          ) : <span className={muted}>—</span>}
        </td>
        <td className="py-2.5 px-3">
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${dark ? 'bg-slate-700/60 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
            {triggerLabel}
          </span>
        </td>
      </tr>
    </>
  );
}

function PositionRow({ pos, dark }) {
  const muted = dark ? 'text-slate-500' : 'text-slate-400';
  const heading = dark ? 'text-slate-200' : 'text-slate-800';
  const rowBorder = dark ? 'border-slate-700/40' : 'border-slate-100';
  const pnlColor = pos.unrealized_pnl == null
    ? muted
    : pos.unrealized_pnl >= 0 ? 'text-green-500' : 'text-red-500';
  const typeColor = pos.position_type === 'long' ? 'text-green-400' : 'text-amber-400';
  const typeBg = pos.position_type === 'long' ? 'bg-green-500/10' : 'bg-amber-500/10';

  return (
    <tr className={`border-t ${rowBorder}`}>
      <td className={`py-2.5 px-3 text-xs font-mono font-bold ${heading}`}>
        {pos.symbol}
        {pos.name && pos.name !== pos.symbol && (
          <div className={`text-[10px] font-normal ${muted}`}>{pos.name}</div>
        )}
      </td>
      <td className="py-2.5 px-3">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${typeBg} ${typeColor}`}>
          {pos.position_type.toUpperCase()}
        </span>
      </td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${heading}`}>
        {pos.shares}
      </td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${muted}`}>
        {fmtPrice(pos.avg_cost_per_share)}
      </td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${heading}`}>
        {fmtPrice(pos.current_price)}
      </td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${heading}`}>
        {fmtValue(pos.position_value)}
      </td>
      <td className={`py-2.5 px-3 text-[11px] font-mono ${pnlColor}`}>
        {pos.unrealized_pnl != null
          ? `${fmtSigned(pos.unrealized_pnl)} (${fmtSignedPct(pos.unrealized_pnl_pct)})`
          : '—'}
      </td>
    </tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ShlobPortfolio() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { data, loading, error, refetch } = useApi('/api/shlob/portfolio');
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
      const res = await fetch('/api/shlob/analyze', {
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
        <div className={`text-xs text-red-400`}>Failed to load Shlob's portfolio: {error}</div>
      </div>
    );
  }

  const { portfolio, positions = [], trades = [] } = data || {};
  const pnlPositive = portfolio?.total_pnl >= 0;
  const tradesToShow = showAllTrades ? trades : trades.slice(0, 20);

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className={`rounded-lg border p-5 ${cardBg}`}>
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className={`text-sm font-bold uppercase tracking-wider ${heading}`}>
              Shlob's Portfolio
            </h2>
            <div className={`text-[11px] mt-0.5 ${muted}`}>
              Fully autonomous · Paper trading · $15,000 starting capital
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-[11px] ${muted}`}>
              Last run: {relativeTime(portfolio?.last_analysis_at)}
            </span>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 ${
                dark
                  ? 'bg-slate-700 text-white hover:bg-slate-600'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
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

        {/* Analysis result banner */}
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

        {/* Stats grid */}
        <div className={`grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t ${dark ? 'border-slate-700/40' : 'border-slate-100'}`}>
          <StatCard
            label="Starting Capital"
            value={fmtValue(portfolio?.starting_capital)}
            dark={dark}
          />
          <StatCard
            label="Total Value"
            value={fmtValue(portfolio?.total_value)}
            valueColor={pnlPositive ? 'text-green-500' : 'text-red-500'}
            dark={dark}
          />
          <StatCard
            label="Total P&L"
            value={fmtSigned(portfolio?.total_pnl)}
            sub={fmtSignedPct(portfolio?.total_pnl_pct)}
            valueColor={portfolio?.total_pnl == null ? undefined : pnlPositive ? 'text-green-500' : 'text-red-500'}
            dark={dark}
          />
          <StatCard
            label="Cash"
            value={fmtValue(portfolio?.cash_balance)}
            dark={dark}
          />
          <StatCard
            label="Open Positions"
            value={positions.length}
            dark={dark}
          />
        </div>
      </div>

      {/* ── Open Positions ── */}
      {positions.length > 0 && (
        <div className={`rounded-lg border overflow-hidden ${cardBg}`}>
          <div className={`px-5 py-3 border-b ${dark ? 'border-slate-700/50' : 'border-slate-200'}`}>
            <h3 className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>
              Open Positions ({positions.length})
            </h3>
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
                {positions.map(p => (
                  <PositionRow key={p.symbol} pos={p} dark={dark} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Trade History ── */}
      <div className={`rounded-lg border overflow-hidden ${cardBg}`}>
        <div className={`px-5 py-3 border-b flex items-center justify-between ${dark ? 'border-slate-700/50' : 'border-slate-200'}`}>
          <h3 className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>
            Trade Log ({trades.length} total)
          </h3>
          {trades.length === 0 && (
            <span className={`text-[11px] ${muted}`}>No trades yet — trigger an analysis above</span>
          )}
        </div>

        {trades.length > 0 && (
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
                  {tradesToShow.map((t, i) => (
                    <TradeRow key={t.id ?? i} trade={t} dark={dark} />
                  ))}
                </tbody>
              </table>
            </div>

            {trades.length > 20 && (
              <div className={`px-5 py-3 border-t text-center ${dark ? 'border-slate-700/40' : 'border-slate-100'}`}>
                <button
                  onClick={() => setShowAllTrades(v => !v)}
                  className={`text-xs font-medium ${dark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-900'} transition-colors`}
                >
                  {showAllTrades ? 'Show less' : `Show all ${trades.length} trades`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
