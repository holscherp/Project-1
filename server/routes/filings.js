import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET / - List filings, filterable and paginated
router.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (req.query.ticker) {
      conditions.push('ticker = ?');
      params.push(req.query.ticker.toUpperCase());
    }

    if (req.query.filing_type) {
      conditions.push('filing_type = ?');
      params.push(req.query.filing_type);
    }

    if (req.query.date_from) {
      conditions.push('filed_at >= ?');
      params.push(req.query.date_from);
    }

    if (req.query.date_to) {
      conditions.push('filed_at <= ?');
      params.push(req.query.date_to);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM filings ${whereClause}`
    ).get(...params);

    const filings = db.prepare(
      `SELECT * FROM filings ${whereClause} ORDER BY filed_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    res.json({
      filings,
      total: countRow.total,
      page,
      limit,
    });
  } catch (err) {
    console.error('Error fetching filings:', err);
    res.status(500).json({ error: 'Failed to fetch filings' });
  }
});

export default router;
