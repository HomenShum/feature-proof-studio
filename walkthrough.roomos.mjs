import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIVE_URL = process.env.ROOMOS_URL || "https://room-os-live.vercel.app";
const OUT_ID = "RoomOSV0123";
const PUB_DIR = join(__dirname, "public", "wt-roomos", OUT_ID);
const DATA_FILE = join(__dirname, "src", "walkthrough.roomos.data.js");
const VW = 1280;
const VH = 720;

const PROFILES = [
  {
    key: "v0",
    title: "V0 Failure",
    note: "raw transcript",
    buttonTitle: "V0 Failure: raw transcript",
  },
  {
    key: "v1",
    title: "V1 Room State",
    note: "shared reducer",
    buttonTitle: "V1 Room State: shared reducer",
  },
  {
    key: "v2",
    title: "V2 Work Room",
    note: "typed intent",
    buttonTitle: "V2 Work Room: intent router",
  },
  {
    key: "v3",
    title: "V3 Agent OS",
    note: "goal graph",
    buttonTitle: "V3 Agent OS: goal graph",
  },
];

const INITIAL_GOAL =
  "Plan a short Saturday in San Francisco for two friends, then agree on the next concrete step.";
const INTERRUPT =
  "Actually switch goals: count from 1 to 6 out loud, one number per agent turn, stopping exactly at 6. Do not overlap.";

const sleep = (page, ms) => page.waitForTimeout(ms);

const centerOf = async (page, locator) => {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    const box = await locator.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 22) };
    });
    return {
      x: Math.max(8, Math.min(VW - 8, Math.round(box.x))),
      y: Math.max(8, Math.min(VH - 8, Math.round(box.y))),
    };
  } catch {
    return null;
  }
};

const focusOfText = async (page, text) => {
  try {
    const locator = page.getByText(new RegExp(text, "i")).first();
    await locator.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    const box = await locator.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    return {
      x: Math.max(0, Math.min(VW, Math.round(box.x))),
      y: Math.max(0, Math.min(VH, Math.round(box.y))),
      scale: 1.34,
    };
  } catch {
    return null;
  }
};

const waitForRoom = async (page) => {
  await page.waitForFunction(
    () => /roomState|live roomState|Start|Invite/i.test(document.body.innerText),
    { timeout: 90000, polling: 750 },
  );
};

const waitForTurnAtLeast = async (page, turn, timeout = 90000) => {
  await page
    .waitForFunction(
      (target) => {
        const match = document.body.innerText.match(/turn\s+(\d+)/i);
        return match ? Number(match[1]) >= target : false;
      },
      turn,
      { timeout, polling: 900 },
    )
    .catch(() => {});
};

