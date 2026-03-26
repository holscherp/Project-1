import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET / - List all upcoming earnings
router.get('/', (req, res) => {
  try {
    const earnings = db.prepare(
      `SELECT * FROM earnings WHERE earnings_date >= date('now') ORDER BY earnings_date ASC`
    ).all();

    res.json({ earnings });
  } catch (err) {
    console.error('Error fetching earnings:', err);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

export default router;
