import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SPECS } from "./walkthrough.visual.specs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dirname, "public", "wt");
const BASE = process.env.VISUAL_URL || process.env.DEMO_URL || "http://127.0.0.1:3000";
const VW = 1280;
const VH = 800;
const DEFAULT_HOLD = 60;

const sleep = (page, ms) => page.waitForTimeout(ms);

function urlFor(path) {
  return path.startsWith("http") ? path : `${BASE}${path}`;
}

function locator(page, sel) {
  if (sel.startsWith("btn:")) return page.getByRole("button", { name: new RegExp(sel.slice(4), "i") }).first();
  if (sel.startsWith("link:")) return page.getByRole("link", { name: new RegExp(sel.slice(5), "i") }).first();
  if (sel.startsWith("aria:")) return page.locator(`[aria-label="${sel.slice(5).replace(/"/g, '\\"')}"]`).first();
  if (sel.startsWith("placeholder:")) return page.getByPlaceholder(sel.slice(12), { exact: true }).first();
  if (sel.startsWith("text:")) return page.getByText(sel.slice(5), { exact: false }).first();
  if (sel.startsWith("css:")) return page.locator(sel.slice(4)).first();
  return page.locator(sel).first();
}

async function cursorOf(page, sel) {
  if (!sel) return null;
  try {
    const target = locator(page, sel);
    await target.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    const box = await target.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(rect.height / 2, 24),
      };
    });
    return {
      x: Math.max(8, Math.min(VW - 8, Math.round(box.x))),
      y: Math.max(8, Math.min(VH - 8, Math.round(box.y))),
    };
  } catch {
    return null;
  }
}

async function waitText(page, value, timeout = 90000) {
  await page
    .waitForFunction(
      (pattern) => new RegExp(pattern, "i").test(document.body.innerText),
      value,
      { timeout, polling: 500 }
    )
    .catch(() => {});
}

async function act(page, op) {
  if (op.act === "click") {
    await locator(page, op.sel).click({ timeout: op.timeout || 30000 });
    await sleep(page, 450);
    return;
  }

  if (op.act === "fill") {
    const target = locator(page, op.sel);
    await target.click({ timeout: op.timeout || 30000 });
    await target.fill(String(op.value), { timeout: op.timeout || 30000 });
    if (op.commit) await target.press(op.commit, { timeout: op.timeout || 30000 });
    await sleep(page, 500);
    return;
  }

  if (op.act === "sleep") {
    await sleep(page, op.ms);
    return;
  }

  if (op.act === "waitText") {
    await waitText(page, op.value, op.timeout || 90000);
    await sleep(page, 650);
    return;
  }

  if (op.act === "scrollText") {
    await page.evaluate((pattern) => {
      const rx = new RegExp(pattern, "i");
      const node = [...document.querySelectorAll("*")].find(
        (el) => rx.test(el.textContent || "") && el.children.length < 8
      );
      if (node) node.scrollIntoView({ block: "center", inline: "nearest" });
    }, op.value);
    await sleep(page, 500);
  }
}

async function openPage(browser, spec) {
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(60000);
  await page.goto(urlFor(spec.start || "/"), { waitUntil: "domcontentloaded" });
  await waitText(page, "VisualLabs|Generate image", 60000);
  await sleep(page, 1200);
  return page;
}

async function captureSpec(browser, spec) {
  const dir = join(PUB, spec.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const page = await openPage(browser, spec);
  const steps = [];
  let n = 0;

  try {
    for (const op of spec.steps) {
      if (op.cap && op.burst) {
        const every = op.burst.every || 320;
        const count = Math.max(2, Math.round((op.burst.ms || 2800) / every));
        const imgs = [];
        for (let b = 0; b < count; b++) {
          const name = `${String(n).padStart(2, "0")}_${String(b).padStart(2, "0")}.png`;
          await page.screenshot({ path: join(dir, name) });
          imgs.push(`wt/${spec.id}/${name}`);
          if (b < count - 1) await sleep(page, every);
        }
        steps.push({ imgs, caption: op.cap, cursor: null, click: false, hold: op.hold || 72, burst: true });
        console.log(`  ${spec.id} burst ${n}: ${imgs.length} frames - ${op.cap}`);
        n++;
        continue;
      }

      if (op.cap) {
        const cur = await cursorOf(page, op.cursor);
        const name = `${String(n).padStart(2, "0")}.png`;
        await sleep(page, 300);
        await page.screenshot({ path: join(dir, name) });
        steps.push({
          img: `wt/${spec.id}/${name}`,
          caption: op.cap,
          cursor: cur,
          click: !!op.click,
          hold: op.hold || DEFAULT_HOLD,
        });
        console.log(`  ${spec.id} cap ${n}: ${op.cap}`);
        n++;
        continue;
      }

      await act(page, op);
    }
  } catch (error) {
    await page.screenshot({ path: join(dir, "zz-fail.png") }).catch(() => {});
    const body = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 500))
      .catch(() => "(unreadable)");
    console.error(`${spec.id} failed: ${error.message.split("\n")[0]}`);
    console.error(`fail-state: ${body}`);
    throw error;
  } finally {
    await page.close().catch(() => {});
  }

  return { id: spec.id, title: spec.title, accent: spec.accent, steps };
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const walkthroughs = [];
    for (const spec of SPECS) {
      walkthroughs.push(await captureSpec(browser, spec));
    }

    const data =
      "// AUTO-GENERATED by walkthrough.visual.mjs - do not edit by hand.\n" +
      "export const VISUAL_WALKTHROUGHS = " +
      JSON.stringify(walkthroughs, null, 2) +
      ";\n";
    writeFileSync(join(__dirname, "src", "walkthrough.visual.data.js"), data);
    console.log("VISUAL_WALKTHROUGH_CAPTURE_DONE - wrote src/walkthrough.visual.data.js");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
