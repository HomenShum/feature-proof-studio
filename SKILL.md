---
name: feature-walkthrough-gif
description: >-
  Produce polished, annotated workflow-walkthrough GIFs for a web app (built/tested
  on Streamlit, works for any browser UI): each GIF shows EVERY UI state of a feature
  — empty form → cursor gliding to the input → the click (with a ripple) → the loading
  state → the final result — plus a step caption and progress bar, so a viewer sees
  exactly what was clicked and what happened. Use when the user wants per-feature demo
  GIFs / README "skill preview" clips that actually walk through the end-to-end flow
  rather than just showing a single final-state "hero shot". Pipeline = Playwright
  capture → generated step data → Remotion render → ffmpeg GIF.
---

# Feature Walkthrough GIF

Turn a live feature into a short, looping, **annotated walkthrough GIF**: clean
state frames + an overlaid cursor that glides to each click (with a ripple) +
per-step captions + a progress bar. The opposite of a single Ken-Burns "hero"
frame — the viewer follows the whole flow.

> **Designing for a specific stack?** What's worth showing — and single-pane vs
> multi-pane capture — differs by architecture. See [`STACK_GUIDELINES.md`](STACK_GUIDELINES.md)
> for Streamlit (single-user), Convex + React (live multi-user), and Next.js + SQL on
> Vercel, grounded in the latest SDK docs.

