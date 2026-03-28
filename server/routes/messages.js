import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Helper: verify caller is a participant in the conversation
function isParticipant(conversationId, userId) {
  return !!db.prepare(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?'
  ).get(conversationId, userId);
}

// Helper: check accepted friendship
function areAcceptedFriends(userIdA, userIdB) {
  return !!db.prepare(`
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
  `).get(userIdA, userIdB, userIdB, userIdA);
}

// Helper: enrich conversation with participants + last message + unread count
function enrichConversation(conv, myUserId) {
  const participants = db.prepare(`
    SELECT u.id, u.name, u.avatar_url, cp.last_read_at
    FROM conversation_participants cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.conversation_id = ?
  `).all(conv.id);

  const lastMessage = db.prepare(`
    SELECT m.*, u.name AS sender_name
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at DESC LIMIT 1
  `).get(conv.id);

  const myParticipant = participants.find(p => p.id === myUserId);
  const lastReadAt = myParticipant?.last_read_at || '1970-01-01T00:00:00.000Z';

  const unreadCount = db.prepare(`
    SELECT COUNT(*) AS c FROM messages
    WHERE conversation_id = ? AND sender_id != ? AND created_at > ?
  `).get(conv.id, myUserId, lastReadAt)?.c || 0;

  // For direct conversations, derive display name from the other participant
  let displayName = conv.name;
  if (conv.type === 'direct' && !displayName) {
    const other = participants.find(p => p.id !== myUserId);
    displayName = other?.name || 'Unknown';
  }

  return { ...conv, display_name: displayName, participants, last_message: lastMessage || null, unread_count: unreadCount };
}

// GET /api/messages/conversations — list my conversations
router.get('/conversations', requireAuth, (req, res) => {
  try {
    const uid = req.user.id;
    const convos = db.prepare(`
      SELECT c.* FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = ?
      ORDER BY c.created_at DESC
    `).all(uid);

    const enriched = convos.map(c => enrichConversation(c, uid));
    // Sort by last message time desc
    enriched.sort((a, b) => {
      const aTime = a.last_message?.created_at || a.created_at;
      const bTime = b.last_message?.created_at || b.created_at;
      return bTime.localeCompare(aTime);
    });

    res.json({ conversations: enriched });
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// POST /api/messages/conversations — create conversation (direct or group)
router.post('/conversations', requireAuth, (req, res) => {
  try {
    const { type, name, participant_ids } = req.body;
    const myId = req.user.id;

    if (!type || !['direct', 'group'].includes(type)) {
      return res.status(400).json({ error: 'type must be direct or group' });
    }
    if (!Array.isArray(participant_ids) || participant_ids.length === 0) {
      return res.status(400).json({ error: 'participant_ids required' });
    }
    if (type === 'group' && !name?.trim()) {
      return res.status(400).json({ error: 'Group name required' });
    }

    // Verify all participants are accepted friends
    for (const pid of participant_ids) {
      if (pid === myId) continue;
      if (!areAcceptedFriends(myId, pid)) {
        return res.status(403).json({ error: `User ${pid} is not your friend` });
      }
    }

    // For direct: check if DM already exists between these two users
    if (type === 'direct' && participant_ids.length === 1) {
      const otherId = participant_ids[0];
      const existing = db.prepare(`
        SELECT c.id FROM conversations c
        JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
        JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
        WHERE c.type = 'direct'
          AND (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id) = 2
        LIMIT 1
      `).get(myId, otherId);

      if (existing) {
        const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(existing.id);
        return res.json(enrichConversation(conv, myId));
      }
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO conversations (id, type, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, type, name?.trim() || null, myId, now);

    // Add creator + all participants
    const allParticipants = [...new Set([myId, ...participant_ids])];
    const insertParticipant = db.prepare(
      'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
    );
    const insertAll = db.transaction(() => {
      for (const uid of allParticipants) insertParticipant.run(id, uid, now);
    });
    insertAll();

    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    res.status(201).json(enrichConversation(conv, myId));
  } catch (err) {
    console.error('Error creating conversation:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// GET /api/messages/conversations/:id — full thread + mark read
router.get('/conversations/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user.id;

    if (!isParticipant(id, myId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const page = parseInt(req.query.page || '1');
    const limit = 50;
    const offset = (page - 1) * limit;

    const messages = db.prepare(`
      SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(id, limit, offset);

    const total = db.prepare(
      'SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ?'
    ).get(id)?.c || 0;

    // Mark as read
    db.prepare(
      'UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?'
    ).run(new Date().toISOString(), id, myId);

    res.json({
      conversation: enrichConversation(conv, myId),
      messages: messages.reverse(), // chronological order
      total,
      page,
    });
  } catch (err) {
    console.error('Error fetching conversation:', err);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// POST /api/messages/conversations/:id/messages — send a message
router.post('/conversations/:id/messages', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user.id;

    if (!isParticipant(id, myId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    const { body, attachment_type, attachment_data } = req.body;

    if (!body?.trim() && !attachment_data) {
      return res.status(400).json({ error: 'Message must have body or attachment' });
    }
    if (attachment_type && !['article', 'ticker'].includes(attachment_type)) {
      return res.status(400).json({ error: 'Invalid attachment_type' });
    }

    const msgId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, body, attachment_type, attachment_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      msgId, id, myId,
      body?.trim() || null,
      attachment_type || null,
      attachment_data ? JSON.stringify(attachment_data) : null,
      now
    );

    // Update caller's last_read_at to now (they just sent a message)
    db.prepare(
      'UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?'
    ).run(now, id, myId);

    const msg = db.prepare(`
      SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar
      FROM messages m LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `).get(msgId);

    res.status(201).json(msg);
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// PUT /api/messages/conversations/:id/read — mark conversation as read
router.put('/conversations/:id/read', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user.id;

    if (!isParticipant(id, myId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    db.prepare(
      'UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?'
    ).run(new Date().toISOString(), id, myId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// GET /api/messages/unread-count — total unread messages across all conversations
router.get('/unread-count', requireAuth, (req, res) => {
  try {
    const uid = req.user.id;
    const rows = db.prepare(`
      SELECT cp.conversation_id, cp.last_read_at
      FROM conversation_participants cp
      WHERE cp.user_id = ?
    `).all(uid);

    let total = 0;
    for (const row of rows) {
      const lastRead = row.last_read_at || '1970-01-01T00:00:00.000Z';
      const count = db.prepare(`
        SELECT COUNT(*) AS c FROM messages
        WHERE conversation_id = ? AND sender_id != ? AND created_at > ?
      `).get(row.conversation_id, uid, lastRead)?.c || 0;
      total += count;
    }

    res.json({ count: total });
  } catch (err) {
    res.status(500).json({ count: 0 });
  }
});

// POST /api/messages/conversations/:id/participants — add participant to group
router.post('/conversations/:id/participants', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user.id;
    const { user_id } = req.body;

    if (!isParticipant(id, myId)) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.type !== 'group') return res.status(400).json({ error: 'Can only add participants to group conversations' });
    if (!areAcceptedFriends(myId, user_id)) {
      return res.status(403).json({ error: 'That user is not your friend' });
    }

    db.prepare(
      'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)'
    ).run(id, user_id, new Date().toISOString());

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

export default router;
