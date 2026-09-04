const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Manager-only endpoint to create additional user accounts (waiters/managers).
// Not strictly one of the 10 goals but needed to make roles usable beyond seed data.
router.post('/users', requireAuth, (req, res) => {
  if (req.user.role !== 'manager') return res.status(403).json({ error: 'Managers only' });
  const { email, password, name, role } = req.body || {};
  if (!email || !password || !name || !role) return res.status(400).json({ error: 'Missing fields' });
  if (!['manager', 'waiter'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
  ).run(email.toLowerCase().trim(), hash, name, role);

  res.status(201).json({ id: info.lastInsertRowid, email, name, role });
});

router.get('/users', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, email, name, role FROM users ORDER BY name').all();
  res.json({ users });
});

module.exports = router;
