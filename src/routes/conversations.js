const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/conversations - list all conversations for the current user
router.get('/', (req, res) => {
  const conversations = Conversation.listForUser(req.user.id);
  const withParticipants = conversations.map((c) => ({
    ...c,
    participants: Conversation.getParticipants(c.id).filter((p) => p.id !== req.user.id),
  }));
  return res.json({ conversations: withParticipants });
});

// POST /api/conversations/direct { userId }
router.post('/direct', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required.' });
  if (Number(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot start a conversation with yourself.' });
  }
  const otherUser = User.findById(userId);
  if (!otherUser) return res.status(404).json({ error: 'User not found.' });

  const conversation = Conversation.createDirect(req.user.id, Number(userId));
  return res.status(201).json({ conversation });
});

// POST /api/conversations/group { name, memberIds: [] }
router.post('/group', (req, res) => {
  const { name, memberIds } = req.body;
  if (!name || !Array.isArray(memberIds) || memberIds.length < 1) {
    return res.status(400).json({ error: 'name and at least one memberId are required.' });
  }
  const conversation = Conversation.createGroup(name, req.user.id, memberIds.map(Number));
  return res.status(201).json({ conversation });
});

// GET /api/conversations/:id/messages?before=123&limit=50
router.get('/:id/messages', (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Conversation.isParticipant(conversationId, req.user.id)) {
    return res.status(403).json({ error: 'You are not part of this conversation.' });
  }
  const before = req.query.before ? Number(req.query.before) : undefined;
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 100) : 50;
  const messages = Message.history(conversationId, { before, limit });
  return res.json({ messages });
});

// POST /api/conversations/:id/read { messageId }
router.post('/:id/read', (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Conversation.isParticipant(conversationId, req.user.id)) {
    return res.status(403).json({ error: 'You are not part of this conversation.' });
  }
  const { messageId } = req.body;
  Conversation.markRead(conversationId, req.user.id, Number(messageId) || 0);
  return res.json({ ok: true });
});

module.exports = router;
