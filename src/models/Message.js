const db = require('../db');

const Message = {
  create({ conversationId, senderId, body }) {
    const stmt = db.prepare(
      `INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)`
    );
    const info = stmt.run(conversationId, senderId, body);
    return Message.findById(info.lastInsertRowid);
  },

  findById(id) {
    return db
      .prepare(
        `SELECT m.*, u.username AS sender_username, u.avatar_color AS sender_avatar_color
         FROM messages m JOIN users u ON u.id = m.sender_id
         WHERE m.id = ?`
      )
      .get(id);
  },

  history(conversationId, { before, limit = 50 } = {}) {
    if (before) {
      return db
        .prepare(
          `SELECT m.*, u.username AS sender_username, u.avatar_color AS sender_avatar_color
           FROM messages m JOIN users u ON u.id = m.sender_id
           WHERE m.conversation_id = ? AND m.id < ?
           ORDER BY m.id DESC LIMIT ?`
        )
        .all(conversationId, before, limit)
        .reverse();
    }
    return db
      .prepare(
        `SELECT m.*, u.username AS sender_username, u.avatar_color AS sender_avatar_color
         FROM messages m JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = ?
         ORDER BY m.id DESC LIMIT ?`
      )
      .all(conversationId, limit)
      .reverse();
  },
};

module.exports = Message;
