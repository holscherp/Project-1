import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET / - Get all tracked X accounts and their recent posts
router.get('/', (req, res) => {
  try {
    const accounts = db.prepare(
      'SELECT * FROM x_accounts ORDER BY category, name'
    ).all();

    // Get social posts from chat_messages where role = 'social'
    // Also check articles table for social source_type
    const socialArticles = db.prepare(
      `SELECT headline as content, source as author_name, tickers, published_at as created_at
       FROM articles
       WHERE source_type = 'social'
       ORDER BY published_at DESC
       LIMIT 50`
    ).all();

    // Map social articles to post format
    const posts = socialArticles.map(a => ({
      author_name: a.author_name || 'Unknown',
      author_handle: a.author_name || 'unknown',
      content: a.content,
      created_at: a.created_at,
    }));

    // If no social articles, try to get posts from chat_messages with role 'social'
    if (posts.length === 0) {
      const socialMessages = db.prepare(
        `SELECT cm.content, cm.created_at, cc.account_handle as author_handle, cc.name as author_name
         FROM chat_messages cm
         JOIN chat_channels cc ON cm.channel_id = cc.id
         WHERE cm.role = 'social'
         ORDER BY cm.created_at DESC
         LIMIT 50`
      ).all();

      for (const msg of socialMessages) {
        posts.push({
          author_name: msg.author_name,
          author_handle: msg.author_handle,
          content: msg.content,
          created_at: msg.created_at,
        });
      }
    }

    res.json({ accounts, posts });
  } catch (err) {
    console.error('Error fetching social data:', err);
    res.status(500).json({ error: 'Failed to fetch social data' });
  }
});

export default router;
