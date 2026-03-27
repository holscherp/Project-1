import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, SqliteSessionStore } from './db.js';
import newsRoutes from './routes/news.js';
import tickerRoutes from './routes/ticker.js';
import filingsRoutes from './routes/filings.js';
import earningsRoutes from './routes/earnings.js';
import chatRoutes from './routes/chat.js';
import watchlistRoutes from './routes/watchlist.js';
import settingsRoutes from './routes/settings.js';
import jobRoutes from './routes/jobs.js';
import shlobRoutes from './routes/shlob.js';
import socialRoutes from './routes/social.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import friendsRoutes from './routes/friends.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Initialize database (must run before session store is used)
initDb();

// Session middleware
app.use(session({
  store: new SqliteSessionStore(),
  secret: process.env.SESSION_SECRET || 'meridian-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
}

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/ticker', tickerRoutes);
app.use('/api/filings', filingsRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/shlob', shlobRoutes);
app.use('/api/social', socialRoutes);

// SPA fallback: serve index.html for non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

import { startCron } from './cron.js';

app.listen(PORT, () => {
  console.log(`Meridian server listening on port ${PORT}`);
  startCron();
});
