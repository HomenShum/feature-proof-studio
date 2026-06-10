import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";

// =============================================================================
// App.tsx — the React client. This mirrors the local collab-demo UI 1:1:
// a shared sticky-note board, an input to add a card, a "Run agent" button,
// and a presence strip. The three behaviours the walkthrough GIF films are
// annotated inline:  [OPTIMISTIC PAINT] · [REACTIVE BROADCAST] · [AGENT STREAM].
//
// House style: dark (#0b1220 / #0d1526), green accent (#10b981 / #34d399), Inter.
// =============================================================================

const ACCENT = "#10b981";
const ACCENT_2 = "#34d399";
const FONT =
  '"Inter", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

// A stable identity for THIS browser tab — drives presence + optimistic author.
// In the walkthrough this is "Client A" in one pane and "Client B" in the other.
const ME = (() => {
  const palette = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa"];
  const name =
    new URLSearchParams(window.location.search).get("name") ??
    `Client-${Math.random().toString(36).slice(2, 5)}`;
  const color = palette[Math.abs(hash(name)) % palette.length];
  return { name, color };
})();

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

// -----------------------------------------------------------------------------
// insertAtTop — local mirror of Convex's paginated `insertAtTop` helper, for a
// plain (non-paginated) list query. The SDK exports `insertAtTop` from
// "convex/react" for usePaginatedQuery; `list` here is a simple reactive
// useQuery, so we prepend into its array via getQuery/setQuery. Same semantics:
// the new item lands at the TOP of every reader's list at 0 ms.
// -----------------------------------------------------------------------------
function insertCardAtTop(
  localStore: OptimisticLocalStore,
  card: Doc<"cards">,
) {
  const current = localStore.getQuery(api.board.list, {});
  if (current !== undefined) {
    localStore.setQuery(api.board.list, {}, [card, ...current]);
  }
}

export default function App() {
  // ---- [REACTIVE BROADCAST] ------------------------------------------------
  // One live subscription per client. When ANY card changes on the server
  // (a new card, the agent's lock, each streamed chunk, the lock clearing),
  // Convex pushes a fresh array here and React re-renders — in EVERY open pane,
  // with no refresh. This is the headline the demo films in the second pane.
  const cards = useQuery(api.board.list, {});
  const presence = useQuery(api.board.listPresence, {});

  // ---- [OPTIMISTIC PAINT] --------------------------------------------------
  // addCard + .withOptimisticUpdate: paint a temp card locally at 0 ms using a
  // crypto.randomUUID() temp id, inserted at the top. When the server mutation
  // commits, `list` re-reads and the temp row is swapped for the authoritative
  // row in a single microtask — net-zero VDOM diff, so there's no flicker.
  const addCard = useMutation(api.board.addCard).withOptimisticUpdate(
    (localStore, args) => {
      const now = Date.now();
      const temp: Doc<"cards"> = {
        // crypto.randomUUID() temp id — replaced by the real _id on commit.
        _id: crypto.randomUUID() as Id<"cards">,
        _creationTime: now,
        text: args.text,
        author: args.author,
        streaming: false,
        // lockedBy intentionally omitted (optional) — a brand-new card is free.
      };
      insertCardAtTop(localStore, temp); // -> instant paint, top of the list
    },
  );

  // ---- [AGENT STREAM] ------------------------------------------------------
  // Kicks off the server-led agent. The action schedules agentStep, which
  // commits the lock + each chunk via an internalMutation — so the agent's
  // output streams into BOTH panes through their `list` subscription, not just
  // the pane that pressed the button. (Contrast the SSE stack: caller-only.)
  const runAgent = useAction(api.board.runAgent);

  // ---- presence heartbeat — upsert my row every few seconds so other clients
  // see me join/leave reactively via listPresence.
  const heartbeat = useMutation(api.board.heartbeat);
  useEffect(() => {
    const beat = () => void heartbeat({ name: ME.name, color: ME.color });
    beat();
    const id = setInterval(beat, 4000);
    return () => clearInterval(id);
  }, [heartbeat]);

  const inputRef = useRef<HTMLInputElement>(null);
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value.trim();
    if (!text) return;
    void addCard({ text, author: ME.name }); // optimistic paint fires first
    if (inputRef.current) inputRef.current.value = "";
  };

  const live = useMemo(
    () => (presence ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [presence],
  );

  return (
    <div style={S.page}>
      <header style={S.header}>
        <span style={{ fontSize: 26 }}>🌱</span>
        <div style={S.title}>Collab Board</div>
        <span style={S.subtitle}>Convex + React · live, multi-user</span>

        {/* Presence strip — reactive: avatars pop in/out as clients join/leave */}
        <div style={S.presence}>
          {live.map((p) => (
            <div
              key={p.name}
              title={p.name}
              style={{
                ...S.avatar,
                background: p.color,
                outline:
                  p.name === ME.name ? `2px solid ${ACCENT_2}` : "none",
              }}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </div>
          ))}
          <span style={S.presenceCount}>
            {live.length} online · you are {ME.name}
          </span>
        </div>
      </header>

      {/* Composer + Run agent */}
      <form onSubmit={onSubmit} style={S.composer}>
        <input
          ref={inputRef}
          placeholder="Add a card…  (paints instantly, syncs to everyone)"
          style={S.input}
          aria-label="Card text"
        />
        <button type="submit" style={S.addBtn}>
          Add card
        </button>
        <button
          type="button"
          onClick={() => void runAgent({ author: "Agent" })}
          style={S.agentBtn}
        >
          ▶ Run agent
        </button>
      </form>

      {/* The board — driven entirely by the reactive `cards` subscription */}
      <main style={S.board}>
        {cards === undefined ? (
          <div style={S.loading}>Connecting to Convex…</div>
        ) : cards.length === 0 ? (
          <div style={S.loading}>No cards yet — add one or run the agent.</div>
        ) : (
          cards.map((c) => <Card key={c._id} card={c} />)
        )}
      </main>
    </div>
  );
}

