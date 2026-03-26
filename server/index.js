import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import newsRoutes from './routes/news.js';
import tickerRoutes from './routes/ticker.js';
import filingsRoutes from './routes/filings.js';
import earningsRoutes from './routes/earnings.js';
import chatRoutes from './routes/chat.js';
import watchlistRoutes from './routes/watchlist.js';
import settingsRoutes from './routes/settings.js';
import jobRoutes from './routes/jobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize database
initDb();

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
}

// Mount API routes
app.use('/api/news', newsRoutes);
app.use('/api/ticker', tickerRoutes);
app.use('/api/filings', filingsRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/jobs', jobRoutes);

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
