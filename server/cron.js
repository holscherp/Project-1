import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import db from './db.js';
import { fetchFinnhubNews, fetchFinnhubEarnings } from './services/finnhub.js';
import { fetchRSSNews } from './services/rss.js';
import { fetchSECFilings } from './services/sec.js';
import { fetchSocialPosts } from './services/social.js';
import { summarizeArticle } from './services/summarizer.js';

let isRunning = false;

export async function runFetchJob() {
  if (isRunning) {
    console.log('[Cron] Job already running, skipping');
    return;
  }

  isRunning = true;
  const startedAt = new Date().toISOString();
  let jobLogId;
  const errors = [];
  let newArticles = 0;
  let newFilings = 0;
  let newSocialPosts = 0;

  try {
    // Create job log entry
    const result = db.prepare(
      'INSERT INTO job_log (job_type, status, message, started_at) VALUES (?, ?, ?, ?)'
    ).run('fetch', 'running', 'Job started', startedAt);
    jobLogId = result.lastInsertRowid;

    // Load current watchlist
    const tickers = db.prepare('SELECT symbol, name FROM tickers').all();
    const sectors = db.prepare('SELECT name FROM sector_groups').all();
    const topics = db.prepare('SELECT name, keywords FROM macro_topics').all();
    const xAccounts = db.prepare('SELECT handle, display_name, category FROM x_accounts').all();

    const tickerSymbols = tickers.map(t => t.symbol);

    console.log(`[Cron] Fetching news for ${tickers.length} tickers, ${sectors.length} sectors, ${topics.length} topics`);

    // Fetch from all sources in parallel
    const [newsResult, rssResult, filingsResult, socialResult, earningsResult] = await Promise.allSettled([
      fetchFinnhubNews(tickerSymbols).catch(err => { errors.push(`Finnhub: ${err.message}`); return []; }),
      fetchRSSNews(tickers, sectors.map(s => s.name), topics).catch(err => { errors.push(`RSS: ${err.message}`); return []; }),
      fetchSECFilings(tickers).catch(err => { errors.push(`SEC: ${err.message}`); return []; }),
      fetchSocialPosts(xAccounts).catch(err => { errors.push(`Social: ${err.message}`); return []; }),
      fetchFinnhubEarnings(tickerSymbols).catch(err => { errors.push(`Earnings: ${err.message}`); return []; }),
    ]);

    // Combine all news articles
    const allArticles = [
      ...(newsResult.status === 'fulfilled' ? newsResult.value : []),
      ...(rssResult.status === 'fulfilled' ? rssResult.value : []),
    ];

    // Deduplicate by URL and check against existing
    const existingUrls = new Set();
    const existingRows = db.prepare('SELECT url FROM articles').all();
    for (const row of existingRows) {
      existingUrls.add(row.url);
    }

    const seenUrls = new Set();
    const uniqueArticles = [];
    for (const article of allArticles) {
      if (article.url && !existingUrls.has(article.url) && !seenUrls.has(article.url)) {
        seenUrls.add(article.url);
        uniqueArticles.push(article);
      }
    }

    console.log(`[Cron] Found ${uniqueArticles.length} new articles to process`);

    // Summarize and insert articles
    const insertArticle = db.prepare(`
      INSERT OR IGNORE INTO articles (id, source, source_type, url, headline, summary, tickers, sectors, topics, published_at, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const article of uniqueArticles) {
      try {
        const { summary, matchedTickers } = await summarizeArticle(article, tickerSymbols);
        const finalTickers = matchedTickers.length > 0 ? matchedTickers : (article.tickers || []);

        insertArticle.run(
          uuidv4(),
          article.source || 'Unknown',
          article.source_type || 'news',
          article.url,
          article.headline,
          summary,
          JSON.stringify(finalTickers),
          JSON.stringify(article.sectors || []),
          JSON.stringify(article.topics || []),
          article.published_at || new Date().toISOString(),
          new Date().toISOString()
        );
        newArticles++;

        // Rate limit delay between summarization calls
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`[Cron] Error processing article "${article.headline}":`, err.message);
        errors.push(`Article "${article.headline?.substring(0, 50)}": ${err.message}`);
      }
    }

    // Process SEC filings
    const filingsData = filingsResult.status === 'fulfilled' ? filingsResult.value : [];
    const existingFilingUrls = new Set(
      db.prepare('SELECT url FROM filings').all().map(r => r.url)
    );

    const insertFiling = db.prepare(`
      INSERT OR IGNORE INTO filings (id, ticker, filing_type, title, url, filed_at, description, is_material, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const filing of filingsData) {
      if (filing.url && !existingFilingUrls.has(filing.url)) {
        try {
          insertFiling.run(
            uuidv4(),
            filing.ticker,
            filing.filing_type,
            filing.title,
            filing.url,
            filing.filed_at,
            filing.description || '',
            filing.is_material || 0,
            new Date().toISOString()
          );
          newFilings++;
        } catch (err) {
          console.error(`[Cron] Error inserting filing:`, err.message);
        }
      }
    }

    // Process earnings
    const earningsData = earningsResult.status === 'fulfilled' ? earningsResult.value : [];
    const upsertEarnings = db.prepare(`
      INSERT INTO earnings (ticker, earnings_date, estimate_eps, fiscal_quarter, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(ticker, earnings_date) DO UPDATE SET
        estimate_eps = excluded.estimate_eps,
        fiscal_quarter = excluded.fiscal_quarter,
        source = excluded.source,
        updated_at = excluded.updated_at
    `);

    for (const earning of earningsData) {
      try {
        upsertEarnings.run(
          earning.ticker,
          earning.earnings_date,
          earning.estimate_eps || null,
          earning.fiscal_quarter || null,
          earning.source || 'Finnhub',
          new Date().toISOString()
        );
      } catch (err) {
        console.error(`[Cron] Error upserting earnings:`, err.message);
      }
    }

    // Process social posts
    const socialData = socialResult.status === 'fulfilled' ? socialResult.value : [];
    const insertMessage = db.prepare(`
      INSERT INTO chat_messages (id, channel_id, role, content, author_name, author_handle, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const post of socialData) {
      try {
        insertMessage.run(
          uuidv4(),
          post.channel_id,
          'social',
          post.content,
          post.author_name || '',
          post.author_handle || '',
          post.created_at || new Date().toISOString()
        );
        newSocialPosts++;
      } catch (err) {
        // Likely duplicate, skip silently
      }
    }

    // Update last_updated timestamp
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('last_updated', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(new Date().toISOString());

    // Update job log
    const completedAt = new Date().toISOString();
    const message = `Completed: ${newArticles} articles, ${newFilings} filings, ${newSocialPosts} social posts. Errors: ${errors.length}`;
    db.prepare(
      'UPDATE job_log SET status = ?, message = ?, completed_at = ? WHERE id = ?'
    ).run('completed', message, completedAt, jobLogId);

    console.log(`[Cron] ${message}`);
  } catch (err) {
    console.error('[Cron] Fatal error in fetch job:', err);
    if (jobLogId) {
      db.prepare(
        'UPDATE job_log SET status = ?, message = ?, completed_at = ? WHERE id = ?'
      ).run('failed', `Fatal: ${err.message}`, new Date().toISOString(), jobLogId);
    }
  } finally {
    isRunning = false;
  }
}

export function startCron() {
  console.log('[Cron] Scheduling hourly fetch job');

  // Run every hour at the top of the hour
  cron.schedule('0 * * * *', () => {
    console.log('[Cron] Hourly job triggered');
    runFetchJob();
  });

  // Run initial fetch after 10 seconds to let server start up
  setTimeout(() => {
    console.log('[Cron] Running initial fetch');
    runFetchJob();
  }, 10000);
}
