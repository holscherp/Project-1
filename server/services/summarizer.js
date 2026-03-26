import Anthropic from '@anthropic-ai/sdk';

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const SYSTEM_PROMPT = `You are a senior macro research analyst at a multi-strategy hedge fund. Summarize this article in 3-5 sentences. Be specific about numbers, dates, and implications. Identify which tickers from the user's watchlist are relevant. Tone: institutional, direct, no filler. Do not start with "Here is a summary" or use bullet points. Write in flowing prose.`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse the model response to extract the summary text and matched tickers.
 * Expects the model to end with a line like "TICKERS: AAPL, MSFT"
 */
function parseResponse(text) {
  const lines = text.trim().split('\n');
  let matchedTickers = [];
  let summaryLines = [];

  for (const line of lines) {
    const tickerMatch = line.match(/^TICKERS:\s*(.+)/i);
    if (tickerMatch) {
      matchedTickers = tickerMatch[1]
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
    } else {
      summaryLines.push(line);
    }
  }

  return {
    summary: summaryLines.join('\n').trim(),
    matchedTickers,
  };
}

/**
 * Summarize a news article using Claude.
 * Falls back to a simple headline truncation if ANTHROPIC_API_KEY is not set or on error.
 */
export async function summarizeArticle(article, watchlistTickers = []) {
  const fallback = {
    summary: article.headline
      ? article.headline.slice(0, 500)
      : 'No summary available.',
    matchedTickers: [],
  };

  if (!anthropic) {
    console.log('[Summarizer] No ANTHROPIC_API_KEY set, using fallback summary');
    return fallback;
  }

  try {
    const userContent = [
      `Article headline: ${article.headline}`,
      '',
      `Article content: ${article.content || article.headline}`,
      '',
      `Watchlist tickers: ${watchlistTickers.join(', ')}`,
      '',
      'Provide your summary, then on a new line write TICKERS: followed by comma-separated relevant ticker symbols from the watchlist.',
    ].join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const text =
      response.content?.[0]?.type === 'text'
        ? response.content[0].text
        : '';

    if (!text) {
      return fallback;
    }

    const parsed = parseResponse(text);

    // Rate limiting delay
    await sleep(500);

    return parsed;
  } catch (err) {
    console.error('[Summarizer] Error calling Anthropic API:', err.message);
    return fallback;
  }
}

/**
 * Generate a company description using Claude.
 */
export async function generateTickerDescription(symbol, name) {
  if (!anthropic) {
    return `${name || symbol} is a publicly traded company.`;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Write a concise 2-3 sentence description of the company ${name || symbol} (ticker: ${symbol}). Focus on what they do, their market position, and sector. Be factual and institutional in tone.`,
        },
      ],
    });

    const text =
      response.content?.[0]?.type === 'text'
        ? response.content[0].text
        : '';

    return text || `${name || symbol} is a publicly traded company.`;
  } catch (err) {
    console.error(
      `[Summarizer] Error generating description for ${symbol}:`,
      err.message
    );
    return `${name || symbol} is a publicly traded company.`;
  }
}
