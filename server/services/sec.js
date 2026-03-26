const EDGAR_SEARCH_URL = 'https://efts.sec.gov/LATEST/search-index';
const EDGAR_HEADERS = {
  'User-Agent': 'Meridian contact@meridian.app',
  Accept: 'application/json',
};

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch recent SEC EDGAR filings for the given tickers.
 * Looks back 30 days for 10-K, 10-Q, and 8-K filings.
 */
export async function fetchSECFilings(tickers) {
  if (!tickers || tickers.length === 0) return [];

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const startDate = formatDate(thirtyDaysAgo);
  const endDate = formatDate(today);
  const results = [];

  for (const ticker of tickers) {
    try {
      const params = new URLSearchParams({
        q: `"${ticker}"`,
        forms: '8-K,10-K,10-Q',
        dateRange: 'custom',
        startdt: startDate,
        enddt: endDate,
        category: 'form-type',
      });

      const url = `${EDGAR_SEARCH_URL}?${params.toString()}`;
      const response = await fetch(url, { headers: EDGAR_HEADERS });

      if (!response.ok) {
        console.error(
          `[SEC] Error fetching filings for ${ticker}: HTTP ${response.status}`
        );
        await sleep(1000);
        continue;
      }

      const data = await response.json();
      const hits = data.hits?.hits || data.hits || data.filings || [];

      if (Array.isArray(hits)) {
        for (const hit of hits) {
          const source = hit._source || hit;
          const filingType =
            source.form_type || source.forms || source.type || '';
          const title =
            source.display_names?.join(', ') ||
            source.entity_name ||
            source.title ||
            `${ticker} ${filingType} Filing`;
          const filingUrl =
            source.file_url ||
            source.url ||
            (source.file_num
              ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}&type=${filingType}&dateb=&owner=include&count=10`
              : null);
          const filedAt =
            source.file_date || source.date_filed || source.period_of_report || null;
          const description =
            source.display_description || source.description || '';

          results.push({
            ticker,
            filing_type: filingType,
            title,
            url: filingUrl,
            filed_at: filedAt,
            description,
            is_material: filingType === '8-K' ? 1 : 0,
          });
        }
      }
    } catch (err) {
      console.error(`[SEC] Exception fetching filings for ${ticker}:`, err.message);
    }

    await sleep(1000);
  }

  return results;
}
