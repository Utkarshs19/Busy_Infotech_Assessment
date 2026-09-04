# Restaurant Orders — "The Corkboard"

A restaurant order-management system replacing paper tickets and a corkboard. See
`docs/architecture.md`, `docs/schema.md`, `docs/decisions.md`, `docs/plan.md`, and
`docs/ai-prompts.md` for the full write-up, and `SUBMISSION.md` for demo credentials and
hosting status.

## Run locally

### 1. Server
```bash
cd server
npm install
cp .env.example .env
npm run seed    # creates data.sqlite with demo data
npm start       # listens on :4000
```

### 2. Client
```bash
cd client
npm install
cp .env.example .env   # only needed if server isn't on localhost:4000
npm run dev             # listens on :5173, proxies /api to the server
```

Then open http://localhost:5173 and sign in with one of the demo accounts listed in
`SUBMISSION.md`.

## Stack
- **Server:** Node.js, Express, `better-sqlite3` (raw SQL, no ORM — see `docs/decisions.md`)
- **Client:** React (Vite), `react-router-dom`, `recharts`
- **Auth:** JWT bearer tokens, bcrypt password hashing
