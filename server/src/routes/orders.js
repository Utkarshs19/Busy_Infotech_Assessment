const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { canTransition, isOpen } = require('../lifecycle');

const router = express.Router();

const ALERT_THRESHOLD_MINUTES = Number(process.env.ALERT_THRESHOLD_MINUTES || 20);
const ALERT_REPEAT_MINUTES = Number(process.env.ALERT_REPEAT_MINUTES || 10);

function canActOn(order, user) {
  if (user.role === 'manager') return true;
  if (order.primary_waiter_id === user.id) return true;
  const collab = db.prepare(
    'SELECT 1 FROM order_collaborators WHERE order_id = ? AND user_id = ?'
  ).get(order.id, user.id);
  return !!collab;
}

function logEvent(orderId, actorId, fields) {
  db.prepare(
    `INSERT INTO order_events (order_id, type, from_status, to_status, line_id, reason, note, actor_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    orderId,
    fields.type,
    fields.from_status ?? null,
    fields.to_status ?? null,
    fields.line_id ?? null,
    fields.reason ?? null,
    fields.note ?? null,
    actorId
  );
}

function serializeOrderSummary(o) {
  return {
    id: o.id,
    tableNumber: o.table_number,
    status: o.status,
    archived: !!o.archived,
    placedAt: o.placed_at,
    readyAt: o.ready_at,
    servedAt: o.served_at,
    primaryWaiterId: o.primary_waiter_id,
    primaryWaiterName: o.primary_waiter_name,
  };
}

function computeTotals(orderId) {
  const lines = db.prepare('SELECT * FROM order_lines WHERE order_id = ?').all(orderId);
  const totalCents = lines
    .filter((l) => l.status === 'Active')
    .reduce((sum, l) => sum + l.unit_price_cents_snapshot * l.quantity, 0);
  return { lines, totalCents };
}

// ---------- Create ----------
router.post('/', requireAuth, (req, res) => {
  const { tableNumber } = req.body || {};
  if (!tableNumber || !Number.isInteger(tableNumber) || tableNumber <= 0) {
    return res.status(400).json({ error: 'tableNumber must be a positive integer' });
  }
  const info = db.prepare(
    'INSERT INTO orders (table_number, primary_waiter_id, status) VALUES (?, ?, ?)'
  ).run(tableNumber, req.user.id, 'Placed');
  logEvent(info.lastInsertRowid, req.user.id, { type: 'status_change', from_status: null, to_status: 'Placed' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ order: serializeOrderSummary({ ...order, primary_waiter_name: req.user.name }) });
});

// ---------- List / search (goal 6) ----------
router.get('/', requireAuth, (req, res) => {
  const {
    q, status, waiterId, dateFrom, dateTo,
    sort = 'placed_at', dir = 'desc',
    page = '1', pageSize = '20',
    archived = 'false',
  } = req.query;

  const where = ['o.archived = ?'];
  const params = [archived === 'true' ? 1 : 0];

  if (q) {
    where.push('CAST(o.table_number AS TEXT) LIKE ?');
    params.push(`%${q}%`);
  }
  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (waiterId) {
    where.push('(o.primary_waiter_id = ? OR EXISTS (SELECT 1 FROM order_collaborators c WHERE c.order_id = o.id AND c.user_id = ?))');
    params.push(Number(waiterId), Number(waiterId));
  }
  if (dateFrom) {
    where.push('o.placed_at >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('o.placed_at <= ?');
    params.push(dateTo);
  }

  const sortCol = { placed_at: 'o.placed_at', status: 'o.status', table: 'o.table_number' }[sort] || 'o.placed_at';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
  const offset = (pageNum - 1) * size;

  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o WHERE ${whereSql}`).get(...params).c;

  const rows = db.prepare(
    `SELECT o.*, u.name AS primary_waiter_name
     FROM orders o JOIN users u ON u.id = o.primary_waiter_id
     WHERE ${whereSql}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`
  ).all(...params, size, offset);

  res.json({
    orders: rows.map(serializeOrderSummary),
    total,
    page: pageNum,
    pageSize: size,
  });
});

