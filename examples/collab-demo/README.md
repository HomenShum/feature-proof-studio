# collab-demo — a zero-dependency local stand-in for the Convex reactive pattern

A tiny, **runnable, zero-npm-dependency** collaborative web app that faithfully
demonstrates the **Convex reactive runtime** — so the multi-pane demo GIF
([`STACK_GUIDELINES.md`](../../STACK_GUIDELINES.md) → *Convex + React*) can be
captured locally with **no cloud login**.

It mimics the four behaviours that make a Convex app worth filming in **two
panes side by side**:

1. **Server-led reactive sync.** State (cards + presence) lives on the server.
   Every client subscribes over **Server-Sent-Events** (the local stand-in for a
   Convex `useQuery` WebSocket subscription). Any mutation ends in a broadcast of
   the full state to **all** clients — so a change in pane **A** appears **live in
   pane B with no refresh**. (≈ `useQuery(api.x.list)`.)
2. **Optimistic update → atomic temp→real swap (zero flicker).** Adding a card
   paints it **instantly** with a temp `crypto.randomUUID()` id and a subtle
   "saving" style — before any network round-trip. The server then assigns the
   **real** id and broadcasts; the client reconciles temp→real **in the same
   render pass**, so the row simply *becomes real* with no flicker.
   (≈ `useMutation(...).withOptimisticUpdate(...)` overlay → authoritative base swap.)
3. **Presence & locks.** A header avatar row shows who's here (this pane
   highlighted). The agent card carries a **`🔒 Agent`** lock badge that appears
   and clears across **both** panes (≈ a lease-lock trace).
4. **Server-led agent, broadcast to everyone.** Clicking **Run agent** kicks off a
   **server-led** job that appends a locked card, then **streams** ~5 text chunks
   into it (~700 ms apart), broadcasting each step — so the agent's output lands
   **live in every pane** at once. (≈ a scheduled action / `internalMutation` +
   `optimisticallySendMessage` fanning out down every client's socket — contrast
   the old client-led SSE, which only Client 1 could see.)

## Run it (no install)

Requires only **Node 18+** (uses the built-in `EventSource`-compatible SSE,
`node:http`, `node:crypto`, `node:fs`). No `npm install`, no dependencies.

```bash
cd examples/collab-demo
node server.mjs
```

Then open **two browser windows** side by side:

- Pane A → http://localhost:8930/?user=A   (Ana, green)
- Pane B → http://localhost:8930/?user=B   (Ben, blue)

(`?user=C` → Cleo, pink, if you want a third pane.)

## What to capture (the multi-pane GIF)

Tile the two panes (A left, B right) and `burst`-capture while **both are
visible**:

- **Type + Add in A** → the card pops in A **instantly** with a "saving" pulse
  (optimistic), then settles (temp→real swap) **and appears in B live**.
- **Run agent** in either pane → the **`🔒 Agent`** card appears in **both** panes
  and text **streams** in, visible everywhere at once.

> Single-pane capture undersells this — the value is the **second pane reacting**.
> See [`STACK_GUIDELINES.md`](../../STACK_GUIDELINES.md) for the multi-pane recipe.

## Stable test/capture hooks

| Hook | What |
|---|---|
| `data-testid="add-input"` | the "Add a card" text input |
| `data-testid="add-btn"`   | the **Add** button |
| `data-testid="agent-btn"` | the **Run agent** button |
| `data-testid="presence"`  | the presence avatar row |
| `data-testid="card"` + `data-card-id="<id>"` | each card (id is temp then real) |

## Endpoints (server.mjs)

| Method · path | Purpose |
|---|---|
| `GET /` · `GET /index.html` | serve `public/index.html` |
| `GET /events?user=A` | SSE stream: pushes `{type:"state",cards,presence}` on connect **and on every state change** (the reactive broadcast) |
| `POST /mutate` `{op:"add"\|"edit", clientId, text, cardId?}` | mutate, assign a **real** server id, broadcast to all |
| `POST /presence` `{clientId, name, color}` | update presence, broadcast |
| `POST /agent` `{clientId}` | server-led streaming agent job (append locked card → stream chunks → clear lock), each step broadcast to all |

## How this maps to real Convex

This is a **stand-in**, not Convex. For the real, production code this pattern is
modelled on — `useQuery` subscriptions, `useMutation().withOptimisticUpdate` with
`insertAtTop`/`insertAtPosition`, `optimisticallySendMessage`, scheduled actions /
`internalMutation`, lease locks — see **[`../convex-reference`](../convex-reference)**.

The contract is identical in spirit: **server-led state, optimistic overlay →
atomic swap, live broadcast to every client, presence/locks, and a server-led
agent that streams to all panes** — just expressed with Node built-ins instead of
the Convex client so the GIF reproduces with zero setup.
