import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIVE_URL = process.env.ROOMOS_URL || "https://room-os-live.vercel.app";
const OUT_ID = "RoomOSV0123";
const PUB_DIR = join(__dirname, "public", "wt-roomos", OUT_ID);
const ASSETS_DIR = join(__dirname, "assets");
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

const verdict = (label, text, tone = "neutral") => ({ label, text, tone });
const verdicts = (byKey) => PROFILES.map((profile) => byKey[profile.key] || null);
const cell = (text, tone = "neutral") => ({ text, tone });

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
    () => {
      const text = document.body.innerText || "";
      const url = new URL(window.location.href);
      return (
        url.searchParams.has("room") ||
        Boolean(document.querySelector('[placeholder="Message or steer the agents"]')) ||
        /roomState|live roomState|Room created|Scan from your phone/i.test(text)
      );
    },
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

const hideInvitePanel = async (page) => {
  await page.getByText(/Scan from your phone/i).first().waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
  const hasInvite = await page.evaluate(() => /Scan from your phone/i.test(document.body.innerText)).catch(() => false);
  if (hasInvite) {
    await page.getByRole("button", { name: /Invite/i }).first().click().catch(() => {});
    await page
      .waitForFunction(() => !/Scan from your phone/i.test(document.body.innerText), { timeout: 5000, polling: 200 })
      .catch(() => {});
  }
};

const scrollTranscriptBottom = async (page) => {
  await page
    .evaluate(() => {
      const scrollables = [...document.querySelectorAll("div")]
        .filter((el) => el.scrollHeight > el.clientHeight + 24)
        .sort((a, b) => b.clientHeight - a.clientHeight);
      const transcript =
        scrollables.find((el) => /Ada|Ben|you|Start|Resume|steer/i.test(el.textContent || "")) || scrollables[0];
      if (transcript) transcript.scrollTop = transcript.scrollHeight;
    })
    .catch(() => {});
  await sleep(page, 250);
};

const scrollAllTranscripts = async (panes) => {
  await Promise.all(panes.map(({ page }) => scrollTranscriptBottom(page)));
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
  await page.getByPlaceholder("Message or steer the agents").first().waitFor({ state: "visible", timeout: 60000 });
  await sleep(page, 1200);
  await hideInvitePanel(page);
  await sleep(page, 500);
  return { profile, context, page, lastCursor: null, lastZoom: null };
};