// ---------- "My orders": primary or collaborator (goal 5) ----------
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT o.*, u.name AS primary_waiter_name
     FROM orders o JOIN users u ON u.id = o.primary_waiter_id
     WHERE o.primary_waiter_id = ?
        OR EXISTS (SELECT 1 FROM order_collaborators c WHERE c.order_id = o.id AND c.user_id = ?)
     ORDER BY o.placed_at DESC`
  ).all(req.user.id, req.user.id);
  res.json({ orders: rows.map(serializeOrderSummary) });
});

// ---------- Alerts (goal 10) ----------
router.get('/alerts', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT o.*, u.name AS primary_waiter_name
     FROM orders o JOIN users u ON u.id = o.primary_waiter_id
     WHERE o.archived = 0 AND o.status NOT IN ('Ready','Served','Cancelled')`
  ).all();

  const now = Date.now();
  const alerts = rows.filter((o) => {
    const placedMs = new Date(o.placed_at + 'Z').getTime();
    const minutesOpen = (now - placedMs) / 60000;
    if (minutesOpen < ALERT_THRESHOLD_MINUTES) return false;
    if (!o.alert_acknowledged_at) return true;
    // If acknowledged, only reappear after the repeat window has passed since ack.
    const ackMs = new Date(o.alert_acknowledged_at + 'Z').getTime();
    const minutesSinceAck = (now - ackMs) / 60000;
    return minutesSinceAck >= ALERT_REPEAT_MINUTES;
  });

  res.json({
    count: alerts.length,
    alerts: alerts.map((o) => ({
      ...serializeOrderSummary(o),
      minutesOpen: Math.floor((now - new Date(o.placed_at + 'Z').getTime()) / 60000),
    })),
  });
});

router.post('/:id/alerts/ack', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  db.prepare("UPDATE orders SET alert_acknowledged_at = datetime('now') WHERE id = ?").run(id);
  res.json({ ok: true });
});

// ---------- CSV export of today's orders (goal 7) ----------
router.get('/export/csv', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT o.*, u.name AS primary_waiter_name
     FROM orders o JOIN users u ON u.id = o.primary_waiter_id
     WHERE date(o.placed_at) = date('now')
     ORDER BY o.placed_at`
  ).all();

  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['order_id', 'table_number', 'status', 'placed_at', 'waiter', 'line_item', 'quantity', 'unit_price', 'line_status', 'order_total'];
  const lines = [header.join(',')];

  for (const o of rows) {
    const { lines: orderLines, totalCents } = computeTotals(o.id);
    if (orderLines.length === 0) {
      lines.push([o.id, o.table_number, o.status, o.placed_at, o.primary_waiter_name, '', '', '', '', (totalCents / 100).toFixed(2)].map(escape).join(','));
    }
    for (const l of orderLines) {
      lines.push([
        o.id, o.table_number, o.status, o.placed_at, o.primary_waiter_name,
        l.menu_item_name_snapshot, l.quantity, (l.unit_price_cents_snapshot / 100).toFixed(2),
        l.status, (totalCents / 100).toFixed(2),
      ].map(escape).join(','));
    }
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

// ---------- Get one order with lines + timeline ----------
router.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare(
    `SELECT o.*, u.name AS primary_waiter_name FROM orders o JOIN users u ON u.id = o.primary_waiter_id WHERE o.id = ?`
  ).get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { lines, totalCents } = computeTotals(id);
  const collaborators = db.prepare(
    `SELECT u.id, u.name FROM order_collaborators c JOIN users u ON u.id = c.user_id WHERE c.order_id = ?`
  ).all(id);
  const events = db.prepare(
    `SELECT e.*, u.name AS actor_name FROM order_events e JOIN users u ON u.id = e.actor_user_id
     WHERE e.order_id = ? ORDER BY e.created_at ASC, e.id ASC`
  ).all(id);

  res.json({
    order: {
      ...serializeOrderSummary(order),
      lines: lines.map((l) => ({
        id: l.id,
        menuItemId: l.menu_item_id,
        name: l.menu_item_name_snapshot,
        unitPriceCents: l.unit_price_cents_snapshot,
        quantity: l.quantity,
        specialInstructions: l.special_instructions,
        status: l.status,
        voidReason: l.void_reason,
      })),
      totalCents,
      collaborators,
      timeline: events.map((e) => ({
        id: e.id,
        type: e.type,
        fromStatus: e.from_status,
        toStatus: e.to_status,
        lineId: e.line_id,
        reason: e.reason,
        note: e.note,
        actorName: e.actor_name,
        createdAt: e.created_at,
      })),
    },
  });
});

// ---------- Status transitions (goal 4) ----------
router.post('/:id/status', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { to } = req.body || {};
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canActOn(order, req.user)) return res.status(403).json({ error: 'You are not on this order' });

  if (!canTransition(order.status, to)) {
    return res.status(422).json({
      error: `Cannot move order from "${order.status}" to "${to}". Allowed next steps depend on the current status.`,
    });
  }

  const extra = {};
  if (to === 'Ready') extra.ready_at = "datetime('now')";
  if (to === 'Served') extra.served_at = "datetime('now')";

  let sql = 'UPDATE orders SET status = ?';
  if (to === 'Ready') sql += ", ready_at = datetime('now')";
  if (to === 'Served') sql += ", served_at = datetime('now')";
  sql += ' WHERE id = ?';
  db.prepare(sql).run(to, id);

  logEvent(id, req.user.id, { type: 'status_change', from_status: order.status, to_status: to });
  res.json({ ok: true, status: to });
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canActOn(order, req.user)) return res.status(403).json({ error: 'You are not on this order' });

  if (!['Placed', 'Accepted'].includes(order.status)) {
    return res.status(422).json({
      error: `Order cannot be cancelled once it has entered "${order.status}". Cancellation is only allowed while Placed or Accepted.`,
    });
  }
  db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ?").run(id);
  logEvent(id, req.user.id, { type: 'status_change', from_status: order.status, to_status: 'Cancelled' });
  res.json({ ok: true });
});

router.post('/:id/archive', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canActOn(order, req.user)) return res.status(403).json({ error: 'You are not on this order' });
  db.prepare('UPDATE orders SET archived = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.post('/:id/unarchive', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canActOn(order, req.user)) return res.status(403).json({ error: 'You are not on this order' });
  db.prepare('UPDATE orders SET archived = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------- Lines (goal 3) ----------
router.post('/:id/lines', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canActOn(order, req.user)) return res.status(403).json({ error: 'You are not on this order' });

  if (order.status === 'Served' || order.status === 'Cancelled') {
    return res.status(422).json({ error: `Cannot add a line: order is already ${order.status}.` });
  }

  const { menuItemId, quantity, specialInstructions } = req.body || {};
  const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(menuItemId);
  if (!menuItem) return res.status(404).json({ error: 'Menu item not found' });
  if (!menuItem.available || menuItem.archived) {
    return res.status(422).json({ error: `"${menuItem.name}" is not currently available.` });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'quantity must be a positive integer' });
  }

  const info = db.prepare(
    `INSERT INTO order_lines (order_id, menu_item_id, menu_item_name_snapshot, unit_price_cents_snapshot, quantity, special_instructions)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, menuItem.id, menuItem.name, menuItem.price_cents, quantity, specialInstructions || null);

  logEvent(id, req.user.id, { type: 'line_added', line_id: info.lastInsertRowid, note: `${quantity}x ${menuItem.name}` });
  res.status(201).json({ lineId: info.lastInsertRowid });
});

