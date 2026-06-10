# convex-reference — the collab-demo, built for real

This is the **production reference** for the local collab-demo that
[`STACK_GUIDELINES.md`](../../STACK_GUIDELINES.md) describes for the **Convex +
React** stack. The local demo is a lightweight, dependency-free mock used to
*capture* the walkthrough GIF without a backend login; **this** package is the
1:1 real implementation, using the **latest Convex React SDK patterns**.

> It is a *reference* — **not run during capture** (it needs a Convex
> deployment login). Use it to verify the captured demo is faithful, or as a
> drop-in starting point for the real thing.

The app is a shared sticky-note **Collab Board**: any client can add a card, a
button kicks off a server-led agent, and a presence strip shows who's online.
Open it in two browser windows side by side and every change in one appears
**live** in the other — that cross-client reactivity is the whole point of the
stack (and the thing the multi-pane GIF films).

## What it demonstrates (the three filmed behaviours)

| Behaviour (filmed in the GIF) | In the **local collab-demo** | The **Convex primitive** that does it for real |
|---|---|---|
| **Reactive broadcast** — a change in Client A appears live in Client B, no refresh | both panes share one in-memory store; a write re-renders both | [`useQuery(api.board.list)`](src/App.tsx) — a live WebSocket subscription; any write to `cards` (in [`board.ts`](convex/board.ts)) re-runs `list` and pushes the new array to **every** subscribed client |
| **Optimistic paint → atomic swap** (zero flicker) | the new card is pushed into the local array instantly, then "confirmed" | [`useMutation(api.board.addCard).withOptimisticUpdate(...)`](src/App.tsx) paints a temp card at 0 ms with a `crypto.randomUUID()` id, inserted at the **top** (mirrors the SDK `insertAtTop` helper); the server commit swaps temp→real in one microtask |
| **Server-led agent stream**, broadcast to everyone | a timer appends chunks to the shared store; both panes see the lock + text grow | [`runAgent` action](convex/board.ts) → `ctx.scheduler.runAfter(0, internal.board.agentStep, …)` → [`agentStep` internalMutation](convex/board.ts) locks the card, appends one chunk, **reschedules itself**, then clears the lock on the final step. Each commit re-broadcasts via everyone's `list` subscription |
| **Presence / locks** | a list of fake collaborators + a "🔒 Locked" flag | [`heartbeat` mutation](convex/board.ts) upserts a `presence` row; `listPresence` is reactive, and `lockedBy` on a card renders a "🔒 Locked by …" badge that appears/clears in **all** panes |

### Why server-led (vs. SSE)

A client-led SSE stream (the Next.js stack) is visible only to the caller — a
second browser on the same board sees nothing until reload. Here the agent
commits each chunk through an `internalMutation`, so its output rides down
**every** client's `list` socket simultaneously. That is the contrast the
2-up walkthrough is built to show.

## Run it for real

**Prerequisites:** Node 18+, and a (free) Convex account for `npx convex dev`.

```bash
cd examples/convex-reference
npm install

# 1) Start the Convex backend. First run prompts you to log in / create a
#    project, pushes schema.ts + board.ts, generates convex/_generated/*,
#    and writes VITE_CONVEX_URL into .env.local. Leave this running.
npx convex dev

# 2) In a second terminal, start the Vite dev server:
npm run dev
```

Open **two** windows to see the multi-client effect:

- `http://localhost:5173/?name=ClientA`
- `http://localhost:5173/?name=ClientB`

Add a card in one — it appears instantly there (optimistic) **and** live in the
other (reactive). Hit **▶ Run agent** in either: a locked card appears in
**both**, text streams in token-by-token, and the lock clears for everyone on
the final chunk.

## Map to the capture tool

To film this with the walkthrough tool, use the **multi-pane** capture pattern
in [`STACK_GUIDELINES.md`](../../STACK_GUIDELINES.md) (two `browser.newContext()`
sessions, tiled, `burst` the reactive propagation). Caption the *cross-client*
effect — "Client B sees it instantly — no refresh" — not the click.

## Files

| File | Role |
|---|---|
| [`convex/schema.ts`](convex/schema.ts) | `cards` + `presence` tables (`defineSchema`) |
| [`convex/board.ts`](convex/board.ts) | `list` query · `addCard`/`heartbeat` mutations · `runAgent` action · `agentStep` internalMutation |
| [`src/App.tsx`](src/App.tsx) | the UI: `useQuery` board · `withOptimisticUpdate` add · Run-agent button · presence strip |
| [`src/main.tsx`](src/main.tsx) | `ConvexProvider` + React root |
| `convex.json`, `vite.config.ts`, `tsconfig.json`, `package.json` | scaffold |

No secrets are committed; `.env.local` (your deployment URL) is git-ignored and
written by `npx convex dev`.
