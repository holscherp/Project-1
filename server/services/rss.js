import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Meridian Dashboard/1.0',
    Accept: 'application/rss+xml, application/xml, text/xml',
  },
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build the list of RSS feed URLs to fetch based on tickers, sectors, and topics.
 */
function buildFeedList(tickers = [], sectors = [], topics = []) {
  const feeds = [];

  // Google News RSS for each ticker
  for (const ticker of tickers) {
    feeds.push({
      name: `Google News (${ticker})`,
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(ticker + ' stock')}&hl=en-US&gl=US&ceid=US:en`,
      relatedTicker: ticker,
    });
  }

  // Google News RSS for each sector
  for (const sector of sectors) {
    feeds.push({
      name: `Google News (${sector})`,
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(sector)}&hl=en-US&gl=US&ceid=US:en`,
    });
  }

  // Google News RSS for each topic keyword
  for (const topic of topics) {
    feeds.push({
      name: `Google News (${topic})`,
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`,
    });
  }

  // Reuters business RSS
  feeds.push({
    name: 'Reuters Business',
    url: 'https://feeds.reuters.com/reuters/businessNews',
  });

  // CNBC RSS
  feeds.push({
    name: 'CNBC',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
  });

  return feeds;
}

/**
 * Check if a text string mentions any of the given tickers or company names.
 * Returns the list of matched ticker symbols.
 */
function matchTickers(text, tickers) {
  if (!text || !tickers || tickers.length === 0) return [];

  const upperText = text.toUpperCase();
  const matched = [];

  for (const ticker of tickers) {
    // Match the ticker symbol as a standalone word
    const tickerUpper = ticker.toUpperCase();
    const tickerRegex = new RegExp(`\\b${tickerUpper}\\b`);
    if (tickerRegex.test(upperText)) {
      matched.push(ticker);
    }
  }

  return matched;
}

/**
 * Fetch news from RSS feeds and Google News RSS.
 * Matches articles to relevant tickers by headline/description content.
 */
export async function fetchRSSNews(tickers = [], sectors = [], topics = []) {
  const feeds = buildFeedList(tickers, sectors, topics);
  const results = [];
  const seenUrls = new Set();

  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);

      if (parsed.items) {
        for (const item of parsed.items) {
          const url = item.link || item.guid;
          if (!url || seenUrls.has(url)) continue;
          seenUrls.add(url);

          // Determine which tickers this article is relevant to
          const textToMatch = [item.title, item.contentSnippet, item.content]
            .filter(Boolean)
            .join(' ');
          let matchedTickers = matchTickers(textToMatch, tickers);

          // If the feed was created for a specific ticker, include it
          if (feed.relatedTicker && !matchedTickers.includes(feed.relatedTicker)) {
            matchedTickers.push(feed.relatedTicker);
          }

          results.push({
            source: feed.name,
            source_type: 'news',
            url,
            headline: item.title || '',
            published_at: item.isoDate || item.pubDate || null,
            tickers: matchedTickers,
            content: item.contentSnippet || item.content || '',
          });
        }
      }
    } catch (err) {
      console.error(`[RSS] Error fetching feed "${feed.name}" (${feed.url}):`, err.message);
    }

    await sleep(500);
  }

  return results;
}
