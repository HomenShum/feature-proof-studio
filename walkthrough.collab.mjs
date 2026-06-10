// MULTI-PANE (2-up) walkthrough capturer — collaboration / cross-client-sync demos.
// Parallel to walkthrough.mjs (single-pane). ADDITIVE: this file is self-contained and
// does NOT touch walkthrough.mjs / src/Walkthrough.jsx.
//
// A collab spec = { id, title, accent, panes: [{ label, url }, ...], steps: [...] }.
// We open ONE browser context per pane (browser.newContext() + a page) so the panes are
// fully independent clients — an action in pane 0 propagates to pane 1 over the wire, and
// we capture the propagation as it happens. The op model mirrors the single-pane tool:
//   { cap, caption?, cursor?, click?, hold? }            -> CAPTURE all panes at one instant
//   { cap, burst:{ms,every}, ... }                       -> CAPTURE a rapid SEQUENCE per pane
//   { act, pane, ... }                                   -> PERFORM an action on ONE pane's page
// `cap` with no `caption` uses the value of `cap` as the caption (same as single-pane).
// The pointer target is recorded for the ACTING pane only (carried from the most recent
// `act` that targets a pane, or an explicit `cursor`+`cursorPane` on the cap op).
//
// Output:
//   public/wt-collab/<id>/p<PANE>_<NN>.png            (one frame per pane per `cap`)
//   public/wt-collab/<id>/p<PANE>_<NN>_<BB>.png       (burst: per pane, per burst tick)
//   src/walkthrough.collab.data.js                    (consumed by src/Walkthrough2up.jsx)
//
//   # serve the demo app on :8930 first, then:
//   node walkthrough.collab.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { COLLAB_SPECS } from "./walkthrough.collab.specs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dirname, "public", "wt-collab");
const VW = 1280, VH = 600, DEFAULT_HOLD = 60;   // short viewport = content-tight frames (no empty space)

const sleep = (p, ms) => p.waitForTimeout(ms);
const waitText = (p, s, t = 60000) =>
  p.waitForFunction((x) => new RegExp(x).test(document.body.innerText), s, { timeout: t, polling: 600 }).catch(() => {});

// Resolve a spec selector to a Playwright Locator on the given page. Supports:
//   "testid:add-btn"  -> [data-testid="add-btn"]
//   "btn:Name"        -> role=button whose accessible name matches /Name/i
//   "text:Foo"        -> element containing text Foo
//   raw css           -> used as-is
const loc = (p, sel) => {
  if (sel.startsWith("testid:")) return p.locator(`[data-testid="${sel.slice(7)}"]`).first();
  if (sel.startsWith("btn:")) return p.getByRole("button", { name: new RegExp(sel.slice(4), "i") }).first();
  if (sel.startsWith("text:")) return p.getByText(new RegExp(sel.slice(5), "i")).first();
  return p.locator(sel).first();
};

// Viewport-relative center of an element (CSS px, clamped) — where the cursor points.
const cursorOf = async (p, sel) => {
  if (!sel) return null;
  try {
    const vp = p.viewportSize() || { width: VW, height: VH };
    const el = loc(p, sel);
    await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    const box = await el.evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 22) };
    });
    return { x: Math.max(8, Math.min(vp.width - 8, Math.round(box.x))), y: Math.max(8, Math.min(vp.height - 8, Math.round(box.y))) };
  } catch { return null; }
};

