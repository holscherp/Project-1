import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/digest
// Returns daily ticker summaries for the authenticated user's watchlist tickers.
router.get('/', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's watchlist ticker symbols
    const watchlistTickers = db.prepare(`
      SELECT t.symbol, t.name
      FROM user_watchlist_tickers uwt
      JOIN tickers t ON t.symbol = uwt.ticker_symbol
      WHERE uwt.user_id = ?
      ORDER BY uwt.added_at ASC
    `).all(userId);

    if (watchlistTickers.length === 0) {
      return res.json({ summaries: [] });
    }

    const symbols = watchlistTickers.map(t => t.symbol);

    // Fetch daily summaries for those symbols
    const placeholders = symbols.map(() => '?').join(', ');
    const summaryRows = db.prepare(`
      SELECT symbol, summary, news_count, generated_at
      FROM ticker_daily_summaries
      WHERE symbol IN (${placeholders})
    `).all(...symbols);

    // Build a map for quick lookup
    const summaryMap = {};
    for (const row of summaryRows) {
      summaryMap[row.symbol] = row;
    }

    // Merge with watchlist order, preserving tickers with no summary yet
    const summaries = watchlistTickers.map(t => ({
      symbol: t.symbol,
      name: t.name,
      summary: summaryMap[t.symbol]?.summary ?? null,
      news_count: summaryMap[t.symbol]?.news_count ?? 0,
      generated_at: summaryMap[t.symbol]?.generated_at ?? null,
    }));

    res.json({ summaries });
  } catch (err) {
    console.error('[Digest] Error fetching digest:', err.message);
    res.status(500).json({ error: 'Failed to fetch daily digest' });
  }
});

export default router;
