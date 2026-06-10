import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing } from "remotion";

// MULTI-PANE (2-up) collaboration composition. Parallel to Walkthrough.jsx (single-pane).
// Renders the two panes SIDE-BY-SIDE — two browser-chrome windows ("Client A" / "Client B"),
// each playing its own captured frame (burst-aware), with an animated cursor + click ripple
// drawn on the ACTING pane only, a shared lower-third caption, a Step n/N counter, and a
// progress bar. Reuses Walkthrough.jsx's visual language (chrome bar, caption pill, pointer
// SVG, ripple, accent) so the two tools feel cohesive.
export const WT2_FPS = 30;
export const WT2_W = 1920;
export const WT2_H = 1080;

const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

// Two windows side-by-side. Capture viewport is 1280x800; we fit each pane to ~half width.
const CAP_VW = 1280, CAP_VH = 800;
const GAP = 36;                                       // gutter between the two windows
const SIDE_MARGIN = 56;                               // left/right margin
const PANE_W = Math.floor((WT2_W - SIDE_MARGIN * 2 - GAP) / 2);   // displayed pane image width
const PANE_H = Math.round(PANE_W * CAP_VH / CAP_VW);  // preserve 1280x800 aspect
const SX = PANE_W / CAP_VW, SY = PANE_H / CAP_VH;     // cursor coord -> displayed-image px

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
  <svg width="46" height="46" viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, opacity, transform: "translate(-3px,-2px)", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.55))", zIndex: 30 }}>
    <path d="M5 3 L5 20 L9.5 15.5 L12.5 22 L15 21 L12 14.5 L18.5 14.5 Z" fill="#fff" stroke="#0b1220" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const Ripple = ({ x, y, lf, accent }) => {
  const t = interpolate(lf, [20, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const size = interpolate(t, [0, 1], [8, 104]);
  const op = interpolate(t, [0, 0.18, 1], [0, 0.9, 0]);
  return <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: "50%", border: `4px solid ${accent}`, opacity: op, zIndex: 29 }} />;
};

// Chrome bar carries a per-pane label ("Client A" / "Client B") in the title slot, plus the
// macOS traffic-light dots from the single-pane tool. The acting pane glows in the accent.
const Chrome = ({ accent, label, acting }) => (
  <div style={{ height: 44, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", background: "linear-gradient(#1b2740,#141f33)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
    <span style={{ width: 12, height: 12, borderRadius: 99, background: "#ff5f57" }} />
    <span style={{ width: 12, height: 12, borderRadius: 99, background: "#febc2e" }} />
    <span style={{ width: 12, height: 12, borderRadius: 99, background: "#28c840" }} />
    <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, background: acting ? "rgba(16,185,129,0.16)" : "rgba(255,255,255,0.07)", color: acting ? accent : "#9fb3c8", fontFamily: FONT, fontWeight: 700, fontSize: 17, padding: "5px 16px", borderRadius: 8, border: acting ? `1px solid ${accent}` : "1px solid transparent" }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: acting ? accent : "#5b6b80" }} />
        {label}
      </div>
    </div>
  </div>
);

// One browser window for a single pane: chrome bar + the captured frame + (if acting)
// the animated cursor/ripple. Mirrors the camera-less full-frame look of the single-pane tool.
const PaneWindow = ({ left, top, accent, label, acting, img, prevImg, cursor, cursorOp, click, lf, fadeIn }) => (
  <div style={{ position: "absolute", left, top, width: PANE_W, borderRadius: 14, overflow: "hidden", boxShadow: acting ? `0 36px 80px rgba(0,0,0,0.55), 0 0 0 2px ${accent}` : "0 36px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)", background: "#0d1526" }}>
    <Chrome accent={accent} label={label} acting={acting} />
    <div style={{ position: "relative", width: PANE_W, height: PANE_H, overflow: "hidden", background: "#fff" }}>
      {prevImg && <Img src={staticFile(prevImg)} style={{ position: "absolute", top: 0, left: 0, width: PANE_W }} />}
      {img && <Img src={staticFile(img)} style={{ position: "absolute", top: 0, left: 0, width: PANE_W, opacity: fadeIn }} />}
      {cursor && <Ripple x={cursor.x} y={cursor.y} lf={click ? lf : -999} accent={accent} />}
      {cursor && <Pointer x={cursor.x} y={cursor.y} opacity={cursorOp} />}
    </div>
  </div>
);

