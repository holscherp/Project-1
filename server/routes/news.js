import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET / - List articles, paginated with filters
router.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (req.query.ticker) {
      conditions.push(`tickers LIKE '%"' || ? || '"%'`);
      params.push(req.query.ticker);
    }

    if (req.query.sector) {
      conditions.push(`sector = ?`);
      params.push(req.query.sector);
    }

    if (req.query.topic) {
      conditions.push(`topic = ?`);
      params.push(req.query.topic);
    }

    if (req.query.source_type) {
      conditions.push(`source_type = ?`);
      params.push(req.query.source_type);
    }

    if (req.query.search) {
      conditions.push(`(headline LIKE ? OR summary LIKE ?)`);
      const searchTerm = `%${req.query.search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (req.query.date_from) {
      conditions.push(`published_at >= ?`);
      params.push(req.query.date_from);
    }

    if (req.query.date_to) {
      conditions.push(`published_at <= ?`);
      params.push(req.query.date_to);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM articles ${whereClause}`
    ).get(...params);

    const articles = db.prepare(
      `SELECT * FROM articles ${whereClause} ORDER BY published_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    res.json({
      articles,
      total: countRow.total,
      page,
      limit,
    });
  } catch (err) {
    console.error('Error fetching articles:', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// PATCH /:id - Update article flags
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { is_read, is_bookmarked, is_flagged } = req.body;

    const fields = [];
    const params = [];

    if (is_read !== undefined) {
      fields.push('is_read = ?');
      params.push(is_read ? 1 : 0);
    }

    if (is_bookmarked !== undefined) {
      fields.push('is_bookmarked = ?');
      params.push(is_bookmarked ? 1 : 0);
    }

    if (is_flagged !== undefined) {
      fields.push('is_flagged = ?');
      params.push(is_flagged ? 1 : 0);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(id);
    const result = db.prepare(
      `UPDATE articles SET ${fields.join(', ')} WHERE id = ?`
    ).run(...params);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    res.json(article);
  } catch (err) {
    console.error('Error updating article:', err);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

export default router;
