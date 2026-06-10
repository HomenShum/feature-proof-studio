import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";

// =============================================================================
// board.ts — the entire server half of the collab demo.
//
// Three behaviours, mapped to three Convex primitives (see README table):
//   1. reactive broadcast   -> `list` (a reactive query) read by useQuery in EVERY client
//   2. optimistic paint      -> `addCard` (a mutation) whose result `list` re-reads
//   3. server-led agent stream -> `runAgent` (action) -> scheduler -> `agentStep`
//        (internalMutation) that mutates a row each tick; `list` re-broadcasts the
//        lock + each appended chunk to all panes, then clears the lock at the end.
// =============================================================================

// How long a presence row is considered "live" without a fresh heartbeat.
const PRESENCE_TTL_MS = 10_000;

// The agent's scripted output, revealed one chunk per scheduled tick. In a real
// app each chunk would be an LLM token/delta; here it's deterministic so the
// captured walkthrough is reproducible (no live model needed at capture time).
const AGENT_CHUNKS = [
  "Reviewing the board… ",
  "Stripe and Ramp both look like fintech infra. ",
  "Suggested next step: pull their funding history ",
  "and score against the ICP. ✅",
];
const AGENT_TICK_MS = 450; // delay between streamed chunks

// -----------------------------------------------------------------------------
// 1. REACTIVE QUERY — the useQuery(api.board.list) target.
//
// Returns the whole board, newest first. Convex records the read-set of this
// query per subscribed client; any write below that touches a `cards` row
// invalidates the subscription and re-runs this function, pushing the fresh
// array down every client's socket. THIS is what makes Client B update the
// instant Client A (or the agent) mutates — with no polling and no refresh.
// -----------------------------------------------------------------------------
export const list = query({
  args: {},
  handler: async (ctx) => {
    const cards = await ctx.db.query("cards").order("desc").collect();
    return cards;
  },
});

// -----------------------------------------------------------------------------
// 2. addCard MUTATION — paired client-side with .withOptimisticUpdate(...).
//
// The client paints a temp card at 0 ms (crypto.randomUUID id, insertAtTop) so
// the author sees zero latency. This server mutation is the authoritative write:
// once it commits, `list` re-runs, the temp row is swapped for the real row in a
// single microtask (net-zero VDOM diff -> no flicker), and the new card also
// appears live in every OTHER pane via their own `list` subscription.
// -----------------------------------------------------------------------------
export const addCard = mutation({
  args: { text: v.string(), author: v.string() },
  handler: async (ctx, { text, author }) => {
    return await ctx.db.insert("cards", {
      text,
      author,
      streaming: false,
    });
  },
});

// -----------------------------------------------------------------------------
// 3a. heartbeat MUTATION — presence. Upsert one row per collaborator and stamp
// `lastSeen`. Because `listPresence` reads this table reactively, every client's
// avatar strip updates the moment someone joins, moves, or goes stale.
// -----------------------------------------------------------------------------
export const heartbeat = mutation({
  args: { name: v.string(), color: v.string() },
  handler: async (ctx, { name, color }) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    const lastSeen = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { color, lastSeen });
    } else {
      await ctx.db.insert("presence", { name, color, lastSeen });
    }
  },
});

// Reactive presence read: only the collaborators seen within the TTL window.
export const listPresence = query({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const rows = await ctx.db.query("presence").collect();
    return rows.filter((p) => p.lastSeen >= cutoff);
  },
});

// -----------------------------------------------------------------------------
// 4. SERVER-LED AGENT — broadcast to EVERYONE.
//
// Client calls runAgent (an action). The action seeds an empty, locked card,
// then hands off to the scheduler. We do NOT stream over an HTTP/SSE response
// (which only the calling client could see — the "multi-user blindness" of the
// Next.js+SSE stack). Instead each chunk is committed by an internalMutation, so
// the agent's text and its lock ride down EVERY client's `list` socket at once.
// -----------------------------------------------------------------------------
export const runAgent = action({
  args: { author: v.optional(v.string()) },
  handler: async (ctx, { author }): Promise<void> => {
    const agentName = author ?? "Agent";
    // Create the card + take the lock atomically inside the first step.
    await ctx.scheduler.runAfter(0, internal.board.agentStep, {
      cardId: null,
      step: 0,
      agentName,
    });
  },
});

// internalMutation: NOT callable from the client. Each invocation is one frame
// of the stream — it locks/creates the card, appends the next chunk, then
// reschedules itself for the following chunk. On the final chunk it clears the
// lock and flips `streaming` off. Every commit re-broadcasts via `list`.
export const agentStep = internalMutation({
  args: {
    cardId: v.union(v.id("cards"), v.null()),
    step: v.number(),
    agentName: v.string(),
  },
  handler: async (ctx, { cardId, step, agentName }) => {
    const isLast = step >= AGENT_CHUNKS.length - 1;
    const chunk = AGENT_CHUNKS[step] ?? "";

    // First step: create the card already LOCKED + streaming, so the lock badge
    // and the streaming caret appear in every pane before any text arrives.
    if (cardId === null) {
      const newId = await ctx.db.insert("cards", {
        text: chunk,
        author: agentName,
        lockedBy: agentName, // -> "🔒 Locked by Agent" in all panes
        streaming: true, // -> live typing caret in all panes
      });
      if (!isLast) {
        await ctx.scheduler.runAfter(AGENT_TICK_MS, internal.board.agentStep, {
          cardId: newId,
          step: step + 1,
          agentName,
        });
      }
      return;
    }

    // Subsequent steps: append this chunk to the existing card. The patch
    // invalidates `list`, so every client sees the text grow token-by-token.
    const card = await ctx.db.get(cardId);
    if (!card) return; // card was deleted mid-stream — bail gracefully
    await ctx.db.patch(cardId, {
      text: card.text + chunk,
      // Final step: release the lease + stop streaming. The badge clears in
      // every pane simultaneously — the visible proof the agent finished.
      lockedBy: isLast ? undefined : card.lockedBy,
      streaming: !isLast,
    });

    if (!isLast) {
      await ctx.scheduler.runAfter(AGENT_TICK_MS, internal.board.agentStep, {
        cardId,
        step: step + 1,
        agentName,
      });
    }
  },
});
