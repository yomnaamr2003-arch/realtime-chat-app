const validator = require('validator');
const db = require('../db');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const MAX_MESSAGE_LENGTH = 4000;

class ValidationError extends Error {}
class ForbiddenError extends Error {}

function sanitizeBody(rawBody) {
  if (typeof rawBody !== 'string') {
    throw new ValidationError('Message body must be a string.');
  }
  const trimmed = rawBody.trim();
  if (trimmed.length < 1) {
    throw new ValidationError('Message body cannot be empty.');
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Message body cannot exceed ${MAX_MESSAGE_LENGTH} characters.`);
  }
  // Escape HTML so stored/broadcast messages can never inject markup into other clients.
  return validator.escape(trimmed);
}

const insertNotification = db.prepare(
  `INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)`
);

/**
 * Validates, persists, and prepares a chat message for broadcast.
 * Also queues an "unread message" notification for every other participant.
 * Throws ValidationError (bad input) or ForbiddenError (not a participant).
 */
function sendMessage({ conversationId, senderId, body }) {
  if (!Conversation.isParticipant(conversationId, senderId)) {
    throw new ForbiddenError('You are not part of this conversation.');
  }

  const cleanBody = sanitizeBody(body);
  const message = Message.create({ conversationId, senderId, body: cleanBody });

  const participants = Conversation.getParticipants(conversationId).filter(
    (p) => p.id !== senderId
  );
  for (const participant of participants) {
    insertNotification.run(
      participant.id,
      'new_message',
      JSON.stringify({
        conversationId,
        messageId: message.id,
        senderUsername: message.sender_username,
        preview: cleanBody.slice(0, 120),
      })
    );
  }

  return { message, recipientIds: participants.map((p) => p.id) };
}

module.exports = { sendMessage, ValidationError, ForbiddenError, MAX_MESSAGE_LENGTH };
