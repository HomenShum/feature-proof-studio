# NODE-LOOPS.md — feature-proof-studio

> This repo's self-improving-loop manifest. Companion to CLAUDE.md. Spec: https://github.com/HomenShum/noderl/blob/main/spec/node-loops.md

This repo has no `CLAUDE.md`; its agent-facing behavior contract is [`SKILL.md`](SKILL.md)
(it ships as a Claude Code skill). NODE-LOOPS.md defines the *loop* the skill runs:
**spec → capture → render → judge → self-heal**. The loop's reward is **visual** — a
separate video model scores the rendered walkthrough against an anti-hero-shot bar.

---

## 1. Goal & milestones

**Goal.** Turn any web feature into a *truthful, annotated walkthrough GIF* — every UI
state (empty → action → loading → result), an overlaid cursor that glides to and
ripples on each click, step captions, a zoom-to-focus camera, a progress bar. Never a
single final-state "hero shot." The spec is a checked-in tape, so the GIF doubles as a
**regenerable integration smoke-test of the UI**
([README.md](README.md) "Why" + "How it works").

**What "good" is (the milestone the loop checks against).** The rendered cut must clear
the 8-dimension anti-hero-shot rubric in [`judge-video.mjs`](judge-video.mjs):
`state_coverage · cursor_truth · caption_sync · pacing · legibility · proof_feel ·
safety · loop_etiquette`, each scored 0–2, with a verdict of `publish` /
`fix-then-publish` / `rework`.

Concrete deliverable milestones (all have shipped receipts in [`assets/`](assets/)):
- single-pane Streamlit feature demos — 5 ParselyFi tabs in [`walkthrough.specs.mjs`](walkthrough.specs.mjs)
- the bundled solo-founder worked example — frames pre-captured under `public/wt/SoloFounder/`, renders via `npm run render:example`
- multi-pane live-collab demos — N independent browser contexts side-by-side ([`walkthrough.collab.mjs`](walkthrough.collab.mjs), [`walkthrough.collab.specs.mjs`](walkthrough.collab.specs.mjs))
- real deployed-app proof — NodeRoom Convex+React walkthroughs ([`walkthrough.noderoom.specs.mjs`](walkthrough.noderoom.specs.mjs))

---

## 2. Inner loop — capture → render → judge

The unit of work is **one feature spec → one rendered clip → one judge verdict.**

**State / action / observation = driving a real browser through a spec.**
[`walkthrough.specs.mjs`](walkthrough.specs.mjs) is an ordered list of ops per feature:
- `{ act, ... }` advances the UI — `fill | click | upload | sleep | waitText | notRunning | scrollEl | scrollText | scrollLastChat | scrollTop | scrollY` (the **action**).
- `{ cap, cursor?, click?, hold? }` captures a CLEAN frame of the current UI (the **observation/state**) and records the pointer target (element center in viewport CSS px) and a click flag.
- `{ cap, burst: { ms, every } }` captures a *rapid sequence* of the loading/streaming state so the clip shows real motion (spinner spinning, results streaming in), not a frozen snapshot.

[`walkthrough.mjs`](walkthrough.mjs) is the capture engine: launches headless Chromium
at 1280×800 @2×, drives each spec, screenshots frames to `public/wt/<id>/NN.png`, and
emits `src/walkthrough.data.js` (the auto-generated per-step trace consumed by the
renderer). The cursor is **not baked into the screenshot** — coords are recorded so
Remotion can animate them; frames stay clean.

**Render.** Remotion (`src/Walkthrough.jsx` single-pane, `src/Walkthrough2up.jsx`
multi-pane) overlays the animated cursor + click ripple + caption + progress bar and
runs an Arcade-style zoom/pan camera (zoom ~1.36× to the click, pull back ~1.14× on the
result). `npx remotion render src/index.js WT-<id> out/WT-<id>.mp4`, then a two-pass
ffmpeg palette (`stats_mode=diff` + `lanczos` + `bayer` + `diff_mode=rectangle`) →
`assets/feature-*.gif`.

**The JUDGE = a separate video model, not the thing that drove the browser.**
[`judge-video.mjs`](judge-video.mjs) sends the rendered MP4 (the pre-palette render,
because GIF is not a supported Gemini video MIME) to Gemini video understanding
(`GEMINI_JUDGE_MODEL`, default `gemini-3.5-flash`) with the anti-hero-shot `RUBRIC`. It
returns strict JSON: per-dimension `{score, evidence}` **with timestamps**, a `defects`
list (each `{ts, severity, observed, fix}`), and an overall `verdict`. It writes
`out/<name>.judge.json` + `out/<name>.judge.md` (a scored table + timestamped defect
list) as the durable receipt.

**Reward signal.** The 0–16 rubric total + the verdict + the timestamped defect list.
The reward is explicitly *visual* and *outcome-grounded* (`proof_feel`,
`state_coverage`, `cursor_truth`) — it rewards showing the real flow, not a polished end
screen.

---

## 3. Outer loop — self-heal from judge defects

