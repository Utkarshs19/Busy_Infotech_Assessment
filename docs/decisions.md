# Decisions

## 1. SQLite via `better-sqlite3`, not Postgres/Prisma (reversed once)

**What happened:** I started with Prisma + SQLite, since Prisma's DX is good and it would
have let me generate a typed client quickly. Prisma needs to download a query-engine
binary from `binaries.prisma.sh` on first run, and that domain isn't reachable from my
sandboxed dev environment (network egress is allow-listed to a specific set of domains for
package registries and GitHub). `prisma --version` failed with a 403 from that binary host.

**What I chose instead:** `better-sqlite3`, a synchronous, dependency-light SQLite driver
whose prebuilt native binary comes from GitHub releases — a domain that *was* reachable.
I wrote schema and queries as raw SQL (`server/src/db/schema.sql`) instead of through an
ORM.

**Trade-off:** I lose Prisma's generated types and migration tooling. I gain: zero external
dependency at boot time (the whole app runs from `npm install` + a local file, no network
calls needed to start the database layer), a schema I can read and change without an ORM
between me and the actual SQL, and — for a reviewer trying to run this from a fresh clone —
one less thing that can fail from network conditions the way it did for me. This is the one
decision I reversed mid-build, and I'm noting it here rather than editing history because
that reversal *is* the interesting decision, not the dead end.

**What I'd change at scale:** SQLite is single-writer; a real multi-location or high-order-
volume deployment should move to Postgres. Because the SQL is hand-written rather than
behind an ORM abstraction, that migration means rewriting queries, not just swapping a
connection string — a cost I accepted for this submission's timeline.

## 2. JWT in `localStorage`, not httpOnly cookies

**What I chose:** the client stores the JWT in `localStorage` and sends it as an
`Authorization: Bearer` header.

**What I rejected:** httpOnly cookies, which are the safer default against XSS token theft.

**Why:** the client and server are two separately deployed static/API hosts (see
architecture.md), which makes cookie-based auth cross-origin and requires `SameSite=None;
Secure` plus CORS credential handling on every request. For a scored take-home with a
15-minute deploy budget, bearer-token-in-header is simpler to get working correctly across
two free-tier hosts, and the CSV export endpoint's need for a query-string token (since a
plain `<a href>` download can't set a header) already meant the API had to accept the token
two ways regardless. In a production system handling real payment or personal data I'd
prioritize httpOnly cookies and accept the deployment complexity.

## 3. One polymorphic `order_events` table, not five separate history tables

**What I chose:** a single `order_events` table with a `type` column and several nullable
fields, rather than `status_changes`, `line_events`, `notes`, and `collaborator_events` as
separate tables.

**Why:** goal 9 asks for "a timeline showing every status change ... every line added or
voided ... and any notes" as one unified view. A single table means the timeline query is
one `ORDER BY created_at` with no `UNION`, and a new event type (if I'd added one) is one
new `type` value rather than a new table and a new branch in the timeline-fetching code.
The cost is a table with several always-null columns depending on `type` — acceptable at
this scale, and documented in schema.md as a place that would need normalizing if event
diversity grew a lot (e.g. many more actor types or event-specific metadata).

## 4. Price snapshots on order lines, not live joins to `menu_items`

**What I chose:** every `order_line` stores its own copy of the item's name and price at
the moment it was added, rather than joining to `menu_items` for current values.

**Why:** this is close to non-negotiable given goal 3's exact wording ("running total,
calculated by the server from the menu items' current prices at the time each line was
added"), but it's worth stating as a deliberate choice because it also solves a second
problem for free: if a manager archives or renames a menu item, every past order's history
stays intact and readable, which goal 9 ("history you cannot rewrite") also implicitly
requires. The alternative (live join) would make a manager's price-fixing action silently
rewrite yesterday's revenue numbers.

## 5. Table-number search is a `LIKE` on a cast integer column, not a dedicated tables table

**What I chose:** `CAST(table_number AS TEXT) LIKE '%q%'` for the search box, and no
separate `tables` entity with its own primary key.

**What I rejected:** modeling tables as first-class rows (with capacity, status, etc.).

**Why:** the brief's goal 6 asks for "a text search over the table number" — nothing more —
and goal 1-10 never asks for table capacity, reservations, or table state beyond what an
order references. Building a `tables` table would be solving a problem the brief didn't
ask for, at the cost of time better spent on the ten required goals. I documented the
performance cost of this choice (a leading-wildcard `LIKE` can't use a b-tree index) in
schema.md's "what breaks at 100x" section rather than pretending it's free.

## 6. Alerts re-trigger a fixed interval after acknowledgment, not on the next poll

**What I chose:** acknowledging an alert stores `alert_acknowledged_at`; the alert
reappears once `ALERT_REPEAT_MINUTES` have passed since that acknowledgment, not simply
"the next time the order is still open" (which would make it reappear almost immediately
given 30-second polling).

**Why:** goal 10 says "if the order is still not Ready a further set number of minutes
later, the alert returns" — the "further set number of minutes" language specifically
implies a second timer starting from acknowledgment, not from the original placed time.
I made this an explicit, separately-configurable value (`ALERT_REPEAT_MINUTES`, default 10)
from the initial slow-order threshold (`ALERT_THRESHOLD_MINUTES`, default 20) since the
brief describes them as two different "set number of minutes."
