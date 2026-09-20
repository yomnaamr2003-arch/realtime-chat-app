const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendMessage, ValidationError, ForbiddenError } = require('../services/messageService');

module.exports = function messagesRouter(io) {
  const router = express.Router();
  router.use(requireAuth);

  // POST /api/messages { conversationId, body }
  // REST fallback for sending a message (the primary path is the socket "message:send" event).
  router.post('/', (req, res) => {
    try {
      const { conversationId, body } = req.body;
      const { message, recipientIds } = sendMessage({
        conversationId: Number(conversationId),
        senderId: req.user.id,
        body,
      });

      io.to(`conversation:${conversationId}`).emit('message:new', message);
      recipientIds.forEach((uid) => {
        io.to(`user:${uid}`).emit('notification:new', {
          type: 'new_message',
          conversationId: Number(conversationId),
          message,
        });
      });

      return res.status(201).json({ message });
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
      console.error('send message error:', err);
      return res.status(500).json({ error: 'Could not send message.' });
    }
  });

  return router;
};
