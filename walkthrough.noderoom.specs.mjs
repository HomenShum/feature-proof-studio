// Real-world example: capture the LIVE deployed NodeRoom (a Convex + React live-collab
// app) — github.com/HomenShum/noderoom. Two walkthroughs:
//   NRsolo — memory mode (deterministic, offline, no keys): the signature human+agent
//            no-clobber "Run collaboration" (lock -> draft -> smart-merge), single pane.
//   NRsync — LIVE shared room: two clients, a chat message synced window->window via
//            Convex reactivity (no /ask, so no LLM cost — just cheap Convex writes).
// NodeRoom is a dense full app, so capture at a taller viewport (vh:800) and DON'T crop.
export const NODEROOM_SPECS = [
  {
    id: "NRsolo",
    title: "NodeRoom · human + agent, no clobber",
    accent: "#8b5cf6",
    vw: 1280, vh: 800,
    retries: 1,
    panes: [{ label: "NodeRoom — memory mode (offline, deterministic)", url: "https://noderoom.live/?mode=memory" }],
    steps: [
      { act: "click", pane: 0, sel: "btn:Enter the Q3" },
      { act: "sleep", pane: 0, ms: 3800 },
      { act: "key", pane: 0, value: "Escape" },
      { act: "sleep", pane: 0, ms: 1000 },
      { cap: "A shared room — humans + a NodeAgent on one spreadsheet", hold: 80 },
      { cap: "Run collaboration — a human and the agent edit at once", cursor: "testid:collab-run", cursorPane: 0, click: true, hold: 58 },
      { act: "click", pane: 0, sel: "testid:collab-run" },
      { act: "sleep", pane: 0, ms: 700 },
      { cap: "The agent locks a cell, drafts, then smart-merges — no clobber", burst: { ms: 4200, every: 320 }, cursor: "testid:collab-run", cursorPane: 0, hold: 100 },
      { act: "sleep", pane: 0, ms: 600 },
      { cap: "Every change — human or agent — lands in the audit trace", hold: 92 },
    ],
  },
  {
    id: "NRsync",
    title: "NodeRoom · live cross-client sync",
    accent: "#34d399",
    vw: 1280, vh: 800,
    retries: 1,
    panes: [
      { label: "Client A", url: "https://noderoom.live/" },
      { label: "Client B", url: "https://noderoom.live/" },
    ],
    steps: [
      { act: "sleep", pane: 0, ms: 3800 },
      { act: "key", pane: 0, value: "Escape" },
      { act: "key", pane: 1, value: "Escape" },
      { act: "sleep", pane: 0, ms: 1000 },
      { cap: "Two clients, one shared NodeRoom", hold: 76 },

      { act: "type", pane: 0, sel: "testid:chat-composer", value: "Hi from Client A", delay: 30 },
      { cap: "Client A types a message", cursor: "testid:chat-composer", cursorPane: 0, hold: 52 },
      { cap: "Client A sends it", cursor: "testid:chat-send", cursorPane: 0, click: true, hold: 52 },
      { act: "click", pane: 0, sel: "testid:chat-send" },

      { act: "sleep", pane: 1, ms: 150 },
      { cap: "Client A posts → Client B sees it live (Convex reactivity)", burst: { ms: 3200, every: 280 }, cursor: "testid:chat-send", cursorPane: 0, hold: 90 },

      { act: "waitText", pane: 1, value: "Hi from Client A" },
      { cap: "Synced across clients — no refresh", hold: 78 },

      { act: "type", pane: 1, sel: "testid:chat-composer", value: "And Client B replies", delay: 30 },
      { cap: "Client B replies", cursor: "testid:chat-send", cursorPane: 1, click: true, hold: 52 },
      { act: "click", pane: 1, sel: "testid:chat-send" },
      { act: "sleep", pane: 0, ms: 150 },
      { cap: "Both directions sync instantly — one shared backend", burst: { ms: 2800, every: 280 }, cursor: "testid:chat-send", cursorPane: 1, hold: 86 },

      { act: "sleep", pane: 0, ms: 400 },
      { cap: "Every client converges on the same room", hold: 82 },
    ],
  },
];
