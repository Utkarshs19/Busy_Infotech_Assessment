# Submission

## Repository
https://github.com/Utkarshs19/Busy_Infotech_Assessment

## Live URL
Frontend (Vercel): fill in your actual Vercel URL here, e.g.
`https://busy-infotech-assessment.vercel.app`

Backend API (Render): fill in your actual Render URL here, e.g.
`https://busy-infotech-assessment.onrender.com`

## Demo credentials
All accounts use password `password123`.

| Role | Email |
|---|---|
| Manager | manager@demo.com |
| Waiter | alice@demo.com |
| Waiter | ben@demo.com |

Seed data (`server/src/seed.js`) creates 3 users, 10 menu items (one deliberately marked
unavailable), and orders covering every lifecycle state including one that will show up in
the Alerts view immediately, one with a voided line and a collaborator, and ~14 days of
served-order history for the dashboard chart.

## Hosting status

Deployed as two services, per the brief's suggested split:
- **Server** — Node/Express on Render's free tier, root directory `server/`.
- **Client** — React/Vite static build on Vercel's free tier, root directory `client/`,
  with `VITE_API_URL` pointed at the Render service's `/api` path.

**Render's free tier notes, worth knowing before you look at this:**
1. **It sleeps after inactivity.** The first request after a period of no traffic can take
   30–60 seconds to respond while the instance wakes up — a slow first load isn't a broken
   deployment.
2. **Its filesystem is ephemeral.** The SQLite database file is wiped on every redeploy and
   on every restart after the service sleeps. There's also no Shell access on the free
   tier, so there'd be no way to manually re-run a seed script after that happened.
   To handle this, the server checks on every boot whether the database is empty and
   seeds it automatically if so (`server/src/index.js`) — so a fresh deploy or a post-sleep
   cold start is always immediately usable with the demo accounts above, with no manual
   step required. Existing data (orders a manager already created) is left alone on a
   restart where the database already has users in it.

## Known limitations
- JWTs are long-lived (7 days) with no revocation list — acceptable for a demo, not for
  production (see `docs/decisions.md` #2).
- The table-number search uses a `LIKE` that can't use an index — fine at demo scale, flagged
  in `docs/schema.md`'s "what breaks at 100x" section.
- No automated test suite — verification was done via manual `curl` smoke tests during
  development (see `docs/plan.md`), not a committed test file. Given more time this would
  be the first gap I'd close.
- Render's free-tier ephemeral disk (see above) means this isn't how a real production
  deployment would be set up — a persistent volume or a managed database (e.g. the
  Supabase/Postgres path the brief also suggests) would be the actual next step.
