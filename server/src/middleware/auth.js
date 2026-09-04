const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  // Also accept ?token= for the CSV export link, which is opened as a plain
  // navigation (new tab) rather than fetched with a header.
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, name, role }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function requireManager(req, res, next) {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Managers only. Your role does not permit this action.' });
  }
  next();
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { requireAuth, requireManager, signToken, JWT_SECRET };
