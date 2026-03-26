import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /:symbol - Get ticker detail with related data
router.get('/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    const ticker = db.prepare(
      'SELECT * FROM tickers WHERE symbol = ?'
    ).get(upperSymbol);

    if (!ticker) {
      return res.status(404).json({ error: 'Ticker not found' });
    }

    const articles = db.prepare(
      `SELECT * FROM articles WHERE tickers LIKE '%"' || ? || '"%' ORDER BY published_at DESC LIMIT 20`
    ).all(upperSymbol);

    const filings = db.prepare(
      'SELECT * FROM filings WHERE ticker = ? ORDER BY filed_at DESC LIMIT 20'
    ).all(upperSymbol);

    const earnings = db.prepare(
      `SELECT * FROM earnings WHERE ticker = ? AND earnings_date >= date('now') ORDER BY earnings_date ASC LIMIT 1`
    ).get(upperSymbol);

    res.json({
      ticker,
      articles,
      filings,
      earnings: earnings || null,
    });
  } catch (err) {
    console.error('Error fetching ticker:', err);
    res.status(500).json({ error: 'Failed to fetch ticker details' });
  }
});

export default router;
