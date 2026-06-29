// Real-world example: capture the LIVE deployed NodeRoom (a Convex + React live-collab
// app) — github.com/HomenShum/noderoom. Two walkthroughs:
//   NRsolo — memory mode (deterministic, offline, no keys): the signature human+agent
//            no-clobber "Run collaboration" (lock -> draft -> smart-merge), single pane.
//   NRsync — LIVE shared room: two clients, a chat message synced window->window via
//            Convex reactivity (no /ask, so no LLM cost — just cheap Convex writes).
// NodeRoom is a dense full app, so capture at a taller viewport (vh:800) and DON'T crop.
export const NODEROOM_SPECS = [
  // HERO — the flagship "this is NodeRoom" walkthrough (top of the README). Distinct from the
  // single-feature clips below: it shows the WHOLE arc — a shared room → the agent does real work
  // (locks, researches, fills CardioNova) → AND every action is provable in the audit Trace
  // (verdict + attribution by evidence source). Memory mode, scripted, deterministic, no LLM.
  {
    id: "NRhero",
    title: "NodeRoom — people + agents in one room, every action proven",
    accent: "#8b5cf6",
    vw: 1280, vh: 800,
    retries: 2,
    panes: [{ label: "NodeRoom — memory mode (offline, deterministic)", url: "https://noderoom.live/?mode=memory" }],
    steps: [
      { act: "sleep", pane: 0, ms: 2600 },
      { cap: "Bring people and agents into the same room", cursor: "testid:start-demo-room", cursorPane: 0, click: true, hold: 64 },
      { act: "click", pane: 0, sel: "testid:start-demo-room" },
      { act: "sleep", pane: 0, ms: 3800 },
      { act: "click", pane: 0, sel: "testid:tour-skip" },
      { act: "sleep", pane: 0, ms: 900 },
      { cap: "A live diligence room — shared sheets, notes, and a NodeAgent", hold: 80 },
      { act: "type", pane: 0, sel: "testid:chat-composer", value: "@nodeagent diligence CardioNova", delay: 22 },
      { cap: "Ask the NodeAgent to run diligence on CardioNova", cursor: "testid:chat-send", cursorPane: 0, click: true, zoom: "testid:chat-feed", zoomScale: 1.5, hold: 50 },
      { act: "click", pane: 0, sel: "testid:chat-send" },
      { act: "sleep", pane: 0, ms: 700 },
      { cap: "It locks the row, researches, and fills it — no clobber", burst: { ms: 4800, every: 320 }, zoom: "testid:artifact-panel", zoomScale: 1.45, hold: 96 },
      { act: "sleep", pane: 0, ms: 700 },
      { cap: "CardioNova → complete: structured fields, two sources", zoom: "testid:artifact-panel", zoomScale: 1.45, hold: 68 },
      { act: "click", pane: 0, sel: "testid:trace-tab" },
      { act: "sleep", pane: 0, ms: 1600 },
      { cap: "And every agent action is provable — verdict, attribution, evidence", zoom: "testid:artifact-panel", zoomScale: 1.28, hold: 112 },
    ],
  },
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
    title: "NodeRoom · live sync across two clients",
    accent: "#34d399",
    vw: 1280, vh: 800,
    retries: 2,
    // Two INDEPENDENT clients in ONE room: pane 0 `?create=__RUNID__` mints a fresh room code,
    // pane 1 `?room=__RUNID__` joins it (navDelay staggers create-then-join). The sync is pure
    // Convex reactivity (a chat message A->B and B->A) — deterministic, no /ask, NO LLM cost.
    panes: [
      { label: "Client A · Maya (host)", url: "https://noderoom.live/?create=__RUNID__&name=Maya" },
      { label: "Client B · Sam", url: "https://noderoom.live/?room=__RUNID__&name=Sam", navDelay: 4200 },
    ],
    steps: [
      { act: "sleep", pane: 0, ms: 2200 },
      { act: "click", pane: 0, sel: "testid:tour-skip" },
      { act: "click", pane: 1, sel: "testid:tour-skip" },
      { act: "sleep", pane: 0, ms: 900 },
      { cap: "Two independent clients, one shared NodeRoom", hold: 76 },

      // A -> B: a human message in Client A appears live in Client B (no refresh).
      { act: "type", pane: 0, sel: "testid:chat-composer", value: "Maya: kicking off CardioNova diligence", delay: 22 },
      { cap: "Client A (Maya) sends a message", cursor: "testid:chat-send", cursorPane: 0, click: true, zoom: "testid:chat-feed", zoomScale: 1.6, hold: 50 },
      { act: "click", pane: 0, sel: "testid:chat-send" },
      { act: "sleep", pane: 1, ms: 150 },
      { cap: "It lands in Client B instantly — no refresh", burst: { ms: 3200, every: 300 }, zoom: "testid:chat-feed", zoomScale: 1.6, hold: 90 },
      { act: "waitText", pane: 1, value: "kicking off CardioNova" },

      // B -> A: Client B replies; it syncs straight back to Client A — live, both ways.
      { act: "type", pane: 1, sel: "testid:chat-composer", value: "Sam: on it — pulling the filings now", delay: 22 },
      { cap: "Client B (Sam) replies", cursor: "testid:chat-send", cursorPane: 1, click: true, zoom: "testid:chat-feed", zoomScale: 1.6, hold: 50 },
      { act: "click", pane: 1, sel: "testid:chat-send" },
      { act: "sleep", pane: 0, ms: 150 },
      { cap: "And straight back to Client A — live, both ways", burst: { ms: 3000, every: 300 }, zoom: "testid:chat-feed", zoomScale: 1.6, hold: 92 },
      { act: "waitText", pane: 0, value: "pulling the filings" },

      { cap: "One shared room — every message, every client, in real time", zoom: "testid:chat-feed", zoomScale: 1.5, hold: 88 },
    ],
  },

  // THE BULK BATCH — the room's own narrative is "CardioNova first, then the bulk batch". NRsolo does
  // the one company; this does the rest: open Company research (every company `pending`), then ONE
  // `@nodeagent enrich companies` researches all five at once → pending->complete across the batch.
  // Scripted in memory mode (deterministic, no LLM). (The redesign made `?create` rooms BLANK — no
  // seeded Q3 sheet — so the old 2-pane "fresh empty Q3" premise isn't reproducible; this is the
  // faithful, deterministic successor of the empty->filled reveal.)
  {
    id: "NRfresh",
    title: "NodeRoom · the bulk batch — every company enriched",
    accent: "#f59e0b",
    vw: 1280, vh: 800,
    retries: 2,
    panes: [{ label: "NodeRoom — memory mode (offline, deterministic)", url: "https://noderoom.live/?mode=memory" }],
    steps: [
      { act: "sleep", pane: 0, ms: 2600 },
      { act: "click", pane: 0, sel: "testid:start-demo-room" },
      { act: "sleep", pane: 0, ms: 3800 },
      { act: "click", pane: 0, sel: "testid:tour-skip" },
      { act: "sleep", pane: 0, ms: 700 },
      { act: "click", pane: 0, sel: "text:Company research" },
      { act: "sleep", pane: 0, ms: 1300 },
      { cap: "A research sheet — every company still pending", zoom: "testid:artifact-panel", zoomScale: 1.4, hold: 84 },
      { act: "type", pane: 0, sel: "testid:chat-composer", value: "@nodeagent enrich companies", delay: 22 },
      { cap: "One command to enrich the whole batch", cursor: "testid:chat-send", cursorPane: 0, click: true, zoom: "testid:chat-feed", zoomScale: 1.5, hold: 54 },
      { act: "click", pane: 0, sel: "testid:chat-send" },
      { act: "sleep", pane: 0, ms: 700 },
      { cap: "The agent researches all five — structured fields + two sources each", burst: { ms: 5500, every: 320 }, zoom: "testid:artifact-panel", zoomScale: 1.4, hold: 112 },
      { act: "sleep", pane: 0, ms: 800 },
      { cap: "Pending → complete across the batch, every row source-backed", zoom: "testid:artifact-panel", zoomScale: 1.4, hold: 96 },
    ],
  },

  // Q3 VARIANCE RECONCILE — open the Q3 P&L (the VARIANCE column starts empty), then
  // `@nodeagent reconcile Q3 variance` locks the column, computes each line's variance, and commits
  // (Revenue +24%, COGS +27.5%, GP +21.7%, Net income +22.4%) — lock released. A different artifact
  // (financial statement) + a different value (computed reconcile) from the company-research clips.
  // Scripted in memory mode (deterministic, no LLM); the live founder/events fan-out it replaces
  // needed a local dev server with a pre-enriched room (not reproducible against noderoom.live).
  {
    id: "NRdeepDive",
    title: "NodeRoom · Q3 variance, reconciled by the agent",
    accent: "#f97316",
    vw: 1280, vh: 800,
    retries: 2,
    panes: [{ label: "NodeRoom — memory mode (offline, deterministic)", url: "https://noderoom.live/?mode=memory" }],
    steps: [
      { act: "sleep", pane: 0, ms: 2600 },
      { act: "click", pane: 0, sel: "testid:start-demo-room" },
      { act: "sleep", pane: 0, ms: 3800 },
      { act: "click", pane: 0, sel: "testid:tour-skip" },
      { act: "sleep", pane: 0, ms: 700 },
      { act: "click", pane: 0, sel: "text:Q3 variance" },
      { act: "sleep", pane: 0, ms: 1300 },
      { cap: "A Q3 P&L — the variance column still empty", zoom: "testid:artifact-panel", zoomScale: 1.4, hold: 84 },
      { act: "type", pane: 0, sel: "testid:chat-composer", value: "@nodeagent reconcile Q3 variance", delay: 22 },
      { cap: "Ask the Room NodeAgent to reconcile the quarter", cursor: "testid:chat-send", cursorPane: 0, click: true, zoom: "testid:chat-feed", zoomScale: 1.5, hold: 54 },
      { act: "click", pane: 0, sel: "testid:chat-send" },
      { act: "sleep", pane: 0, ms: 700 },
      { cap: "It locks the column, computes each line's variance, and commits", burst: { ms: 5000, every: 320 }, zoom: "testid:artifact-panel", zoomScale: 1.4, hold: 110 },
      { act: "sleep", pane: 0, ms: 800 },
      { cap: "Revenue +24%, COGS +27.5%, net income +22.4% — lock released", zoom: "testid:artifact-panel", zoomScale: 1.4, hold: 96 },
    ],
  },
];
