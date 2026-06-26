// Walkthrough capturer for the solo-founder-3d-proof-run app (React SPA with hash routes).
// Adapted from walkthrough.mjs which targets Streamlit tabs.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SOLO_FOUNDER_SPECS } from "./walkthrough.solo-founder.specs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dirname, "public", "wt");
const BASE = process.env.DEMO_URL || "http://localhost:5179/#/builder";
const VW = 1280, VH = 800, DEFAULT_HOLD = 60;

const sleep = (p, ms) => p.waitForTimeout(ms);

// Resolve a spec selector to a Playwright Locator on the page.
const loc = (p, sel) => {
  if (sel.startsWith("btn:")) return p.getByRole("button", { name: new RegExp(sel.slice(4), "i") }).first();
  if (sel.startsWith("link:")) return p.getByRole("link", { name: new RegExp(sel.slice(5), "i") }).first();
  if (sel.startsWith("testid:")) return p.getByTestId(sel.slice(7)).first();
  if (sel === "textarea") return p.locator("textarea").first();
  if (sel === "input") return p.locator("input").first();
  return p.locator(sel).first();
};

// Viewport-relative center of an element (CSS px, clamped) — where the cursor points.
const cursorOf = async (p, sel) => {
  if (!sel) return null;
  try {
    const el = loc(p, sel);
    await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    const box = await el.evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 22) };
    });
    return { x: Math.max(8, Math.min(VW - 8, Math.round(box.x))), y: Math.max(8, Math.min(VH - 8, Math.round(box.y))) };
  } catch { return null; }
};

const doAct = async (p, a) => {
  if (a.act === "fill") { const el = loc(p, a.sel); await el.click(); await el.fill(String(a.value)); if (a.commit) await el.press(a.commit); await sleep(p, 600); }
  else if (a.act === "click") { await loc(p, a.sel).click(); await sleep(p, 300); }
  else if (a.act === "sleep") { await sleep(p, a.ms); }
  else if (a.act === "goto") { await p.goto(a.url, { waitUntil: "domcontentloaded" }).catch(() => {}); await sleep(p, 1500); }
  else if (a.act === "scrollTop") { await p.evaluate(() => window.scrollTo(0, 0)); await sleep(p, 300); }
  else if (a.act === "scrollY") { await p.evaluate((y) => window.scrollTo(0, y), a.y); await sleep(p, 300); }
};

const openHarness = async (browser) => {
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(60000);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(page, 2000);
  return page;
};

const run = async () => {
  rmSync(PUB, { recursive: true, force: true });
  const browser = await chromium.launch({ headless: true });
  let page = await openHarness(browser);

  const out = [];
  for (const spec of SOLO_FOUNDER_SPECS) {
    const dir = join(PUB, spec.id);
    const maxAttempts = 1 + (spec.retries || 0);
    let steps = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      steps = [];
      try {
        let n = 0;
        for (const op of spec.steps) {
          if (op.cap && op.burst) {
            const every = op.burst.every || 320;
            const count = Math.max(2, Math.round((op.burst.ms || 2800) / every));
            const imgs = [];
            for (let b = 0; b < count; b++) {
              const fn = `${String(n).padStart(2, "0")}_${String(b).padStart(2, "0")}.png`;
              await page.screenshot({ path: join(dir, fn) });
              imgs.push(`wt/${spec.id}/${fn}`);
              if (b < count - 1) await sleep(page, every);
            }
            steps.push({ imgs, caption: op.cap, cursor: null, click: false, hold: op.hold || 72, burst: true });
            console.log(`  ${spec.id} burst ${n}: ${imgs.length} frames — ${op.cap}`);
            n++;
          } else if (op.cap) {
            const cur = await cursorOf(page, op.cursor);
            const name = String(n).padStart(2, "0") + ".png";
            await sleep(page, 350);
            await page.screenshot({ path: join(dir, name) });
            steps.push({ img: `wt/${spec.id}/${name}`, caption: op.cap, cursor: cur, click: !!op.click, hold: op.hold || DEFAULT_HOLD });
            console.log(`  ${spec.id} cap ${n}: ${op.cap}`);
            n++;
          } else {
            await doAct(page, op);
          }
        }
        break;
      } catch (e) {
        await page.screenshot({ path: join(dir, "zz-fail.png") }).catch(() => {});
        const bodyText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200)).catch(() => "(unreadable)");
        console.log(`${spec.id} attempt ${attempt}/${maxAttempts} err: ${e.message.split("\n")[0]}`);
        console.log(`  fail-state: ${bodyText}`);
        if (attempt < maxAttempts) {
          await page.close().catch(() => {});
          page = await openHarness(browser);
          console.log(`  retrying ${spec.id} in a fresh page`);
        }
      }
    }
    out.push({ id: spec.id, title: spec.title, accent: spec.accent, steps });
  }
  await browser.close();

  const data = "// AUTO-GENERATED by walkthrough.solo-founder.mjs — do not edit by hand.\n" +
    "export const WALKTHROUGHS = " + JSON.stringify(out, null, 2) + ";\n";
  writeFileSync(join(__dirname, "src", "walkthrough.data.js"), data);
  console.log("WALKTHROUGH_CAPTURE_DONE — wrote src/walkthrough.data.js");
};
run().catch((e) => { console.error(e); process.exit(1); });
