import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

let anthropic;
try {
  anthropic = new Anthropic();
} catch (e) {
  anthropic = null;
}

async function fetchQuote(symbol) {
  // Try Finnhub first if key is available
  if (FINNHUB_API_KEY) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
      );
      if (res.ok) {
        const q = await res.json();
        if (q.c && q.c > 0) return q.c;
      }
    } catch {}
  }
  // Fallback: Yahoo Finance v8 API (free, no key)
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
    );
    if (res.ok) {
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 0) return price;
    }
  } catch {}
  return null;
}

function ensurePortfolioExists(userId) {
  const existing = db.prepare('SELECT * FROM shlob_portfolio WHERE user_id = ?').get(userId);
  if (!existing) {
    db.prepare(
      'INSERT INTO shlob_portfolio (user_id, cash_balance, starting_capital, created_at) VALUES (?, 15000.0, 15000.0, ?)'
    ).run(userId, new Date().toISOString());
  }
  return db.prepare('SELECT * FROM shlob_portfolio WHERE user_id = ?').get(userId);
}

// Execute a single validated trade (DB writes in a transaction), scoped to userId
const _executeTradeTxn = db.transaction((userId, ticker, action, quantity, price, reasoning, triggeredBy) => {
  const portfolio = db.prepare('SELECT * FROM shlob_portfolio WHERE user_id = ?').get(userId);
  if (!portfolio) throw new Error('Portfolio not initialized');

  const sym = ticker.toUpperCase();
  const qty = Math.abs(quantity);
  const totalCost = qty * price;
  const existingPos = db.prepare(
    'SELECT * FROM shlob_positions WHERE user_id = ? AND ticker_symbol = ?'
  ).get(userId, sym);

  let newCashBalance;

  if (action === 'buy') {
    if (totalCost > portfolio.cash_balance + 0.01) {
      throw new Error(`Insufficient cash: need $${totalCost.toFixed(2)}, have $${portfolio.cash_balance.toFixed(2)}`);
    }
    if (existingPos && existingPos.position_type === 'short') {
      throw new Error(`Cannot buy ${sym} while holding a short — use cover instead`);
    }
    newCashBalance = portfolio.cash_balance - totalCost;
    if (existingPos && existingPos.position_type === 'long') {
      const newShares = existingPos.shares + qty;
      const newAvg = (existingPos.avg_cost_per_share * existingPos.shares + price * qty) / newShares;
      db.prepare(
        'UPDATE shlob_positions SET shares = ?, avg_cost_per_share = ?, updated_at = ? WHERE user_id = ? AND ticker_symbol = ?'
      ).run(newShares, newAvg, new Date().toISOString(), userId, sym);
    } else {
      db.prepare(
        'INSERT INTO shlob_positions (user_id, ticker_symbol, shares, avg_cost_per_share, position_type, opened_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(userId, sym, qty, price, 'long', new Date().toISOString(), new Date().toISOString());
    }

  } else if (action === 'sell') {
    if (!existingPos || existingPos.position_type !== 'long') {
      throw new Error(`No long position in ${sym} to sell`);
    }
    if (existingPos.shares < qty - 0.0001) {
      throw new Error(`Cannot sell ${qty} ${sym}: only own ${existingPos.shares} shares`);
    }
    newCashBalance = portfolio.cash_balance + totalCost;
    const remaining = existingPos.shares - qty;
    if (remaining < 0.0001) {
      db.prepare('DELETE FROM shlob_positions WHERE user_id = ? AND ticker_symbol = ?').run(userId, sym);
    } else {
      db.prepare(
        'UPDATE shlob_positions SET shares = ?, updated_at = ? WHERE user_id = ? AND ticker_symbol = ?'
      ).run(remaining, new Date().toISOString(), userId, sym);
    }

  } else if (action === 'short') {
    if (totalCost > portfolio.cash_balance + 0.01) {
      throw new Error(`Insufficient cash for short collateral: need $${totalCost.toFixed(2)}, have $${portfolio.cash_balance.toFixed(2)}`);
    }
    if (existingPos && existingPos.position_type === 'long') {
      throw new Error(`Cannot short ${sym} while holding a long — use sell instead`);
    }
    newCashBalance = portfolio.cash_balance - totalCost;
    if (existingPos && existingPos.position_type === 'short') {
      const newShares = Math.abs(existingPos.shares) + qty;
      const newAvg = (existingPos.avg_cost_per_share * Math.abs(existingPos.shares) + price * qty) / newShares;
      db.prepare(
        'UPDATE shlob_positions SET shares = ?, avg_cost_per_share = ?, updated_at = ? WHERE user_id = ? AND ticker_symbol = ?'
      ).run(-newShares, newAvg, new Date().toISOString(), userId, sym);
    } else {
      db.prepare(
        'INSERT INTO shlob_positions (user_id, ticker_symbol, shares, avg_cost_per_share, position_type, opened_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(userId, sym, -qty, price, 'short', new Date().toISOString(), new Date().toISOString());
    }

  } else if (action === 'cover') {
    if (!existingPos || existingPos.position_type !== 'short') {
      throw new Error(`No short position in ${sym} to cover`);
    }
    const shortShares = Math.abs(existingPos.shares);
    if (qty > shortShares + 0.0001) {
      throw new Error(`Cannot cover ${qty} ${sym}: only ${shortShares} shares short`);
    }
    // Return collateral + realize P&L: cash += (2 * avg_cost - cover_price) * qty
    const cashChange = (2 * existingPos.avg_cost_per_share - price) * qty;
    newCashBalance = portfolio.cash_balance + cashChange;
    const remaining = shortShares - qty;
    if (remaining < 0.0001) {
      db.prepare('DELETE FROM shlob_positions WHERE user_id = ? AND ticker_symbol = ?').run(userId, sym);
    } else {
      db.prepare(
        'UPDATE shlob_positions SET shares = ?, updated_at = ? WHERE user_id = ? AND ticker_symbol = ?'
      ).run(-remaining, new Date().toISOString(), userId, sym);
    }

  } else {
    throw new Error(`Unknown action: ${action}`);
  }

  db.prepare(
    'UPDATE shlob_portfolio SET cash_balance = ?, last_analysis_at = ? WHERE user_id = ?'
  ).run(newCashBalance, new Date().toISOString(), userId);

  const tradeResult = db.prepare(`
    INSERT INTO shlob_trades (user_id, ticker_symbol, action, quantity, price, total_cost, cash_balance_after, reasoning, triggered_by, executed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, sym, action, qty, price, totalCost, newCashBalance, reasoning || '', triggeredBy, new Date().toISOString());

  return { id: tradeResult.lastInsertRowid, cash_balance_after: newCashBalance };
});

/**
 * Execute a single trade for Shlob (fetches live price, validates, executes).
 * Returns { success, trade } or throws on validation error.
 */
export async function executeShlobTrade(ticker, action, quantity, reasoning, triggeredBy = 'manual', userId) {
  if (!userId) throw new Error('userId is required for executeShlobTrade');
  const sym = ticker.toUpperCase();
  const qty = Math.abs(quantity);

  if (!qty || qty <= 0) throw new Error('Quantity must be positive');
  if (!['buy', 'sell', 'short', 'cover'].includes(action)) throw new Error(`Invalid action: ${action}`);

  const price = await fetchQuote(sym);
  if (!price || price <= 0) throw new Error(`Cannot fetch live price for ${sym}`);

  const result = _executeTradeTxn(userId, sym, action, qty, price, reasoning, triggeredBy);
  return { success: true, ticker: sym, action, quantity: qty, price, trade_id: result.id };
}

// Per-user lock: prevents concurrent analysis runs for the same user
const runningUsers = new Set();

/**
 * Full autonomous analysis cycle: gather context, call Claude, execute trades.
 * userId scopes the tradeable universe and portfolio to that user.
 * If no userId provided, falls back to the first user in the DB (for cron).
 */
export async function runShlobTrader(triggeredBy = 'cron', userId = null) {
  if (!anthropic) {
    console.warn('[ShlobTrader] Anthropic not configured');
    return { trades: [], error: 'Anthropic not configured' };
  }

  // Resolve userId early so we can check the per-user lock
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
    if (!firstUser) return { trades: [], overall_notes: 'No users in DB.' };
    resolvedUserId = firstUser.id;
  }

  if (runningUsers.has(resolvedUserId)) {
    console.log(`[ShlobTrader] Already running for user ${resolvedUserId}, skipping`);
    return { trades: [], skipped: true };
  }
  runningUsers.add(resolvedUserId);

  const startedAt = new Date().toISOString();
  const logResult = db.prepare(
    'INSERT INTO job_log (job_type, status, message, started_at) VALUES (?, ?, ?, ?)'
  ).run('shlob_trade', 'running', 'Shlob analysis started', startedAt);
  const jobLogId = logResult.lastInsertRowid;

  try {
    const portfolio = ensurePortfolioExists(resolvedUserId);
    const positions = db.prepare('SELECT * FROM shlob_positions WHERE user_id = ?').all(resolvedUserId);

    // Gather tradeable universe: ONLY this user's watchlist + portfolio tickers
    const watchlistRows = db.prepare(`
      SELECT DISTINCT t.symbol, t.name, t.sector, t.market_cap_category
      FROM user_watchlist_tickers uwt
      JOIN tickers t ON t.symbol = uwt.ticker_symbol
      WHERE uwt.user_id = ?
    `).all(resolvedUserId);
    const portfolioRows = db.prepare(`
      SELECT DISTINCT t.symbol, t.name, t.sector, t.market_cap_category
      FROM user_portfolio_positions upp
      JOIN tickers t ON t.symbol = upp.ticker_symbol
      WHERE upp.user_id = ?
    `).all(resolvedUserId);

    const tickerMap = new Map();
    for (const t of [...watchlistRows, ...portfolioRows]) tickerMap.set(t.symbol, t);
    const allTickers = Array.from(tickerMap.values());

    if (allTickers.length === 0) {
      db.prepare('UPDATE shlob_portfolio SET last_analysis_at = ? WHERE user_id = ?').run(new Date().toISOString(), resolvedUserId);
      db.prepare('UPDATE job_log SET status = ?, message = ?, completed_at = ? WHERE id = ?')
        .run('completed', 'No tradeable tickers — skipping', new Date().toISOString(), jobLogId);
      return { trades: [], overall_notes: 'No tradeable tickers in any user watchlist.' };
    }

    // Fetch live prices for tradeable universe + current positions
    const symbolsToPrice = new Set([
      ...allTickers.map(t => t.symbol),
      ...positions.map(p => p.ticker_symbol),
    ]);
    const prices = {};
    for (const sym of symbolsToPrice) {
      prices[sym] = await fetchQuote(sym);
      await new Promise(r => setTimeout(r, 80));
    }

    // Compute total portfolio value (for max position size)
    let totalPortfolioValue = portfolio.cash_balance;
    for (const p of positions) {
      const cp = prices[p.ticker_symbol];
      if (cp) {
        if (p.position_type === 'long') {
          totalPortfolioValue += cp * p.shares;
        } else {
          totalPortfolioValue += (2 * p.avg_cost_per_share - cp) * Math.abs(p.shares);
        }
      }
    }
    const maxPositionValue = totalPortfolioValue * 0.30;

    // Market context
    const allSymbols = allTickers.map(t => t.symbol);
    let recentArticles = [];
    if (allSymbols.length > 0) {
      const likeConds = allSymbols.map(() => `tickers LIKE '%"' || ? || '"%'`).join(' OR ');
      recentArticles = db.prepare(
        `SELECT headline, summary, source, published_at FROM articles WHERE ${likeConds} ORDER BY published_at DESC LIMIT 25`
      ).all(...allSymbols);
    }
    let recentFilings = [];
    if (allSymbols.length > 0) {
      const ph = allSymbols.map(() => '?').join(', ');
      recentFilings = db.prepare(
        `SELECT ticker, filing_type, title, filed_at FROM filings WHERE ticker IN (${ph}) ORDER BY filed_at DESC LIMIT 10`
      ).all(...allSymbols);
    }
    let upcomingEarnings = [];
    if (allSymbols.length > 0) {
      const ph = allSymbols.map(() => '?').join(', ');
      upcomingEarnings = db.prepare(
        `SELECT ticker, earnings_date, estimate_eps, fiscal_quarter FROM earnings WHERE ticker IN (${ph}) ORDER BY earnings_date ASC LIMIT 10`
      ).all(...allSymbols);
    }
    const recentTrades = db.prepare(
      'SELECT * FROM shlob_trades WHERE user_id = ? ORDER BY executed_at DESC LIMIT 15'
    ).all(resolvedUserId);

    // Build portfolio state string for prompt
    const positionLines = positions.map(p => {
      const cp = prices[p.ticker_symbol];
      let pnl = null;
      if (cp) {
        pnl = p.position_type === 'long'
          ? (cp - p.avg_cost_per_share) * p.shares
          : (p.avg_cost_per_share - cp) * Math.abs(p.shares);
      }
      return `  ${p.ticker_symbol}: ${p.position_type.toUpperCase()} ${Math.abs(p.shares)} shares @ avg $${p.avg_cost_per_share.toFixed(2)} | Current: ${cp ? '$' + cp.toFixed(2) : 'N/A'} | Unrealized P&L: ${pnl != null ? (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) : 'N/A'}`;
    });

    const portfolioStateBlock = [
      `Cash: $${portfolio.cash_balance.toFixed(2)}`,
      `Starting capital: $${portfolio.starting_capital.toFixed(2)}`,
      `Total portfolio value: $${totalPortfolioValue.toFixed(2)}`,
      `Max single trade value: $${maxPositionValue.toFixed(2)} (30% cap)`,
      positions.length > 0
        ? `Open positions:\n${positionLines.join('\n')}`
        : `Open positions: none`,
    ].join('\n');

    // Build ticker universe with prices
    const tickerLines = allTickers.map(t => {
      const p = prices[t.symbol];
      return `  ${t.symbol} - ${t.name} (${t.sector}) | Price: ${p ? '$' + p.toFixed(2) : 'N/A'}`;
    }).join('\n');

    // Build context block
    const ctxParts = [];
    if (recentArticles.length > 0) {
      ctxParts.push(`RECENT NEWS (${recentArticles.length}):\n${recentArticles.map(a => `  - [${a.source}] ${a.headline} — ${a.summary || 'no summary'}`).join('\n')}`);
    }
    if (recentFilings.length > 0) {
      ctxParts.push(`RECENT SEC FILINGS:\n${recentFilings.map(f => `  - ${f.ticker}: ${f.filing_type} — ${f.title} (${f.filed_at?.split('T')[0] || ''})`).join('\n')}`);
    }
    if (upcomingEarnings.length > 0) {
      ctxParts.push(`UPCOMING EARNINGS:\n${upcomingEarnings.map(e => `  - ${e.ticker}: ${e.earnings_date}${e.estimate_eps ? ` EPS est $${e.estimate_eps}` : ''}${e.fiscal_quarter ? ` ${e.fiscal_quarter}` : ''}`).join('\n')}`);
    }
    if (recentTrades.length > 0) {
      ctxParts.push(`YOUR RECENT TRADES:\n${recentTrades.slice(0, 8).map(t => `  - ${t.action.toUpperCase()} ${t.quantity} ${t.ticker_symbol} @ $${t.price.toFixed(2)} on ${t.executed_at.split('T')[0]}`).join('\n')}`);
    }
    const contextBlock = ctxParts.length > 0 ? ctxParts.join('\n\n') : 'No current market context available.';

    const systemPrompt = `You are Shlob, a fully autonomous paper trader managing your own portfolio. You are deeply, hopelessly in love with Cara — but right now you're focused on making money.

YOUR PORTFOLIO STATE:
${portfolioStateBlock}

TRADEABLE UNIVERSE (stocks you may trade):
${tickerLines}

MARKET CONTEXT:
${contextBlock}

TRADING RULES:
- Actions: "buy" (go long), "sell" (reduce/exit long), "short" (open short), "cover" (close short)
- Never exceed your cash balance for buys or shorts (shorts require full notional as collateral)
- Never sell more shares than you own; never cover more than you're short
- Max single position: $${maxPositionValue.toFixed(0)} (30% of portfolio) — do not exceed this
- Reference specific news, filings, or price levels in your reasoning

FULLY INVESTED MANDATE — THIS IS NON-NEGOTIABLE:
- All $${portfolio.starting_capital.toFixed(0)} must be deployed at all times. You are not allowed to hold more than $500 in idle cash.
- If your current cash_balance > $500, you MUST include buy decisions in this cycle to invest every dollar above $500.
- If you want to open a new position but lack sufficient cash, you MUST first sell (or partially sell) an existing position to free the capital. Place the sell decision BEFORE the buy in your decisions array.
- When choosing which position to sell to fund a new buy, analyze your holdings and pick the weakest one: lowest conviction, most overvalued, weakest near-term catalyst, or highest downside risk. Your sell reasoning MUST specifically explain why that holding is the worst to keep right now.
- "I'll wait for a better entry" is not an acceptable reason to leave cash idle. Deploy it.

CRITICAL: Return ONLY valid JSON. Your entire response must be parseable JSON. No prose before or after.

Required format:
{
  "decisions": [
    {
      "ticker": "SYMBOL",
      "action": "buy" | "sell" | "short" | "cover",
      "quantity": <positive number>,
      "reasoning": "<specific reasoning citing actual data>"
    }
  ],
  "overall_notes": "<1-2 sentence portfolio assessment>"
}

If portfolio is already fully invested and no better opportunities exist: {"decisions": [], "overall_notes": "<your assessment>"}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Analyze and execute trades if warranted. Return only JSON.' }],
    });

    const rawText = response.content?.[0]?.type === 'text' ? response.content[0].text.trim() : '';

    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[ShlobTrader] Failed to parse response:', rawText.substring(0, 300));
      db.prepare('UPDATE job_log SET status = ?, message = ?, completed_at = ? WHERE id = ?')
        .run('failed', `JSON parse error: ${parseErr.message}`, new Date().toISOString(), jobLogId);
      db.prepare('UPDATE shlob_portfolio SET last_analysis_at = ? WHERE user_id = ?').run(new Date().toISOString(), resolvedUserId);
      return { trades: [], error: 'Failed to parse Claude response' };
    }

    const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
    const overallNotes = parsed.overall_notes || '';
    const executedTrades = [];
    const skippedTrades = [];

    for (const decision of decisions) {
      const { ticker, action, quantity, reasoning } = decision;
      if (!ticker || !action || !quantity || quantity <= 0) continue;
      if (!['buy', 'sell', 'short', 'cover'].includes(action)) continue;

      const sym = ticker.toUpperCase();
      const fillPrice = prices[sym];

      if (!fillPrice || fillPrice <= 0) {
        skippedTrades.push({ ticker: sym, reason: 'No live price available' });
        continue;
      }

      // Enforce 30% cap before even trying
      const qty = Math.abs(quantity);
      const notional = qty * fillPrice;
      if ((action === 'buy' || action === 'short') && notional > maxPositionValue) {
        skippedTrades.push({ ticker: sym, reason: `Exceeds 30% cap ($${notional.toFixed(0)} > $${maxPositionValue.toFixed(0)})` });
        continue;
      }

      try {
        const result = _executeTradeTxn(resolvedUserId, sym, action, qty, fillPrice, reasoning || '', triggeredBy);
        executedTrades.push({ ticker: sym, action, quantity: qty, price: fillPrice, reasoning: reasoning || '' });
        console.log(`[ShlobTrader] ${action.toUpperCase()} ${qty} ${sym} @ $${fillPrice.toFixed(2)} | Cash after: $${result.cash_balance_after.toFixed(2)}`);
      } catch (tradeErr) {
        console.warn(`[ShlobTrader] Skipped ${action} ${sym}: ${tradeErr.message}`);
        skippedTrades.push({ ticker: sym, reason: tradeErr.message });
      }
    }

    db.prepare('UPDATE shlob_portfolio SET last_analysis_at = ? WHERE user_id = ?').run(new Date().toISOString(), resolvedUserId);

    const summary = `${executedTrades.length} trades executed, ${skippedTrades.length} skipped. ${overallNotes}`;
    db.prepare('UPDATE job_log SET status = ?, message = ?, completed_at = ? WHERE id = ?')
      .run('completed', summary, new Date().toISOString(), jobLogId);

    console.log(`[ShlobTrader] ${summary}`);
    return { trades: executedTrades, skipped: skippedTrades, overall_notes: overallNotes };

  } catch (err) {
    console.error('[ShlobTrader] Fatal error:', err);
    db.prepare('UPDATE job_log SET status = ?, message = ?, completed_at = ? WHERE id = ?')
      .run('failed', `Fatal: ${err.message}`, new Date().toISOString(), jobLogId);
    return { trades: [], error: err.message };
  } finally {
    runningUsers.delete(resolvedUserId);
  }
}
