// collab-demo/server.mjs
// ---------------------------------------------------------------------------
// A faithful, ZERO-dependency LOCAL stand-in for the Convex reactive pattern.
//
// Why this exists: the multi-pane demo GIF needs a live-collaborative app whose
// distinctive runtime behaviour is *cross-client* (a change in pane A appearing
// live in pane B; an optimistic temp row swapping atomically for the server row;
// presence; a server-led agent broadcasting to everyone). Convex provides this
// over WebSockets with `useQuery` subscriptions + `useMutation` optimistic
// updates. To capture the GIF with NO cloud login, this file mimics the same
// SERVER-LED model with Node built-ins only:
//
//   - state lives on the SERVER (cards + presence), never trusted from clients
//   - every client subscribes via Server-Sent-Events (≈ Convex `useQuery`)
//   - any mutation assigns the REAL server id, then BROADCASTS the full state to
//     ALL subscribers (≈ Convex commit fanning out down every WebSocket)
//   - a server-led "agent" appends a locked card and STREAMS chunks into it,
//     broadcasting each step to every client (≈ scheduled action + internalMutation
//     + optimisticallySendMessage landing in all panes)
//
// The optimistic temp->real swap is implemented on the CLIENT (see public/
// index.html): it paints a temp crypto.randomUUID() row at 0ms, then reconciles
// when the broadcast carries the real server id. That mirrors Convex's
// withOptimisticUpdate overlay -> authoritative base-layer reconciliation.
//
// Run:  node server.mjs   then open  http://localhost:8930/?user=A  and  ?user=B
// ---------------------------------------------------------------------------

import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = 8930;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, "public", "index.html");

// ---- Server-authoritative in-memory state -------------------------------
// cards: the system of record. Each card carries its real server id, who wrote
// it, an optional lock holder, and whether it is currently being streamed into.
/** @type {{id:string,text:string,author:string,lockedBy:string|null,streaming:boolean}[]} */
let cards = [];
// presence: clientId -> { name, color, lastSeen }. Drives the avatar row.
/** @type {Record<string,{name:string,color:string,lastSeen:number}>} */
const presence = {};

// Bounded so a long-running capture / agent loop can never grow memory without
// limit (BOUND: every in-memory collection has a MAX + eviction). The board is a
// demo surface, so we keep the most recent N cards.
const MAX_CARDS = 200;
const PRESENCE_TTL_MS = 60_000; // drop avatars not seen in a minute

// ---- SSE subscribers (the "reactive" fan-out, ≈ Convex subscriptions) -----
/** @type {Set<import('node:http').ServerResponse>} */
const clients = new Set();

function snapshot() {
  prunePresence();
  return { type: "state", cards, presence };
}

function prunePresence() {
  const now = Date.now();
  for (const [id, p] of Object.entries(presence)) {
    if (now - p.lastSeen > PRESENCE_TTL_MS) delete presence[id];
  }
}

// Broadcast the FULL state to every connected client. This is the single choke
// point that makes the app "reactive": every mutation ends with broadcast(), so
// all panes converge on the same server-led state with no client polling.
function broadcast() {
  const payload = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res); // dead socket; drop it
    }
  }
}

// ---- tiny request-body reader (bounded) ----------------------------------
const MAX_BODY = 64 * 1024; // BOUND_READ: cap inbound body size
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

// ---- mutations (server assigns the REAL id, then broadcasts) --------------
function addCard({ clientId, text }) {
  const author = presence[clientId]?.name || "Someone";
  const card = {
    id: crypto.randomUUID(), // the REAL server id (client had a temp one)
    text: String(text ?? "").slice(0, 280),
    author,
    lockedBy: null,
    streaming: false,
  };
  cards.push(card);
  if (cards.length > MAX_CARDS) cards = cards.slice(-MAX_CARDS); // BOUND
  return card;
}

function editCard({ cardId, text }) {
  const card = cards.find((c) => c.id === cardId);
  if (!card) return null;
  if (card.lockedBy) return null; // respect the lock (no edits while locked)
  card.text = String(text ?? "").slice(0, 280);
  return card;
}

