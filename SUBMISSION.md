# Submission

## Repository
Not yet pushed to a public GitHub remote from this environment — see "Hosting status" below.
The local git history (`git log`) reflects the actual incremental build order: schema →
auth → menu → lifecycle → orders → dashboard → seed, then client scaffold → api/auth
context → styles → app shell → each page in the order a waiter would touch them.

## Live URL
Not deployed yet — see "Hosting status" below for exactly what's needed and why it wasn't
completed in this environment.

## Demo credentials
All accounts use password `password123`.

| Role | Email |
|---|---|
| Manager | manager@demo.com |
| Waiter | alice@demo.com |
| Waiter | ben@demo.com |

Seed data (`server/src/seed.js`) creates 3 users, 7 menu items (one deliberately marked
unavailable), and orders covering every lifecycle state including one that will show up in
the Alerts view immediately, one with a voided line and a collaborator, and ~14 days of
served-order history for the dashboard chart.

## Hosting status

**This was not deployed to a public URL.** The environment this was built in is a sandboxed
container with network egress restricted to an allow-list of package-registry domains
(npm, GitHub, PyPI, crates.io, etc.) — it does not have outbound access to Render, Vercel,
Supabase, or general internet hosts, and has no ability to authenticate to those services'
dashboards on the requester's behalf even if it could reach them.

What exists and is ready to deploy exactly as the brief's suggested path describes:

1. **Database** — SQLite file, zero setup. For the suggested free-tier path (Supabase =
   Postgres), the schema in `server/src/db/schema.sql` would need its SQLite-specific
   syntax (`AUTOINCREMENT`, `datetime('now')`) translated to Postgres equivalents — a
   small, mechanical change, not a redesign, since the table/column/constraint shape is
   already relational and portable in intent.
2. **Server** — `server/`, a standard Express app reading `PORT`, `JWT_SECRET`, and
   `DATABASE_FILE` from environment variables (see `server/.env.example`). Deploys to
   Render (or any Node host) with `npm install && npm run seed && npm start`.
3. **Client** — `client/`, a standard Vite app reading `VITE_API_URL` at build time (see
   `client/.env.example`). Deploys to Vercel/Netlify with `npm run build`, output in
   `client/dist`.

To actually complete this step: run `npm install` in both `server/` and `client/`, push
this repository to GitHub, then follow the three steps above on whichever free host is
chosen. I've verified locally that the server starts cleanly, the seed script populates
realistic data, the client builds without errors, and the full stack works together
end-to-end through Vite's dev proxy — the only missing piece is the actual account-level
deployment action, which requires credentials this environment doesn't have.

## Known limitations
- JWTs are long-lived (7 days) with no revocation list — acceptable for a demo, not for
  production (see `docs/decisions.md` #2).
- The table-number search uses a `LIKE` that can't use an index — fine at demo scale, flagged
  in `docs/schema.md`'s "what breaks at 100x" section.
- No automated test suite — verification was done via manual `curl` smoke tests during
  development (see `docs/plan.md`), not a committed test file. Given more time this would
  be the first gap I'd close.
