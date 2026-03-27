import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/users/search?q= — search users by name or email
router.get('/search', requireAuth, (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  try {
    const pattern = `%${q.trim()}%`;
    const users = db.prepare(`
      SELECT id, name, avatar_url, email
      FROM users
      WHERE id != ? AND (name LIKE ? OR email LIKE ?)
      LIMIT 20
    `).all(req.user.id, pattern, pattern);

    // Don't expose email in response, but use it for search
    res.json(users.map(u => ({ id: u.id, name: u.name, avatar_url: u.avatar_url })));
  } catch (err) {
    console.error('Error searching users:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/users/:id — public profile + watchlist counts
router.get('/:id', requireAuth, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, avatar_url, created_at FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tickerCount = db.prepare('SELECT COUNT(*) as c FROM user_watchlist_tickers WHERE user_id = ?').get(req.params.id)?.c || 0;
    const sectorCount = db.prepare('SELECT COUNT(*) as c FROM user_watchlist_sectors WHERE user_id = ?').get(req.params.id)?.c || 0;
    const topicCount = db.prepare('SELECT COUNT(*) as c FROM user_watchlist_topics WHERE user_id = ?').get(req.params.id)?.c || 0;
    const xAccountCount = db.prepare('SELECT COUNT(*) as c FROM user_watchlist_x_accounts WHERE user_id = ?').get(req.params.id)?.c || 0;

    res.json({
      ...user,
      watchlist_counts: { tickers: tickerCount, sectors: sectorCount, topics: topicCount, x_accounts: xAccountCount },
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;
