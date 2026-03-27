import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

let anthropic;
try {
  anthropic = new Anthropic();
} catch (e) {
  anthropic = null;
}

// GET / — Return current user's watchlist
router.get('/', requireAuth, (req, res) => {
  try {
    const uid = req.user.id;

    const tickers = db.prepare(`
      SELECT t.* FROM user_watchlist_tickers uwt
      JOIN tickers t ON t.symbol = uwt.ticker_symbol
      WHERE uwt.user_id = ?
      ORDER BY t.symbol
    `).all(uid);

    const sectors = db.prepare(`
      SELECT sg.* FROM user_watchlist_sectors uws
      JOIN sector_groups sg ON sg.id = uws.sector_id
      WHERE uws.user_id = ?
      ORDER BY sg.name
    `).all(uid);

    const topics = db.prepare(`
      SELECT mt.* FROM user_watchlist_topics uwt
      JOIN macro_topics mt ON mt.id = uwt.topic_id
      WHERE uwt.user_id = ?
      ORDER BY mt.name
    `).all(uid);

    const xAccounts = db.prepare(`
      SELECT xa.* FROM user_watchlist_x_accounts uwx
      JOIN x_accounts xa ON xa.id = uwx.x_account_id
      WHERE uwx.user_id = ?
      ORDER BY xa.category, xa.handle
    `).all(uid);

    res.json({ tickers, sectors, topics, xAccounts });
  } catch (err) {
    console.error('Error fetching watchlist:', err);
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

// POST /tickers — Add ticker to user's watchlist (and global catalog if new)
router.post('/tickers', requireAuth, async (req, res) => {
  try {
    let { symbol, name, description, sector, market_cap_category, themes } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const upperSymbol = symbol.toUpperCase();
    const uid = req.user.id;

    // Check if already in user's watchlist
    const alreadyWatched = db.prepare(
      'SELECT 1 FROM user_watchlist_tickers WHERE user_id = ? AND ticker_symbol = ?'
    ).get(uid, upperSymbol);
    if (alreadyWatched) {
      return res.status(409).json({ error: 'Ticker already in your watchlist' });
    }

    // Ensure ticker exists in global catalog; add it if not
    let ticker = db.prepare('SELECT * FROM tickers WHERE symbol = ?').get(upperSymbol);

    if (!ticker) {
      // Auto-fetch company profile from Finnhub if name not provided
      if (!name && FINNHUB_API_KEY) {
        try {
          const profileRes = await fetch(
            `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(upperSymbol)}&token=${FINNHUB_API_KEY}`
          );
          if (profileRes.ok) {
            const profile = await profileRes.json();
            if (profile.name) name = profile.name;
            if (!sector && profile.finnhubIndustry) sector = profile.finnhubIndustry;
            if (!market_cap_category && profile.marketCapitalization) {
              const mcap = profile.marketCapitalization;
              if (mcap >= 200000) market_cap_category = 'Mega Cap';
              else if (mcap >= 10000) market_cap_category = 'Large Cap';
              else if (mcap >= 2000) market_cap_category = 'Mid Cap';
              else market_cap_category = 'Small Cap';
            }
          }
        } catch (e) {
          console.error('Failed to fetch Finnhub profile:', e.message);
        }
      }

      if (!name && anthropic) {
        try {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 100,
            messages: [{ role: 'user', content: `What is the company name for the stock ticker symbol ${upperSymbol}? Reply with just the company name, nothing else.` }],
          });
          name = response.content[0]?.text?.trim() || upperSymbol;
        } catch { name = upperSymbol; }
      }

      if (!name) name = upperSymbol;

      let finalDescription = description || '';
      if (!description && anthropic) {
        try {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: `Write a 2-3 sentence description of ${name} (${upperSymbol}). Focus on what the company does, its market position, and macro relevance. Be concise and factual. No preamble.`,
            }],
          });
          finalDescription = response.content[0]?.text || '';
        } catch (aiErr) {
          console.error('Failed to generate description:', aiErr.message);
        }
      }

      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO tickers (symbol, name, description, sector, market_cap_category, themes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(upperSymbol, name, finalDescription, sector || null, market_cap_category || null, themes || null, now);

      ticker = db.prepare('SELECT * FROM tickers WHERE symbol = ?').get(upperSymbol);
    }

    // Add to user's watchlist
    db.prepare(
      'INSERT OR IGNORE INTO user_watchlist_tickers (user_id, ticker_symbol, added_at) VALUES (?, ?, ?)'
    ).run(uid, upperSymbol, new Date().toISOString());

    res.status(201).json(ticker);
  } catch (err) {
    console.error('Error adding ticker:', err);
    res.status(500).json({ error: 'Failed to add ticker' });
  }
});

// DELETE /tickers/:symbol — Remove ticker from user's watchlist only
router.delete('/tickers/:symbol', requireAuth, (req, res) => {
  try {
    const upperSymbol = req.params.symbol.toUpperCase();
    const result = db.prepare(
      'DELETE FROM user_watchlist_tickers WHERE user_id = ? AND ticker_symbol = ?'
    ).run(req.user.id, upperSymbol);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Ticker not in your watchlist' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting ticker:', err);
    res.status(500).json({ error: 'Failed to remove ticker' });
  }
});

