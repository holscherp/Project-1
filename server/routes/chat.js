import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';

const router = Router();

let anthropic;
try {
  anthropic = new Anthropic();
} catch (e) {
  console.warn('Anthropic API key not configured. Chat will be unavailable.');
}

const SYSTEM_PROMPT = `You are a senior macro research analyst at a multi-strategy hedge fund. You have deep expertise in commodities, agriculture, shipping, water infrastructure, insurance/reinsurance, and housing finance. Respond with specific, quantitative, opinionated analysis. No generic advice. Reference specific data points, dates, and market dynamics. Be direct and institutional in tone.`;

// GET /channels - List all chat channels grouped by category
router.get('/channels', (req, res) => {
  try {
    const channels = db.prepare(
      'SELECT * FROM chat_channels ORDER BY category, name'
    ).all();

    const grouped = {};
    for (const channel of channels) {
      if (!grouped[channel.category]) {
        grouped[channel.category] = [];
      }
      grouped[channel.category].push(channel);
    }

    res.json({ channels: grouped });
  } catch (err) {
    console.error('Error fetching channels:', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// GET /:channelId/messages - Get messages for a channel
router.get('/:channelId/messages', (req, res) => {
  try {
    const { channelId } = req.params;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));

    const channel = db.prepare(
      'SELECT * FROM chat_channels WHERE id = ?'
    ).get(channelId);

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const messages = db.prepare(
      'SELECT * FROM chat_messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT ?'
    ).all(channelId, limit);

    res.json({ messages, channel });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /:channelId/message - Send user message and get Claude response
router.post('/:channelId/message', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const channel = db.prepare(
      'SELECT * FROM chat_channels WHERE id = ?'
    ).get(channelId);

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Save user message
    const userMessageId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO chat_messages (id, channel_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(userMessageId, channelId, 'user', content.trim(), now);

    // Get last 20 messages for conversation history
    const recentMessages = db.prepare(
      'SELECT role, content FROM chat_messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 20'
    ).all(channelId);

    // Reverse to chronological order
    recentMessages.reverse();

    // Build messages array for Claude
    const claudeMessages = recentMessages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // Build system prompt with channel context
    let systemPrompt = SYSTEM_PROMPT;
    if (channel.account_handle) {
      systemPrompt += `\n\nThis channel is dedicated to discussing the X/Twitter account @${channel.account_handle} (${channel.name}). Focus analysis on the topics, insights, and market views shared by this account.`;
    }

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const assistantContent = response.content[0].text;

    // Save assistant message
    const assistantMessageId = uuidv4();
    const assistantNow = new Date().toISOString();
    db.prepare(
      'INSERT INTO chat_messages (id, channel_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(assistantMessageId, channelId, 'assistant', assistantContent, assistantNow);

    const assistantMessage = db.prepare(
      'SELECT * FROM chat_messages WHERE id = ?'
    ).get(assistantMessageId);

    res.json({ message: assistantMessage });
  } catch (err) {
    console.error('Error in chat:', err);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

export default router;
