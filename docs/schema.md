# Schema

Database: SQLite (file-based, via `better-sqlite3`). DDL lives at `server/src/db/schema.sql`
and is applied idempotently (`CREATE TABLE IF NOT EXISTS`) on every server boot, so there is
no separate migration step to run for this submission.

## Tables

### `users`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| email | TEXT UNIQUE | |
| password_hash | TEXT | bcrypt |
| name | TEXT | |
| role | TEXT | CHECK IN ('manager','waiter') |
| created_at | TEXT | |

### `menu_items`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | |
| price_cents | INTEGER | CHECK >= 0. Stored as integer cents, never floats, to avoid rounding errors on money. |
| available | INTEGER (bool) | |
| archived | INTEGER (bool) | Soft delete — archived items are hidden from ordering but old order lines still reference them. |
| created_at / updated_at | TEXT | |

### `orders`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| table_number | INTEGER | Not a foreign key — tables aren't modelled as their own entity, see decisions.md. |
| primary_waiter_id | INTEGER FK → users | One-to-many: one waiter can be primary on many orders. |
| status | TEXT | CHECK against the six lifecycle states. |
| archived | INTEGER (bool) | |
| placed_at, ready_at, served_at | TEXT | Denormalised timestamps set at the moment of each transition, so the dashboard's "served today" and "14-day served" queries don't need to scan `order_events`. |
| alert_acknowledged_at | TEXT | See "Alerts" below. |

### `order_collaborators`
Many-to-many join table between `orders` and `users`. Composite primary key
`(order_id, user_id)` prevents adding the same collaborator twice. The **primary**
waiter is not duplicated into this table — it lives only on `orders.primary_waiter_id` —
so "who is on this order" is always `primary_waiter_id UNION order_collaborators`, computed
in application queries (see `orders.js`, `canActOn` and the `/mine` and `/` list queries).

### `order_lines`
One-to-many with `orders`. Each line snapshots `menu_item_name_snapshot` and
`unit_price_cents_snapshot` at the moment it's added — this is a deliberate
denormalisation (see decisions.md): a price change on the menu must never alter the
total of an order that already has that line on it. Voiding sets `status = 'Void'` and
`void_reason`; the row is never deleted, matching goal 4's "voiding marks the line rather
than deleting it."

### `order_events`
Append-only audit log, one-to-many with `orders`. Every status change, line addition,
void, note, and collaborator addition is inserted here and never updated or deleted by
application code (goal 9). `type` distinguishes the five kinds of event; the columns not
relevant to a given type are left null (e.g. `from_status`/`to_status` are null for a
`note` event). This is a single polymorphic table rather than five separate tables —
see decisions.md for why.

## Relationships summary
- users 1—N orders (as primary waiter)
- users N—M orders (as collaborator, via `order_collaborators`)
- orders 1—N order_lines
- orders 1—N order_events
- menu_items 1—N order_lines (loosely — the line keeps its own snapshot, so this FK is
  really just "which item was this originally," not a live price source)

## Constraints: database vs. application
Enforced in the database (via `CHECK` and `UNIQUE`/`PRIMARY KEY`):
- Role must be one of two values; status must be one of six values; line status one of two.
- Prices and quantities cannot be negative/zero.
- A user can't be added as the same order's collaborator twice.

Enforced in application code, not the database:
- The state machine itself (which status can follow which) — SQLite's `CHECK` can enforce
  "status is a valid value" but not "this transition is legal given the current row," so
  that logic lives in `server/src/lifecycle.js` and is applied before every UPDATE.
- "Cancel only from Placed/Accepted," "void only while order is open," "reason required to
  void" — same reasoning: these are transition-time rules, not column-level constraints.
- Role-based authorization (who can act on which order) — this depends on joining against
  the request's authenticated user, which lives outside the row itself.

## What's denormalised, and why
1. `order_lines.menu_item_name_snapshot` / `unit_price_cents_snapshot` — required by the
   brief itself ("running total, calculated ... from the menu items' current prices at the
   time each line was added"). Without this, editing a menu price would retroactively
   change the total of every past order that used it.
2. `orders.ready_at` / `served_at` — could be derived by finding the matching
   `order_events` row instead, but the dashboard queries (today's revenue, 14-day served
   chart) run on every dashboard load, and re-deriving from the event log means a subquery
   per order rather than a direct column comparison. Traded a small amount of duplication
   for materially simpler, faster read queries on a table that's read far more than the
   status column is written.

## What would break first at 100x the data
At today's scale (a single restaurant, thousands of orders), SQLite plus these indexes
(`status`, `table_number`, `primary_waiter_id`, `placed_at`) is comfortably fast. At 100x:
- **SQLite's single-writer model** would be the first real ceiling — `better-sqlite3` is
  synchronous and WAL mode allows concurrent readers, but concurrent *writers* (many
  waiters updating orders simultaneously across, say, a multi-location chain) would start
  to serialize and queue. This is the main reason a Postgres-backed deployment would be the
  next step long before query performance became the bottleneck.
- The `/api/orders` search endpoint does a `COUNT(*)` and a paginated `SELECT` as two
  separate queries against the same WHERE clause; at 100x the row count this remains index-
  friendly, but the `CAST(table_number AS TEXT) LIKE ?` table-number search can't use an
  index (leading wildcard-style LIKE) — this would need a covering index strategy or a
  the search restructured to an exact-match/prefix match if table search became a hot path.
- The dashboard's revenue-today calculation currently loops over each of today's orders in
  application code and sums their lines with a per-order query (`server/src/routes/
  dashboard.js`). This is fine for a day's worth of orders at one restaurant, but is an
  N+1 pattern that should become a single aggregate `SUM(...) JOIN` once order volume per
  day is large.
