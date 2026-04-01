import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Store } from 'express-session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'meridian.db');

// Ensure the directory for the database file exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

function initDb() {
  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Create Tables ──────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      source TEXT,
      source_type TEXT CHECK(source_type IN ('news', 'filing', 'social', 'earnings')),
      url TEXT UNIQUE,
      headline TEXT,
      summary TEXT,
      tickers TEXT,
      sectors TEXT,
      topics TEXT,
      published_at TEXT,
      fetched_at TEXT,
      is_read INTEGER DEFAULT 0,
      is_bookmarked INTEGER DEFAULT 0,
      is_flagged INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tickers (
      symbol TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      sector TEXT,
      market_cap_category TEXT,
      themes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sector_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS macro_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      keywords TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS x_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handle TEXT UNIQUE,
      display_name TEXT,
      category TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_channels (
      id TEXT PRIMARY KEY,
      name TEXT,
      category TEXT,
      account_handle TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT REFERENCES chat_channels(id),
      role TEXT CHECK(role IN ('user', 'assistant', 'social')),
      content TEXT,
      author_name TEXT,
      author_handle TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS filings (
      id TEXT PRIMARY KEY,
      ticker TEXT,
      filing_type TEXT,
      title TEXT,
      url TEXT UNIQUE,
      filed_at TEXT,
      description TEXT,
      is_material INTEGER DEFAULT 0,
      fetched_at TEXT
    );

    CREATE TABLE IF NOT EXISTS earnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT,
      earnings_date TEXT,
      estimate_eps REAL,
      fiscal_quarter TEXT,
      source TEXT,
      updated_at TEXT,
      UNIQUE(ticker, earnings_date)
    );

    CREATE TABLE IF NOT EXISTS job_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT,
      status TEXT,
      message TEXT,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_watchlist_tickers (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ticker_symbol TEXT NOT NULL REFERENCES tickers(symbol) ON DELETE CASCADE,
      added_at TEXT NOT NULL,
      PRIMARY KEY (user_id, ticker_symbol)
    );

    CREATE TABLE IF NOT EXISTS user_watchlist_sectors (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sector_id INTEGER NOT NULL REFERENCES sector_groups(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL,
      PRIMARY KEY (user_id, sector_id)
    );

    CREATE TABLE IF NOT EXISTS user_watchlist_topics (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      topic_id INTEGER NOT NULL REFERENCES macro_topics(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL,
      PRIMARY KEY (user_id, topic_id)
    );

    CREATE TABLE IF NOT EXISTS user_watchlist_x_accounts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      x_account_id INTEGER NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL,
      PRIMARY KEY (user_id, x_account_id)
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')) DEFAULT 'pending',
      created_at TEXT NOT NULL,
      UNIQUE(requester_id, addressee_id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
      name TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_participants (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL,
      last_read_at TEXT,
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT REFERENCES users(id),
      body TEXT,
      attachment_type TEXT CHECK(attachment_type IN ('article', 'ticker') OR attachment_type IS NULL),
      attachment_data TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(user_id);

    CREATE TABLE IF NOT EXISTS ticker_metrics (
      symbol TEXT PRIMARY KEY,
      metrics_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticker_analysis_cache (
      symbol TEXT PRIMARY KEY,
      bull TEXT,
      bear TEXT,
      conviction INTEGER,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shlob_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      used_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shlob_usage_user ON shlob_usage(user_id, used_at);

    CREATE TABLE IF NOT EXISTS user_portfolio_positions (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ticker_symbol TEXT NOT NULL REFERENCES tickers(symbol) ON DELETE CASCADE,
      shares REAL NOT NULL DEFAULT 0,
      cost_basis_per_share REAL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (user_id, ticker_symbol)
    );

    CREATE TABLE IF NOT EXISTS ticker_daily_summaries (
      symbol TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      news_count INTEGER NOT NULL DEFAULT 0,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shlob_portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id),
      cash_balance REAL NOT NULL DEFAULT 15000.0,
      starting_capital REAL NOT NULL DEFAULT 15000.0,
      last_analysis_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shlob_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id),
      ticker_symbol TEXT NOT NULL,
      shares REAL NOT NULL,
      avg_cost_per_share REAL NOT NULL,
      position_type TEXT NOT NULL CHECK(position_type IN ('long', 'short')),
      opened_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, ticker_symbol)
    );

    CREATE TABLE IF NOT EXISTS shlob_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id),
      ticker_symbol TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('buy', 'sell', 'short', 'cover')),
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      total_cost REAL NOT NULL,
      cash_balance_after REAL NOT NULL,
      reasoning TEXT,
      triggered_by TEXT NOT NULL DEFAULT 'cron',
      executed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shlob_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at TEXT NOT NULL,
      total_value REAL NOT NULL,
      cash_balance REAL NOT NULL,
      positions_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shlob_snapshots_time ON shlob_snapshots(recorded_at);
  `);

  // ── Seed Data ──────────────────────────────────────────────────────────

  const now = new Date().toISOString();

  // -- Tickers --
  const tickerData = [
    ['CF', 'CF Industries', 'Leading nitrogen fertilizer manufacturer. Produces ammonia, urea, and UAN solutions. Key beneficiary of natural gas price spreads and global food security dynamics.', 'Nitrogen Fertilizer / Agriculture', 'Large Cap', 'nitrogen fertilizer, global food security, natural gas'],
    ['NTR', 'Nutrien', 'World\'s largest provider of crop inputs and services. Operates retail, potash, nitrogen, and phosphate segments.', 'Nitrogen Fertilizer / Agriculture', 'Large Cap', 'nitrogen fertilizer, potash, global food security'],
    ['XYL', 'Xylem', 'Global water technology company. Provides solutions for water and wastewater transport, treatment, testing, and smart metering.', 'Water Technology', 'Large Cap', 'water technology, smart water, infrastructure'],
    ['VEOEY', 'Veolia', 'Global leader in water, waste, and energy management. Operates in 48 countries with focus on resource recovery.', 'Water Technology', 'Large Cap', 'water treatment, waste management, European utilities'],
    ['ERII', 'Energy Recovery', 'Manufacturer of energy recovery devices for desalination and industrial processes. Key play on global water scarcity.', 'Water Technology', 'Mid Cap', 'desalination, water scarcity, energy efficiency'],
    ['PNR', 'Pentair', 'Water treatment and sustainable solutions company. Residential, commercial, and industrial water treatment.', 'Water Technology', 'Large Cap', 'water purification, residential water, pool equipment'],
    ['AWK', 'American Water Works', 'Largest publicly traded US water and wastewater utility. Regulated operations across 14 states.', 'Water Utilities', 'Large Cap', 'water utility, regulated utility, infrastructure'],
    ['APD', 'Air Products', 'Industrial gas company and leading hydrogen producer. Developing mega hydrogen projects globally.', 'Industrial Gas / Hydrogen', 'Large Cap', 'hydrogen economy, industrial gas, clean energy'],
    ['LIN', 'Linde', 'World\'s largest industrial gas company. Engineering, gases, and hydrogen solutions across all end markets.', 'Industrial Gas / Hydrogen', 'Mega Cap', 'industrial gas, hydrogen, semiconductor supply'],
    ['GTLS', 'Chart Industries', 'Specialty equipment for gas processing, LNG, hydrogen, and water treatment. Diversified industrial.', 'LNG / Industrial', 'Mid Cap', 'LNG infrastructure, hydrogen storage, cryogenics'],
    ['FRO', 'Frontline', 'One of the world\'s largest tanker companies. VLCCs, Suezmax, and LR2/Aframax vessels.', 'Tanker / Shipping', 'Mid Cap', 'tanker rates, oil transport, Strait of Hormuz'],
    ['FLNG', 'Flex LNG', 'Operator of modern LNG carriers. Pure-play LNG shipping with long-term charter coverage.', 'LNG Shipping', 'Small Cap', 'LNG shipping, European energy security, natural gas'],
    ['MKL', 'Markel', 'Specialty insurance holding company often compared to Berkshire. Insurance, reinsurance, and Markel Ventures.', 'Specialty Insurance / Reinsurance', 'Large Cap', 'specialty insurance, crop insurance, reinsurance'],
    ['ACGL', 'Arch Capital', 'Global specialty insurer and reinsurer. Property catastrophe, mortgage, and specialty lines.', 'Specialty Insurance / Reinsurance', 'Large Cap', 'reinsurance, catastrophe insurance, mortgage insurance'],
    ['RNR', 'RenaissanceRe', 'Leading property catastrophe reinsurer. Known for sophisticated risk modeling and capital management.', 'Specialty Insurance / Reinsurance', 'Large Cap', 'catastrophe reinsurance, climate risk, risk modeling'],
    ['BG', 'Bunge Global', 'Global agribusiness and food company. One of the four major ABCD grain traders.', 'Agricultural Commodities', 'Large Cap', 'grain trading, global food supply, oilseed processing'],
    ['ADM', 'Archer Daniels Midland', 'Major agricultural processor and food ingredient provider. Global grain trading, processing, nutrition.', 'Agricultural Commodities', 'Large Cap', 'grain trading, biofuels, food processing'],
    ['MOS', 'Mosaic', 'Leading producer of phosphate and potash crop nutrients. Key fertilizer supplier for global agriculture.', 'Fertilizer / Agriculture', 'Large Cap', 'phosphate, potash, crop nutrients'],
    ['FMC', 'FMC Corporation', 'Agricultural sciences company focused on crop protection. Insecticides, herbicides, fungicides.', 'Crop Protection', 'Mid Cap', 'crop protection, agricultural chemicals, precision agriculture'],
    ['DE', 'Deere & Co', 'World\'s largest agricultural equipment manufacturer. Leader in precision agriculture technology.', 'Agricultural Equipment', 'Mega Cap', 'precision agriculture, farm equipment, autonomous farming'],
    ['TRMB', 'Trimble', 'Technology company providing precision agriculture, construction, and geospatial solutions.', 'Precision Agriculture / Tech', 'Large Cap', 'precision agriculture, GPS technology, construction tech'],
    ['GPRE', 'Green Plains', 'Ethanol production and agricultural technology. Transitioning to high-protein feed and renewable corn oil.', 'Biofuels / Agriculture', 'Small Cap', 'ethanol, biofuels, agricultural biotech'],
    ['FNMA', 'Fannie Mae', 'Government-sponsored enterprise providing liquidity to the US mortgage market. In conservatorship since 2008.', 'GSE / Housing Finance', 'Special Situation', 'housing finance, GSE reform, mortgage market'],
    ['FMCC', 'Freddie Mac', 'Government-sponsored enterprise guaranteeing mortgage-backed securities. In conservatorship alongside Fannie Mae.', 'GSE / Housing Finance', 'Special Situation', 'housing finance, GSE reform, mortgage market'],
  ];

  const insertTicker = db.prepare(`
    INSERT OR IGNORE INTO tickers (symbol, name, description, sector, market_cap_category, themes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTickerMany = db.transaction((rows) => {
    for (const row of rows) {
      insertTicker.run(row[0], row[1], row[2], row[3], row[4], row[5], now);
    }
  });

  insertTickerMany(tickerData);

  // -- Sector Groups --
  const sectorGroups = [
    'Nitrogen fertilizer',
    'Water technology',
    'AI/data center water & cooling',
    'Water treatment & purification',
    'Tanker & shipping operators',
    'Crop insurance & agricultural reinsurance',
    'GSEs & housing finance',
    'Hydrogen & industrial gas',
    'Precision agriculture',
    'Global grain traders',
    'LNG infrastructure',
    'Defense & naval',
    'Nuclear energy',
    'Critical minerals & rare earths',
  ];

  const insertSectorGroup = db.prepare(`
    INSERT OR IGNORE INTO sector_groups (name, created_at) VALUES (?, ?)
  `);

  const insertSectorGroupMany = db.transaction((rows) => {
    for (const name of rows) {
      insertSectorGroup.run(name, now);
    }
  });

  insertSectorGroupMany(sectorGroups);

  // -- Macro Topics --
  const macroTopics = [
    ['Strait of Hormuz', 'Strait of Hormuz, hormuz, Persian Gulf shipping'],
    ['Red Sea / Houthi disruption', 'Red Sea, Houthi, Bab el-Mandeb, Yemen shipping'],
    ['US-China trade & tariffs', 'US-China trade, tariffs, trade war, decoupling'],
    ['Hydrogen economy', 'hydrogen, green hydrogen, blue hydrogen, hydrogen economy'],
    ['USDA crop reports & WASDE', 'USDA, WASDE, crop report, crop production, acreage'],
    ['Fed rate decisions & FOMC', 'Federal Reserve, FOMC, rate decision, interest rate, rate cut, rate hike'],
    ['European energy security', 'European energy, EU energy, gas storage, LNG imports Europe'],
    ['Global food security', 'food security, food crisis, grain supply, food prices'],
    ['Semiconductor water constraints', 'semiconductor water, chip water, fab water, TSMC water'],
    ['OPEC+ production decisions', 'OPEC, OPEC+, oil production, oil cut, oil output'],
    ['Climate & crop weather events', 'drought, flood, crop weather, El Nino, La Nina, heat wave'],
    ['Agricultural supply chain', 'agricultural supply chain, fertilizer supply, grain logistics'],
  ];

  const insertMacroTopic = db.prepare(`
    INSERT OR IGNORE INTO macro_topics (name, keywords, created_at) VALUES (?, ?, ?)
  `);

  const insertMacroTopicMany = db.transaction((rows) => {
    for (const [name, keywords] of rows) {
      insertMacroTopic.run(name, keywords, now);
    }
  });

  insertMacroTopicMany(macroTopics);

  // -- X Accounts & Chat Channels --
  const xAccounts = [
    // Activist Investors
    ['BillAckman', 'Bill Ackman', 'Activist Investors'],
    ['Carl_C_Icahn', 'Carl Icahn', 'Activist Investors'],
    ['chamath', 'Chamath Palihapitiya', 'Activist Investors'],
    ['DavidEinwortn', 'David Einhorn', 'Activist Investors'],
    // Macro Analysts
    ['zerohedge', 'Zerohedge', 'Macro Analysts'],
    ['KobeissiLetter', 'The Kobeissi Letter', 'Macro Analysts'],
    ['unusual_whales', 'Unusual Whales', 'Macro Analysts'],
    ['biaborptio', 'Jim Bianco', 'Macro Analysts'],
    ['PeterSchiff', 'Peter Schiff', 'Macro Analysts'],
    ['LynAldenContact', 'Lyn Alden', 'Macro Analysts'],
    ['DarioPerkins', 'Dario Perkins', 'Macro Analysts'],
    // Official/Institutional
    ['FederalReserve', 'Federal Reserve', 'Official/Institutional'],
    ['USDA', 'USDA', 'Official/Institutional'],
    ['IEA', 'IEA', 'Official/Institutional'],
    ['SECGov', 'SEC', 'Official/Institutional'],
    ['USTreasury', 'US Treasury', 'Official/Institutional'],
    // Financial Journalists
    ['TheStalwart', 'Joe Weisenthal', 'Financial Journalists'],
    ['tracyalloway', 'Tracy Alloway', 'Financial Journalists'],
    ['NickTimiraos', 'Nick Timiraos', 'Financial Journalists'],
    ['JavierBlas', 'Javier Blas', 'Financial Journalists'],
  ];

  const insertXAccount = db.prepare(`
    INSERT OR IGNORE INTO x_accounts (handle, display_name, category, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const insertChatChannel = db.prepare(`
    INSERT OR IGNORE INTO chat_channels (id, name, category, account_handle, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertXAccountsMany = db.transaction((rows) => {
    for (const [handle, displayName, category] of rows) {
      insertXAccount.run(handle, displayName, category, now);
      insertChatChannel.run(handle, displayName, category, handle, now);
    }
  });

  insertXAccountsMany(xAccounts);

  // -- Settings --
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  insertSetting.run('last_updated', null);
  insertSetting.run('theme', 'dark');

  // ── Shlob Per-User Migration ──────────────────────────────────────────
  // Add user_id to shlob_portfolio if this is an existing install
  try { db.exec('ALTER TABLE shlob_portfolio ADD COLUMN user_id TEXT REFERENCES users(id)'); } catch {}
  // Add user_id to shlob_trades if this is an existing install
  try { db.exec('ALTER TABLE shlob_trades ADD COLUMN user_id TEXT REFERENCES users(id)'); } catch {}

  // Rebuild shlob_positions if user_id column is absent (need to change UNIQUE constraint)
  const posColumns = db.prepare('PRAGMA table_info(shlob_positions)').all();
  if (!posColumns.some(c => c.name === 'user_id')) {
    db.exec(`CREATE TABLE IF NOT EXISTS shlob_positions_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id),
      ticker_symbol TEXT NOT NULL,
      shares REAL NOT NULL,
      avg_cost_per_share REAL NOT NULL,
      position_type TEXT NOT NULL CHECK(position_type IN ('long', 'short')),
      opened_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, ticker_symbol)
    )`);
    db.exec(`INSERT INTO shlob_positions_migration
      (id, ticker_symbol, shares, avg_cost_per_share, position_type, opened_at, updated_at)
      SELECT id, ticker_symbol, shares, avg_cost_per_share, position_type, opened_at, updated_at
      FROM shlob_positions`);
    db.exec('DROP TABLE shlob_positions');
    db.exec('ALTER TABLE shlob_positions_migration RENAME TO shlob_positions');
  }

  // Create the index only after user_id column is guaranteed to exist
  db.exec('CREATE INDEX IF NOT EXISTS idx_shlob_trades_user ON shlob_trades(user_id, executed_at)');

  // Assign any pre-migration rows (user_id IS NULL) to the oldest user
  const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
  if (firstUser) {
    db.prepare('UPDATE shlob_portfolio SET user_id = ? WHERE user_id IS NULL').run(firstUser.id);
    db.prepare('UPDATE shlob_positions SET user_id = ? WHERE user_id IS NULL').run(firstUser.id);
    db.prepare('UPDATE shlob_trades SET user_id = ? WHERE user_id IS NULL').run(firstUser.id);
  }

  return db;
}

// ── SQLite-backed session store for express-session ────────────────────────
class SqliteSessionStore extends Store {
  constructor() {
    super();
    // Clean up expired sessions every 15 minutes
    setInterval(() => {
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    }, 15 * 60 * 1000);
  }

  get(sid, callback) {
    try {
      const row = db.prepare('SELECT data, expires_at FROM sessions WHERE id = ?').get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at < Date.now()) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, session, callback) {
    try {
      const maxAge = session.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000;
      const expiresAt = Date.now() + maxAge;
      db.prepare(
        'INSERT OR REPLACE INTO sessions (id, data, expires_at) VALUES (?, ?, ?)'
      ).run(sid, JSON.stringify(session), expiresAt);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

export { db, initDb, SqliteSessionStore };
export default db;