// POST /sectors — Add sector to user's watchlist
router.post('/sectors', requireAuth, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const uid = req.user.id;
    const now = new Date().toISOString();

    // Ensure sector exists in global catalog
    let sector = db.prepare('SELECT * FROM sector_groups WHERE name = ?').get(name);
    if (!sector) {
      db.prepare('INSERT INTO sector_groups (name, created_at) VALUES (?, ?)').run(name, now);
      sector = db.prepare('SELECT * FROM sector_groups WHERE name = ?').get(name);
    }

    const existing = db.prepare(
      'SELECT 1 FROM user_watchlist_sectors WHERE user_id = ? AND sector_id = ?'
    ).get(uid, sector.id);
    if (existing) return res.status(409).json({ error: 'Sector already in your watchlist' });

    db.prepare(
      'INSERT INTO user_watchlist_sectors (user_id, sector_id, added_at) VALUES (?, ?, ?)'
    ).run(uid, sector.id, now);

    res.status(201).json(sector);
  } catch (err) {
    console.error('Error adding sector:', err);
    res.status(500).json({ error: 'Failed to add sector' });
  }
});

// DELETE /sectors/:id — Remove sector from user's watchlist
router.delete('/sectors/:id', requireAuth, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM user_watchlist_sectors WHERE user_id = ? AND sector_id = ?'
    ).run(req.user.id, req.params.id);

    if (result.changes === 0) return res.status(404).json({ error: 'Sector not in your watchlist' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting sector:', err);
    res.status(500).json({ error: 'Failed to remove sector' });
  }
});

// POST /topics — Add topic to user's watchlist
router.post('/topics', requireAuth, (req, res) => {
  try {
    const { name, keywords } = req.body;
    if (!name || !keywords) return res.status(400).json({ error: 'Name and keywords are required' });

    const uid = req.user.id;
    const now = new Date().toISOString();

    let topic = db.prepare('SELECT * FROM macro_topics WHERE name = ?').get(name);
    if (!topic) {
      db.prepare('INSERT INTO macro_topics (name, keywords, created_at) VALUES (?, ?, ?)').run(name, keywords, now);
      topic = db.prepare('SELECT * FROM macro_topics WHERE name = ?').get(name);
    }

    const existing = db.prepare(
      'SELECT 1 FROM user_watchlist_topics WHERE user_id = ? AND topic_id = ?'
    ).get(uid, topic.id);
    if (existing) return res.status(409).json({ error: 'Topic already in your watchlist' });

    db.prepare(
      'INSERT INTO user_watchlist_topics (user_id, topic_id, added_at) VALUES (?, ?, ?)'
    ).run(uid, topic.id, now);

    res.status(201).json(topic);
  } catch (err) {
    console.error('Error adding topic:', err);
    res.status(500).json({ error: 'Failed to add topic' });
  }
});

// DELETE /topics/:id — Remove topic from user's watchlist
router.delete('/topics/:id', requireAuth, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM user_watchlist_topics WHERE user_id = ? AND topic_id = ?'
    ).run(req.user.id, req.params.id);

    if (result.changes === 0) return res.status(404).json({ error: 'Topic not in your watchlist' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting topic:', err);
    res.status(500).json({ error: 'Failed to remove topic' });
  }
});

// POST /x-accounts — Add X account to user's watchlist
router.post('/x-accounts', requireAuth, (req, res) => {
  try {
    const { handle, display_name, category } = req.body;
    if (!handle || !display_name || !category) {
      return res.status(400).json({ error: 'Handle, display_name, and category are required' });
    }

    const cleanHandle = handle.replace(/^@/, '');
    const uid = req.user.id;
    const now = new Date().toISOString();

    // Ensure x_account exists in global catalog
    let account = db.prepare('SELECT * FROM x_accounts WHERE handle = ?').get(cleanHandle);
    if (!account) {
      db.prepare('INSERT INTO x_accounts (handle, display_name, category, created_at) VALUES (?, ?, ?, ?)')
        .run(cleanHandle, display_name, category, now);
      db.prepare('INSERT OR IGNORE INTO chat_channels (id, name, category, account_handle, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(cleanHandle, display_name, category, cleanHandle, now);
      account = db.prepare('SELECT * FROM x_accounts WHERE handle = ?').get(cleanHandle);
    }

    const existing = db.prepare(
      'SELECT 1 FROM user_watchlist_x_accounts WHERE user_id = ? AND x_account_id = ?'
    ).get(uid, account.id);
    if (existing) return res.status(409).json({ error: 'X account already in your watchlist' });

    db.prepare(
      'INSERT INTO user_watchlist_x_accounts (user_id, x_account_id, added_at) VALUES (?, ?, ?)'
    ).run(uid, account.id, now);

    res.status(201).json(account);
  } catch (err) {
    console.error('Error adding X account:', err);
    res.status(500).json({ error: 'Failed to add X account' });
  }
});

// DELETE /x-accounts/:id — Remove X account from user's watchlist
router.delete('/x-accounts/:id', requireAuth, (req, res) => {
  try {
    const result = db.prepare(
      'DELETE FROM user_watchlist_x_accounts WHERE user_id = ? AND x_account_id = ?'
    ).run(req.user.id, req.params.id);

    if (result.changes === 0) return res.status(404).json({ error: 'X account not in your watchlist' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting X account:', err);
    res.status(500).json({ error: 'Failed to remove X account' });
  }
});

export default router;