// Element CENTER (viewport px) — the focus point a zoom step (`zoom: "<selector>"`) eases to.
const focusOf = async (p, sel) => {
  if (!sel) return null;
  try {
    const vp = p.viewportSize() || { width: VW, height: VH };
    const el = loc(p, sel);
    await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    const c = await el.evaluate((n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    return { x: Math.max(0, Math.min(vp.width, Math.round(c.x))), y: Math.max(0, Math.min(vp.height, Math.round(c.y))) };
  } catch { return null; }
};

// Perform an action on ONE pane's page. Mirrors walkthrough.mjs doAct; adds nothing
// Streamlit-specific (the demo app is a plain page). `a.pane` selects the page.
const doAct = async (page, a) => {
  if (a.act === "fill") {
    const el = loc(page, a.sel);
    await el.click();
    await el.fill(String(a.value));
    if (a.commit) await el.press(a.commit);
    await sleep(page, 350);
  } else if (a.act === "click") {
    await loc(page, a.sel).click();
    await sleep(page, 250);
  } else if (a.act === "key") {
    await page.keyboard.press(a.value);
    await sleep(page, 250);
  } else if (a.act === "type") {
    const el = loc(page, a.sel);
    await el.click();
    await el.type(String(a.value), { delay: a.delay || 40 });
    if (a.commit) await el.press(a.commit);
    await sleep(page, 350);
  } else if (a.act === "sleep") {
    await sleep(page, a.ms);
  } else if (a.act === "waitText") {
    await waitText(page, a.value, a.timeout);
  } else if (a.act === "scrollTop") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(page, 250);
  } else if (a.act === "scrollText") {
    await page.evaluate((s) => {
      const rx = new RegExp(s);
      const el = [...document.querySelectorAll("*")].find((n) => rx.test(n.textContent || "") && n.children.length < 6);
      if (el) el.scrollIntoView({ block: "center" });
    }, a.value);
    await sleep(page, 350);
  }
};

const run = async () => {
  // COLLAB_ONLY=NRsync,LiveSync re-captures just those specs and MERGES into the existing data
  // (iterate one walkthrough without re-running the others). No filter = full run + wipe.
  const ONLY = process.env.COLLAB_ONLY ? process.env.COLLAB_ONLY.split(",").map((s) => s.trim()) : null;
  const specs = ONLY ? COLLAB_SPECS.filter((s) => ONLY.includes(s.id)) : COLLAB_SPECS;
  if (!ONLY) rmSync(PUB, { recursive: true, force: true });
  const browser = await chromium.launch({ headless: true });

  const out = [];
  for (const spec of specs) {
    const dir = join(PUB, spec.id);
    // Per-spec retries (opt-in via `retries: N`) — each attempt wipes the frame dir and runs in
    // FRESH contexts, so a retried capture never inherits a half-driven, poisoned UI on any pane.
    const maxAttempts = 1 + (spec.retries || 0);
    let steps = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    // ONE context per pane => fully independent clients (separate cookies/storage/socket).
    const contexts = [];
    const pages = [];
    for (const pane of spec.panes) {
      const ctx = await browser.newContext({ viewport: { width: spec.vw || VW, height: spec.vh || VH }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      page.setDefaultTimeout(60000);
      contexts.push(ctx);
      pages.push(page);
    }
    // Navigate every pane to its own URL.
    await Promise.all(pages.map((page, k) => page.goto(spec.panes[k].url, { waitUntil: "domcontentloaded" }).catch(() => {})));
    await Promise.all(pages.map((page) => sleep(page, 1200)));

    steps = [];
    let lastCursorPane = 0;       // which pane the most recent `act` touched (the ACTING pane)
    let ok = false;
    try {
      let n = 0;
      for (const op of spec.steps) {
        if (op.cap && op.burst) {
          // BURST: rapidly capture a SEQUENCE on EVERY pane at the same wall-clock ticks so
          // the rendered clip shows real cross-client motion — the card painting in A, then
          // syncing into B; the agent text streaming into BOTH at once.
          const every = op.burst.every || 300;
          const count = Math.max(2, Math.round((op.burst.ms || 2800) / every));
          const actPane = op.cursorPane != null ? op.cursorPane : lastCursorPane;
          const cur = await cursorOf(pages[actPane], op.cursor);
          const zoom = op.zoom ? await Promise.all(pages.map((pg) => focusOf(pg, op.zoom))) : null;
          const paneImgs = spec.panes.map(() => []);
          for (let b = 0; b < count; b++) {
            const bb = String(b).padStart(2, "0");
            // Screenshot all panes as close to the same instant as possible.
            await Promise.all(pages.map(async (page, pi) => {
              const fn = `p${pi}_${String(n).padStart(2, "0")}_${bb}.png`;
              await page.screenshot({ path: join(dir, fn) });
              paneImgs[pi].push(`wt-collab/${spec.id}/${fn}`);
            }));
            if (b < count - 1) await Promise.all(pages.map((page) => sleep(page, every)));
          }
          const panes = spec.panes.map((_, pi) => ({
            imgs: paneImgs[pi],
            cursor: pi === actPane ? cur : null,
            click: pi === actPane ? !!op.click : false,
            zoom: zoom ? zoom[pi] : null,
          }));
          steps.push({ caption: op.caption || op.cap, hold: op.hold || 78, burst: true, zoomScale: op.zoomScale || null, panes });
          console.log(`  ${spec.id} burst ${n}: ${count} frames x ${spec.panes.length} panes — ${op.caption || op.cap}`);
          n++;
        } else if (op.cap) {
          const actPane = op.cursorPane != null ? op.cursorPane : lastCursorPane;
          const cur = await cursorOf(pages[actPane], op.cursor);
          const zoom = op.zoom ? await Promise.all(pages.map((pg) => focusOf(pg, op.zoom))) : null;
          await Promise.all(pages.map((page) => sleep(page, 300)));
          const panes = [];
          for (let pi = 0; pi < spec.panes.length; pi++) {
            const name = `p${pi}_${String(n).padStart(2, "0")}.png`;
            await pages[pi].screenshot({ path: join(dir, name) });
            panes.push({
              img: `wt-collab/${spec.id}/${name}`,
              cursor: pi === actPane ? cur : null,
              click: pi === actPane ? !!op.click : false,
              zoom: zoom ? zoom[pi] : null,
            });
          }
          steps.push({ caption: op.caption || op.cap, hold: op.hold || DEFAULT_HOLD, burst: false, zoomScale: op.zoomScale || null, panes });
          console.log(`  ${spec.id} cap ${n}: ${op.caption || op.cap}`);
          n++;
        } else {
          // ACTION on a single pane.
          const pi = op.pane != null ? op.pane : 0;
          lastCursorPane = pi;
          await doAct(pages[pi], op);
        }
      }
      ok = true;
    } catch (e) {
      // FAILURE FORENSICS: freeze EVERY pane's exact state + a body-text snippet before retry —
      // "which client was in which state" ends debugging guesswork. zz-fail-* sorts last and is
      // never referenced by walkthrough.collab.data.js.
      await Promise.all(pages.map((page, pi) => page.screenshot({ path: join(dir, `zz-fail-p${pi}.png`) }).catch(() => {})));
      for (let pi = 0; pi < pages.length; pi++) {
        const bt = await pages[pi].evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 160)).catch(() => "(unreadable)");
        console.log(`  ${spec.id} fail-state pane ${pi}: ${bt}`);
      }
      console.log(`${spec.id} attempt ${attempt}/${maxAttempts} err: ${e.message.split("\n")[0]}`);
    }

    for (const ctx of contexts) await ctx.close().catch(() => {});
    if (ok) break;
    if (attempt < maxAttempts) console.log(`  retrying ${spec.id} in fresh contexts`);
    }
    out.push({
      id: spec.id,
      title: spec.title,
      accent: spec.accent,
      vw: spec.vw || VW,
      vh: spec.vh || VH,
      cropVH: spec.cropVH || null,
      paneLabels: spec.panes.map((p) => p.label),
      steps,
    });
  }
  await browser.close();

  // When filtering, MERGE captured specs into the existing data (preserve the others + order).
  let final = out;
  if (ONLY) {
    let existing = [];
    try { ({ COLLAB_WALKTHROUGHS: existing } = await import("./src/walkthrough.collab.data.js")); } catch {}
    const byId = new Map((existing || []).map((w) => [w.id, w]));
    for (const w of out) byId.set(w.id, w);
    const order = (existing || []).map((w) => w.id);
    for (const w of out) if (!order.includes(w.id)) order.push(w.id);
    final = order.map((id) => byId.get(id)).filter(Boolean);
  }
  const data = "// AUTO-GENERATED by walkthrough.collab.mjs — do not edit by hand.\n" +
    "export const COLLAB_WALKTHROUGHS = " + JSON.stringify(final, null, 2) + ";\n";
  writeFileSync(join(__dirname, "src", "walkthrough.collab.data.js"), data);
  console.log("WALKTHROUGH_COLLAB_CAPTURE_DONE — wrote src/walkthrough.collab.data.js");
};
run().catch((e) => { console.error(e); process.exit(1); });
