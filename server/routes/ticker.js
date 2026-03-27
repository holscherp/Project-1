import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';

const router = Router();

let anthropic;
try {
  anthropic = new Anthropic();
} catch (e) {
  anthropic = null;
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

// GET /search?q= - Autocomplete ticker search (must be before /:symbol)
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim().toUpperCase();
  if (!q) return res.json({ results: [] });

  // 1. Query local DB first (instant)
  const local = db.prepare(
    `SELECT symbol, name, sector AS type FROM tickers
     WHERE symbol LIKE ? OR name LIKE ? LIMIT 8`
  ).all(`${q}%`, `%${q}%`);

  const seen = new Set(local.map(r => r.symbol));
  const results = [...local];

  // 2. Supplement with Finnhub symbol search if needed
  if (FINNHUB_API_KEY && results.length < 8) {
    try {
      const r = await fetch(
        `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_API_KEY}`
      );
      if (r.ok) {
        const data = await r.json();
        for (const item of (data.result || [])) {
          if (!seen.has(item.symbol) && item.type === 'Common Stock') {
            results.push({ symbol: item.symbol, name: item.description, type: item.type });
            seen.add(item.symbol);
            if (results.length >= 8) break;
          }
        }
      }
    } catch {}
  }

  res.json({ results: results.slice(0, 8) });
});

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

// GET /:symbol/price - Get price history (30 days) from Finnhub
router.get('/:symbol/price', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    if (!FINNHUB_API_KEY) {
      return res.json({ current: null, history: [] });
    }

    // Fetch quote
    const quoteRes = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
    );
    const quote = quoteRes.ok ? await quoteRes.json() : {};
    const current = quote.c || null;

    // Fetch 30-day candles
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 86400;
    const candleRes = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${thirtyDaysAgo}&to=${now}&token=${FINNHUB_API_KEY}`
    );
    const candles = candleRes.ok ? await candleRes.json() : {};

    let history = [];
    if (candles.s === 'ok' && candles.c && candles.t) {
      history = candles.t.map((t, i) => ({
        date: new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: candles.c[i],
      }));
    }

    res.json({ current, history });
  } catch (err) {
    console.error('Error fetching price:', err);
    res.json({ current: null, history: [] });
  }
});

// GET /:symbol/analysis - AI bull/bear analysis with conviction score
router.get('/:symbol/analysis', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    if (!anthropic) {
      return res.json({ bull: 'API key not configured.', bear: 'API key not configured.', conviction: 50 });
    }

    const ticker = db.prepare('SELECT * FROM tickers WHERE symbol = ?').get(symbol);
    if (!ticker) {
      return res.status(404).json({ error: 'Ticker not found' });
    }

    // Get recent news for context
    const recentNews = db.prepare(
      `SELECT headline, summary FROM articles WHERE tickers LIKE '%"' || ? || '"%' ORDER BY published_at DESC LIMIT 10`
    ).all(symbol);

    const newsContext = recentNews.map(n => `- ${n.headline}: ${n.summary || ''}`).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: 'You are a senior equity research analyst. Provide concise, specific analysis. No filler. Use numbers and dates when available.',
      messages: [{
        role: 'user',
        content: `Analyze ${ticker.name} (${symbol}). Sector: ${ticker.sector}. Description: ${ticker.description}. Themes: ${ticker.themes}.

Recent news:
${newsContext || 'No recent news available.'}

Respond in exactly this JSON format (no markdown, no code blocks):
{"bull": "2-3 sentence bull case", "bear": "2-3 sentence bear case", "conviction": <number 0-100 representing how bullish the recent news sentiment is>}`
      }],
    });

    const text = response.content[0]?.text || '';
    try {
      // Try to parse as JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        res.json({
          bull: parsed.bull || '',
          bear: parsed.bear || '',
          conviction: Math.min(100, Math.max(0, parseInt(parsed.conviction) || 50)),
        });
        return;
      }
    } catch {}

    res.json({ bull: text, bear: '', conviction: 50 });
  } catch (err) {
    console.error('Error generating analysis:', err);
    res.json({ bull: 'Analysis temporarily unavailable.', bear: '', conviction: 50 });
  }
});

export default router;
