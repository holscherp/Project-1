import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Helper: check if two users are accepted friends
function areAcceptedFriends(userIdA, userIdB) {
  const row = db.prepare(`
    SELECT id FROM friendships
    WHERE status = 'accepted'
      AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
  `).get(userIdA, userIdB, userIdB, userIdA);
  return !!row;
}

// GET /api/friends — my friends list + pending requests
router.get('/', requireAuth, (req, res) => {
  try {
    const uid = req.user.id;

    const friends = db.prepare(`
      SELECT f.id as friendship_id, f.created_at,
             u.id, u.name, u.avatar_url
      FROM friendships f
      JOIN users u ON (
        CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END = u.id
      )
      WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
      ORDER BY u.name
    `).all(uid, uid, uid);

    const pendingReceived = db.prepare(`
      SELECT f.id as friendship_id, f.created_at,
             u.id, u.name, u.avatar_url
      FROM friendships f
      JOIN users u ON f.requester_id = u.id
      WHERE f.addressee_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(uid);

    const pendingSent = db.prepare(`
      SELECT f.id as friendship_id, f.created_at,
             u.id, u.name, u.avatar_url
      FROM friendships f
      JOIN users u ON f.addressee_id = u.id
      WHERE f.requester_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(uid);

    res.json({ friends, pending_received: pendingReceived, pending_sent: pendingSent });
  } catch (err) {
    console.error('Error fetching friends:', err);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// POST /api/friends/request/:userId — send friend request
router.post('/request/:userId', requireAuth, (req, res) => {
  try {
    const requesterId = req.user.id;
    const addresseeId = req.params.userId;

    if (requesterId === addresseeId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(addresseeId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Check for any existing relationship in either direction
    const existing = db.prepare(`
      SELECT id, status FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `).get(requesterId, addresseeId, addresseeId, requesterId);

    if (existing) {
      if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
      if (existing.status === 'pending') return res.status(409).json({ error: 'Friend request already pending' });
      // If rejected, allow re-request by updating the row
      db.prepare("UPDATE friendships SET status = 'pending', created_at = ? WHERE id = ?")
        .run(new Date().toISOString(), existing.id);
      const updated = db.prepare('SELECT * FROM friendships WHERE id = ?').get(existing.id);
      return res.status(201).json(updated);
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
    ).run(id, requesterId, addresseeId, new Date().toISOString());

    res.status(201).json({ id, requester_id: requesterId, addressee_id: addresseeId, status: 'pending' });
  } catch (err) {
    console.error('Error sending friend request:', err);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// PUT /api/friends/accept/:friendshipId — accept (only addressee)
router.put('/accept/:friendshipId', requireAuth, (req, res) => {
  try {
    const friendship = db.prepare('SELECT * FROM friendships WHERE id = ?').get(req.params.friendshipId);
    if (!friendship) return res.status(404).json({ error: 'Friend request not found' });
    if (friendship.addressee_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (friendship.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(req.params.friendshipId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error accepting friend request:', err);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// PUT /api/friends/reject/:friendshipId — reject (only addressee)
router.put('/reject/:friendshipId', requireAuth, (req, res) => {
  try {
    const friendship = db.prepare('SELECT * FROM friendships WHERE id = ?').get(req.params.friendshipId);
    if (!friendship) return res.status(404).json({ error: 'Friend request not found' });
    if (friendship.addressee_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (friendship.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    db.prepare("UPDATE friendships SET status = 'rejected' WHERE id = ?").run(req.params.friendshipId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error rejecting friend request:', err);
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
});

// DELETE /api/friends/:friendshipId — unfriend or cancel request
router.delete('/:friendshipId', requireAuth, (req, res) => {
  try {
    const friendship = db.prepare('SELECT * FROM friendships WHERE id = ?').get(req.params.friendshipId);
    if (!friendship) return res.status(404).json({ error: 'Friendship not found' });

    if (friendship.requester_id !== req.user.id && friendship.addressee_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    db.prepare('DELETE FROM friendships WHERE id = ?').run(req.params.friendshipId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing friendship:', err);
    res.status(500).json({ error: 'Failed to remove friendship' });
  }
});

// GET /api/friends/compare/:userId — side-by-side watchlist comparison
router.get('/compare/:userId', requireAuth, (req, res) => {
  try {
    const myId = req.user.id;
    const theirId = req.params.userId;

    if (myId === theirId) return res.status(400).json({ error: 'Cannot compare with yourself' });

    if (!areAcceptedFriends(myId, theirId)) {
      return res.status(403).json({ error: 'You must be friends to compare accounts' });
    }

    const them = db.prepare('SELECT id, name, avatar_url FROM users WHERE id = ?').get(theirId);
    if (!them) return res.status(404).json({ error: 'User not found' });

    // Tickers
    const myTickers = db.prepare(`
      SELECT t.symbol, t.name, t.sector FROM user_watchlist_tickers uwt
      JOIN tickers t ON t.symbol = uwt.ticker_symbol
      WHERE uwt.user_id = ?
    `).all(myId);
    const theirTickers = db.prepare(`
      SELECT t.symbol, t.name, t.sector FROM user_watchlist_tickers uwt
      JOIN tickers t ON t.symbol = uwt.ticker_symbol
      WHERE uwt.user_id = ?
    `).all(theirId);
    const myTickerSymbols = new Set(myTickers.map(t => t.symbol));
    const theirTickerSymbols = new Set(theirTickers.map(t => t.symbol));
    const tickers = {
      shared: myTickers.filter(t => theirTickerSymbols.has(t.symbol)),
      only_mine: myTickers.filter(t => !theirTickerSymbols.has(t.symbol)),
      only_theirs: theirTickers.filter(t => !myTickerSymbols.has(t.symbol)),
    };

    // Sectors
    const mySectors = db.prepare(`
      SELECT sg.id, sg.name FROM user_watchlist_sectors uws
      JOIN sector_groups sg ON sg.id = uws.sector_id
      WHERE uws.user_id = ?
    `).all(myId);
    const theirSectors = db.prepare(`
      SELECT sg.id, sg.name FROM user_watchlist_sectors uws
      JOIN sector_groups sg ON sg.id = uws.sector_id
      WHERE uws.user_id = ?
    `).all(theirId);
    const mySectorIds = new Set(mySectors.map(s => s.id));
    const theirSectorIds = new Set(theirSectors.map(s => s.id));
    const sectors = {
      shared: mySectors.filter(s => theirSectorIds.has(s.id)),
      only_mine: mySectors.filter(s => !theirSectorIds.has(s.id)),
      only_theirs: theirSectors.filter(s => !mySectorIds.has(s.id)),
    };

    // Topics
    const myTopics = db.prepare(`
      SELECT mt.id, mt.name FROM user_watchlist_topics uwt
      JOIN macro_topics mt ON mt.id = uwt.topic_id
      WHERE uwt.user_id = ?
    `).all(myId);
    const theirTopics = db.prepare(`
      SELECT mt.id, mt.name FROM user_watchlist_topics uwt
      JOIN macro_topics mt ON mt.id = uwt.topic_id
      WHERE uwt.user_id = ?
    `).all(theirId);
    const myTopicIds = new Set(myTopics.map(t => t.id));
    const theirTopicIds = new Set(theirTopics.map(t => t.id));
    const topics = {
      shared: myTopics.filter(t => theirTopicIds.has(t.id)),
      only_mine: myTopics.filter(t => !theirTopicIds.has(t.id)),
      only_theirs: theirTopics.filter(t => !myTopicIds.has(t.id)),
    };

    // X Accounts
    const myXAccounts = db.prepare(`
      SELECT xa.id, xa.handle, xa.display_name, xa.category FROM user_watchlist_x_accounts uwx
      JOIN x_accounts xa ON xa.id = uwx.x_account_id
      WHERE uwx.user_id = ?
    `).all(myId);
    const theirXAccounts = db.prepare(`
      SELECT xa.id, xa.handle, xa.display_name, xa.category FROM user_watchlist_x_accounts uwx
      JOIN x_accounts xa ON xa.id = uwx.x_account_id
      WHERE uwx.user_id = ?
    `).all(theirId);
    const myXIds = new Set(myXAccounts.map(x => x.id));
    const theirXIds = new Set(theirXAccounts.map(x => x.id));
    const xAccounts = {
      shared: myXAccounts.filter(x => theirXIds.has(x.id)),
      only_mine: myXAccounts.filter(x => !theirXIds.has(x.id)),
      only_theirs: theirXAccounts.filter(x => !myXIds.has(x.id)),
    };

    res.json({
      me: { id: myId, name: req.user.name, avatar_url: req.user.avatar_url },
      them,
      tickers,
      sectors,
      topics,
      x_accounts: xAccounts,
    });
  } catch (err) {
    console.error('Error comparing accounts:', err);
    res.status(500).json({ error: 'Failed to compare accounts' });
  }
});

export default router;