export const Walkthrough2up = ({ wt }) => {
  const frame = useCurrentFrame();
  const steps = wt.steps || [];
  const paneLabels = wt.paneLabels || ["Client A", "Client B"];
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

  const fadeIn = interpolate(lf, [0, 11], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const capY = interpolate(lf, [4, 22], [26, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const capOp = interpolate(lf, [4, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const progress = (starts[i] + Math.min(lf, cur.hold || 60)) / total;

  const winTop = 150;

  // Per-pane render data: image (burst-aware), and — for the acting pane — a gliding cursor.
  const panes = (cur.panes || []).map((paneStep, pi) => {
    const img = burstFrame(paneStep, cur, lf);
    const prevPane = prev && prev.panes ? prev.panes[pi] : null;
    const prevImg = prevPane ? burstFrame(prevPane, prev, 1e9) : null;

    let cursor = null, cursorOp = 0;
    if (paneStep && paneStep.cursor) {
      const c = { x: paneStep.cursor.x * SX, y: paneStep.cursor.y * SY };
      const from = prevPane && prevPane.cursor ? { x: prevPane.cursor.x * SX, y: prevPane.cursor.y * SY } : c;
      const t = interpolate(lf, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
      cursor = { x: from.x + (c.x - from.x) * t, y: from.y + (c.y - from.y) * t };
      cursorOp = interpolate(lf, [0, 8], [prevPane && prevPane.cursor ? 1 : 0, 1], { extrapolateRight: "clamp" });
    }
    return { img, prevImg, cursor, cursorOp, click: !!(paneStep && paneStep.click), acting: !!(paneStep && paneStep.cursor) };
  });

  return (
    <AbsoluteFill style={{ background: "#0b1220" }}>
      <Background />

      {/* Header: brand + title + step counter */}
      <div style={{ position: "absolute", top: 26, left: SIDE_MARGIN, display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 30 }}>🌱</span>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 28, color: "#eaf2ff" }}>{wt.title}</div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: wt.accent, border: `2px solid ${wt.accent}`, borderRadius: 8, padding: "3px 10px" }}>
          Step {i + 1} / {steps.length}
        </div>
      </div>

      {/* Two browser windows, side-by-side */}
      {[0, 1].map((pi) => {
        const p = panes[pi] || {};
        const label = paneLabels[pi] || `Client ${String.fromCharCode(65 + pi)}`;
        const left = SIDE_MARGIN + pi * (PANE_W + GAP);
        return (
          <PaneWindow
            key={pi}
            left={left}
            top={winTop}
            accent={wt.accent}
            label={label}
            acting={p.acting}
            img={p.img}
            prevImg={p.prevImg}
            cursor={p.cursor}
            cursorOp={p.cursorOp}
            click={p.click}
            lf={lf}
            fadeIn={fadeIn}
          />
        );
      })}

      {/* Shared caption lower-third */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 46 }}>
        <div style={{ transform: `translateY(${capY}px)`, opacity: capOp, display: "flex", alignItems: "center", gap: 18, background: "rgba(7,12,22,0.78)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: "14px 28px", backdropFilter: "blur(4px)" }}>
          <div style={{ width: 5, height: 40, background: wt.accent, borderRadius: 8 }} />
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 34, color: "#eaf2ff" }}>{cur.caption}</div>
        </div>
      </AbsoluteFill>

      {/* Progress bar (bottom) */}
      <div style={{ position: "absolute", bottom: 0, left: 0, height: 6, width: WT2_W * progress, background: wt.accent }} />
    </AbsoluteFill>
  );
};
