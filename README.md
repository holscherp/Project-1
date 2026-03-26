# Meridian — Market Intelligence Dashboard

A self-hosted market intelligence dashboard that pulls financial news from free sources, summarizes articles using Claude AI, and serves everything on a professional, Bloomberg-inspired interface.

## What It Does

- **Hourly news aggregation** from Finnhub, Google News RSS, SEC EDGAR, and financial RSS feeds
- **AI-powered summaries** — every article is summarized by Claude in the voice of a senior macro research analyst
- **SEC filings tracker** — monitors 10-K, 10-Q, and 8-K filings for your watchlist tickers
- **Earnings calendar** — upcoming earnings dates for all tracked companies
- **Analyst chat room** — chat with Claude about posts from tracked X/Twitter accounts, with full conversation context
- **Watchlist management** — add/remove tickers, sectors, macro topics, and X accounts from the UI
- **Dark & light themes** — Bloomberg-style dark mode by default

## Tech Stack

- **Frontend:** React (Vite), Tailwind CSS
- **Backend:** Node.js (Express)
- **Database:** SQLite (better-sqlite3)
- **AI:** Anthropic API (claude-sonnet-4-20250514)
- **Scheduling:** node-cron (hourly pulls)

## Quick Start (Local Development)

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd meridian

# 2. Install dependencies
npm install

# 3. Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

# 4. (Optional) Set Finnhub API key for enhanced news + earnings data
export FINNHUB_API_KEY=your-finnhub-key

# 5. Start development server
npm run dev
```

The app will be available at `http://localhost:5173` (frontend) with the API on port `3001`.

## Deploy to Render (One-Click)

1. Push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **New** > **Blueprint**
4. Connect your GitHub repo — Render will detect `render.yaml`
5. Set the `ANTHROPIC_API_KEY` environment variable when prompted
6. Optionally set `FINNHUB_API_KEY` for enhanced data
7. Click **Apply** — your dashboard deploys automatically

The `render.yaml` configures:
- A web service running Node.js
- A 1 GB persistent disk for the SQLite database
- Build command: `npm install && npm run build`
- Start command: `npm start`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key for Claude AI summaries and chat |
| `FINNHUB_API_KEY` | No | Free Finnhub API key for enhanced news, earnings, and company data. Get one at [finnhub.io](https://finnhub.io) |
| `DB_PATH` | No | Path to SQLite database file (defaults to `./data/meridian.db`) |
| `PORT` | No | Server port (defaults to `3001`) |

## Estimated API Costs

Claude API usage depends on your watchlist size and news volume:

- **Article summarization:** ~$0.005–0.01 per article (claude-sonnet-4-20250514, ~500 input + 300 output tokens)
- **Typical hourly run:** 10–50 new articles = $0.05–0.50 per hour
- **Chat messages:** ~$0.01–0.03 per exchange
- **Monthly estimate:** $30–100 depending on news volume and chat usage

Finnhub free tier: 60 API calls per minute, more than sufficient.

## Watchlist Management

All watchlist items are editable from the UI under the **Watchlist** tab:

- **Tickers** — Add any stock ticker. Claude auto-generates a company description.
- **Sector Groups** — Broader themes for news capture (e.g., "Water technology", "LNG infrastructure")
- **Macro Topics** — Keywords that trigger article matching (e.g., "OPEC+ production decisions")
- **X/Twitter Accounts** — Track accounts across categories. Posts appear in the Chat tab.

Changes take effect on the next hourly pull (or click **Refresh** to trigger immediately).

## Pre-Populated Watchlist

The app ships with 24 tickers across these themes:
- Nitrogen fertilizer & agriculture (CF, NTR, MOS, ADM, BG)
- Water technology (XYL, VEOEY, ERII, PNR, AWK)
- Industrial gas & hydrogen (APD, LIN, GTLS)
- Tanker & shipping (FRO, FLNG)
- Specialty insurance (MKL, ACGL, RNR)
- Precision agriculture (DE, TRMB, FMC)
- GSE & housing finance (FNMA, FMCC)
- Biofuels (GPRE)

Plus 14 sector groups, 12 macro topics, and 20 tracked X/Twitter accounts.

## Troubleshooting

**"No articles yet" on first load**
The first fetch runs ~10 seconds after server start. Click **Refresh** in the header to trigger manually. It may take a minute to complete.

**Chat returns errors**
Make sure `ANTHROPIC_API_KEY` is set correctly. The chat feature requires a valid API key.

**No earnings data**
Earnings data requires the `FINNHUB_API_KEY`. Sign up for a free key at [finnhub.io](https://finnhub.io).

**X/Twitter posts not appearing**
Social media scraping is inherently fragile. The app tries multiple Nitter instances and RSS bridges. If automated fetching fails, use the **Paste** button in the chat to manually add posts for analysis.

**Database issues on Render**
Ensure the persistent disk is mounted. Check that `DB_PATH` points to the disk mount path (`/opt/render/project/data/meridian.db`).
