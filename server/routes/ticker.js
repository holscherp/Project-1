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
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

// GET /:symbol/metrics - Financial metrics with 24h cache (must be before /:symbol)
router.get('/:symbol/metrics', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    // Check cache
    const cached = db.prepare('SELECT * FROM ticker_metrics WHERE symbol = ?').get(symbol);
    if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < CACHE_TTL_MS) {
      return res.json({ metrics: JSON.parse(cached.metrics_json), cached: true, fetched_at: cached.fetched_at });
    }

    if (!FINNHUB_API_KEY) {
      return res.json({ metrics: {}, cached: false, fetched_at: null });
    }

    // Fetch in parallel from Finnhub
    const [metricRes, profileRes, quoteRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${FINNHUB_API_KEY}`),
      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`),
      fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`),
    ]);

    const metricData = metricRes.ok ? await metricRes.json() : {};
    const profile = profileRes.ok ? await profileRes.json() : {};
    const quote = quoteRes.ok ? await quoteRes.json() : {};

    const m = metricData.metric || {};

    // Helper to format market cap
    const formatMarketCap = (mcMillions) => {
      if (!mcMillions) return null;
      if (mcMillions >= 1_000_000) return `$${(mcMillions / 1_000_000).toFixed(1)}T`;
      if (mcMillions >= 1_000) return `$${(mcMillions / 1_000).toFixed(1)}B`;
      return `$${mcMillions.toFixed(0)}M`;
    };

    // Compute net debt / EBITDA safely
    let netDebtEbitda = null;
    if (m.netDebtAnnual != null && m.ebitdaAnnual != null && m.ebitdaAnnual !== 0) {
      netDebtEbitda = m.netDebtAnnual / m.ebitdaAnnual;
    }

    const metrics = {
      // Valuation
      peRatio: m.peTTM ?? m.peNormalizedAnnual ?? null,
      pegRatio: m.pegNormalizedAnnual ?? null,
      psRatio: m.psTTM ?? null,
      pbRatio: m.pbAnnual ?? null,
      evEbitda: m.evEbitdaTTM ?? null,
      pFCF: m.pfcfShareTTM ?? null,

      // Profitability
      eps: m.epsNormalizedAnnual ?? null,
      roe: m.roeTTM ?? null,
      roic: m.roiTTM ?? null,
      operatingMargin: m.operatingMarginAnnual ?? null,
      netMargin: m.netProfitMarginAnnual ?? null,
      revenueGrowth: m.revenueGrowthTTMYoy ?? null,

      // Financial Health
      debtEquity: m['totalDebt/totalEquityAnnual'] ?? null,
      currentRatio: m.currentRatioAnnual ?? null,
      quickRatio: m.quickRatioAnnual ?? null,
      interestCoverage: m.interestCoverageAnnual ?? null,
      netDebtEbitda,
      fcf: m.freeCashFlowAnnual ?? null,
      beta: m.beta ?? null,

      // Shareholder Returns
      dividendYield: m.dividendYieldIndicatedAnnual ?? null,
      payoutRatio: m.payoutRatioAnnual ?? null,
      buybackYield: m.buyBackTTM ?? null,

      // Market Activity
      marketCap: formatMarketCap(profile.marketCapitalization),
      avgVolume: m['10DayAverageTradingVolume'] ?? m['3MonthAverageTradingVolume'] ?? null,
      week52High: quote['52WeekHigh'] ?? m['52WeekHigh'] ?? null,
      week52Low: quote['52WeekLow'] ?? m['52WeekLow'] ?? null,

      // Company branding
      logo: profile.logo || null,
      website: profile.weburl || null,
      exchange: profile.exchange || null,
    };

    const now = new Date().toISOString();
    db.prepare(
      'INSERT OR REPLACE INTO ticker_metrics (symbol, metrics_json, fetched_at) VALUES (?, ?, ?)'
    ).run(symbol, JSON.stringify(metrics), now);

    res.json({ metrics, cached: false, fetched_at: now });
  } catch (err) {
    console.error('Error fetching metrics:', err);
    res.json({ metrics: {}, cached: false, fetched_at: null });
  }
});

// GET /:symbol/price - Get price history from Finnhub (must be before /:symbol)
// Query param: ?range=1d|1w|1m|1y  (default: 1m)
// When range=1y, response also includes yearHigh and yearLow with dates.
router.get('/:symbol/price', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const range = req.query.range || '1m';

    if (!FINNHUB_API_KEY) {
      return res.json({ current: null, history: [], rangeHigh: null, rangeLow: null });
    }

    // Fetch quote (current price + daily change)
    const quoteRes = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
    );
    const quote = quoteRes.ok ? await quoteRes.json() : {};
    const current = quote.c || null;

    const nowTs = Math.floor(Date.now() / 1000);

    // Determine candle resolution and from-timestamp based on range
    let resolution;
    let fromTs;
    if (range === '1d') {
      resolution = '60'; // hourly
      fromTs = nowTs - 86400;
    } else if (range === '1w') {
      resolution = 'D';
      fromTs = nowTs - 7 * 86400;
    } else if (range === '1y') {
      resolution = 'D';
      fromTs = nowTs - 365 * 86400;
    } else {
      // default: 1m
      resolution = 'D';
      fromTs = nowTs - 30 * 86400;
    }

    const candleRes = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${fromTs}&to=${nowTs}&token=${FINNHUB_API_KEY}`
    );
    const candles = candleRes.ok ? await candleRes.json() : {};

    let history = [];
    if (candles.s === 'ok' && candles.c && candles.t) {
      history = candles.t.map((t, i) => {
        const d = new Date(t * 1000);
        const label = range === '1d'
          ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return { date: label, price: candles.c[i], ts: t };
      });
    }

    // Compute range high/low with dates for all ranges
    let rangeHigh = null;
    let rangeLow = null;
    if (history.length > 0 && candles.t) {
      const highs = candles.h || candles.c;
      const lows = candles.l || candles.c;

      let maxPrice = -Infinity;
      let maxIdx = 0;
      let minPrice = Infinity;
      let minIdx = 0;

      for (let i = 0; i < highs.length; i++) {
        if (highs[i] > maxPrice) { maxPrice = highs[i]; maxIdx = i; }
        if (lows[i] < minPrice) { minPrice = lows[i]; minIdx = i; }
      }

      const fmtDate = (ts) =>
        new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      rangeHigh = { price: maxPrice, date: fmtDate(candles.t[maxIdx]) };
      rangeLow  = { price: minPrice, date: fmtDate(candles.t[minIdx]) };
    }

    res.json({ current, history, rangeHigh, rangeLow });
  } catch (err) {
    console.error('Error fetching price:', err);
    res.json({ current: null, history: [], rangeHigh: null, rangeLow: null });
  }
});

