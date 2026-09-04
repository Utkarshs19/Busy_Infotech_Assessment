# Plan

## How I split the work

I worked in two large sessions rather than the suggested six ~2-hour sessions, because the
tool I built this with (an AI coding assistant, working directly in a sandboxed environment)
made context-switching between sessions costlier than working in longer continuous blocks.
I've kept the session boundaries below honest to how the work actually happened, and noted
in `docs/ai-prompts.md` exactly what was prompted at each step.

**Session 1 — backend foundation and all ten goals server-side**
1. Read the brief fully before writing anything; decided on stack (Express + SQLite +
   React) based on speed/confidence rather than novelty, per the brief's own guidance.
2. Attempted Prisma first; hit a network wall pulling its query-engine binary; switched to
   `better-sqlite3` and hand-written SQL (documented in decisions.md as the one reversal).
3. Wrote the schema first, before any route — state changes and audit history are the part
   of this system hardest to bolt on retroactively, so I wanted the shape settled early.
4. Built routes in dependency order: auth → menu (needed by orders) → the lifecycle state
   machine as its own small module (so it could be unit-testable in isolation, and so the
   transition rules exist in exactly one place) → orders (the largest file, combining
   goals 2–7 and 9–10) → dashboard (goal 8, last because it just aggregates data the other
   routes already produce).
5. Smoke-tested every goal's stated *rule*, not just the happy path, with curl: illegal
   transitions, cross-waiter permission checks, cancel-after-Preparing, bulk update with a
   deliberately-bad id mixed into a valid batch. Fixed nothing here — everything passed on
   the first pass, which is a signal I should treat cautiously; a reviewer with more time
   than I had would want to try to break the illegal-transition and authorization logic
   harder than I did here.

**Session 2 — frontend, git history, docs, deploy**
1. Scaffolded the client, then designed a small custom visual language (a "ticket rail"
   look) rather than defaulting to a generic dashboard-with-cards template, per the
   frontend-design guidance available to me.
2. Built pages in the order a waiter would actually touch them: login → dashboard →
   order list/search → order detail (by far the largest page, since it holds lines,
   lifecycle actions, void, collaborators, and the timeline) → menu management → alerts.
3. Verified the built client and running server together end-to-end with the dev proxy
   before considering the app done.
4. Went back through git history and made it match how the code was actually built
   (schema → auth → menu → lifecycle → orders → dashboard → seed, then the client in the
   same dependency order), rather than one final commit.
5. Wrote the five required docs files last, deliberately, so they'd describe what was
   actually built rather than what was planned before building it.

## What I estimated vs. what it actually took
I did not track hours against a plan the way a human candidate working across a week would;
this was built in continuous sessions rather than the suggested 2-hours-a-day cadence, so a
direct hour-for-hour estimate-vs-actual comparison would be artificial. The honest
equivalent: the backend (all ten goals' worth of rules and endpoints) took roughly as long
as the frontend did, which surprised me a little going in — I expected the UI, with five
pages and a custom design system, to be the larger share, but the *rules* (state machine,
authorization, bulk-action per-item reporting, alert re-trigger semantics) took longer to
get exactly right than the screens that expose them.

## What I cut
Nothing from the required ten goals was cut. What I did not build, and why, is the "what I
decided not to build" section of `docs/architecture.md` — websockets/live push, a separate
tables entity, refresh-token rotation, and any of the stretch ideas. Given more time, the
kitchen-display stretch goal is the one I'd pick first, since the alerts and status-
transition data already exist and a KDS is mostly a different view over data this system
already tracks.
