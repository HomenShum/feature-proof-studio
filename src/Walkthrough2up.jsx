import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, Easing } from "remotion";

// MULTI-PANE (N-up) collaboration composition. Parallel to Walkthrough.jsx (single-pane).
// Renders N panes SIDE-BY-SIDE — one browser-chrome window per client ("Client A" / "B" / "C"),
// each playing its own captured frame (burst-aware), with an animated cursor + click ripple on
// the ACTING pane only, a shared caption, a Step n/N counter, and a progress bar. Pane count is
// taken from the data (wt.paneLabels / step.panes), so the same composition does 2-up and 3-up.
export const WT2_FPS = 30;
export const WT2_W = 1920;
export const WT2_H = 1080;

const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
const CAP_VW = 1280, CAP_VH = 600;   // collab capture viewport
const CROP_VH = 360;                 // show only the content-bearing top of each frame (crop empty space)
const GAP = 28, SIDE_MARGIN = 48;
const CHROME_H = 44;

export const wt2Duration = (wt) => (wt.steps || []).reduce((a, s) => a + (s.hold || 60), 0);

// A BURST step holds a captured frame SEQUENCE per pane (sync/streaming motion). Pick the
// frame for this local time — play once over ~72% of the hold, then rest on the last.
const burstFrame = (paneStep, step, lf) => {
  if (step && step.burst && paneStep && paneStep.imgs && paneStep.imgs.length) {
    const N = paneStep.imgs.length;
    const playFrames = Math.max(N, Math.floor((step.hold || 60) * 0.72));
    const idx = Math.min(N - 1, Math.max(0, Math.floor(lf / (playFrames / N))));
    return paneStep.imgs[idx];
  }
  if (!paneStep) return null;
  return paneStep.img || (paneStep.imgs && paneStep.imgs[paneStep.imgs.length - 1]) || null;
};

const Background = () => (
  <AbsoluteFill style={{ background: "radial-gradient(1300px 760px at 68% -5%, #14253f 0%, #0f1b2e 46%, #0b1220 100%)" }}>
    <AbsoluteFill style={{ background: "radial-gradient(900px 520px at 10% 100%, rgba(52,211,153,0.10), transparent 60%)" }} />
  </AbsoluteFill>
);

const Pointer = ({ x, y, opacity }) => (
  <svg width="42" height="42" viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, opacity, transform: "translate(-3px,-2px)", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.55))", zIndex: 30 }}>
    <path d="M5 3 L5 20 L9.5 15.5 L12.5 22 L15 21 L12 14.5 L18.5 14.5 Z" fill="#fff" stroke="#0b1220" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const Ripple = ({ x, y, lf, accent }) => {
  const t = interpolate(lf, [20, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const size = interpolate(t, [0, 1], [8, 96]);
  const op = interpolate(t, [0, 0.18, 1], [0, 0.9, 0]);
  return <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: "50%", border: `4px solid ${accent}`, opacity: op, zIndex: 29 }} />;
};

const Chrome = ({ accent, label, acting }) => (
  <div style={{ height: CHROME_H, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", background: "linear-gradient(#1b2740,#141f33)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
    <span style={{ width: 11, height: 11, borderRadius: 99, background: "#ff5f57" }} />
    <span style={{ width: 11, height: 11, borderRadius: 99, background: "#febc2e" }} />
    <span style={{ width: 11, height: 11, borderRadius: 99, background: "#28c840" }} />
    <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: acting ? "rgba(16,185,129,0.16)" : "rgba(255,255,255,0.07)", color: acting ? accent : "#9fb3c8", fontFamily: FONT, fontWeight: 700, fontSize: 16, padding: "5px 14px", borderRadius: 8, border: acting ? `1px solid ${accent}` : "1px solid transparent" }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: acting ? accent : "#5b6b80" }} />
        {label}
      </div>
    </div>
  </div>
);

// One browser window for a single pane (dimensions passed in, so 2-up and 3-up share this).
const PaneWindow = ({ left, top, paneW, paneH, accent, label, acting, img, prevImg, cursor, cursorOp, click, lf, fadeIn }) => (
  <div style={{ position: "absolute", left, top, width: paneW, borderRadius: 14, overflow: "hidden", boxShadow: acting ? `0 30px 70px rgba(0,0,0,0.55), 0 0 0 2px ${accent}` : "0 30px 70px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)", background: "#0d1526" }}>
    <Chrome accent={accent} label={label} acting={acting} />
    <div style={{ position: "relative", width: paneW, height: paneH, overflow: "hidden", background: "#fff" }}>
      {prevImg && <Img src={staticFile(prevImg)} style={{ position: "absolute", top: 0, left: 0, width: paneW }} />}
      {img && <Img src={staticFile(img)} style={{ position: "absolute", top: 0, left: 0, width: paneW, opacity: fadeIn }} />}
      {cursor && <Ripple x={cursor.x} y={cursor.y} lf={click ? lf : -999} accent={accent} />}
      {cursor && <Pointer x={cursor.x} y={cursor.y} opacity={cursorOp} />}
    </div>
  </div>
);

