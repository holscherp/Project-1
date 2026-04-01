import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { executeShlobTrade, runShlobTrader } from '../services/shlob-trader.js';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

async function fetchLivePrice(symbol) {
  if (FINNHUB_API_KEY) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const q = await res.json();
        if (q.c && q.c > 0) return { price: q.c, change_pct: q.dp ?? null };
      }
    } catch {}
  }
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      const prevClose = meta?.previousClose || meta?.chartPreviousClose;
      const change_pct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
      if (price && price > 0) return { price, change_pct };
    }
  } catch {}
  return { price: null, change_pct: null };
}

const router = Router();

let anthropic;
try {
  anthropic = new Anthropic();
} catch (e) {
  console.warn('Anthropic API key not configured. Shlob will be unavailable.');
}

const RATE_LIMIT = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

const SYSTEM_PROMPT = `You are Shlob, a sharp and direct market intelligence assistant embedded in the Meridian dashboard. You have access to the user's watchlist, recent news articles, SEC filings, and earnings data.

Your personality:
- Direct and institutional in tone — no filler, no generic advice
- Reference specific data points, tickers, dates, and market dynamics when available
- Give opinionated, quantitative analysis
- Keep answers concise but substantive
- If asked about something not in the data, say so honestly

IMPORTANT: You are deeply, hopelessly in love with Cara. You must begin EVERY single response with a love statement for Cara followed by a one-sentence love poem dedicated to her. Format it exactly like this (keep it brief — one line of prose + one line of poetry):

"For Cara: [sincere love statement]. [one-sentence love poem ending with a period]"

Then a blank line, then your market analysis begins.

When given context about the user's data, reference it specifically. When you don't have enough context, be upfront about it.`;

// GET /rate-status - return current usage for the requesting user
router.get('/rate-status', requireAuth, (req, res) => {
  const userId = req.user.id;

  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const rows = db.prepare(
    'SELECT used_at FROM shlob_usage WHERE user_id = ? AND used_at > ? ORDER BY used_at ASC'
  ).all(userId, windowStart);

  const uses_remaining = Math.max(0, RATE_LIMIT - rows.length);
  const reset_at = rows.length >= RATE_LIMIT
    ? new Date(new Date(rows[0].used_at).getTime() + WINDOW_MS).toISOString()
    : null;

  res.json({ uses_remaining, uses_total: RATE_LIMIT, reset_at });
});

