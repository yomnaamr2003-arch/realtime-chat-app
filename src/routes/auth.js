const express = require('express');
const validator = require('validator');
const User = require('../models/User');
const { hashPassword, verifyPassword, signToken } = require('../auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email and password are required.' });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    if (!validator.isLength(username, { min: 3, max: 24 }) || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return res
        .status(400)
        .json({ error: 'Username must be 3-24 characters: letters, numbers, underscore only.' });
    }
    if (!validator.isLength(password, { min: 8 })) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    if (User.findByEmail(email)) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    if (User.findByUsername(username)) {
      return res.status(409).json({ error: 'That username is taken.' });
    }

    const passwordHash = await hashPassword(password);
    const user = User.create({ username, email, passwordHash });

    const token = signToken({ sub: user.id, username: user.username });
    res.cookie('token', token, COOKIE_OPTIONS);
    return res.status(201).json({ user: User.toPublic(user), token });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Something went wrong while registering.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const user = User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken({ sub: user.id, username: user.username });
    res.cookie('token', token, COOKIE_OPTIONS);
    return res.json({ user: User.toPublic(user), token });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Something went wrong while logging in.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user: User.toPublic(user) });
});

module.exports = router;
