import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The data model the whole demo reacts to.
//
// Every connected client opens a `useQuery(api.board.list)` subscription against
// the `cards` table. Convex tracks which rows that query read; the moment ANY
// of those rows change — a new card, a `lockedBy` set/cleared, a `text` chunk
// appended by the agent — Convex pushes the new result down every subscribed
// client's WebSocket and React re-renders. That server-led reactivity is the
// thing the local collab-demo films in the second pane.
export default defineSchema({
  // One sticky note on the shared board.
  cards: defineTable({
    text: v.string(),
    author: v.string(),
    // Set while a client (or the agent) holds the card; rendered as a
    // "🔒 Locked by …" badge in EVERY pane. Cleared on the agent's final step.
    lockedBy: v.optional(v.string()),
    // True while the agent is appending chunks to `text`, so the UI can show a
    // live "typing" caret. Flipped back to false on the final chunk.
    streaming: v.boolean(),
  }),

  // Lightweight presence: one row per live collaborator, heartbeated.
  // `lastSeen` lets the UI fade out clients that stopped heartbeating.
  presence: defineTable({
    name: v.string(),
    color: v.string(),
    lastSeen: v.number(),
  }).index("by_name", ["name"]),
});
