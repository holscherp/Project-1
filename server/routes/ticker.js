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

// GET /:symbol/price - Get price history via Yahoo Finance v8 API (free, no key)
// Query param: ?range=1d|1w|1m|3m|1y|all  (default: 1m)
router.get('/:symbol/price', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const range = req.query.range || '1m';

    // Map our range keys to Yahoo Finance v8 API params
    const rangeMap = {
      '1d':  { yahooRange: '1d',  interval: '5m'  },
      '1w':  { yahooRange: '5d',  interval: '1h'  },
      '1m':  { yahooRange: '1mo', interval: '1d'  },
      '3m':  { yahooRange: '3mo', interval: '1d'  },
      '1y':  { yahooRange: '1y',  interval: '1wk' },
      'all': { yahooRange: 'max', interval: '1mo' },
    };
    const { yahooRange, interval } = rangeMap[range] || rangeMap['1m'];

    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=${interval}&range=${yahooRange}&includePrePost=false`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) throw new Error(`Yahoo Finance responded ${response.status}`);

    const data = await response.json();
    const chart = data?.chart?.result?.[0];

    if (!chart) return res.json({ current: null, history: [], rangeHigh: null, rangeLow: null });

    const timestamps = chart.timestamp || [];
    const quote = chart.indicators?.quote?.[0] || {};
    const closes = quote.close || [];
    const highs  = quote.high  || [];
    const lows   = quote.low   || [];
    const current = chart.meta?.regularMarketPrice ?? null;

    const fmtLabel = (ts) => {
      const d = new Date(ts * 1000);
      if (range === '1d') return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      if (range === 'all') return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const fmtDate = (ts) =>
      new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Build valid points, filtering nulls
    let points = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        points.push({ ts: timestamps[i], close: closes[i], high: highs[i] ?? closes[i], low: lows[i] ?? closes[i] });
      }
    }

    // For 1d, only keep the most recent trading day
    if (range === '1d' && points.length > 0) {
      const lastDay = new Date(points[points.length - 1].ts * 1000).toDateString();
      points = points.filter(p => new Date(p.ts * 1000).toDateString() === lastDay);
    }

    const history = points.map(p => ({
      date: fmtLabel(p.ts),
      price: parseFloat(p.close.toFixed(2)),
    }));

    let rangeHigh = null, rangeLow = null;
    if (points.length > 0) {
      let maxP = -Infinity, maxTs = null, minP = Infinity, minTs = null;
      for (const p of points) {
        if (p.high > maxP) { maxP = p.high; maxTs = p.ts; }
        if (p.low  < minP) { minP = p.low;  minTs = p.ts; }
      }
      rangeHigh = { price: parseFloat(maxP.toFixed(2)), date: fmtDate(maxTs) };
      rangeLow  = { price: parseFloat(minP.toFixed(2)), date: fmtDate(minTs) };
    }

    res.json({ current, history, rangeHigh, rangeLow });
  } catch (err) {
    console.error('Price fetch error:', err.message);
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
