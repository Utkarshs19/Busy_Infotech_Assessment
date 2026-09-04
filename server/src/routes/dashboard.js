const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const openOrders = db.prepare(
    `SELECT COUNT(*) c FROM orders WHERE archived = 0 AND status NOT IN ('Served','Cancelled')`
  ).get().c;

  const placedToday = db.prepare(
    `SELECT COUNT(*) c FROM orders WHERE date(placed_at) = date('now')`
  ).get().c;

  const servedToday = db.prepare(
    `SELECT COUNT(*) c FROM orders WHERE status = 'Served' AND date(served_at) = date('now')`
  ).get().c;

  const revenueRows = db.prepare(
    `SELECT o.id FROM orders o WHERE date(o.placed_at) = date('now') AND o.status != 'Cancelled'`
  ).all();
  let revenueTodayCents = 0;
  const totalStmt = db.prepare(
    `SELECT COALESCE(SUM(unit_price_cents_snapshot * quantity), 0) t
     FROM order_lines WHERE order_id = ? AND status = 'Active'`
  );
  for (const r of revenueRows) revenueTodayCents += totalStmt.get(r.id).t;

  const byStatus = db.prepare(
    `SELECT status, COUNT(*) c FROM orders WHERE archived = 0 GROUP BY status`
  ).all();

  const byWaiter = db.prepare(
    `SELECT u.name AS waiter, COUNT(*) c FROM orders o JOIN users u ON u.id = o.primary_waiter_id
     WHERE date(o.placed_at) = date('now') GROUP BY u.name ORDER BY c DESC`
  ).all();

  const servedPerDay = db.prepare(
    `SELECT date(served_at) AS day, COUNT(*) c FROM orders
     WHERE status = 'Served' AND served_at >= datetime('now', '-14 days')
     GROUP BY date(served_at) ORDER BY day ASC`
  ).all();

  res.json({
    openOrders,
    placedToday,
    servedToday,
    revenueTodayCents,
    byStatus,
    byWaiter,
    servedPerDay,
  });
});

module.exports = router;
