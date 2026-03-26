const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const BASE_URL = 'https://finnhub.io/api/v1';

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch company news from Finnhub for the given tickers.
 * Free tier is limited to 60 requests/min, so we add a 1s delay between calls.
 */
export async function fetchFinnhubNews(tickers) {
  if (!FINNHUB_API_KEY) {
    console.log('[Finnhub] No API key set, skipping news fetch');
    return [];
  }

  if (!tickers || tickers.length === 0) return [];

  const today = new Date();
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(today.getDate() - 3);

  const fromDate = formatDate(threeDaysAgo);
  const toDate = formatDate(today);
  const results = [];

  for (const ticker of tickers) {
    try {
      const url = `${BASE_URL}/company-news?symbol=${encodeURIComponent(ticker)}&from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[Finnhub] Error fetching news for ${ticker}: HTTP ${response.status}`);
        await sleep(1000);
        continue;
      }

      const articles = await response.json();

      if (Array.isArray(articles)) {
        for (const article of articles) {
          results.push({
            source: 'Finnhub',
            source_type: 'news',
            url: article.url,
            headline: article.headline,
            published_at: article.datetime
              ? new Date(article.datetime * 1000).toISOString()
              : null,
            tickers: [ticker],
          });
        }
      }
    } catch (err) {
      console.error(`[Finnhub] Exception fetching news for ${ticker}:`, err.message);
    }

    await sleep(1000);
  }

  return results;
}

/**
 * Fetch upcoming earnings calendar from Finnhub, filtered to watchlist tickers.
 * Looks 90 days ahead.
 */
export async function fetchFinnhubEarnings(tickers) {
  if (!FINNHUB_API_KEY) {
    console.log('[Finnhub] No API key set, skipping earnings fetch');
    return [];
  }

  if (!tickers || tickers.length === 0) return [];

  const today = new Date();
  const ninetyDaysOut = new Date(today);
  ninetyDaysOut.setDate(today.getDate() + 90);

  const fromDate = formatDate(today);
  const toDate = formatDate(ninetyDaysOut);

  try {
    const url = `${BASE_URL}/calendar/earnings?from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Finnhub] Error fetching earnings calendar: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    const earnings = data.earningsCalendar || [];
    const tickerSet = new Set(tickers.map(t => t.toUpperCase()));

    return earnings
      .filter(e => tickerSet.has(e.symbol?.toUpperCase()))
      .map(e => ({
        ticker: e.symbol,
        earnings_date: e.date,
        estimate_eps: e.epsEstimate ?? null,
        fiscal_quarter: e.quarter ? `Q${e.quarter}` : null,
        source: 'Finnhub',
      }));
  } catch (err) {
    console.error('[Finnhub] Exception fetching earnings calendar:', err.message);
    return [];
  }
}

/**
 * Fetch company profile from Finnhub.
 */
export async function fetchFinnhubProfile(symbol) {
  if (!FINNHUB_API_KEY) {
    console.log('[Finnhub] No API key set, skipping profile fetch');
    return null;
  }

  try {
    const url = `${BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Finnhub] Error fetching profile for ${symbol}: HTTP ${response.status}`);
      return null;
    }

    const profile = await response.json();

    if (!profile || !profile.name) {
      return null;
    }

    return profile;
  } catch (err) {
    console.error(`[Finnhub] Exception fetching profile for ${symbol}:`, err.message);
    return null;
  }
}
