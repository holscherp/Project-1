import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET / - Return recent job logs (last 20)
router.get('/', (req, res) => {
  try {
    const jobs = db.prepare(
      'SELECT * FROM job_log ORDER BY started_at DESC LIMIT 20'
    ).all();

    res.json({ jobs });
  } catch (err) {
    console.error('Error fetching job logs:', err);
    res.status(500).json({ error: 'Failed to fetch job logs' });
  }
});

export default router;
