// EXAMPLE multi-pane (2-up) collab spec — drives the local demo app to TELL a
// cross-client-sync story: an action in Client A appears live in Client B, and a
// server-led agent streams into BOTH clients at once.
//
// Each spec is { id, title, accent, panes: [{ label, url }, ...], steps: [...] }.
// Ops (see resolver + op model in walkthrough.collab.mjs):
//   { cap, caption?, cursor?, cursorPane?, click?, burst?, hold? }
//        -> CAPTURE all panes at one instant. `cursor` (a selector) marks where the pointer
//           sits on the ACTING pane (defaults to the pane of the most recent `act`, or set
//           `cursorPane`). `burst:{ms,every}` captures a rapid sequence per pane so sync
//           motion is visible. `caption` defaults to `cap` if omitted.
//   { act, pane, ... }  -> PERFORM an action on ONE pane's page (fill/type/click/sleep/waitText/...).
//
// Selectors: "testid:add-btn" | "btn:Name" | "text:Foo" | raw css.
//
// The demo app is expected to serve a shared collaborative board at :8930 and key each
// client off the ?user= query param. Adjust testids/URLs to match your app.
export const COLLAB_SPECS = [
  {
    id: "LiveSync",
    title: "Live Collaboration",
    accent: "#10b981",
    panes: [
      { label: "Client A", url: "http://127.0.0.1:8930/?user=A" },
      { label: "Client B", url: "http://127.0.0.1:8930/?user=B" },
    ],
    steps: [
      // 1) Both clients are looking at the same shared board.
      { act: "sleep", pane: 0, ms: 600 },
      { cap: "Two clients, one shared board", hold: 70 },

      // 2) Client A composes a new card and adds it.
      { act: "fill", pane: 0, sel: "testid:add-input", value: "Ship the collab demo" },
      { cap: "Client A types a new card", cursor: "testid:add-input", cursorPane: 0, hold: 60 },
      { cap: "Client A clicks Add", cursor: "testid:add-btn", cursorPane: 0, click: true, hold: 54 },
      { act: "click", pane: 0, sel: "testid:add-btn" },

      // 3) The card paints INSTANTLY in A, then syncs into B — captured as a burst on BOTH panes.
      { act: "sleep", pane: 1, ms: 120 },
      { cap: "Client A adds a card → Client B sees it live", burst: { ms: 2600, every: 260 }, cursor: "testid:add-btn", cursorPane: 0, hold: 84 },

      // 4) Settled: both boards now show the same card.
      { act: "waitText", pane: 1, value: "Ship the collab demo" },
      { cap: "Synced — both clients agree", hold: 78 },

      // 5) Client A triggers the server-led agent.
      { cap: "Client A asks the agent to act", cursor: "testid:agent-btn", cursorPane: 0, click: true, hold: 56 },
      { act: "click", pane: 0, sel: "testid:agent-btn" },
      { act: "sleep", pane: 0, ms: 300 },

      // 6) The agent card locks and its text STREAMS into BOTH panes at once.
      { cap: "Server-led agent streams to every client", burst: { ms: 3200, every: 300 }, cursor: "testid:agent-btn", cursorPane: 0, hold: 90 },

      // 7) Done: identical end state across clients.
      { act: "sleep", pane: 0, ms: 400 },
      { cap: "Every client converges on the same state", hold: 96 },
    ],
  },
];
