const express = require('express');
const db = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const rows = includeArchived
    ? db.prepare('SELECT * FROM menu_items ORDER BY name').all()
    : db.prepare('SELECT * FROM menu_items WHERE archived = 0 ORDER BY name').all();
  res.json({ items: rows });
});

router.post('/', requireAuth, requireManager, (req, res) => {
  const { name, priceCents, available } = req.body || {};
  if (!name || typeof priceCents !== 'number' || priceCents < 0) {
    return res.status(400).json({ error: 'name and non-negative priceCents are required' });
  }
  const info = db.prepare(
    'INSERT INTO menu_items (name, price_cents, available) VALUES (?, ?, ?)'
  ).run(name.trim(), Math.round(priceCents), available === false ? 0 : 1);
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ item });
});

router.patch('/:id', requireAuth, requireManager, (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });

  const { name, priceCents, available } = req.body || {};
  if (priceCents !== undefined && (typeof priceCents !== 'number' || priceCents < 0)) {
    return res.status(400).json({ error: 'priceCents must be a non-negative number' });
  }
  db.prepare(
    `UPDATE menu_items SET
       name = COALESCE(?, name),
       price_cents = COALESCE(?, price_cents),
       available = COALESCE(?, available),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(name ?? null, priceCents !== undefined ? Math.round(priceCents) : null,
        available !== undefined ? (available ? 1 : 0) : null, id);

  const updated = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  res.json({ item: updated });
});

router.post('/:id/archive', requireAuth, requireManager, (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });
  db.prepare('UPDATE menu_items SET archived = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.post('/:id/unarchive', requireAuth, requireManager, (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });
  db.prepare('UPDATE menu_items SET archived = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Bulk action: apply a price change or availability change to many items at once.
// Reports per-item success/failure rather than failing the whole batch (goal 7).
router.post('/bulk', requireAuth, requireManager, (req, res) => {
  const { ids, priceCents, available } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (priceCents === undefined && available === undefined) {
    return res.status(400).json({ error: 'Provide priceCents and/or available to apply' });
  }

  const getStmt = db.prepare('SELECT * FROM menu_items WHERE id = ?');
  const updateStmt = db.prepare(
    `UPDATE menu_items SET
       price_cents = COALESCE(?, price_cents),
       available = COALESCE(?, available),
       updated_at = datetime('now')
     WHERE id = ?`
  );

  const results = ids.map((rawId) => {
    const id = Number(rawId);
    const item = getStmt.get(id);
    if (!item) {
      return { id: rawId, ok: false, error: 'Menu item not found' };
    }
    if (priceCents !== undefined && (typeof priceCents !== 'number' || priceCents < 0)) {
      return { id, ok: false, error: 'Invalid price: must be a non-negative number' };
    }
    if (item.archived) {
      return { id, ok: false, error: 'Cannot modify an archived item' };
    }
    updateStmt.run(
      priceCents !== undefined ? Math.round(priceCents) : null,
      available !== undefined ? (available ? 1 : 0) : null,
      id
    );
    return { id, ok: true };
  });

  res.json({
    results,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
});

module.exports = router;
