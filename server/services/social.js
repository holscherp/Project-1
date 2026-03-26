import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Meridian Dashboard/1.0',
  },
});

const NITTER_INSTANCES = [
  'nitter.net',
  'nitter.privacydev.net',
  'nitter.poast.org',
  'nitter.woodland.cafe',
];

const RSS_BRIDGE_URL =
  'https://rss-bridge.org/bridge01/?action=display&bridge=TwitterBridge&context=By+username';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Try to fetch an X/Twitter user's timeline via Nitter RSS instances.
 * Returns parsed feed items or null if all instances fail.
 */
async function tryNitterFeed(handle) {
  const cleanHandle = handle.replace(/^@/, '');

  for (const instance of NITTER_INSTANCES) {
    try {
      const url = `https://${instance}/${cleanHandle}/rss`;
      const feed = await parser.parseURL(url);

      if (feed && feed.items && feed.items.length > 0) {
        return { feed, instance };
      }
    } catch (err) {
      // Instance unavailable, try next
    }
    await sleep(500);
  }

  return null;
}

/**
 * Try to fetch an X/Twitter user's timeline via RSS Bridge.
 * Returns parsed feed items or null on failure.
 */
async function tryRSSBridge(handle) {
  const cleanHandle = handle.replace(/^@/, '');

  try {
    const url = `${RSS_BRIDGE_URL}&u=${encodeURIComponent(cleanHandle)}&format=Atom`;
    const feed = await parser.parseURL(url);

    if (feed && feed.items && feed.items.length > 0) {
      return { feed, instance: 'RSS Bridge' };
    }
  } catch (err) {
    // RSS Bridge unavailable
  }

  return null;
}

/**
 * Fetch posts from X/Twitter accounts using free RSS-based methods.
 * Tries Nitter instances first, then RSS Bridge as fallback.
 * Never lets scraping failures crash the app.
 */
export async function fetchSocialPosts(xAccounts) {
  if (!xAccounts || xAccounts.length === 0) return [];

  const results = [];

  for (const account of xAccounts) {
    const handle = typeof account === 'string' ? account : account.handle;
    if (!handle) continue;

    const cleanHandle = handle.replace(/^@/, '');

    try {
      // Method 1: Try Nitter instances
      let feedResult = await tryNitterFeed(cleanHandle);

      // Method 2: Try RSS Bridge
      if (!feedResult) {
        feedResult = await tryRSSBridge(cleanHandle);
      }

      if (!feedResult) {
        console.log(
          `[Social] All automated methods failed for @${cleanHandle}. Manual paste is the UI fallback.`
        );
        continue;
      }

      const { feed } = feedResult;

      for (const item of feed.items) {
        results.push({
          channel_id: cleanHandle,
          author_name: feed.title || cleanHandle,
          author_handle: cleanHandle,
          content: item.contentSnippet || item.content || item.title || '',
          created_at: item.isoDate || item.pubDate || null,
        });
      }
    } catch (err) {
      // IMPORTANT: Never let social media scraping failures crash the app
      console.error(
        `[Social] Unexpected error processing @${cleanHandle}:`,
        err.message
      );
    }

    await sleep(1000);
  }

  return results;
}