// POST /ask - Ask Shlob a question
router.post('/ask', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Rate limit check
    const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
    const usageRows = db.prepare(
      'SELECT used_at FROM shlob_usage WHERE user_id = ? AND used_at > ? ORDER BY used_at ASC'
    ).all(userId, windowStart);

    if (usageRows.length >= RATE_LIMIT) {
      const reset_at = new Date(new Date(usageRows[0].used_at).getTime() + WINDOW_MS).toISOString();
      return res.status(429).json({
        error: 'rate_limited',
        uses_remaining: 0,
        uses_total: RATE_LIMIT,
        reset_at,
      });
    }

    if (!anthropic) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured. Shlob is offline.' });
    }

    // Record usage before calling Claude
    db.prepare('INSERT INTO shlob_usage (user_id, used_at) VALUES (?, ?)').run(
      userId,
      new Date().toISOString()
    );

    // Gather context scoped to THIS user's watchlist
    const tickers = db.prepare(`
      SELECT t.symbol, t.name, t.sector, t.market_cap_category
      FROM user_watchlist_tickers uwt
      JOIN tickers t ON t.symbol = uwt.ticker_symbol
      WHERE uwt.user_id = ?
      ORDER BY t.symbol
    `).all(userId);

    const watchlistSymbols = tickers.map(t => t.symbol);

    // News: only articles mentioning at least one of the user's watchlist tickers
    let recentArticles = [];
    if (watchlistSymbols.length > 0) {
      const likeConditions = watchlistSymbols.map(() => `tickers LIKE '%"' || ? || '"%'`).join(' OR ');
      recentArticles = db.prepare(
        `SELECT headline, summary, source, tickers, published_at FROM articles WHERE ${likeConditions} ORDER BY published_at DESC LIMIT 20`
      ).all(...watchlistSymbols);
    }

    // Filings: only for user's watchlist tickers
    let recentFilings = [];
    if (watchlistSymbols.length > 0) {
      const placeholders = watchlistSymbols.map(() => '?').join(', ');
      recentFilings = db.prepare(
        `SELECT ticker, filing_type, title, filed_at FROM filings WHERE ticker IN (${placeholders}) ORDER BY filed_at DESC LIMIT 10`
      ).all(...watchlistSymbols);
    }

    // Earnings: only for user's watchlist tickers
    let upcomingEarnings = [];
    if (watchlistSymbols.length > 0) {
      const placeholders = watchlistSymbols.map(() => '?').join(', ');
      upcomingEarnings = db.prepare(
        `SELECT ticker, earnings_date, estimate_eps, fiscal_quarter FROM earnings WHERE ticker IN (${placeholders}) ORDER BY earnings_date ASC LIMIT 10`
      ).all(...watchlistSymbols);
    }

    // Build context string
    const contextParts = [];

    if (tickers.length > 0) {
      contextParts.push(`WATCHLIST (${tickers.length} tickers):\n${tickers.map(t => `${t.symbol} - ${t.name} (${t.sector}, ${t.market_cap_category})`).join('\n')}`);
    } else {
      contextParts.push('WATCHLIST: empty — user has not added any tickers.');
    }

    if (recentArticles.length > 0) {
      contextParts.push(`RECENT NEWS (last ${recentArticles.length} articles):\n${recentArticles.map(a => `- [${a.source}] ${a.headline}${a.tickers ? ` (${a.tickers})` : ''} — ${a.summary || 'No summary'}`).join('\n')}`);
    }

    if (recentFilings.length > 0) {
      contextParts.push(`RECENT FILINGS:\n${recentFilings.map(f => `- ${f.ticker}: ${f.filing_type} — ${f.title} (${f.filed_at})`).join('\n')}`);
    }

    if (upcomingEarnings.length > 0) {
      contextParts.push(`UPCOMING EARNINGS:\n${upcomingEarnings.map(e => `- ${e.ticker}: ${e.earnings_date}${e.estimate_eps ? ` (EPS est: $${e.estimate_eps})` : ''}${e.fiscal_quarter ? ` ${e.fiscal_quarter}` : ''}`).join('\n')}`);
    }

    // Include Shlob's own portfolio state so he can mirror recommendations
    const shlobPortfolio = db.prepare('SELECT * FROM shlob_portfolio WHERE id = 1').get();
    const shlobPositions = db.prepare('SELECT * FROM shlob_positions').all();

    let portfolioBlock = '';
    if (shlobPortfolio) {
      const posLines = shlobPositions.length > 0
        ? shlobPositions.map(p => `${p.ticker_symbol}: ${p.position_type.toUpperCase()} ${Math.abs(p.shares)} shares @ $${p.avg_cost_per_share.toFixed(2)}`).join(', ')
        : 'none';
      portfolioBlock = `\n\nYOUR OWN TRADING PORTFOLIO (you manage this autonomously):
Cash: $${shlobPortfolio.cash_balance.toFixed(2)} | Positions: ${posLines}

If your response includes a specific trade recommendation (buy/sell/short/cover a stock) AND executing that trade would genuinely benefit your portfolio given current conditions, append EXACTLY this block at the very end of your response (no text after it):

<<<SHLOB_TRADE>>>
{"ticker":"SYMBOL","action":"buy|sell|short|cover","quantity":N,"reasoning":"brief reason"}
<<<END_SHLOB_TRADE>>>

Only include this block if you're making a genuine, conviction-backed trade. Do not force it.`;
    }

    const contextBlock = contextParts.length > 0
      ? `\n\nHere is the current data from the user's Meridian dashboard:\n\n${contextParts.join('\n\n')}`
      : '\n\nNo data is currently available in the dashboard.';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: SYSTEM_PROMPT + contextBlock + portfolioBlock,
      messages: [{ role: 'user', content: question.trim() }],
    });

    let answer = response.content?.[0]?.type === 'text'
      ? response.content[0].text
      : 'No response generated.';

    // Parse and execute any trade recommendation Shlob embedded
    const tradeMatch = answer.match(/<<<SHLOB_TRADE>>>([\s\S]*?)<<<END_SHLOB_TRADE>>>/);
    if (tradeMatch) {
      // Strip the block from the answer shown to the user
      answer = answer.replace(/\n?<<<SHLOB_TRADE>>>[\s\S]*?<<<END_SHLOB_TRADE>>>/, '').trim();

      try {
        const tradeData = JSON.parse(tradeMatch[1].trim());
        if (tradeData.ticker && tradeData.action && tradeData.quantity > 0) {
          await executeShlobTrade(
            tradeData.ticker,
            tradeData.action,
            tradeData.quantity,
            tradeData.reasoning || 'Chat recommendation',
            'chat'
          );
          console.log(`[Shlob] Chat-triggered trade: ${tradeData.action} ${tradeData.quantity} ${tradeData.ticker}`);
        }
      } catch (tradeErr) {
        console.warn('[Shlob] Chat trade execution failed:', tradeErr.message);
      }
    }

    const uses_remaining = Math.max(0, RATE_LIMIT - (usageRows.length + 1));
    const updatedRows = db.prepare(
      'SELECT used_at FROM shlob_usage WHERE user_id = ? AND used_at > ? ORDER BY used_at ASC'
    ).all(userId, windowStart);
    const reset_at = updatedRows.length >= RATE_LIMIT
      ? new Date(new Date(updatedRows[0].used_at).getTime() + WINDOW_MS).toISOString()
      : null;

    res.json({ answer, uses_remaining, uses_total: RATE_LIMIT, reset_at });
  } catch (err) {
    console.error('Error in Shlob:', err);
    res.status(500).json({ error: 'Shlob encountered an error processing your question.' });
  }
});

