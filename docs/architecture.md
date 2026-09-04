# Architecture

## Moving pieces

```
┌─────────────────┐        HTTPS/JSON         ┌──────────────────┐        ┌──────────────┐
│  React (Vite)    │ ───────────────────────▶ │  Express API      │ ─────▶ │  SQLite file  │
│  client/         │ ◀─────────────────────── │  server/           │ ◀───── │  data.sqlite  │
│  runs in browser │        Bearer JWT         │  runs on Node       │        │  on disk      │
└─────────────────┘                            └──────────────────┘        └──────────────┘
```

- **Client** (`client/`): a single-page React app built with Vite. Talks to the API over
  `fetch`, holds the JWT in `localStorage`, and does all routing client-side with
  `react-router-dom`. Deployed as static files (e.g. Vercel/Netlify/any static host).
- **Server** (`server/`): a single Express process. Owns all business logic — the state
  machine, authorization checks, search/pagination, the dashboard aggregation, CSV export.
  Deployed as a long-running Node process (e.g. Render).
- **Database**: SQLite, accessed synchronously via `better-sqlite3`, as a single file next
  to the server process. See decisions.md for why SQLite over Postgres for this submission.

There is no separate background worker, queue, or cache layer — traffic and data volume
for a single restaurant's order flow don't need one, and adding one would be complexity
without a corresponding problem to solve (see "what I decided not to build" below).

## Where each piece runs
- Client: static bundle, served by a CDN/static host. No server-side rendering.
- Server: one Node process, one port, stateless except for the SQLite file it owns.
- Database: same filesystem as the server process (SQLite is embedded, not a separate
  service) — this is the main portability trade-off of this design, see decisions.md.

## Request path for one representative action: "waiter adds a line to an order"

1. **Client**: on `OrderDetail.jsx`, the waiter picks a menu item, quantity, and optional
   instructions, and clicks "Add line." This calls `api.addLine(orderId, {...})`
   (`client/src/api.js`), which does `fetch('/api/orders/:id/lines', { method: 'POST',
   headers: { Authorization: 'Bearer <jwt>' }, body: {...} })`.
2. **Server routing**: Express matches `POST /api/orders/:id/lines` in `routes/orders.js`.
3. **Auth middleware** (`middleware/auth.js`): verifies the JWT, attaches `req.user =
   { id, role, ... }`. If the token is missing or invalid, the request stops here with 401.
4. **Authorization**: the route loads the order by id, then calls `canActOn(order, req.user)`
   — true if the user is a manager, the primary waiter, or a collaborator. If false, 403.
5. **Business rules**: the route checks the order isn't already Served/Cancelled (422 if so),
   loads the menu item and checks it's available (422 if not), validates quantity is a
   positive integer (400 if not).
6. **Write**: a new row is inserted into `order_lines`, snapshotting the menu item's current
   name and price. A corresponding row is inserted into `order_events` (`type:
   'line_added'`) in the same synchronous call — `better-sqlite3` is synchronous, so there's
   no risk of the event log and the line getting out of sync from a dropped async step.
7. **Response**: `201` with the new line's id.
8. **Client**: on success, re-fetches the order (`GET /api/orders/:id`) to show the updated
   line list and running total, and calls `onChanged()` so the alerts badge count refreshes
   too (adding a line doesn't change alert status directly, but this keeps the polling logic
   in one place rather than special-casing which actions need a refresh).

Every other write endpoint (status transitions, voiding, archiving, collaborators, notes)
follows this same shape: auth → authorization → business rule check → write + event log
entry → response. Reads follow auth → authorization → query → serialize.

## What I decided not to build
- **No websockets / live push.** Alerts and order status are polled (every 30s on the
  client) rather than pushed. For a single restaurant's order volume this is more than
  fast enough, and it avoids a whole second connection-management layer for a 12-hour
  budget. A kitchen-display stretch goal would be the natural point to revisit this.
- **No separate "tables" entity.** A table is just an integer typed on order creation, not
  a row with its own state (occupied/empty), seating capacity, etc. The brief only asks for
  table *number* identification and search, not table management.
- **No image/menu-photo storage, no payments/checkout.** Out of scope per the ten goals.
- **No refresh-token rotation.** JWTs are long-lived (7 days) and there's no revocation
  list. Fine for a take-home; a real deployment would want short-lived access tokens plus
  refresh tokens or session revocation.
- **No ORM.** Raw SQL via `better-sqlite3` prepared statements. See decisions.md.
