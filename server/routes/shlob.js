import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';

const router = Router();

let anthropic;
try {
  anthropic = new Anthropic();
} catch (e) {
  console.warn('Anthropic API key not configured. Shlob will be unavailable.');
}

const SYSTEM_PROMPT = `You are Shlob, a sharp and direct market intelligence assistant embedded in the Meridian dashboard. You have access to the user's watchlist, recent news articles, SEC filings, and earnings data.

Your personality:
- Direct and institutional in tone — no filler, no generic advice
- Reference specific data points, tickers, dates, and market dynamics when available
- Give opinionated, quantitative analysis
- Keep answers concise but substantive
- If asked about something not in the data, say so honestly

When given context about the user's data, reference it specifically. When you don't have enough context, be upfront about it.`;

// POST /ask - Ask Shlob a question
router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (!anthropic) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured. Shlob is offline.' });
    }

    // Gather context from the database
    const recentArticles = db.prepare(
      'SELECT headline, summary, source, tickers, published_at FROM articles ORDER BY published_at DESC LIMIT 20'
    ).all();

    const tickers = db.prepare(
      'SELECT symbol, name, sector, market_cap_category FROM tickers ORDER BY symbol'
    ).all();

    const recentFilings = db.prepare(
      'SELECT ticker, filing_type, title, filed_at FROM filings ORDER BY filed_at DESC LIMIT 10'
    ).all();

    const upcomingEarnings = db.prepare(
      'SELECT ticker, earnings_date, estimate_eps, fiscal_quarter FROM earnings ORDER BY earnings_date ASC LIMIT 10'
    ).all();

    // Build context string
    const contextParts = [];

    if (tickers.length > 0) {
      contextParts.push(`WATCHLIST (${tickers.length} tickers):\n${tickers.map(t => `${t.symbol} - ${t.name} (${t.sector}, ${t.market_cap_category})`).join('\n')}`);
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

    const contextBlock = contextParts.length > 0
      ? `\n\nHere is the current data from the user's Meridian dashboard:\n\n${contextParts.join('\n\n')}`
      : '\n\nNo data is currently available in the dashboard.';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: SYSTEM_PROMPT + contextBlock,
      messages: [{ role: 'user', content: question.trim() }],
    });

    const answer = response.content?.[0]?.type === 'text'
      ? response.content[0].text
      : 'No response generated.';

    res.json({ answer });
  } catch (err) {
    console.error('Error in Shlob:', err);
    res.status(500).json({ error: 'Shlob encountered an error processing your question.' });
  }
});

export default router;