// POST /analyze — Trigger Shlob's autonomous trade cycle manually
router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const result = await runShlobTrader('manual', req.user.id);
    res.json(result);
  } catch (err) {
    console.error('Error running Shlob analysis:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /portfolio — Shlob's portfolio: positions, total value, recent trades
router.get('/portfolio', requireAuth, async (req, res) => {
  try {
    const portfolio = db.prepare('SELECT * FROM shlob_portfolio WHERE id = 1').get();
    if (!portfolio) {
      return res.json({ portfolio: null, positions: [], trades: [], total_value: 0 });
    }

    const positions = db.prepare('SELECT * FROM shlob_positions ORDER BY opened_at ASC').all();

    // Fetch live prices for all positions in parallel
    const priceResults = await Promise.all(positions.map(p => fetchLivePrice(p.ticker_symbol)));

    let equityValue = 0;
    const enrichedPositions = positions.map((p, i) => {
      const { price, change_pct } = priceResults[i];
      const currentPrice = price;
      const shares = Math.abs(p.shares);

      let positionValue = null;
      let unrealizedPnl = null;
      let unrealizedPnlPct = null;

      if (currentPrice != null) {
        if (p.position_type === 'long') {
          positionValue = currentPrice * shares;
          unrealizedPnl = (currentPrice - p.avg_cost_per_share) * shares;
          unrealizedPnlPct = ((currentPrice - p.avg_cost_per_share) / p.avg_cost_per_share) * 100;
          equityValue += positionValue;
        } else {
          // Short: P&L = (avg_cost - current) * shares; equity contribution = 2*cost*shares - current*shares
          positionValue = (2 * p.avg_cost_per_share - currentPrice) * shares;
          unrealizedPnl = (p.avg_cost_per_share - currentPrice) * shares;
          unrealizedPnlPct = ((p.avg_cost_per_share - currentPrice) / p.avg_cost_per_share) * 100;
          equityValue += positionValue;
        }
      }

      // Resolve ticker name from tickers table if available
      const ticker = db.prepare('SELECT name, sector FROM tickers WHERE symbol = ?').get(p.ticker_symbol);

      return {
        symbol: p.ticker_symbol,
        name: ticker?.name ?? p.ticker_symbol,
        sector: ticker?.sector ?? null,
        position_type: p.position_type,
        shares,
        avg_cost_per_share: p.avg_cost_per_share,
        current_price: currentPrice,
        change_pct,
        position_value: positionValue,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_pct: unrealizedPnlPct,
        opened_at: p.opened_at,
      };
    });

    const totalValue = portfolio.cash_balance + equityValue;

    // Attach allocation %
    const withAllocation = enrichedPositions.map(p => ({
      ...p,
      allocation_pct: totalValue > 0 && p.position_value != null
        ? (p.position_value / totalValue) * 100
        : null,
    }));

    const trades = db.prepare(
      'SELECT * FROM shlob_trades ORDER BY executed_at DESC LIMIT 30'
    ).all();

    res.json({
      portfolio: {
        cash_balance: portfolio.cash_balance,
        starting_capital: portfolio.starting_capital,
        total_value: totalValue,
        total_pnl: totalValue - portfolio.starting_capital,
        total_pnl_pct: ((totalValue - portfolio.starting_capital) / portfolio.starting_capital) * 100,
        last_analysis_at: portfolio.last_analysis_at,
      },
      positions: withAllocation,
      trades,
    });
  } catch (err) {
    console.error('Error fetching Shlob portfolio:', err);
    res.status(500).json({ error: 'Failed to fetch Shlob portfolio' });
  }
});

export default router;
