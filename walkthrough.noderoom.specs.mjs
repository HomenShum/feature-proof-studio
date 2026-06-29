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
    title: "NodeRoom · a shared diligence room + a NodeAgent",
    accent: "#8b5cf6",
    vw: 1280, vh: 800,
    retries: 2,
    // Memory mode (offline, deterministic, no keys). Entry is now the public landing surface →
    // `start-demo-room` seeds a full diligence room; `@nodeagent diligence CardioNova` runs a
    // SCRIPTED research pass that locks the CardioNova row, fills it (status -> complete), and
    // releases the lock — the signature human+agent no-clobber story, end to end.
    panes: [{ label: "NodeRoom — memory mode (offline, deterministic)", url: "https://noderoom.live/?mode=memory" }],
    steps: [
      // 0) The public landing surface
      { act: "sleep", pane: 0, ms: 2600 },
      { cap: "Bring people and agents into the same room", cursor: "testid:start-demo-room", cursorPane: 0, click: true, hold: 70 },
      // 1) Enter the seeded diligence room, dismiss the welcome tour
      { act: "click", pane: 0, sel: "testid:start-demo-room" },
      { act: "sleep", pane: 0, ms: 3800 },
      { act: "click", pane: 0, sel: "testid:tour-skip" },
      { act: "sleep", pane: 0, ms: 1000 },
      { cap: "A shared diligence room — people + NodeAgents on the same artifacts", hold: 84 },
      // 2) Ask the Room NodeAgent
      { act: "type", pane: 0, sel: "testid:chat-composer", value: "@nodeagent diligence CardioNova", delay: 24 },
      { cap: "Ask the Room NodeAgent to run diligence on CardioNova", cursor: "testid:chat-send", cursorPane: 0, click: true, zoom: "testid:chat-feed", zoomScale: 1.5, hold: 56 },
      { act: "click", pane: 0, sel: "testid:chat-send" },
      { act: "sleep", pane: 0, ms: 700 },
      // 3) Burst — the agent locks the row, researches, and fills it live
      { cap: "It locks the row, researches, and fills it — no clobber", burst: { ms: 5200, every: 320 }, zoom: "testid:artifact-panel", zoomScale: 1.45, hold: 110 },
      { act: "sleep", pane: 0, ms: 900 },
      // 4) Result — CardioNova complete, two sources, lock released
      { cap: "CardioNova → complete: structured fields, two sources, lock released", zoom: "testid:artifact-panel", zoomScale: 1.45, hold: 96 },
    ],
  },
  {
    id: "NRsync",
    title: "NodeRoom · live sync + a server-led agent",
    accent: "#34d399",
    vw: 1280, vh: 800,
    retries: 1,
    panes: [
      { label: "Client A", url: "https://noderoom.live/" },
      { label: "Client B", url: "https://noderoom.live/" },
    ],
    steps: [
      { act: "sleep", pane: 0, ms: 4000 },
      { act: "key", pane: 0, value: "Escape" },
      { act: "key", pane: 1, value: "Escape" },
      { act: "sleep", pane: 0, ms: 1000 },
      { cap: "Two clients, one shared NodeRoom", hold: 74 },

      // Beat 1 — a human message syncs A -> B; zoom to the chat feed so it's legible at 2-up.
      { act: "type", pane: 0, sel: "testid:chat-composer", value: "Hi from Client A", delay: 28 },
      { cap: "Client A sends a message", cursor: "testid:chat-send", cursorPane: 0, click: true, hold: 50 },
      { act: "click", pane: 0, sel: "testid:chat-send" },
      { act: "sleep", pane: 1, ms: 150 },
      { cap: "It lands in Client B instantly — no refresh", burst: { ms: 3000, every: 300 }, zoom: "testid:chat-feed", zoomScale: 1.65, hold: 88 },
      { act: "waitText", pane: 1, value: "Hi from Client A" },

      // Beat 2 — the REAL Room NodeAgent (server-led, real LLM): Client A runs /ask; the agent
      // locks cells + edits the shared sheet and its work broadcasts to BOTH clients at once.
      { act: "type", pane: 0, sel: "testid:chat-composer", value: "/ask reconcile Q3 revenue", delay: 20 },
      { cap: "Client A asks the Room NodeAgent to reconcile Q3", cursor: "testid:chat-send", cursorPane: 0, click: true, zoom: "testid:chat-feed", zoomScale: 1.65, hold: 54 },
      { act: "click", pane: 0, sel: "testid:chat-send" },
      { act: "sleep", pane: 0, ms: 2600 },
      { cap: "The agent locks cells and fills the variance — live, on BOTH clients", burst: { ms: 9000, every: 450 }, zoom: "testid:artifact-panel", zoomScale: 1.6, hold: 120 },
      { act: "sleep", pane: 0, ms: 2400 },
      { cap: "One server-led agent, broadcast to every client", zoom: "testid:artifact-panel", zoomScale: 1.6, hold: 90 },
    ],
  },

  // FRESH SEEDED ROOM — Client A creates a brand-new room (?create seeds a Q3 sheet with an EMPTY
  // variance column); Client B joins it. /ask reconcile then FILLS the empty variance live on both
  // — the dramatic empty->filled reveal the crowded shared room can't show. `__RUNID__` => a unique
  // room code per run/attempt (always a fresh, empty room); navDelay staggers create-then-join.
  {
    id: "NRfresh",
    title: "NodeRoom · a fresh room, reconciled by the agent",
    accent: "#f59e0b",
    vw: 1280, vh: 800,
    retries: 1,
    panes: [
      { label: "Client A (host)", url: "https://noderoom.live/?create=__RUNID__&name=Client+A" },
      { label: "Client B", url: "https://noderoom.live/?room=__RUNID__&name=Client+B", navDelay: 5200 },
    ],
    steps: [
      { act: "sleep", pane: 0, ms: 1500 },
      { act: "key", pane: 0, value: "Escape" },
      { act: "key", pane: 1, value: "Escape" },
      { act: "sleep", pane: 0, ms: 1200 },
      { cap: "A brand-new room — two clients, a fresh Q3 sheet", hold: 76 },
      { cap: "The variance column starts empty", zoom: "testid:artifact-panel", zoomScale: 1.55, hold: 84 },

      { act: "type", pane: 0, sel: "testid:chat-composer", value: "/ask reconcile Q3 revenue", delay: 20 },
      { cap: "Client A asks the Room NodeAgent to reconcile", cursor: "testid:chat-send", cursorPane: 0, click: true, zoom: "testid:chat-feed", zoomScale: 1.65, hold: 54 },
      { act: "click", pane: 0, sel: "testid:chat-send" },
      { act: "sleep", pane: 0, ms: 2600 },
      { cap: "The agent fills the empty variance — live, on BOTH clients", burst: { ms: 10000, every: 450 }, zoom: "testid:artifact-panel", zoomScale: 1.55, hold: 130 },
      { act: "waitText", pane: 0, value: "released", timeout: 30000 },
      { act: "sleep", pane: 0, ms: 1500 },
      { cap: "Empty → reconciled, broadcast to every client", zoom: "testid:artifact-panel", zoomScale: 1.55, hold: 94 },
    ],
  },

  // DEEP-DIVE FAN-OUT — single pane on the local dev server. Shows the full arc:
  // enriched companies (status=complete) → @nodeagent deep dive → agent spawns child
  // frames for per-founder research, events, contacts → deep-dive columns fill in.
  {
    id: "NRdeepDive",
    title: "NodeRoom · deep-dive fan-out: events, people & contacts",
    accent: "#f97316",
    vw: 1280, vh: 800,
    retries: 2,
    panes: [{ label: "NodeRoom — live dev room with enriched companies", url: "http://localhost:5260/?room=XQP3HUB0&name=Homen" }],
    steps: [
      { act: "sleep", pane: 0, ms: 4000 },
      { act: "key", pane: 0, value: "Escape" },
      { act: "sleep", pane: 0, ms: 1500 },
      // 1) Show the enriched sheet — companies with status "complete"
      { cap: "Enriched companies — research complete, ready for deep dive", zoom: "testid:artifact-panel", zoomScale: 1.4, hold: 90 },

      // 2) Type the deep-dive command
      { act: "type", pane: 0, sel: "testid:chat-composer", value: "@nodeagent deep dive Mercury", delay: 22 },
      { cap: "Ask the agent to deep-dive a completed company", cursor: "testid:chat-send", cursorPane: 0, click: true, zoom: "testid:chat-feed", zoomScale: 1.5, hold: 56 },
      { act: "click", pane: 0, sel: "testid:chat-send" },

      // 3) Agent starts working — burst capture the streaming
      { act: "sleep", pane: 0, ms: 3000 },
      { cap: "The agent researches events, founders, and possible contacts", burst: { ms: 12000, every: 500 }, zoom: "testid:chat-feed", zoomScale: 1.5, hold: 140 },

      // 4) Show the deep-dive columns filling in
      { act: "sleep", pane: 0, ms: 2000 },
      { cap: "Deep-dive columns: team background, events, founder profiles, contacts", zoom: "testid:artifact-panel", zoomScale: 1.45, hold: 100 },

      // 5) Final state — the sheet with deep-dive data
      { act: "sleep", pane: 0, ms: 1500 },
      { cap: "Per-founder research, outreach topics, and possible contacts — all source-backed", zoom: "testid:artifact-panel", zoomScale: 1.4, hold: 94 },
    ],
  },
];