function Card({ card }: { card: Doc<"cards"> }) {
  const locked = !!card.lockedBy;
  return (
    <div
      style={{
        ...S.card,
        borderColor: card.streaming ? ACCENT_2 : "rgba(255,255,255,0.08)",
        boxShadow: card.streaming
          ? `0 0 0 1px ${ACCENT_2}, 0 8px 30px rgba(16,185,129,0.18)`
          : "0 8px 30px rgba(0,0,0,0.35)",
      }}
    >
      {/* Lock badge — appears + clears across EVERY pane via the subscription */}
      {locked && (
        <div style={S.lock}>🔒 Locked by {card.lockedBy}</div>
      )}
      <div style={S.cardText}>
        {card.text}
        {/* streaming caret — the live "agent is typing" tell, in all panes */}
        {card.streaming && <span style={S.caret}>▋</span>}
      </div>
      <div style={S.cardAuthor}>— {card.author}</div>
    </div>
  );
}

// ---- House-style dark theme + green accent -----------------------------------
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(1300px 760px at 68% -5%, #14253f 0%, #0f1b2e 46%, #0b1220 100%)",
    color: "#eaf2ff",
    fontFamily: FONT,
    padding: "28px clamp(16px, 5vw, 64px)",
    boxSizing: "border-box",
  },
  header: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  title: { fontWeight: 800, fontSize: 26 },
  subtitle: { color: "#9fb3c8", fontSize: 14, fontWeight: 600 },
  presence: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 99,
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 13,
    color: "#0b1220",
  },
  presenceCount: { marginLeft: 10, color: "#9fb3c8", fontSize: 13 },
  composer: { display: "flex", gap: 10, margin: "22px 0 24px", flexWrap: "wrap" },
  input: {
    flex: 1,
    minWidth: 240,
    background: "#0d1526",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 10,
    color: "#eaf2ff",
    padding: "12px 16px",
    fontSize: 15,
    fontFamily: FONT,
    outline: "none",
  },
  addBtn: {
    background: ACCENT,
    color: "#04130c",
    border: "none",
    borderRadius: 10,
    padding: "12px 20px",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  },
  agentBtn: {
    background: "transparent",
    color: ACCENT_2,
    border: `2px solid ${ACCENT_2}`,
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  },
  board: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16,
    alignItems: "start",
  },
  loading: { color: "#9fb3c8", fontSize: 15, padding: "40px 0" },
  card: {
    background: "#0d1526",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    transition: "border-color 120ms ease, box-shadow 120ms ease",
  },
  lock: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: 800,
    color: ACCENT_2,
    background: "rgba(52,211,153,0.12)",
    border: `1px solid ${ACCENT_2}`,
    borderRadius: 8,
    padding: "3px 8px",
  },
  cardText: { fontSize: 16, lineHeight: 1.45, color: "#eaf2ff" },
  caret: { color: ACCENT_2, marginLeft: 2, animation: "blink 1s steps(2) infinite" },
  cardAuthor: { fontSize: 13, color: "#9fb3c8", fontWeight: 600 },
};