router.post('/:id/lines/:lineId/void', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const lineId = Number(req.params.lineId);
  const { reason } = req.body || {};
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canActOn(order, req.user)) return res.status(403).json({ error: 'You are not on this order' });
  if (!isOpen(order.status)) {
    return res.status(422).json({ error: `Cannot void a line: order is already ${order.status}.` });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A reason is required to void a line' });
  }
  const line = db.prepare('SELECT * FROM order_lines WHERE id = ? AND order_id = ?').get(lineId, id);
  if (!line) return res.status(404).json({ error: 'Line not found on this order' });
  if (line.status === 'Void') return res.status(422).json({ error: 'Line is already void' });

  db.prepare("UPDATE order_lines SET status = 'Void', void_reason = ? WHERE id = ?").run(reason.trim(), lineId);
  logEvent(id, req.user.id, { type: 'line_voided', line_id: lineId, reason: reason.trim() });
  res.json({ ok: true });
});

// ---------- Collaborators (goal 5) ----------
router.post('/:id/collaborators', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { userId } = req.body || {};
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canActOn(order, req.user)) return res.status(403).json({ error: 'You are not on this order' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (order.primary_waiter_id === user.id) {
    return res.status(422).json({ error: 'This user is already the primary waiter on this order' });
  }
  try {
    db.prepare('INSERT INTO order_collaborators (order_id, user_id) VALUES (?, ?)').run(id, user.id);
  } catch (e) {
    return res.status(422).json({ error: 'This user is already a collaborator on this order' });
  }
  logEvent(id, req.user.id, { type: 'collaborator_added', note: `${user.name} added as collaborator` });
  res.status(201).json({ ok: true });
});

// ---------- Notes (part of timeline, goal 9) ----------
router.post('/:id/notes', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { note } = req.body || {};
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!canActOn(order, req.user)) return res.status(403).json({ error: 'You are not on this order' });
  if (!note || !note.trim()) return res.status(400).json({ error: 'Note text is required' });

  logEvent(id, req.user.id, { type: 'note', note: note.trim() });
  res.status(201).json({ ok: true });
});

module.exports = router;
