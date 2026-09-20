const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/users/search?q=alex
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 1) return res.json({ users: [] });
  const users = User.search(q, req.user.id);
  return res.json({ users });
});

module.exports = router;