const createRoom = async (browser, profile, runId) => {
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[${profile.key}] browser console: ${msg.text()}`);
  });
  await page.goto(`${LIVE_URL}/?walkthrough=${runId}-${profile.key}`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("What should the agents work on together?").fill(INITIAL_GOAL);
  await page.locator(`button[title="${profile.buttonTitle}"]`).click();
  await page.getByRole("button", { name: /Create room/i }).click();
  await waitForRoom(page);
  await sleep(page, 1200);
  await page.getByRole("button", { name: /Invite/i }).click().catch(() => {});
  await sleep(page, 500);
  return { profile, context, page, lastCursor: null, lastZoom: null };
};

const snap = async (panes, stepIndex, caption, detail, options = {}) => {
  const burst = Boolean(options.burst);
  const burstCount = burst ? options.frames || 8 : 1;
  const paneSteps = PROFILES.map(() => ({ imgs: [] }));
  for (let frame = 0; frame < burstCount; frame += 1) {
    if (burst && frame > 0) {
      await Promise.all(panes.map(({ page }) => sleep(page, options.every || 450)));
    }
    await Promise.all(
      panes.map(async (pane, paneIndex) => {
        const file = burst
          ? `${pane.profile.key}_${String(stepIndex).padStart(2, "0")}_${String(frame).padStart(2, "0")}.png`
          : `${pane.profile.key}_${String(stepIndex).padStart(2, "0")}.png`;
        await pane.page.screenshot({ path: join(PUB_DIR, file), fullPage: false });
        if (burst) paneSteps[paneIndex].imgs.push(`wt-roomos/${OUT_ID}/${file}`);
        else paneSteps[paneIndex].img = `wt-roomos/${OUT_ID}/${file}`;
      }),
    );
  }

  for (let paneIndex = 0; paneIndex < panes.length; paneIndex += 1) {
    const pane = panes[paneIndex];
    const isActive = options.active === "all" || options.active === pane.profile.key;
    paneSteps[paneIndex].cursor = isActive ? options.cursor?.[pane.profile.key] || null : null;
    paneSteps[paneIndex].click = isActive && Boolean(options.click);
    paneSteps[paneIndex].zoom = options.zoom?.[pane.profile.key] || null;
    paneSteps[paneIndex].prevCursor = pane.lastCursor;
    paneSteps[paneIndex].prevZoom = pane.lastZoom;
    paneSteps[paneIndex].active = isActive;
    if (paneSteps[paneIndex].cursor) pane.lastCursor = paneSteps[paneIndex].cursor;
    if (paneSteps[paneIndex].zoom) pane.lastZoom = paneSteps[paneIndex].zoom;
  }

  return {
    caption,
    detail,
    hold: options.hold || 84,
    burst,
    panes: paneSteps,
  };
};

const startAll = async (panes) => {
  const cursors = {};
  for (const pane of panes) {
    cursors[pane.profile.key] = await centerOf(pane.page, pane.page.getByRole("button", { name: /Start/i }).first());
  }
  await Promise.all(
    panes.map(({ page }) =>
      page
        .getByRole("button", { name: /Start/i })
        .first()
        .click()
        .catch(() => {}),
    ),
  );
  return cursors;
};

const steerAll = async (panes) => {
  const cursors = {};
  for (const pane of panes) {
    const input = pane.page.getByPlaceholder("Message or steer the agents").first();
    await input.fill(INTERRUPT);
    cursors[pane.profile.key] = await centerOf(pane.page, pane.page.locator('button[title="Send steer"]').first());
  }
  await Promise.all(
    panes.map(({ page }) =>
      page
        .locator('button[title="Send steer"]')
        .first()
        .click()
        .catch(() => {}),
    ),
  );
  return cursors;
};

const openStateAll = async (panes) => {
  const cursors = {};
  for (const pane of panes) {
    cursors[pane.profile.key] = await centerOf(pane.page, pane.page.getByRole("button", { name: /State/i }).first());
  }
  await Promise.all(
    panes.map(({ page }) =>
      page
        .getByRole("button", { name: /State/i })
        .first()
        .click()
        .catch(() => {}),
    ),
  );
  await Promise.all(panes.map(({ page }) => sleep(page, 900)));
  return cursors;
};

const run = async () => {
  const runId = Date.now().toString(36);
  rmSync(PUB_DIR, { recursive: true, force: true });
  mkdirSync(PUB_DIR, { recursive: true });

  console.log(`Capturing Room OS live walkthrough from ${LIVE_URL}`);
  console.log(`Run id: ${runId}`);

  const browser = await chromium.launch({ headless: true });
  let panes = [];
  const steps = [];
  try {
    panes = await Promise.all(PROFILES.map((profile) => createRoom(browser, profile, runId)));

    steps.push(
      await snap(
        panes,
        0,
        "Four fresh production rooms, one per agent version",
        "Each pane is a real room on room-os-live.vercel.app. Same starting goal, different coordination layer.",
        { hold: 92, zoom: Object.fromEntries(PROFILES.map((p) => [p.key, { x: 620, y: 205, scale: 1.16 }])) },
      ),
    );

    const startCursors = await startAll(panes);
    steps.push(
      await snap(
        panes,
        1,
        "Start the same planning task in every version",
        "V0 hears transcript only. V1 owns floor/count state. V2 routes interrupts. V3 also exposes goals, workers, artifacts, cost, and latency.",
        { hold: 76, active: "all", cursor: startCursors, click: true },
      ),
    );

    await Promise.all(panes.map(({ page }) => waitForTurnAtLeast(page, 1, 90000)));
    steps.push(
      await snap(
        panes,
        2,
        "Live model turns appear; the control surface is already different",
        "The visible difference is not intelligence. It is what state the system can inspect and commit.",
        { hold: 86, burst: true, frames: 6, every: 450 },
      ),
    );

    const steerCursors = await steerAll(panes);
    steps.push(
      await snap(
        panes,
        3,
        "Interrupt all rooms: switch from trip planning to counting",
        "This is the failure case: the human changes the mission mid-run and expects the room to stay coherent.",
        { hold: 86, active: "all", cursor: steerCursors, click: true },
      ),
    );

    await Promise.all(panes.map(({ page }) => waitForTurnAtLeast(page, 3, 120000)));
    steps.push(
      await snap(
        panes,
        4,
        "Reducer-owned state is what makes the steer durable",
        "V1/V2/V3 can expose turn, floor, count, done, and loop-risk state. V0 can only hope the next model reply remembers.",
        {
          hold: 96,
          burst: true,
          frames: 7,
          every: 520,
          zoom: Object.fromEntries(PROFILES.map((p) => [p.key, { x: 650, y: 118, scale: 1.42 }])),
        },
      ),
    );

    await Promise.all(panes.map(({ page }) => waitForTurnAtLeast(page, 6, 150000)));
    steps.push(
      await snap(
        panes,
        5,
        "End-to-end run: compare the room receipts",
        "The bounded transcript shows latest entries, while the roomState strip keeps the authoritative progress compact.",
        {
          hold: 96,
          burst: true,
          frames: 6,
          every: 500,
          zoom: Object.fromEntries(PROFILES.map((p) => [p.key, { x: 640, y: 360, scale: 1.18 }])),
        },
      ),
    );

    const stateCursors = await openStateAll(panes);
    const stateZooms = {};
    for (const pane of panes) {
      stateZooms[pane.profile.key] = (await focusOfText(pane.page, pane.profile.key === "v3" ? "expected" : "Internal State")) || {
        x: 620,
        y: 560,
        scale: 1.34,
      };
    }
    steps.push(
      await snap(
        panes,
        6,
        "Open the internal-state drawer for auditability",
        "V3 adds the agent-OS layer: policy, goal graph, workers, artifacts, expected cost, observed latency, and trace payloads.",
        { hold: 118, active: "all", cursor: stateCursors, click: true, zoom: stateZooms },
      ),
    );
  } finally {
    await Promise.all(panes.map(({ context }) => context.close().catch(() => {})));
    await browser.close();
  }

  const data = [
    {
      id: OUT_ID,
      title: "Room OS V0 -> V3",
      accent: "#8b5cf6",
      vw: VW,
      vh: VH,
      paneLabels: PROFILES.map((p) => p.title),
      paneNotes: PROFILES.map((p) => p.note),
      steps,
    },
  ];

  writeFileSync(
    DATA_FILE,
    `// AUTO-GENERATED by walkthrough.roomos.mjs - do not edit by hand.\nexport const ROOMOS_WALKTHROUGHS = ${JSON.stringify(data, null, 2)};\n`,
  );
  console.log(`Wrote ${steps.length} steps to ${DATA_FILE}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