// ---- server-led agent (≈ scheduled action streaming into a card) ----------
// Appends a card locked by "Agent", broadcasts it, then streams ~5 chunks ~700ms
// apart (append + broadcast each), then clears the lock + a final broadcast.
// Every step ends in broadcast(), so BOTH panes watch the text stream in live.
const AGENT_STEPS = [
  "Analyzing the board",
  " · clustering 3 themes",
  " · drafting a summary",
  " · ranking by impact",
  " · done. Top theme: collaboration.",
];
let agentBusy = false; // one agent job at a time (deterministic for the GIF)

async function runAgent(clientId) {
  if (agentBusy) return;
  agentBusy = true;
  const requestedBy = presence[clientId]?.name || "Someone";

  // 1) append the locked agent card and broadcast it appearing in every pane
  const card = {
    id: crypto.randomUUID(),
    text: `🤖 Agent (requested by ${requestedBy}): `,
    author: "Agent",
    lockedBy: "Agent",
    streaming: true,
  };
  cards.push(card);
  if (cards.length > MAX_CARDS) cards = cards.slice(-MAX_CARDS);
  broadcast();

  // 2) stream chunks in, broadcasting each step (the headline "agent motion")
  for (const chunk of AGENT_STEPS) {
    await sleep(700);
    const live = cards.find((c) => c.id === card.id);
    if (!live) break; // card evicted mid-run; bail gracefully
    live.text += chunk;
    broadcast();
  }

  // 3) clear the lock + streaming flag, final broadcast
  const live = cards.find((c) => c.id === card.id);
  if (live) {
    live.lockedBy = null;
    live.streaming = false;
  }
  broadcast();
  agentBusy = false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- HTTP server ----------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // Static page ----------------------------------------------------------
    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      const html = await readFile(INDEX_PATH);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }

    // SSE subscription (≈ Convex useQuery live subscription) ----------------
    if (req.method === "GET" && pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write("retry: 1000\n\n");
      clients.add(res);
      // push the current state immediately (initial query result)
      res.write(`data: ${JSON.stringify(snapshot())}\n\n`);

      // heartbeat keeps proxies/keep-alive happy; also reaps dead sockets
      const hb = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          clearInterval(hb);
          clients.delete(res);
        }
      }, 15_000);

      req.on("close", () => {
        clearInterval(hb);
        clients.delete(res);
      });
      return;
    }

    // Mutate: add | edit  (server assigns real id, then broadcasts to ALL) --
    if (req.method === "POST" && pathname === "/mutate") {
      const body = await readBody(req);
      const { op, clientId, text, cardId } = body;
      if (op === "add") {
        const card = addCard({ clientId, text });
        broadcast();
        // echo the real id so the client can reconcile its temp row
        return sendJson(res, 200, { ok: true, card });
      }
      if (op === "edit") {
        const card = editCard({ cardId, text });
        if (!card) return sendJson(res, 409, { ok: false, error: "locked or missing" });
        broadcast();
        return sendJson(res, 200, { ok: true, card });
      }
      return sendJson(res, 400, { ok: false, error: "unknown op" });
    }

    // Presence: join / heartbeat (then broadcast the avatar row) ------------
    if (req.method === "POST" && pathname === "/presence") {
      const body = await readBody(req);
      const { clientId, name, color } = body;
      if (!clientId) return sendJson(res, 400, { ok: false, error: "clientId required" });
      presence[clientId] = {
        name: String(name ?? "Anon").slice(0, 24),
        color: String(color ?? "#34d399").slice(0, 16),
        lastSeen: Date.now(),
      };
      broadcast();
      return sendJson(res, 200, { ok: true });
    }

    // Agent: server-led streaming job, broadcast to everyone ----------------
    if (req.method === "POST" && pathname === "/agent") {
      const body = await readBody(req);
      const { clientId } = body;
      // fire-and-forget: respond now, stream via broadcasts (HONEST_STATUS:
      // 202 = accepted/already-running, not a fake 200-with-result)
      if (agentBusy) return sendJson(res, 202, { ok: true, busy: true });
      runAgent(clientId).catch((err) => console.error("agent error:", err));
      return sendJson(res, 202, { ok: true, started: true });
    }

    sendJson(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    // ERROR_BOUNDARY: never leak a hung socket on a bad request
    sendJson(res, 400, { ok: false, error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`collab-demo (Convex-pattern stand-in) listening on http://localhost:${PORT}`);
  console.log(`  open two panes:  http://localhost:${PORT}/?user=A   and   http://localhost:${PORT}/?user=B`);
});
