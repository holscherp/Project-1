import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runShlobTrader } from '../services/shlob-trader.js';

const router = Router();

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

async function fetchQuote(symbol) {
  if (!FINNHUB_API_KEY) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
    );
    if (!res.ok) return null;
    const q = await res.json();
    return q.c || null;
  } catch {
    return null;
  }
}

// GET / — Shlob's full portfolio state with live P&L
router.get('/', requireAuth, async (req, res) => {
  try {
    let portfolio = db.prepare('SELECT * FROM shlob_portfolio WHERE id = 1').get();
    if (!portfolio) {
      db.prepare(
        'INSERT OR IGNORE INTO shlob_portfolio (id, cash_balance, starting_capital, created_at) VALUES (1, 15000.0, 15000.0, ?)'
      ).run(new Date().toISOString());
      portfolio = db.prepare('SELECT * FROM shlob_portfolio WHERE id = 1').get();
    }

    const positions = db.prepare('SELECT * FROM shlob_positions ORDER BY opened_at ASC').all();
    const recentTrades = db.prepare(
      'SELECT * FROM shlob_trades ORDER BY executed_at DESC LIMIT 100'
    ).all();

    // Fetch live prices for all open positions in parallel
    const quotes = await Promise.all(positions.map(p => fetchQuote(p.ticker_symbol)));
    const priceMap = {};
    positions.forEach((p, i) => { priceMap[p.ticker_symbol] = quotes[i]; });

    // Enrich positions
    let totalPositionValue = 0;
    const enrichedPositions = positions.map(p => {
      const cp = priceMap[p.ticker_symbol];
      let unrealizedPnl = null;
      let unrealizedPnlPct = null;
      let positionValue = null;

      if (cp) {
        if (p.position_type === 'long') {
          unrealizedPnl = (cp - p.avg_cost_per_share) * p.shares;
          unrealizedPnlPct = ((cp - p.avg_cost_per_share) / p.avg_cost_per_share) * 100;
          positionValue = cp * p.shares;
        } else {
          // Short: unrealized = (avg_cost - current_price) * abs_shares
          const absShares = Math.abs(p.shares);
          unrealizedPnl = (p.avg_cost_per_share - cp) * absShares;
          unrealizedPnlPct = ((p.avg_cost_per_share - cp) / p.avg_cost_per_share) * 100;
          // Cover value (what you'd receive if you covered right now)
          positionValue = (2 * p.avg_cost_per_share - cp) * absShares;
        }
        totalPositionValue += positionValue;
      }

      const ticker = db.prepare('SELECT name, sector FROM tickers WHERE symbol = ?').get(p.ticker_symbol);

      return {
        ...p,
        shares: Math.abs(p.shares),
        name: ticker?.name || p.ticker_symbol,
        sector: ticker?.sector || null,
        current_price: cp,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_pct: unrealizedPnlPct,
        position_value: positionValue,
      };
    });

    const totalValue = portfolio.cash_balance + totalPositionValue;
    const totalPnl = totalValue - portfolio.starting_capital;
    const totalPnlPct = (totalPnl / portfolio.starting_capital) * 100;

    res.json({
      portfolio: {
        cash_balance: portfolio.cash_balance,
        starting_capital: portfolio.starting_capital,
        total_value: totalValue,
        total_pnl: totalPnl,
        total_pnl_pct: totalPnlPct,
        last_analysis_at: portfolio.last_analysis_at,
      },
      positions: enrichedPositions,
      recent_trades: recentTrades,
    });
  } catch (err) {
    console.error('[shlob-portfolio] GET error:', err);
    res.status(500).json({ error: 'Failed to load Shlob portfolio' });
  }
});

// GET /trades — Paginated full trade history
router.get('/trades', requireAuth, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const trades = db.prepare(
      'SELECT * FROM shlob_trades ORDER BY executed_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    const { count } = db.prepare('SELECT COUNT(*) as count FROM shlob_trades').get();

    res.json({ trades, total: count, page, limit });
  } catch (err) {
    console.error('[shlob-portfolio] trades GET error:', err);
    res.status(500).json({ error: 'Failed to fetch trade history' });
  }
});

// POST /analyze — Trigger a manual analysis run
let isAnalyzing = false;
router.post('/analyze', requireAuth, async (req, res) => {
  if (isAnalyzing) {
    return res.status(429).json({ error: 'Analysis already in progress. Try again shortly.' });
  }
  isAnalyzing = true;
  try {
    const result = await runShlobTrader('manual', req.user.id);
    res.json(result);
  } catch (err) {
    console.error('[shlob-portfolio] analyze error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    isAnalyzing = false;
  }
});

export default router;
