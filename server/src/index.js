const express = require('express');
const cors = require('cors');

const db = require('./db'); // ensures schema is applied on boot

// Render's free tier has no Shell access and an ephemeral filesystem, so there's
// no way to manually run `npm run seed` after deploy or after a restart wipes the
// disk. Auto-seed once on boot if the database has no users yet, so the app is
// always usable right after a fresh deploy without any extra manual step.
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  console.log('No users found — running seed script automatically...');
  require('./seed');
}

const authRoutes = require('./routes/auth');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/menu-items', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Central error handler as a safety net for unexpected exceptions.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
