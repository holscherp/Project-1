import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';

const router = Router();
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

let anthropic;
try {
  anthropic = new Anthropic();
} catch (e) {
  anthropic = null;
}

// GET / - Return all watchlist items
router.get('/', (req, res) => {
  try {
    const tickers = db.prepare('SELECT * FROM tickers ORDER BY symbol').all();
    const sectors = db.prepare('SELECT * FROM sector_groups ORDER BY name').all();
    const topics = db.prepare('SELECT * FROM macro_topics ORDER BY name').all();
    const xAccounts = db.prepare('SELECT * FROM x_accounts ORDER BY category, handle').all();

    res.json({ tickers, sectors, topics, xAccounts });
  } catch (err) {
    console.error('Error fetching watchlist:', err);
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

// POST /tickers - Add a ticker (only symbol required; rest auto-fetched)
router.post('/tickers', async (req, res) => {
  try {
    let { symbol, name, description, sector, market_cap_category, themes } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const upperSymbol = symbol.toUpperCase();

    const existing = db.prepare('SELECT symbol FROM tickers WHERE symbol = ?').get(upperSymbol);
    if (existing) {
      return res.status(409).json({ error: 'Ticker already exists' });
    }

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
            const mcap = profile.marketCapitalization; // in millions
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

    // Fallback: use Claude to get company info if still missing
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

    // Auto-generate description
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
      `INSERT INTO tickers (symbol, name, description, sector, market_cap_category, themes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(upperSymbol, name, finalDescription, sector || null, market_cap_category || null, themes || null, now);

    const ticker = db.prepare('SELECT * FROM tickers WHERE symbol = ?').get(upperSymbol);
    res.status(201).json(ticker);
  } catch (err) {
    console.error('Error adding ticker:', err);
    res.status(500).json({ error: 'Failed to add ticker' });
  }
});

// DELETE /tickers/:symbol - Remove a ticker
router.delete('/tickers/:symbol', (req, res) => {
  try {
    const upperSymbol = req.params.symbol.toUpperCase();
    const result = db.prepare('DELETE FROM tickers WHERE symbol = ?').run(upperSymbol);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Ticker not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting ticker:', err);
    res.status(500).json({ error: 'Failed to delete ticker' });
  }
});

// POST /sectors - Add a sector group
router.post('/sectors', (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO sector_groups (name, created_at) VALUES (?, ?)'
    ).run(name, now);

    const sector = db.prepare('SELECT * FROM sector_groups WHERE name = ?').get(name);
    res.status(201).json(sector);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Sector already exists' });
    }
    console.error('Error adding sector:', err);
    res.status(500).json({ error: 'Failed to add sector' });
  }
});

// DELETE /sectors/:id - Remove a sector group
router.delete('/sectors/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM sector_groups WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Sector not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting sector:', err);
    res.status(500).json({ error: 'Failed to delete sector' });
  }
});

// POST /topics - Add a macro topic
router.post('/topics', (req, res) => {
  try {
    const { name, keywords } = req.body;

    if (!name || !keywords) {
      return res.status(400).json({ error: 'Name and keywords are required' });
    }

    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO macro_topics (name, keywords, created_at) VALUES (?, ?, ?)'
    ).run(name, keywords, now);

    const topic = db.prepare('SELECT * FROM macro_topics WHERE name = ?').get(name);
    res.status(201).json(topic);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Topic already exists' });
    }
    console.error('Error adding topic:', err);
    res.status(500).json({ error: 'Failed to add topic' });
  }
});

// DELETE /topics/:id - Remove a topic
router.delete('/topics/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM macro_topics WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting topic:', err);
    res.status(500).json({ error: 'Failed to delete topic' });
  }
});

// POST /x-accounts - Add X account
router.post('/x-accounts', (req, res) => {
  try {
    const { handle, display_name, category } = req.body;

    if (!handle || !display_name || !category) {
      return res.status(400).json({ error: 'Handle, display_name, and category are required' });
    }

    const cleanHandle = handle.replace(/^@/, '');
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO x_accounts (handle, display_name, category, created_at) VALUES (?, ?, ?, ?)'
    ).run(cleanHandle, display_name, category, now);

    // Create a chat channel for the account
    db.prepare(
      'INSERT INTO chat_channels (id, name, category, account_handle, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(cleanHandle, display_name, category, cleanHandle, now);

    const account = db.prepare('SELECT * FROM x_accounts WHERE handle = ?').get(cleanHandle);
    res.status(201).json(account);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'X account already exists' });
    }
    console.error('Error adding X account:', err);
    res.status(500).json({ error: 'Failed to add X account' });
  }
});

// DELETE /x-accounts/:id - Remove X account and its chat channel
router.delete('/x-accounts/:id', (req, res) => {
  try {
    const account = db.prepare('SELECT * FROM x_accounts WHERE id = ?').get(req.params.id);

    if (!account) {
      return res.status(404).json({ error: 'X account not found' });
    }

    db.prepare('DELETE FROM chat_messages WHERE channel_id = ?').run(account.handle);
    db.prepare('DELETE FROM chat_channels WHERE id = ?').run(account.handle);
    db.prepare('DELETE FROM x_accounts WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting X account:', err);
    res.status(500).json({ error: 'Failed to delete X account' });
  }
});

export default router;
