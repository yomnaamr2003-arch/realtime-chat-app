const db = require('../db');

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

const User = {
  create({ username, email, passwordHash }) {
    const stmt = db.prepare(
      `INSERT INTO users (username, email, password_hash, avatar_color) VALUES (?, ?, ?, ?)`
    );
    const info = stmt.run(username, email, passwordHash, randomColor());
    return User.findById(info.lastInsertRowid);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  },

  findByEmail(email) {
    return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  },

  findByUsername(username) {
    return db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  },

  search(query, excludeUserId) {
    return db
      .prepare(
        `SELECT id, username, email, avatar_color, is_online, last_seen
         FROM users
         WHERE (username LIKE ? OR email LIKE ?) AND id != ?
         LIMIT 20`
      )
      .all(`%${query}%`, `%${query}%`, excludeUserId);
  },

  setOnlineStatus(id, isOnline) {
    db.prepare(`UPDATE users SET is_online = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?`).run(
      isOnline ? 1 : 0,
      id
    );
  },

  toPublic(user) {
    if (!user) return null;
    const { password_hash, ...rest } = user;
    return rest;
  },
};

module.exports = User;
