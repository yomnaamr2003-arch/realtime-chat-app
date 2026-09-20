const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/notifications
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, type, payload, is_read, created_at FROM notifications
       WHERE user_id = ? ORDER BY id DESC LIMIT 50`
    )
    .all(req.user.id);
  const notifications = rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  return res.json({ notifications });
});

// POST /api/notifications/:id/read
router.post('/:id/read', (req, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(
    req.params.id,
    req.user.id
  );
  return res.json({ ok: true });
});

// POST /api/notifications/read-all
router.post('/read-all', (req, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user.id);
  return res.json({ ok: true });
});

module.exports = router;