export const Walkthrough2up = ({ wt }) => {
  const frame = useCurrentFrame();
  const steps = wt.steps || [];
  if (!steps.length) return <AbsoluteFill style={{ background: "#0b1220" }} />;

  const starts = [];
  let acc = 0;
  for (const s of steps) { starts.push(acc); acc += s.hold || 60; }
  const total = acc;
  let i = steps.findIndex((s, k) => frame >= starts[k] && frame < starts[k] + (steps[k].hold || 60));
  if (i < 0) i = steps.length - 1;
  const lf = frame - starts[i];
  const cur = steps[i];
  const prev = steps[i - 1];

  // Pane count drives the layout (2-up or 3-up share this composition).
  const N = (wt.paneLabels && wt.paneLabels.length) || (cur.panes && cur.panes.length) || 2;
  const paneLabels = wt.paneLabels || Array.from({ length: N }, (_, k) => `Client ${String.fromCharCode(65 + k)}`);
  const PANE_W = Math.floor((WT2_W - SIDE_MARGIN * 2 - GAP * (N - 1)) / N);
  const PANE_H = Math.round(PANE_W * CROP_VH / CAP_VW);  // window clips the image to the content-bearing top
  const SCALE = PANE_W / CAP_VW;                          // uniform cursor-coord scale
  const winTop = Math.max(120, Math.round((WT2_H - (CHROME_H + PANE_H)) / 2) - 4);

  const fadeIn = interpolate(lf, [0, 11], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const capY = interpolate(lf, [4, 22], [26, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const capOp = interpolate(lf, [4, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const progress = (starts[i] + Math.min(lf, cur.hold || 60)) / total;

  const panes = (cur.panes || []).map((paneStep, pi) => {
    const img = burstFrame(paneStep, cur, lf);
    const prevPane = prev && prev.panes ? prev.panes[pi] : null;
    const prevImg = prevPane ? burstFrame(prevPane, prev, 1e9) : null;
    let cursor = null, cursorOp = 0;
    if (paneStep && paneStep.cursor) {
      const c = { x: paneStep.cursor.x * SCALE, y: paneStep.cursor.y * SCALE };
      const from = prevPane && prevPane.cursor ? { x: prevPane.cursor.x * SCALE, y: prevPane.cursor.y * SCALE } : c;
      // Spring (stiffness 400 / damping 45 / clamped) = the "confident cursor" ported from the
      // single-pane tool's battle-tested hardening, so both tools feel identical.
      const t = spring({ frame: lf, fps: WT2_FPS, durationInFrames: 18, config: { stiffness: 400, damping: 45, mass: 1 }, overshootClamping: true });
      cursor = { x: from.x + (c.x - from.x) * t, y: from.y + (c.y - from.y) * t };
      cursorOp = interpolate(lf, [0, 8], [prevPane && prevPane.cursor ? 1 : 0, 1], { extrapolateRight: "clamp" });
    }
    return { img, prevImg, cursor, cursorOp, click: !!(paneStep && paneStep.click), acting: !!(paneStep && paneStep.cursor) };
  });

  return (
    <AbsoluteFill style={{ background: "#0b1220" }}>
      <Background />

      <div style={{ position: "absolute", top: 30, left: SIDE_MARGIN, display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 30 }}>🌱</span>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 28, color: "#eaf2ff" }}>{wt.title}</div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: wt.accent, border: `2px solid ${wt.accent}`, borderRadius: 8, padding: "3px 10px" }}>
          Step {i + 1} / {steps.length}
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: "#9fb3c8" }}>· {N} clients, one shared backend</div>
      </div>

      {Array.from({ length: N }, (_, pi) => {
        const p = panes[pi] || {};
        const left = SIDE_MARGIN + pi * (PANE_W + GAP);
        return (
          <PaneWindow
            key={pi} left={left} top={winTop} paneW={PANE_W} paneH={PANE_H}
            accent={wt.accent} label={paneLabels[pi] || `Client ${String.fromCharCode(65 + pi)}`}
            acting={p.acting} img={p.img} prevImg={p.prevImg}
            cursor={p.cursor} cursorOp={p.cursorOp} click={p.click} lf={lf} fadeIn={fadeIn}
          />
        );
      })}

      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 46 }}>
        <div style={{ transform: `translateY(${capY}px)`, opacity: capOp, display: "flex", alignItems: "center", gap: 18, background: "rgba(7,12,22,0.78)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: "14px 28px", backdropFilter: "blur(4px)" }}>
          <div style={{ width: 5, height: 40, background: wt.accent, borderRadius: 8 }} />
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 33, color: "#eaf2ff" }}>{cur.caption}</div>
        </div>
      </AbsoluteFill>

      <div style={{ position: "absolute", bottom: 0, left: 0, height: 6, width: WT2_W * progress, background: wt.accent }} />
    </AbsoluteFill>
  );
};
