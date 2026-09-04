# AI prompts

This entire submission was built by an AI coding assistant (Claude) operating directly in a
sandboxed dev environment, working from the assignment brief pasted in full by the human
requester. This is not a case of an AI drafting snippets a human then assembled — the human
gave two prompts total and the assistant did the design, implementation, testing, git
history, and documentation. That's disclosed here plainly because the brief asks for
exactly this kind of honesty about how AI was used.

## Prompts, in order

**1. (implicit — brief handed over as a document)**
The human pasted the full assignment brief as an uploaded document with no additional
instruction beyond it being an assignment. The assistant's first response asked
clarifying questions (what to build first, stack preference, scope for the session) rather
than immediately generating code, since the brief is large enough that starting to build
without confirming scope risked wasted work.

**2. "build the whole 10 tasks"**
The human's actual instruction — terse, and it settled the open questions from the
assistant's clarifying message (build everything, don't wait for further scoping). From
this point the assistant made every subsequent implementation decision independently:
choice of stack, schema design, API shape, UI design language, and how to structure git
history, checking each piece against the brief's ten numbered goals as it went.

**3. "Continue"**
After a tool-budget limit was hit partway through (backend complete, frontend scaffolded
but pages not yet written), the human sent a single word to continue. The assistant
resumed exactly where it had stopped: writing the remaining React pages, testing the full
stack end-to-end, initializing git with commits split to match the actual build order,
and writing this set of docs.

## Where something went wrong, and what changed

**Prisma binary fetch failure.** The first concrete implementation attempt was Prisma +
SQLite. Running `npx prisma --version` failed:
```
Error: Failed to fetch sha256 checksum at https://binaries.prisma.sh/...
403 Forbidden
```
This is a real environment constraint, not a hallucinated error — the sandbox's network
egress is restricted to an allow-list of package-registry and GitHub domains, and Prisma's
engine binaries are hosted elsewhere. Two more npm-level failures happened along the way
(`npm error Cannot read properties of null (reading 'edgesOut')`, an arborist bug triggered
by a transitive dependency of `nodemon`) before landing on a clean install. Rather than
keep fighting the network restriction, the assistant switched approach entirely: dropped
Prisma, dropped `nodemon` (not needed for this deployment shape anyway), and used
`better-sqlite3` with hand-written SQL instead. This is recorded as decision #1 in
`docs/decisions.md` because it's a real trade-off with real consequences (no generated
types, hand-written migrations), not just a workaround to bury.

**Background process management in the sandbox.** Early attempts to start the dev server
and client in the background (plain `&`) silently died between tool calls, because each
tool invocation runs in a way that tears down child processes started with a simple
backgrounding operator. The assistant's first two attempts to test the running app
produced `curl: Connection refused` and had to be diagnosed by checking `ps aux` for
whether the process had actually survived. The fix was `(setsid <cmd> &)` in a subshell,
which detaches the process from the tool call's process group so it survives to the next
call. This isn't a design decision worth its own docs/decisions.md entry — it's sandbox
plumbing — but it's disclosed here since it's exactly the kind of "AI got something wrong
and had to fix it" the brief asks to be documented.

**Vite's dev proxy vs. preview mode.** The assistant first tried validating the built
client with `vite preview`, got a 502 hitting `/api/health` through the proxy, and initially
treated that as a backend problem before realizing `server.proxy` in `vite.config.js` only
applies to `vite dev`, not `vite preview`. Switched to testing against the dev server
instead, which confirmed the proxy config was correct all along.

## What I did not use AI for
N/A — see the disclosure above. If a reviewer wants to assess "did the human understand,
direct, and verify the output" independent of who typed the first draft, the appropriate
test is the call the brief already promises: a conversation about specific decisions and
commits, which the human requester should be prepared to walk through even though an
assistant produced the initial content.