## When to use
- "Make a GIF that walks through the feature" / "show every step / where the user clicked".
- Per-feature README previews, changelog clips, PR demos, onboarding.
NOT for: a static screenshot (use a screenshot), or a full narrated marketing reel
(that's a different, longer composition).

## Output, at a glance
For each feature → one `assets/feature-<name>.gif` (~0.5–1.5 MB, ~10 s, loops),
embedded in the README. Made of N "steps", each a captured UI state with a caption.

## Prerequisites (verify first)
- The app running locally in a **no-auth / demo state** (Streamlit: a `dev_preview`
  harness; set a `DEMO_CLEAN=1`-style flag to hide toolbars/chrome for clean frames).
- A **Remotion** project (`npm i remotion @remotion/cli @remotion/bundler react react-dom`)
  and **Playwright** (`npm i -D playwright && npx playwright install chromium`).
- **ffmpeg** on PATH.
- Real API keys if the feature calls live services (capture exercises the real app).

## The four-stage pipeline
1. **Spec** — for each feature, write an ordered list of ops (see format below):
   `cap` = capture this UI state (+ where the cursor points); `act` = perform an
   action to advance the UI.
2. **Capture** — `node walkthrough.mjs` drives the app per spec, screenshots a CLEAN
   frame at each `cap`, records the pointer target (element center, viewport px) and
   click flag, and writes `src/walkthrough.data.js` + frames under `public/wt/<id>/`.
3. **Render** — Remotion `Walkthrough.jsx` overlays an animated cursor (glides between
   targets) + click ripple + step caption + progress bar, AND runs an Arcade-style
   **zoom/pan camera** (zoom ~1.36× to the click on action steps; pull back ~1.14×,
   centered, on the result state — the result is scrolled to viewport centre at capture).
   `npx remotion render src/index.js WT-<id> out/WT-<id>.mp4`.
4. **GIF** — two-pass palette (the single highest-leverage quality lever):
   `ffmpeg -i out/WT-<id>.mp4 -vf "fps=15,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" -loop 0 assets/feature-<name>.gif`.
   `stats_mode=diff` weights the palette to the moving region; `bayer` + `diff_mode=rectangle`
   keep static panels byte-identical frame-to-frame (no "swarming", smaller file).

## Spec format (`walkthrough.specs.mjs`)
A spec is `{ id, title, accent, tab, steps: [...] }`. Each step is ONE of:
- **Capture**: `{ cap: "Caption text", cursor?: "<selector>", click?: true, hold?: 60 }`
  Captures a clean frame of the CURRENT state. `cursor` marks where the pointer
  glides to; `click:true` draws a ripple there; `hold` = frames to dwell (30 fps).
- **Burst capture** (show the loading/STREAMING motion): `{ cap: "Running…", burst: { ms: 2800, every: 300 }, hold: 64 }`
  Rapidly screenshots the CURRENT state every `every` ms for `ms`; Remotion plays
  the frames back as **real motion** — the spinner spinning, the status updating, and
  results **streaming in** — instead of a frozen snapshot. Put it right after the click
  that starts the work, and `scroll*` to the spinner/output first so it's in view. Its
  impact scales with how much the app actually streams (token-by-token chat → dramatic;
  atomic result + spinner → you still see it working). This is the answer to "I want to
  see the loading/streaming, not just the final state."
- **Action**: `{ act: "fill"|"click"|"upload"|"sleep"|"waitText"|"notRunning"|"scrollEl"|"scrollText"|"scrollLastChat"|"scrollTop"|"scrollY", ... }`
  Advances the UI so the NEXT `cap` shows the result. `scrollEl` centers a result
  widget — `{ act: "scrollEl", sel: "df"|"iframe"|"metric"|"<css>", last?: true }`.

Order so the story reads: capture empty → fill → capture (cursor on the button,
click:true) → click → sleep → capture the loading state → wait for result →
capture the result. See `scripts/walkthrough.specs.example.mjs` for 5 worked specs.

Selector shorthand (resolved against the **active tab panel** — see lesson #1):
`"textarea"`, `"input"`, `"file"`, `"drop"` (uploader dropzone), `"chat"` (chat input),
`"btn:Run pipeline"` (button by accessible-name regex), `"aria:Net income"` /
`"aria^:Revenue"` (input by aria-label exact / prefix), or any raw CSS selector.

## Hard-won capture lessons (THIS is why naive captures fail)
1. **Scope every locator to the ACTIVE tab panel.** Streamlit (and many tab UIs)
   render ALL tab panels in the DOM; an unscoped `.first()` silently matches a hidden
   tab's element. Use `[data-baseweb="tab-panel"]:visible` (the helper `panel(page)`).
2. **Await uploads until the widget registers** before clicking the action button
   (e.g. wait for "1 image(s) ready"); clicking too early hits a disabled/0-item button.
3. **Data-grids are CANVAS** (glide-data-grid): cell text is NOT in the DOM. Don't
   wait on row text — wait on a real DOM label (a KPI, a heading) instead.
4. **Capture the loading state on purpose**: after the click, `sleep ~1.5 s` then `cap`
   — that frame ("running…") is what makes the walkthrough show *what happened*.
5. **Avoid spinner-timing flakiness where you can**: e.g. for a deterministic form
   (a calculator), drive it via manual field entry instead of an LLM-extract call.
6. **Cursor coords are viewport CSS px** (`getBoundingClientRect` center) captured at
   the moment of the step; the cursor is NOT baked into the screenshot — Remotion
   overlays + animates it, so it can glide and ripple. Frames stay clean.
7. **Don't match caption text in your wait conditions**: e.g. waiting for "Adjusted
   EBITDA" fires instantly if it's in a page header. Wait for a post-result-only
   string (a computed value, a status="complete" label).
8. **Presence before negative assertion.** "The spinner is gone" passes vacuously on a
   page that never rendered — always require the container to EXIST first, then wait
   for the absence (see `notRunning` in `walkthrough.mjs`). This exact bug produced a
   "passing" multi-user capture where user 2's panel was never mounted at all.
9. **Retry nondeterministic specs in a FRESH environment.** LLM-backed steps flake
   (~50% observed across a day of live captures). Mark them `retries: N` — each attempt
   wipes the frame dir and reopens a fresh page; a half-driven UI poisons every frame
   after the failure, so reusing the page just re-captures the damage.
10. **Freeze failure forensics.** On any capture error, screenshot `zz-fail.png` + log a
   body-text snippet before moving on. "Which state was the page actually in" turns an
   hour of hypothesis ping-pong into one image. (It once exposed a real product bug:
   returning visitors landed in a collapsed layout nothing else ever exercised.)
11. **One browser context per persona.** Two pages in one context share localStorage —
   "user 2" silently reuses user 1's session and every multi-user claim is fake.
   Real users = isolated `browser.newContext()` per persona.
12. **Deterministic-engine fallback for un-walkthrough-able flows** — but root-cause
   first. When a live-LLM flow won't reproduce, capture against a scripted/demo engine
   at the SAME URL and label the clip honestly. In our case the "flaky" review-mode flow
   turned out to be a real agent bug (the model was never told approval mode existed);
   the walkthrough capturer is what found it. Fallback is a labeled last resort, not the
   first move.
13. **GIF camera rule: ease over a FIXED short window, then HOLD static.** Continuous
   zoom/pan relax changes every pixel of every frame — inter-frame delta IS the GIF
   size budget (observed 2–3× blow-up, 8–16MB). Motion is cheap in H.264, brutal in
   GIF; this composition's pre-move-delay → glide → hold pattern is the right shape,
   keep it that way through refactors.

## Stage 5 (recommended): self-judge the render
The final cut should not be the one stage only human eyes check. `npm run judge out/example.mp4`
sends the RENDERED video to Gemini video understanding (`judge-video.mjs`; key via
`GEMINI_API_KEY`/`GOOGLE_GENERATIVE_AI_API_KEY`) and scores 8 dimensions against the
anti-hero-shot bar — state coverage (empty → cursor → loading → result, per flow), cursor truth,
caption sync, pacing, legibility, proof-feel, safety, loop etiquette — returning timestamped
P0/P1/P2 defects + a publish verdict. Judge the MP4 (pre-palette render), not the GIF — GIF is
not a supported Gemini video MIME. Severity policy: **P0 blocks publishing · P1 fix before
posting · P2 log and ship** — never enter a re-render polish loop for P2s on a passed render.
(First production run on a 54.8s NodeRoom episode: verdict publish, 15/16, one P2.)

## Stage 0 (optional, for audience-targeted walkthroughs): audience-world research
A walkthrough proves the product works; for high-trust audiences (founders, family offices,
advisors, M&A teams) that is necessary but not sufficient — they trust people who understand the
room they sit in. Before writing the spec, load the audience's world and let the SCENARIO come
from it (their meetings, documents, anxieties), with the feature appearing inside it — never the
reverse. Doctrine + fluency grid + lexicon discipline + the publish-blocking eval:
[`references/cultural-fluency.md`](references/cultural-fluency.md) · capture the audience as data:
[`references/audience_context.example.yaml`](references/audience_context.example.yaml).
Rule of thumb: **recognition before persuasion; quiet competence, not loud wealth.**

## Reuse in a new project
1. Copy `scripts/walkthrough.mjs` + `scripts/Walkthrough.jsx` into the Remotion project
   (`Walkthrough.jsx` → `src/`), and register it in `src/Root.jsx`:
   ```jsx
   import { Walkthrough, WT_FPS, WT_W, WT_H, wtDuration } from "./Walkthrough.jsx";
   import { WALKTHROUGHS } from "./walkthrough.data.js";   // generated by the capturer
   {WALKTHROUGHS.map((w) => (
     <Composition key={"WT-"+w.id} id={"WT-"+w.id} component={Walkthrough}
       durationInFrames={Math.max(1, wtDuration(w))} fps={WT_FPS} width={WT_W}
       height={WT_H} defaultProps={{ wt: w }} />
   ))}
   ```
   Create a stub `src/walkthrough.data.js` (`export const WALKTHROUGHS = [];`) so it
   imports before the first capture.
2. Write `walkthrough.specs.mjs` for your features (adapt the example).
3. Start the app's clean/demo harness, then: `node walkthrough.mjs` → render each
   `WT-<id>` → ffmpeg to `assets/feature-<name>.gif` → embed in the README.

## Design principles (researched — apply these)
Distilled from product-demo / screencast guidance (Arcade, Supademo, HowdyGo,
CleanShot, Rekort, Mux, ubitux's *High-quality GIF with FFmpeg*, GIPHY, WCAG):
- **Two-pass palette is mandatory.** `stats_mode=diff` + `lanczos` + `bayer` +
  `diff_mode=rectangle` — the difference between a banded 256-color mess and a clean
  demo, and it shrinks the file. *(blog.pkh.me; Mux)*
- **Deliver 12–15 fps; author higher.** 15 fps is the screencast sweet spot; render the
  composition at 30 fps so cursor/zoom interpolate smoothly, sample down for the GIF.
  *(blog.pkh.me; Mux; Remotion `everyNthFrame`)*
- **Zoom/pan to focus, eased, with a pre-move delay.** Click-triggered zoom ~1.3–1.6×
  beats highlight-only for comprehension and makes small text legible; glide (pan)
  between same-scale steps rather than cut; a 200–400 ms delay lets the eye register
  context first. *(Arcade Pan & Zoom; Supademo; Camtasia "zoom to focus")*
- **Cursor at ~1.5–2× OS size + click ripple + dwell-before-click.** A real 32px cursor
  is invisible after downscaling; the ripple is the silent substitute for a click sound,
  anchoring cause→effect. *(Rekort; CleanShot/Camtasia; Material ripple ~600 ms)*
- **Show every state, including loading.** empty → click → *loading/skeleton* → result;
  never cut an action straight to a finished result — the work must feel real.
- **Pace from the caption; write outcome statements.** No narration paces the viewer, so
  dwell ≈ `clamp(1.5 s, words/2.5, 7 s)`; ≤15–18 words; "Filter to overdue invoices", not
  "Click Filter". *(Supademo hotspots; Arcade; captioning standards)*
- **3–10 s, scope to ONE feature, ~6–12 steps, seamless loop.** End on a ~1–1.5 s hold (or
  make the last frame match the first) so the restart reads as a clean replay. *(HowdyGo;
  GIPHY ≤6 s; Arcade 9–12 steps)*
- **Crop/downscale to ~640–800 px wide** — the single biggest size lever, and it sharpens focus.
- **Ship MP4 + GIF.** MP4 is 60–90% smaller; GitHub auto-embeds a bare user-attachments
  MP4 URL. Use MP4 for the hero/long walkthroughs, GIF for per-feature loops + chat/email.
- **Accessibility:** no flashing ≥3×/s; keep loops short or pair with a pausable `<video>`;
  ship a frame-0 PNG poster for `prefers-reduced-motion`; write content-specific alt text.

## Gotchas
- Remotion composition ids **cannot contain `_`** (a-z A-Z 0-9 and `-` only) → use `WT-<id>`.
- Tune the GIF size with `fps` (10–15), `scale` (700–900 px = README width), and
  `max_colors` (96–128). Stepped frames + crossfades compress far better than
  continuous motion, so these GIFs are usually smaller than Ken-Burns ones.
- If a captured state is wrong, fix the SPEC (wait/scroll/selector), not the renderer.