The judge does not auto-patch; the **agent/human running the skill** consumes the
defect list and edits upstream. The repair targets are, in order of leverage:
- **the spec** ([`walkthrough.specs.mjs`](walkthrough.specs.mjs)) — wrong cursor target, missed loading state, a `cap` placed before the result rendered, a caption that doesn't match the screen.
- **the capture engine** ([`walkthrough.mjs`](walkthrough.mjs)) — flaky waits, unscoped locators, missing `notRunning`/`waitText` guards.
- **the render** (`src/Walkthrough*.jsx`) — pacing/hold, legibility, loop length.
- **the app/UI itself** — a defect the walkthrough *exposed*. (Capture has surfaced real product bugs: a returning-visitor collapsed layout that nothing else exercised — [`SKILL.md`](SKILL.md) lesson 10.)

**Promotion gate (severity policy, [`judge-video.mjs`](judge-video.mjs) header).**
`P0` blocks publishing · `P1` fix before posting · `P2` log and ship. A clip is promoted
to `assets/` and embedded in the README only at verdict `publish` (or `fix-then-publish`
after P0/P1 are cleared).

**Kill criteria (anti-perpetual-polish).** Do **not** enter a re-render loop for `P2`s
the judge already passed — log and ship. For nondeterministic (LLM-backed) capture
steps, retries are *bounded*: a spec opts in with `retries: N`; each attempt wipes the
frame dir and reopens a **fresh** page, then gives up and ships the failure-forensics
frame (`zz-fail.png`) rather than re-capturing a poisoned UI forever
([`walkthrough.mjs`](walkthrough.mjs) `openHarness` + the per-attempt loop;
[`SKILL.md`](SKILL.md) lessons 9–10). Some flows are deliberately *not* made
walkthrough-able and are driven by a deterministic engine instead — but root-cause
first, don't paper over ([`SKILL.md`](SKILL.md) lessons 5, 12).

---

## 4. Context anchors

