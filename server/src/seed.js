const bcrypt = require('bcryptjs');
const db = require('./db');

function reset() {
  db.exec(`
    DELETE FROM order_events;
    DELETE FROM order_lines;
    DELETE FROM order_collaborators;
    DELETE FROM orders;
    DELETE FROM menu_items;
    DELETE FROM users;
  `);
}

function seed() {
  reset();
  const hash = (pw) => bcrypt.hashSync(pw, 10);

  const insertUser = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)');
  const managerId = insertUser.run('manager@demo.com', hash('password123'), 'Morgan (Manager)', 'manager').lastInsertRowid;
  const waiter1Id = insertUser.run('alice@demo.com', hash('password123'), 'Alice', 'waiter').lastInsertRowid;
  const waiter2Id = insertUser.run('ben@demo.com', hash('password123'), 'Ben', 'waiter').lastInsertRowid;

  const insertMenu = db.prepare('INSERT INTO menu_items (name, price_cents, available) VALUES (?, ?, ?)');
  const menu = {
    margherita: insertMenu.run('Margherita Pizza', 1200, 1).lastInsertRowid,
    carbonara: insertMenu.run('Spaghetti Carbonara', 1450, 1).lastInsertRowid,
    caesar: insertMenu.run('Caesar Salad', 950, 1).lastInsertRowid,
    tiramisu: insertMenu.run('Tiramisu', 650, 1).lastInsertRowid,
    lemonade: insertMenu.run('Fresh Lemonade', 400, 1).lastInsertRowid,
    steak: insertMenu.run('Grilled Ribeye Steak', 2800, 0).lastInsertRowid, // currently unavailable
    bruschetta: insertMenu.run('Bruschetta', 700, 1).lastInsertRowid,
  };

  const insertOrder = db.prepare(
    `INSERT INTO orders (table_number, primary_waiter_id, status, placed_at, ready_at, served_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO order_lines (order_id, menu_item_id, menu_item_name_snapshot, unit_price_cents_snapshot, quantity, special_instructions, status, void_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertEvent = db.prepare(
    `INSERT INTO order_events (order_id, type, from_status, to_status, line_id, reason, note, actor_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  function addLine(orderId, itemKey, qty, instructions) {
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(menu[itemKey]);
    const lineId = insertLine.run(orderId, item.id, item.name, item.price_cents, qty, instructions || null, 'Active', null).lastInsertRowid;
    insertEvent.run(orderId, 'line_added', null, null, lineId, null, `${qty}x ${item.name}`, waiter1Id, new Date().toISOString());
    return lineId;
  }

  const now = Date.now();
  const minsAgo = (m) => new Date(now - m * 60000).toISOString().replace('T', ' ').slice(0, 19);

  // Order 1: Served, complete lifecycle, table 4
  let o = insertOrder.run(4, waiter1Id, 'Served', minsAgo(90), minsAgo(50), minsAgo(30)).lastInsertRowid;
  addLine(o, 'margherita', 2);
  addLine(o, 'lemonade', 2);
  ['Accepted', 'Preparing', 'Ready', 'Served'].forEach((s, i) => {
    insertEvent.run(o, 'status_change', ['Placed','Accepted','Preparing','Ready'][i], s, null, null, null, waiter1Id, minsAgo(80 - i * 15));
  });

  // Order 2: Preparing, long open -> should trigger slow-order alert, table 7
  o = insertOrder.run(7, waiter2Id, 'Preparing', minsAgo(35), null, null).lastInsertRowid;
  addLine(o, 'carbonara', 1);
  addLine(o, 'caesar', 1, 'No croutons, allergy');
  insertEvent.run(o, 'status_change', 'Placed', 'Accepted', null, null, null, waiter2Id, minsAgo(30));
  insertEvent.run(o, 'status_change', 'Accepted', 'Preparing', null, null, null, managerId, minsAgo(20));

  // Order 3: Placed, fresh, table 2
  o = insertOrder.run(2, waiter1Id, 'Placed', minsAgo(4), null, null).lastInsertRowid;
  addLine(o, 'bruschetta', 3);

  // Order 4: Cancelled, table 9
  o = insertOrder.run(9, waiter2Id, 'Cancelled', minsAgo(60), null, null).lastInsertRowid;
  addLine(o, 'steak', 1);
  insertEvent.run(o, 'status_change', 'Placed', 'Cancelled', null, null, null, waiter2Id, minsAgo(55));

  // Order 5: Ready, has a voided line, collaborators, table 1
  o = insertOrder.run(1, waiter1Id, 'Ready', minsAgo(25), minsAgo(3), null).lastInsertRowid;
  const lid = addLine(o, 'tiramisu', 2);
  addLine(o, 'lemonade', 1);
  db.prepare("UPDATE order_lines SET status = 'Void', void_reason = ? WHERE id = ?").run('Kitchen ran out of ladyfingers', lid);
  insertEvent.run(o, 'line_voided', null, null, lid, 'Kitchen ran out of ladyfingers', null, managerId, minsAgo(10));
  db.prepare('INSERT INTO order_collaborators (order_id, user_id) VALUES (?, ?)').run(o, waiter2Id);
  insertEvent.run(o, 'collaborator_added', null, null, null, null, 'Ben added as collaborator', waiter1Id, minsAgo(20));
  insertEvent.run(o, 'status_change', 'Placed', 'Accepted', null, null, null, waiter1Id, minsAgo(23));
  insertEvent.run(o, 'status_change', 'Accepted', 'Preparing', null, null, null, waiter1Id, minsAgo(18));
  insertEvent.run(o, 'status_change', 'Preparing', 'Ready', null, null, null, managerId, minsAgo(3));

  // Served-today orders spread across the last 14 days for the chart
  for (let d = 0; d < 14; d++) {
    const count = Math.floor(Math.random() * 5) + (d === 0 ? 2 : 0);
    for (let i = 0; i < count; i++) {
      const placed = minsAgo(d * 1440 + 120);
      const served = minsAgo(d * 1440 + 60);
      const oid = insertOrder.run(
        (i % 10) + 1,
        i % 2 === 0 ? waiter1Id : waiter2Id,
        'Served',
        placed,
        served,
        served
      ).lastInsertRowid;
      addLine(oid, 'margherita', 1);
    }
  }

  console.log('Seed complete.');
  console.log('Manager: manager@demo.com / password123');
  console.log('Waiter:  alice@demo.com / password123');
  console.log('Waiter:  ben@demo.com / password123');
}

seed();
