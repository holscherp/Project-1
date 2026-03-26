import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET / - Return all settings as key-value object
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /theme - Save theme preference
router.post('/theme', (req, res) => {
  try {
    const { theme } = req.body;

    if (!theme || !['dark', 'light'].includes(theme)) {
      return res.status(400).json({ error: 'Theme must be "dark" or "light"' });
    }

    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('theme', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(theme);

    res.json({ success: true, theme });
  } catch (err) {
    console.error('Error saving theme:', err);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

// POST /refresh - Trigger manual refresh
router.post('/refresh', async (req, res) => {
  try {
    const { runFetchJob } = await import('../cron.js');
    runFetchJob();
    res.json({ status: 'started' });
  } catch (err) {
    console.error('Error triggering refresh:', err);
    res.status(500).json({ error: 'Failed to trigger refresh' });
  }
});

export default router;
