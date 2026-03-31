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

// Fetch current price + daily change for a symbol from Finnhub
async function fetchQuote(symbol) {
  if (!FINNHUB_API_KEY) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
    );
    if (!res.ok) return null;
    const q = await res.json();
    // c = current price, pc = previous close, d = change, dp = change %
    return {
      current: q.c || null,
      prevClose: q.pc || null,
      change: q.d ?? null,
      changePct: q.dp ?? null,
    };
  } catch {
    return null;
  }
}

// GET / — Return current user's portfolio positions enriched with live data
router.get('/', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id;

    const positions = db.prepare(`
      SELECT upp.ticker_symbol, upp.shares, upp.cost_basis_per_share, upp.added_at,
             t.name, t.sector, t.description
      FROM user_portfolio_positions upp
      JOIN tickers t ON t.symbol = upp.ticker_symbol
      WHERE upp.user_id = ?
      ORDER BY upp.added_at ASC
    `).all(uid);

    if (positions.length === 0) {
      return res.json({ positions: [], total_value: 0 });
    }

    // Fetch live quotes for all positions in parallel
    const quotes = await Promise.all(
      positions.map(p => fetchQuote(p.ticker_symbol))
    );

    // Compute per-position values
    const enriched = positions.map((p, i) => {
      const q = quotes[i];
      const currentPrice = q?.current ?? null;
      const positionValue = currentPrice != null ? currentPrice * p.shares : null;

      let totalGainLoss = null;
      let totalGainLossPct = null;
      if (
        currentPrice != null &&
        p.cost_basis_per_share != null &&
        p.cost_basis_per_share > 0
      ) {
        const costTotal = p.cost_basis_per_share * p.shares;
        totalGainLoss = positionValue - costTotal;
        totalGainLossPct = (totalGainLoss / costTotal) * 100;
      }

      return {
        symbol: p.ticker_symbol,
        name: p.name,
        sector: p.sector,
        description: p.description,
        shares: p.shares,
        cost_basis_per_share: p.cost_basis_per_share,
        added_at: p.added_at,
        current_price: currentPrice,
        price_change: q?.change ?? null,
        price_change_pct: q?.changePct ?? null,
        position_value: positionValue,
        total_gain_loss: totalGainLoss,
        total_gain_loss_pct: totalGainLossPct,
        // allocation_pct is computed after we know total_value
      };
    });

    const total_value = enriched.reduce((sum, p) => sum + (p.position_value ?? 0), 0);

    // Attach allocation %
    const withAllocation = enriched.map(p => ({
      ...p,
      allocation_pct: total_value > 0 && p.position_value != null
        ? (p.position_value / total_value) * 100
        : null,
    }));

    res.json({ positions: withAllocation, total_value });
  } catch (err) {
    console.error('Error fetching portfolio:', err);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

// POST /positions — Add a position
router.post('/positions', requireAuth, async (req, res) => {
  try {
    let { symbol, shares, cost_basis_per_share } = req.body;

    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    if (shares == null || isNaN(Number(shares)) || Number(shares) <= 0) {
      return res.status(400).json({ error: 'shares must be a positive number' });
    }

    const upperSymbol = symbol.toUpperCase();
    const uid = req.user.id;
    const sharesNum = Number(shares);
    const costNum = cost_basis_per_share != null && !isNaN(Number(cost_basis_per_share))
      ? Number(cost_basis_per_share)
      : null;

    // Check duplicate
    const existing = db.prepare(
      'SELECT 1 FROM user_portfolio_positions WHERE user_id = ? AND ticker_symbol = ?'
    ).get(uid, upperSymbol);
    if (existing) {
      return res.status(409).json({ error: 'Position already exists — use PATCH to update shares' });
    }

    // Ensure ticker exists in global catalog
    let ticker = db.prepare('SELECT * FROM tickers WHERE symbol = ?').get(upperSymbol);
    if (!ticker) {
      let name = upperSymbol;
      let sector = null;
      let market_cap_category = null;

      if (FINNHUB_API_KEY) {
        try {
          const profileRes = await fetch(
            `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(upperSymbol)}&token=${FINNHUB_API_KEY}`
          );
          if (profileRes.ok) {
            const profile = await profileRes.json();
            if (profile.name) name = profile.name;
            if (profile.finnhubIndustry) sector = profile.finnhubIndustry;
            if (profile.marketCapitalization) {
              const mc = profile.marketCapitalization;
              if (mc >= 200000) market_cap_category = 'Mega Cap';
              else if (mc >= 10000) market_cap_category = 'Large Cap';
              else if (mc >= 2000) market_cap_category = 'Mid Cap';
              else market_cap_category = 'Small Cap';
            }
          }
        } catch {}
      }

      if (name === upperSymbol && anthropic) {
        try {
          const r = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 100,
            messages: [{ role: 'user', content: `What is the company name for stock ticker ${upperSymbol}? Reply with just the company name.` }],
          });
          name = r.content[0]?.text?.trim() || upperSymbol;
        } catch {}
      }

      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO tickers (symbol, name, description, sector, market_cap_category, themes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(upperSymbol, name, '', sector, market_cap_category, null, now);

      ticker = db.prepare('SELECT * FROM tickers WHERE symbol = ?').get(upperSymbol);
    }

    db.prepare(
      'INSERT INTO user_portfolio_positions (user_id, ticker_symbol, shares, cost_basis_per_share, added_at) VALUES (?, ?, ?, ?, ?)'
    ).run(uid, upperSymbol, sharesNum, costNum, new Date().toISOString());

    res.status(201).json({ symbol: upperSymbol, shares: sharesNum, cost_basis_per_share: costNum });
  } catch (err) {
    console.error('Error adding position:', err);
    res.status(500).json({ error: 'Failed to add position' });
  }
});

// PATCH /positions/:symbol — Update shares and/or cost basis
router.patch('/positions/:symbol', requireAuth, (req, res) => {
  try {
    const upperSymbol = req.params.symbol.toUpperCase();
    const uid = req.user.id;

    const pos = db.prepare(
      'SELECT * FROM user_portfolio_positions WHERE user_id = ? AND ticker_symbol = ?'
    ).get(uid, upperSymbol);
    if (!pos) return res.status(404).json({ error: 'Position not found' });

    const { shares, cost_basis_per_share } = req.body;
    const newShares = shares != null && !isNaN(Number(shares)) && Number(shares) > 0
      ? Number(shares)
      : pos.shares;
    const newCost = cost_basis_per_share !== undefined
      ? (cost_basis_per_share === null || cost_basis_per_share === '' ? null : Number(cost_basis_per_share))
      : pos.cost_basis_per_share;

    db.prepare(
      'UPDATE user_portfolio_positions SET shares = ?, cost_basis_per_share = ? WHERE user_id = ? AND ticker_symbol = ?'
    ).run(newShares, newCost, uid, upperSymbol);

    res.json({ symbol: upperSymbol, shares: newShares, cost_basis_per_share: newCost });
  } catch (err) {
    console.error('Error updating position:', err);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// DELETE /positions/:symbol — Remove position
router.delete('/positions/:symbol', requireAuth, (req, res) => {
  try {
    const upperSymbol = req.params.symbol.toUpperCase();
    const result = db.prepare(
      'DELETE FROM user_portfolio_positions WHERE user_id = ? AND ticker_symbol = ?'
    ).run(req.user.id, upperSymbol);

    if (result.changes === 0) return res.status(404).json({ error: 'Position not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting position:', err);
    res.status(500).json({ error: 'Failed to delete position' });
  }
});

export default router;
