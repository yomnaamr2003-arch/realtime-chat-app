const db = require('../db');

const Conversation = {
  createDirect(userAId, userBId) {
    // Reuse an existing direct conversation between the two users if one exists.
    const existing = db
      .prepare(
        `SELECT c.id FROM conversations c
         JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = ?
         JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = ?
         WHERE c.is_group = 0
         LIMIT 1`
      )
      .get(userAId, userBId);
    if (existing) return Conversation.findById(existing.id);

    const insertConversation = db.prepare(
      `INSERT INTO conversations (is_group, name, created_by) VALUES (0, NULL, ?)`
    );
    const insertParticipant = db.prepare(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)`
    );

    const tx = db.transaction(() => {
      const info = insertConversation.run(userAId);
      insertParticipant.run(info.lastInsertRowid, userAId);
      insertParticipant.run(info.lastInsertRowid, userBId);
      return info.lastInsertRowid;
    });

    const id = tx();
    return Conversation.findById(id);
  },

  createGroup(name, creatorId, memberIds) {
    const insertConversation = db.prepare(
      `INSERT INTO conversations (is_group, name, created_by) VALUES (1, ?, ?)`
    );
    const insertParticipant = db.prepare(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)`
    );

    const tx = db.transaction(() => {
      const info = insertConversation.run(name, creatorId);
      const allMembers = new Set([creatorId, ...memberIds]);
      for (const uid of allMembers) {
        insertParticipant.run(info.lastInsertRowid, uid);
      }
      return info.lastInsertRowid;
    });

    const id = tx();
    return Conversation.findById(id);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id);
  },

  isParticipant(conversationId, userId) {
    const row = db
      .prepare(
        `SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`
      )
      .get(conversationId, userId);
    return !!row;
  },

  getParticipants(conversationId) {
    return db
      .prepare(
        `SELECT u.id, u.username, u.avatar_color, u.is_online, u.last_seen
         FROM conversation_participants cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.conversation_id = ?`
      )
      .all(conversationId);
  },

  listForUser(userId) {
    return db
      .prepare(
        `SELECT c.id, c.is_group, c.name, c.created_at,
                (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
                (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_at
         FROM conversations c
         JOIN conversation_participants cp ON cp.conversation_id = c.id
         WHERE cp.user_id = ?
         ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC`
      )
      .all(userId);
  },

  markRead(conversationId, userId, messageId) {
    db.prepare(
      `UPDATE conversation_participants SET last_read_message_id = ?
       WHERE conversation_id = ? AND user_id = ?`
    ).run(messageId, conversationId, userId);
  },
};

module.exports = Conversation;