const snap = async (panes, stepIndex, caption, detail, options = {}) => {
  await Promise.all(panes.map(({ page }) => hideInvitePanel(page).catch(() => {})));
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
    scene: options.scene,
    axis: options.axis,
    question: options.question,
    caption,
    detail,
    takeaway: options.takeaway,
    hold: options.hold || 84,
    burst,
    layout: options.layout || "grid",
    focusPane: typeof options.focusPane === "number" ? options.focusPane : undefined,
    verdicts: options.verdicts || [],
    scorecard: options.scorecard,
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

const exportStateJsonAll = async (panes) => {
  const exported = {};
  mkdirSync(ASSETS_DIR, { recursive: true });

  for (const pane of panes) {
    const raw = await pane.page.evaluate(() => {
      const pres = [...document.querySelectorAll("pre")].map((node) => node.textContent || "");
      return (
        pres.find((text) =>
          /"(transcriptOnlyState|roomReducerState|workRoomState|agentOsState)"/.test(text),
        ) || ""
      );
    });

    if (!raw.trim()) {
      throw new Error(`Could not find state JSON for ${pane.profile.key}`);
    }

    const parsed = JSON.parse(raw);
    const pretty = `${JSON.stringify(parsed, null, 2)}\n`;
    const file = `room-os-${pane.profile.key}-state.json`;
    writeFileSync(join(ASSETS_DIR, file), pretty);
    exported[pane.profile.key] = { file: `assets/${file}`, bytes: Buffer.byteLength(pretty) };
  }

  return exported;
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
    const focusPane = (key) => PROFILES.findIndex((profile) => profile.key === key);
    const zoomAll = (x, y, scale) => Object.fromEntries(PROFILES.map((p) => [p.key, { x, y, scale }]));

    steps.push(
      await snap(
        panes,
        0,
        "Test setup: same task, same interrupt, four room versions",
        "All panes are live production rooms. We start with trip planning, then send the same steer: count 1-6, one agent per turn.",
        {
          hold: 108,
          scene: "SCENE 1 / SETUP",
          axis: "same live task, four architectures",
          question: "What changes when the room owns state instead of only chat?",
          takeaway: "The evidence is live UI; the story is the coordination layer.",
          verdicts: verdicts({
            v0: verdict("baseline", "Transcript-only coordination.", "fail"),
            v1: verdict("state", "Reducer owns floor and progress.", "pass"),
            v2: verdict("intent", "Interrupts become typed room intent.", "strong"),
            v3: verdict("os", "Goals, workers, cost, latency, traces.", "strong"),
          }),
          zoom: zoomAll(620, 218, 1.18),
        },
      ),
    );

    const startCursors = await startAll(panes);
    steps.push(
      await snap(
        panes,
        1,
        "Baseline: every version can produce a normal agent turn",
        "This is not the win condition. The comparison starts when the user changes the mission while the agents are already moving.",
        {
          hold: 92,
          scene: "SCENE 2 / BASELINE",
          axis: "before the interrupt",
          question: "Can each version talk before the mission changes?",
          takeaway: "Speech is table stakes; durable retargeting is the test.",
          active: "all",
          cursor: startCursors,
          click: true,
          verdicts: verdicts({
            v0: verdict("talks", "Can produce transcript output.", "neutral"),
            v1: verdict("talks", "Can produce output plus roomState.", "pass"),
            v2: verdict("talks", "Can produce output plus intent lane.", "pass"),
            v3: verdict("talks", "Can produce output plus control plane.", "strong"),
          }),
        },
      ),
    );

    await Promise.all(panes.map(({ page }) => waitForTurnAtLeast(page, 1, 90000)));
    await scrollAllTranscripts(panes);
    steps.push(
      await snap(
        panes,
        2,
        "V0: model output exists, but progress is only implied",
        "This is the failure baseline. Ada and Ben can speak, but the room has no authoritative count target, no typed interrupt, and no worker ledger.",
        {
          hold: 122,
          scene: "SCENE 3 / V0 FAILURE",
          axis: "memory source",
          question: "What proof exists after the first model turn?",
          takeaway: "A transcript is evidence of words, not control of work.",
          verdicts: verdicts({
            v0: verdict("failure", "Only transcript rows; no durable progress object.", "fail"),
            v1: verdict("contrast", "Adds reducer state.", "pass"),
            v2: verdict("contrast", "Adds typed retargeting.", "strong"),
            v3: verdict("contrast", "Adds an agent OS layer.", "strong"),
          }),
          burst: true,
          frames: 5,
          every: 500,
          layout: "focus",
          focusPane: focusPane("v0"),
          zoom: zoomAll(640, 520, 1.38),
        },
      ),
    );

    const steerCursors = await steerAll(panes);
    await scrollAllTranscripts(panes);
    steps.push(
      await snap(
        panes,
        3,
        "Same human input: switch goals and count from 1 to 6",
        "The exact same steer is sent to every room. After this moment, the only thing that matters is whether the room preserves the new mission.",
        {
          hold: 104,
          scene: "SCENE 4 / CONFLICT",
          axis: "same human interrupt",
          question: "Does the steer become authoritative state or just another message?",
          takeaway: "This is the plot turn: new goal, same live run.",
          active: "all",
          cursor: steerCursors,
          click: true,
          zoom: zoomAll(640, 655, 1.28),
          verdicts: verdicts({
            v0: verdict("risk", "Steer is transcript text.", "fail"),
            v1: verdict("state", "Reducer can retarget count state.", "pass"),
            v2: verdict("intent", "Intent router interprets the interrupt.", "strong"),
            v3: verdict("work", "Goal graph can spawn structured work.", "strong"),
          }),
        },
      ),
    );

    await Promise.all(panes.map(({ page }) => waitForTurnAtLeast(page, 3, 120000)));
    await scrollAllTranscripts(panes);
    steps.push(
      await snap(
        panes,
        4,
        "V1: reducer-owned count and floor state",
        "The transcript shows the agent messages; the roomState strip shows floor, turn, next act, and count progress as authoritative state.",
        {
          hold: 128,
          scene: "SCENE 5 / STATE PROOF",
          axis: "reducer-owned progress",
          question: "Can progress be proven without trusting the next LLM sentence?",
          takeaway: "The room, not the model prose, owns the count.",
          verdicts: verdicts({
            v0: verdict("missing", "Still transcript-only.", "fail"),
            v1: verdict("proof", "Count, floor, turn, and act are visible.", "pass"),
            v2: verdict("inherits", "Keeps reducer state plus intent.", "strong"),
            v3: verdict("inherits", "Keeps state plus work control.", "strong"),
          }),
          burst: true,
          frames: 6,
          every: 520,
          layout: "focus",
          focusPane: focusPane("v1"),
          zoom: zoomAll(650, 515, 1.36),
        },
      ),
    );

    await Promise.all(panes.map(({ page }) => waitForTurnAtLeast(page, 5, 150000)));
    await scrollAllTranscripts(panes);
    steps.push(
      await snap(
        panes,
        5,
        "V2: the interrupt is routed as work-room intent",
        "V2 keeps the human steer visible while using typed intent to retarget active work instead of treating it as loose chat.",
        {
          hold: 128,
          scene: "SCENE 6 / INTENT ROUTING",
          axis: "interrupt semantics",
          question: "Does the system understand the steer as control, not conversation?",
          takeaway: "The steer becomes a durable work-room event.",
          verdicts: verdicts({
            v0: verdict("missing", "No typed control event.", "fail"),
            v1: verdict("partial", "Stateful, but less semantic.", "pass"),
            v2: verdict("proof", "Typed intent retargets the active room.", "strong"),
            v3: verdict("extends", "Typed work feeds the goal graph.", "strong"),
          }),
          burst: true,
          frames: 6,
          every: 500,
          layout: "focus",
          focusPane: focusPane("v2"),
          zoom: zoomAll(640, 530, 1.34),
        },
      ),
    );

    await Promise.all(panes.map(({ page }) => waitForTurnAtLeast(page, 6, 150000)));
    await scrollAllTranscripts(panes);
    steps.push(
      await snap(
        panes,
        6,
        "V3: goals, workers, cost, latency, and artifacts are first-class",
        "V3 shifts the comparison from counting correctly to operating a budgeted agent workroom with policy, workers, artifacts, and runtime stats.",
        {
          hold: 136,
          scene: "SCENE 7 / AGENT OS",
          axis: "parallel work control",
          question: "What does V3 add once basic steering works?",
          takeaway: "This is where the demo becomes an operating system, not a chat room.",
          verdicts: verdicts({
            v0: verdict("baseline", "No worker or budget layer.", "fail"),
            v1: verdict("foundation", "Stateful turn-taking.", "pass"),
            v2: verdict("foundation", "Stateful intent routing.", "strong"),
            v3: verdict("delta", "Goals, tasks, workers, artifacts, cost, latency.", "strong"),
          }),
          burst: true,
          frames: 6,
          every: 520,
          layout: "focus",
          focusPane: focusPane("v3"),
          zoom: {
            ...zoomAll(640, 390, 1.26),
            v3: { x: 628, y: 255, scale: 1.58 },
          },
        },
      ),
    );

    const stateCursors = await openStateAll(panes);
    const exportedStateJson = await exportStateJsonAll(panes);
    console.log(`Exported state JSON: ${JSON.stringify(exportedStateJson)}`);
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
        7,
        "State drawer: receipts behind the conversation",
        "The drawer exposes reducer snapshots and trace payloads: participants, utterance limits, V3 goals, tasks, workers, artifacts, and world beliefs.",
        {
          hold: 142,
          scene: "SCENE 8 / AUDIT",
          axis: "human inspectability",
          question: "Can a human inspect exactly what happened after the run?",
          takeaway: "Trust comes from inspectable internal state, not vibes.",
          active: "all",
          cursor: stateCursors,
          click: true,
          layout: "focus",
          focusPane: focusPane("v3"),
          zoom: stateZooms,
          verdicts: verdicts({
            v0: verdict("thin", "Transcript is the main receipt.", "warn"),
            v1: verdict("state", "Reducer snapshot is inspectable.", "pass"),
            v2: verdict("trace", "Intent and reducer state are inspectable.", "strong"),
            v3: verdict("full", "Goals, workers, artifacts, costs, traces.", "strong"),
          }),
        },
      ),
    );

    steps.push(
      await snap(
        panes,
        8,
        "Final decision: from agents talking to agent work being governed",
        "The viewer should leave knowing exactly what each version proves, what it cannot prove, and why V3 is the full live-room target.",
        {
          hold: 164,
          scene: "SCENE 9 / VERDICT",
          axis: "decision table",
          question: "What changed from V0 to V3?",
          takeaway: "V3 is the goal; V1/V2 are the required stepping stones.",
          layout: "scorecard",
          scorecard: {
            title: "Room OS V0 -> V3: what the live run proves",
            subtitle:
              "Same task, same interrupt, same production surface. The difference is how much work state the room can own, expose, and govern.",
            columns: PROFILES.map((profile) => profile.title),
            rows: [
              {
                axis: "Memory",
                cells: [
                  cell("Transcript only.", "fail"),
                  cell("Reducer state.", "pass"),
                  cell("Reducer plus typed intent.", "strong"),
                  cell("Goal graph plus world beliefs.", "strong"),
                ],
              },
              {
                axis: "Interrupt",
                cells: [
                  cell("Loose chat; easy to lose.", "fail"),
                  cell("Retargets count state.", "pass"),
                  cell("Parsed as room-control intent.", "strong"),
                  cell("Can become new goals and workstreams.", "strong"),
                ],
              },
              {
                axis: "Progress",
                cells: [
                  cell("Inferred from words.", "fail"),
                  cell("Count, floor, act, done are explicit.", "pass"),
                  cell("State plus semantic steer history.", "strong"),
                  cell("Goals, tasks, workers, artifacts.", "strong"),
                ],
              },
              {
                axis: "Parallel work",
                cells: [
                  cell("None.", "fail"),
                  cell("Single room loop.", "neutral"),
                  cell("Single room plus intent lane.", "pass"),
                  cell("Worker budget and task lanes.", "strong"),
                ],
              },
              {
                axis: "Cost/latency",
                cells: [
                  cell("Hidden.", "fail"),
                  cell("Hidden.", "warn"),
                  cell("Hidden.", "warn"),
                  cell("Expected cost, expected latency, observed runtime.", "strong"),
                ],
              },
              {
                axis: "Audit",
                cells: [
                  cell("Read the transcript manually.", "warn"),
                  cell("Inspect roomState and traces.", "pass"),
                  cell("Inspect typed intent plus state.", "strong"),
                  cell("Inspect full control plane and trace payloads.", "strong"),
                ],
              },
            ],
          },
        },
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
