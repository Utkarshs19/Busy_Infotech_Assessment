-- Restaurant Orders schema (SQLite)
-- Design notes live in docs/schema.md

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','waiter')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_number INTEGER NOT NULL,
  primary_waiter_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Placed'
    CHECK (status IN ('Placed','Accepted','Preparing','Ready','Served','Cancelled')),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  placed_at TEXT NOT NULL DEFAULT (datetime('now')),
  ready_at TEXT,
  served_at TEXT,
  alert_acknowledged_at TEXT,
  alert_ack_status_at_ack TEXT -- status snapshot when acked, so a later regression re-triggers correctly
);

-- Many-to-many: an order has one primary waiter (column above) and any number of
-- collaborator waiters (this table). Primary waiter is NOT duplicated in here.
CREATE TABLE IF NOT EXISTS order_collaborators (
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (order_id, user_id)
);

CREATE TABLE IF NOT EXISTS order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  menu_item_name_snapshot TEXT NOT NULL,     -- denormalised: name at time of add
  unit_price_cents_snapshot INTEGER NOT NULL, -- denormalised: price at time of add
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  special_instructions TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Void')),
  void_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only audit trail. Nothing is ever updated or deleted from this table
-- by the application layer (enforced in code, see docs/decisions.md).
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('status_change','line_added','line_voided','note','collaborator_added')),
  from_status TEXT,
  to_status TEXT,
  line_id INTEGER REFERENCES order_lines(id),
  reason TEXT,
  note TEXT,
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_number);
CREATE INDEX IF NOT EXISTS idx_orders_primary_waiter ON orders(primary_waiter_id);
CREATE INDEX IF NOT EXISTS idx_orders_placed_at ON orders(placed_at);
CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_collab_user ON order_collaborators(user_id);