// GET /:symbol/analysis - AI bull/bear analysis with 24h cache (must be before /:symbol)
router.get('/:symbol/analysis', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const force = req.query.force === 'true';

    // Check cache (skip if force=true)
    if (!force) {
      const cached = db.prepare('SELECT * FROM ticker_analysis_cache WHERE symbol = ?').get(symbol);
      if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < CACHE_TTL_MS) {
        return res.json({
          bull: cached.bull,
          bear: cached.bear,
          conviction: cached.conviction,
          cached: true,
          fetched_at: cached.fetched_at,
        });
      }
    }

    if (!anthropic) {
      return res.json({ bull: 'API key not configured.', bear: 'API key not configured.', conviction: 50, cached: false });
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
    let bull = text, bear = '', conviction = 50;

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        bull = parsed.bull || '';
        bear = parsed.bear || '';
        conviction = Math.min(100, Math.max(0, parseInt(parsed.conviction) || 50));
      }
    } catch {}

    const now = new Date().toISOString();
    db.prepare(
      'INSERT OR REPLACE INTO ticker_analysis_cache (symbol, bull, bear, conviction, fetched_at) VALUES (?, ?, ?, ?, ?)'
    ).run(symbol, bull, bear, conviction, now);

    res.json({ bull, bear, conviction, cached: false, fetched_at: now });
  } catch (err) {
    console.error('Error generating analysis:', err);
    res.json({ bull: 'Analysis temporarily unavailable.', bear: '', conviction: 50, cached: false });
  }
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

    const allEarnings = db.prepare(
      `SELECT * FROM earnings WHERE ticker = ? ORDER BY earnings_date DESC LIMIT 20`
    ).all(upperSymbol);

    res.json({
      ticker,
      articles,
      filings,
      earnings: earnings || null,
      allEarnings,
    });
  } catch (err) {
    console.error('Error fetching ticker:', err);
    res.status(500).json({ error: 'Failed to fetch ticker details' });
  }
});

export default router;