**Spec tapes (the loop's input state):**
- [`walkthrough.specs.mjs`](walkthrough.specs.mjs) — 5 single-pane Streamlit feature specs (ParselyFi)
- [`walkthrough.collab.specs.mjs`](walkthrough.collab.specs.mjs) — multi-pane live-collab specs
- [`walkthrough.noderoom.specs.mjs`](walkthrough.noderoom.specs.mjs) — real deployed-app (NodeRoom) specs
- [`walkthrough.solo-founder.specs.mjs`](walkthrough.solo-founder.specs.mjs) — non-Streamlit (React SPA, hash routes) specs

**Capture / render engines:**
- [`walkthrough.mjs`](walkthrough.mjs) — single-pane Playwright capture → `src/walkthrough.data.js`
- [`walkthrough.collab.mjs`](walkthrough.collab.mjs) — N-context multi-pane capture (one `browser.newContext()` per persona)
- [`walkthrough.solo-founder.mjs`](walkthrough.solo-founder.mjs) — React-SPA adaptation (`goto` action for URL nav)
- `src/Root.jsx`, `src/index.js`, `src/Walkthrough.jsx`, `src/Walkthrough2up.jsx` — Remotion compositions
- `src/walkthrough.data.js`, `src/walkthrough.collab.data.js` — **auto-generated** per-step traces (do not hand-edit)

**Judge (separate verifier) + rubric:**
- [`judge-video.mjs`](judge-video.mjs) — Gemini video judge; the `RUBRIC` constant is the 8-dimension anti-hero-shot bar + severity policy.

**Behavior contract & design grounding:**
- [`SKILL.md`](SKILL.md) — the agent's how-to, including the hard-won capture lessons (presence-before-negative-assertion, scope to active tab panel, canvas data-grids, capture-loading-on-purpose, retry-in-fresh-env, failure forensics, one-context-per-persona).
- [`STACK_GUIDELINES.md`](STACK_GUIDELINES.md) — per-stack capture pattern (Streamlit single-cursor vs Convex+React multi-pane vs Next.js+SQL); which SDK primitives produce capturable motion.
- [`README.md`](README.md) — the 4-stage pipeline + design principles (researched).

**Fixtures & worked examples (reproduce-anywhere receipts):**
- [`fixtures/`](fixtures/) — `cap_table.png`, `memo.md`, `make_cap_table.py` (capture inputs)
- [`examples/collab-demo/`](examples/collab-demo/) — zero-dependency local SSE app reproducing the Convex reactive pattern (no cloud login)
- [`examples/convex-reference/`](examples/convex-reference/) — the real Convex+React implementation, mapped 1:1
- [`public/wt/SoloFounder/`](public/wt/) — pre-captured frames for `npm run render:example`
- [`assets/`](assets/) — the shipped GIFs (the promoted receipts)

**Absence-is-a-finding (honest gaps).** There is **no** `CLAUDE.md`, no memory
substrate, no codebase graph, and no OKF/RAG knowledge layer in this repo. The outer
loop is **not automated** — the judge emits `out/*.judge.{json,md}`, but nothing in this
repo reads that JSON to auto-edit a spec or re-trigger capture; a human/agent closes the
loop by hand per the severity policy. Per the spec, that puts this repo in the
**lighter, hand-written / control-arm** category, not the full agent-status substrate.

---

## 5. Verification protocol

- **Separate verifier — not the author.** The verdict comes from a Gemini *video*
  model ([`judge-video.mjs`](judge-video.mjs)) watching the rendered MP4, distinct from
  the Playwright capture engine that produced it. Scores require **specific evidence +
  timestamps**; a bare number is not accepted by the rubric.
- **No-blank-frame / presence before negative assertion.** A negative wait ("spinner is
  gone") passes vacuously on a page that never rendered — `notRunning` in
  [`walkthrough.mjs`](walkthrough.mjs) first requires the active panel to **exist**,
  then waits for the spinner's absence. This exact bug once produced a "passing"
  multi-user capture where user 2's panel was never mounted ([`SKILL.md`](SKILL.md) lesson 8).
- **Don't match caption text in wait conditions** — wait on a post-result-only signal
  (a computed value, a `status=complete` label), not a string that already exists in a
  header ([`SKILL.md`](SKILL.md) lesson 7).
- **Bounded retries on nondeterministic steps** — `retries: N`, each attempt in a fresh
  page; no unbounded re-capture of a poisoned UI ([`walkthrough.mjs`](walkthrough.mjs)).
- **Failure forensics** — on any capture error, freeze `zz-fail.png` + a body-text
  snippet before retrying/shipping, so "which state was the page actually in" is one
  image, not an hour of guessing.
- **Inline-size guard** — the judge refuses MP4s > ~19 MB inline (points you to the
  Files API / a smaller cut) rather than failing opaquely.
- **PROVE-BEFORE-CLAIM** (agent-side gate) — never assert done/pass/fixed/blocked/absent/"root cause" from a *proxy* (an affordance, a keyword/template echo, a rendered shell, or a prior-based hypothesis); name the artifact that proves it and check THAT, independent-confirm anything that "looks done", and treat no gate as real until the autonomous path is tried. Canonical gate + observed failure signals: https://github.com/HomenShum/noderl/blob/main/spec/prove-before-claim.md

---

## 6. Reward & safety

**Reward components** (the judge rubric, [`judge-video.mjs`](judge-video.mjs)):
`state_coverage`, `cursor_truth`, `caption_sync`, `pacing`, `legibility`, `proof_feel`,
`safety`, `loop_etiquette` — 0–2 each, summed to /16, gated by the `publish /
fix-then-publish / rework` verdict.

**Safety gates:**
- **`safety` is a first-class scored dimension** — the judge flags any visible secrets,
  API keys, tokens, real personal data, or internal URLs that should not ship; such a
  finding is a publish-blocking defect, not a polish nit.
- **Clean / no-auth harness** — capture runs against a demo/no-auth state
  (`DEMO_CLEAN=1`-style flag) so toolbars, chrome, and real user data stay out of frame
  ([`README.md`](README.md) Prerequisites; [`SKILL.md`](SKILL.md)).
- **Real keys exercise the real app** — capture hits live services if the feature does
  (so the demo is honest), but the rendered cut is then scanned by the `safety`
  dimension before promotion.
- **No-clobber / persona isolation** — multi-pane capture uses one
  `browser.newContext()` per persona; two pages in one context share `localStorage`, so
  "user 2" would silently reuse user 1's session and every multi-user claim would be
  fake ([`SKILL.md`](SKILL.md) lesson 11).
- **Loop etiquette** — `loop_etiquette` penalizes over-long GIFs / final-state holds so
  a looping README embed doesn't strand a viewer on the second loop.

---

## 7. Status / receipts

**PROVEN (shipped artifacts in this repo):**
- The full **spec → capture → render → ffmpeg** pipeline is real and end-to-end runnable; the bundled solo-founder example ships pre-captured frames and renders with no app via `npm run render:example` ([`package.json`](package.json), `public/wt/SoloFounder/`).
- The **separate video judge** is real: [`judge-video.mjs`](judge-video.mjs) (`npm run judge`) with a concrete 8-dimension rubric, timestamped defects, and a severity-gated verdict.
- **Single-pane** (Streamlit, 5 tabs), **multi-pane live-collab**, and **real deployed-app** (NodeRoom Convex+React) walkthroughs all have shipped GIFs in [`assets/`](assets/): `feature-noderoom-{hero,solo,sync,bulk,deepdive,collab}.gif`, `feature-collab{,-3up}.gif`, `solo-founder-walkthrough.gif`.
- The capture engine encodes its own reliability hardening (presence guards, bounded retries, failure forensics, per-persona contexts) — see [`walkthrough.mjs`](walkthrough.mjs) + [`SKILL.md`](SKILL.md).

**OPEN (honest gaps, no overclaim):**
- **No `*.judge.json` receipts are committed** in this repo — the judge runs on demand and writes to `out/` (gitignored). The published-quality bar is documented and runnable, but per-clip judge scores are not checked in here. (No scores are invented in this manifest.)
- **The outer loop is manual.** Nothing reads the judge JSON to auto-edit a spec or re-trigger capture; closing the loop is a human/agent step under the severity policy.
- **No agent-status substrates** (memory store, codebase graph, OKF/RAG) — this repo is the spec's lighter / control-arm case.
