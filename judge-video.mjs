// Self-judge — Gemini video understanding watches the RENDERED walkthrough and scores it against
// the anti-hero-shot quality bar, with timestamped defects. The final cut stops being the one
// stage only human eyes ever check.
//
//   node judge-video.mjs out/example.mp4            (writes out/example.judge.md + .judge.json)
//   GEMINI_JUDGE_MODEL=gemini-3.5-flash node judge-video.mjs renders/feature.mp4
//
// Judge the MP4 (the pre-palette render), not the GIF — GIF is not a supported video MIME for
// Gemini; the MP4 has identical content plus the audio track if you added narration.
// Key: GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY (env, or a local .env/.env.local line).
// Severity policy: P0 blocks publishing · P1 fix before posting · P2 log and ship — do NOT enter
// a re-render polish loop for P2s the judge already passed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const video = process.argv[2];
if (!video || !existsSync(video)) { console.error("usage: node judge-video.mjs <video.mp4|webm|mov>"); process.exit(1); }

const key = () => {
  for (const k of ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]) if (process.env[k]) return process.env[k];
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^(?:GEMINI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY)=(.+)$/m);
    if (m) return m[1].trim();
  }
  throw new Error("set GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY");
};

const RUBRIC = `You are judging a rendered product-walkthrough video (a feature demo with an
animated cursor, click ripples, step captions, and a progress bar — possibly with narration).
The quality bar is STORY-FIRST and ANTI-HERO-SHOT. The viewer should understand the premise,
the question being tested, the comparison axis, the conflict/input, the evidence, the verdict,
and the final decision. Camera moves should reveal evidence, not fake excellence.

A viewer must always see the empty state, where the cursor
clicked, any loading state, and the result — never just a polished final state.

Score each dimension 0-2 (0=fails, 1=acceptable, 2=strong) WITH specific evidence + timestamps:
1. storyboard_clarity - can a first-time viewer state what is being compared, why it matters, and what each scene proves?
2. state_coverage - does each flow show empty state -> action -> (loading if async) -> result, or does it skip to outcomes (hero-shot smell)?
3. cursor_truth - does the cursor visibly travel to and land ON the control being used before each state change?
4. caption_sync - do step captions match what is actually happening on screen (and any narration heard)?
5. pacing - can a first-time viewer read each caption and register each state? any dead air or rushed beats?
6. legibility - is app text readable at the rendered size? are captions large and contrasty enough?
7. proof_feel - does it read as evidence of a real working product (real states, real data motion) rather than staged marketing?
8. safety - any visible secrets, API keys, tokens, real personal data, or internal URLs that should not ship?
9. loop_etiquette - if this loops as a GIF, is the total length and final-state hold reasonable (viewers lost on the second loop = too long)?

Then list DEFECTS: each with timestamp, severity (P0 blocks publishing / P1 fix before posting /
P2 polish, log and ship), what you observed, and a concrete fix.
Finally an overall verdict: publish | fix-then-publish | rework.

Return STRICT JSON: {"scores":{"storyboard_clarity":{"score":n,"evidence":"..."},"state_coverage":{"score":n,"evidence":"..."},...},
"defects":[{"ts":"m:ss","severity":"P0|P1|P2","observed":"...","fix":"..."}],
"verdict":"...","summary":"2-3 sentences"}`;

const run = async () => {
  const bytes = readFileSync(video);
  if (bytes.length > 19_000_000) throw new Error(`${(bytes.length / 1048576).toFixed(1)}MB > inline limit — use the Gemini Files API or render a smaller cut`);
  console.log(`[judge] ${video} — ${(bytes.length / 1048576).toFixed(1)}MB → gemini`);
  const model = process.env.GEMINI_JUDGE_MODEL || "gemini-3.5-flash";
  const mime = video.endsWith(".webm") ? "video/webm" : video.endsWith(".mov") ? "video/quicktime" : "video/mp4";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: bytes.toString("base64") } }, { text: RUBRIC }] }],
      generationConfig: { temperature: 0.2, response_mime_type: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const judge = JSON.parse((body.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""));

  const base = video.replace(/\.(mp4|webm|mov)$/i, "");
  writeFileSync(`${base}.judge.json`, JSON.stringify(judge, null, 2));
  const scores = Object.entries(judge.scores);
  const total = scores.reduce((a, [, v]) => a + v.score, 0);
  const md = [
    `# Video judge — ${video}`,
    ``,
    `**Judge:** ${model} (video understanding) · **Verdict:** ${judge.verdict} · **Score:** ${total}/${scores.length * 2}`,
    ``,
    `> ${judge.summary}`,
    ``,
    `| Dimension | Score | Evidence |`,
    `|---|---|---|`,
    ...scores.map(([k, v]) => `| ${k} | ${v.score}/2 | ${v.evidence} |`),
    ``,
    `## Defects`,
    ...(judge.defects?.length ? judge.defects.map((d) => `- **${d.severity} @ ${d.ts}** — ${d.observed} → *${d.fix}*`) : ["(none found)"]),
  ].join("\n");
  writeFileSync(`${base}.judge.md`, md + "\n");
  console.log(md);
};
run().catch((e) => { console.error(e.message || e); process.exit(1); });
