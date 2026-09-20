const { verifyToken } = require('../auth');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { sendMessage, ValidationError, ForbiddenError } = require('../services/messageService');

// Tracks how many active socket connections each user currently has,
// so we only flip a user "offline" once their LAST tab/connection drops.
const onlineCounts = new Map();

function socketAuthMiddleware(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.cookie || '')
        .split('; ')
        .find((c) => c.startsWith('token='))
        ?.split('=')[1];

    if (!token) return next(new Error('Authentication required.'));

    const decoded = verifyToken(token);
    const user = User.findById(decoded.sub);
    if (!user) return next(new Error('User not found.'));

    socket.user = { id: user.id, username: user.username };
    return next();
  } catch (err) {
    return next(new Error('Invalid or expired token.'));
  }
}

function registerSocketHandlers(io) {
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    const { id: userId, username } = socket.user;

    // --- Presence: join a personal room + mark online on first connection ---
    socket.join(`user:${userId}`);
    const prevCount = onlineCounts.get(userId) || 0;
    onlineCounts.set(userId, prevCount + 1);

    if (prevCount === 0) {
      User.setOnlineStatus(userId, true);
      broadcastPresence(io, userId, true);
    }

    // --- Join a room per conversation the user belongs to ---
    const conversations = Conversation.listForUser(userId);
    conversations.forEach((c) => socket.join(`conversation:${c.id}`));

    socket.on('conversation:join', (conversationId) => {
      if (Conversation.isParticipant(Number(conversationId), userId)) {
        socket.join(`conversation:${conversationId}`);
      }
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // --- Sending a message ---
    socket.on('message:send', (data, ack) => {
      try {
        const { conversationId, body } = data || {};
        const { message, recipientIds } = sendMessage({
          conversationId: Number(conversationId),
          senderId: userId,
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

        if (typeof ack === 'function') ack({ ok: true, message });
      } catch (err) {
        const status =
          err instanceof ValidationError ? 'validation_error' : err instanceof ForbiddenError ? 'forbidden' : 'server_error';
        if (status === 'server_error') console.error('socket message:send error:', err);
        if (typeof ack === 'function') ack({ ok: false, error: err.message || 'Could not send message.', status });
      }
    });

    // --- Typing indicators ---
    socket.on('typing:start', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', { conversationId, userId, username });
    });

    socket.on('typing:stop', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', { conversationId, userId, username });
    });

    // --- Disconnect: only go offline once every connection for this user has closed ---
    socket.on('disconnect', () => {
      const count = (onlineCounts.get(userId) || 1) - 1;
      if (count <= 0) {
        onlineCounts.delete(userId);
        User.setOnlineStatus(userId, false);
        broadcastPresence(io, userId, false);
      } else {
        onlineCounts.set(userId, count);
      }
    });
  });
}

function broadcastPresence(io, userId, isOnline) {
  const user = User.findById(userId);
  io.emit('presence:update', {
    userId,
    isOnline,
    lastSeen: user ? user.last_seen : new Date().toISOString(),
  });
}

module.exports = { registerSocketHandlers };
