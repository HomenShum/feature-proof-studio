import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  interpolate,
  spring,
  Easing,
} from "remotion";

export const WTG_FPS = 30;
export const WTG_W = 1920;
export const WTG_H = 1080;

const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Arial, sans-serif';
const MONO = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';
const CHROME_H = 36;
const GAP = 20;
const SIDE = 44;

export const wtgDuration = (wt) => (wt.steps || []).reduce((sum, step) => sum + (step.hold || 72), 0);

const activeStep = (steps, frame) => {
  let cursor = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const hold = steps[i].hold || 72;
    if (frame < cursor + hold) return { index: i, localFrame: frame - cursor, startFrame: cursor };
    cursor += hold;
  }
  return { index: Math.max(0, steps.length - 1), localFrame: 0, startFrame: cursor };
};

const paneImage = (stepPane, step, localFrame) => {
  if (!stepPane) return null;
  if (step?.burst && stepPane.imgs?.length) {
    const imgs = stepPane.imgs;
    const playback = Math.max(imgs.length, Math.floor((step.hold || 72) * 0.7));
    const idx = Math.min(imgs.length - 1, Math.floor(localFrame / (playback / imgs.length)));
    return imgs[idx];
  }
  return stepPane.img || stepPane.imgs?.[stepPane.imgs.length - 1] || null;
};

const Background = () => (
  <AbsoluteFill style={{ background: "linear-gradient(135deg, #060913 0%, #0a111f 52%, #081419 100%)" }}>
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(900px 520px at 18% 5%, rgba(124,92,255,0.18), transparent 56%), radial-gradient(760px 500px at 86% 16%, rgba(34,211,238,0.11), transparent 58%), radial-gradient(800px 520px at 70% 98%, rgba(16,185,129,0.12), transparent 64%)",
      }}
    />
  </AbsoluteFill>
);

const Pointer = ({ x, y, opacity }) => (
  <svg
    width="34"
    height="34"
    viewBox="0 0 24 24"
    style={{
      position: "absolute",
      left: x,
      top: y,
      opacity,
      transform: "translate(-3px, -2px)",
      filter: "drop-shadow(0 5px 8px rgba(0,0,0,0.65))",
      zIndex: 10,
    }}
  >
    <path
      d="M5 3 L5 20 L9.5 15.6 L12.4 22 L15 20.9 L12.1 14.5 L18.6 14.5 Z"
      fill="#fff"
      stroke="#070b14"
      strokeWidth="1.45"
      strokeLinejoin="round"
    />
  </svg>
);

const ClickRing = ({ x, y, localFrame, accent }) => {
  const t = interpolate(localFrame, [18, 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const size = interpolate(t, [0, 1], [10, 92]);
  const opacity = interpolate(t, [0, 0.22, 1], [0, 0.85, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: 999,
        border: `4px solid ${accent}`,
        opacity,
        zIndex: 9,
      }}
    />
  );
};

const BrowserChrome = ({ label, note, accent, active }) => (
  <div
    style={{
      height: CHROME_H,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 12px",
      background: active ? "linear-gradient(90deg, #1a1433, #101a2d)" : "linear-gradient(90deg, #131b2a, #0d1422)",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
    }}
  >
    <span style={{ width: 9, height: 9, borderRadius: 99, background: "#ff5f57" }} />
    <span style={{ width: 9, height: 9, borderRadius: 99, background: "#febc2e" }} />
    <span style={{ width: 9, height: 9, borderRadius: 99, background: "#28c840" }} />
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          maxWidth: "100%",
          border: active ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.08)",
          borderRadius: 7,
          background: active ? "rgba(124,92,255,0.16)" : "rgba(255,255,255,0.05)",
          color: "#e8eefc",
          padding: "3px 9px",
          fontFamily: FONT,
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 99, background: active ? accent : "#64748b" }} />
        <span>{label}</span>
        <span style={{ color: "#93a4bc", fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {note}
        </span>
      </div>
    </div>
  </div>
);

const Pane = ({
  x,
  y,
  w,
  h,
  img,
  prevImg,
  pane,
  label,
  note,
  accent,
  localFrame,
  fade,
  capW,
  capH,
}) => {
  const active = Boolean(pane?.cursor || pane?.active);
  const scale = w / capW;
  const cropH = h - CHROME_H;
  const naturalH = w * (capH / capW);

  const target = pane?.zoom
    ? { scale: pane.zoom.scale || 1.42, x: (pane.zoom.x || capW / 2) * scale, y: (pane.zoom.y || capH / 2) * scale }
    : { scale: 1, x: w / 2, y: cropH / 2 };
  const previous = pane?.prevZoom
    ? {
        scale: pane.prevZoom.scale || 1.42,
        x: (pane.prevZoom.x || capW / 2) * scale,
        y: (pane.prevZoom.y || capH / 2) * scale,
      }
    : { scale: 1, x: w / 2, y: cropH / 2 };
  const ease = interpolate(localFrame, [5, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const zoomScale = previous.scale + (target.scale - previous.scale) * ease;
  const fx = previous.x + (target.x - previous.x) * ease;
  const fy = previous.y + (target.y - previous.y) * ease;
  const tx = Math.min(0, Math.max(w * (1 - zoomScale), w / 2 - fx * zoomScale));
  const ty = Math.min(0, Math.max(cropH - naturalH * zoomScale, cropH / 2 - fy * zoomScale));

  const cursorTarget = pane?.cursor ? { x: pane.cursor.x * scale, y: pane.cursor.y * scale } : null;
  const cursorFrom = pane?.prevCursor ? { x: pane.prevCursor.x * scale, y: pane.prevCursor.y * scale } : cursorTarget;
  const cursorT = spring({
    frame: localFrame,
    fps: WTG_FPS,
    durationInFrames: 20,
    config: { stiffness: 360, damping: 44, mass: 1 },
    overshootClamping: true,
  });
  const cursor =
    cursorTarget && cursorFrom
      ? {
          x: cursorFrom.x + (cursorTarget.x - cursorFrom.x) * cursorT,
          y: cursorFrom.y + (cursorTarget.y - cursorFrom.y) * cursorT,
        }
      : null;
  const cursorOpacity = cursor ? interpolate(localFrame, [0, 8], [0.15, 1], { extrapolateRight: "clamp" }) : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 15,
        overflow: "hidden",
        background: "#070b14",
        boxShadow: active
          ? `0 30px 70px rgba(0,0,0,0.58), 0 0 0 2px ${accent}, 0 0 42px rgba(124,92,255,0.20)`
          : "0 24px 60px rgba(0,0,0,0.52), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <BrowserChrome label={label} note={note} accent={accent} active={active} />
      <div style={{ position: "relative", width: w, height: cropH, overflow: "hidden", background: "#070b14" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: w,
            height: naturalH,
            transformOrigin: "0 0",
            transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${zoomScale.toFixed(4)})`,
          }}
        >
          {prevImg && <Img src={staticFile(prevImg)} style={{ position: "absolute", inset: 0, width: w }} />}
          {img && <Img src={staticFile(img)} style={{ position: "absolute", inset: 0, width: w, opacity: fade }} />}
          {cursor && pane?.click && <ClickRing x={cursor.x} y={cursor.y} localFrame={localFrame} accent={accent} />}
          {cursor && <Pointer x={cursor.x} y={cursor.y} opacity={cursorOpacity} />}
        </div>
      </div>
    </div>
  );
};

export const WalkthroughGrid = ({ wt }) => {
  const frame = useCurrentFrame();
  const steps = wt.steps || [];
  if (!steps.length) return <AbsoluteFill style={{ background: "#070b14" }} />;

  const { index, localFrame, startFrame } = activeStep(steps, frame);
  const step = steps[index];
  const prev = steps[index - 1];
  const total = wtgDuration(wt);
  const progress = Math.min(1, (startFrame + Math.min(localFrame, step.hold || 72)) / total);
  const fade = interpolate(localFrame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const captionY = interpolate(localFrame, [4, 24], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const captionOpacity = interpolate(localFrame, [4, 22], [0, 1], { extrapolateRight: "clamp" });

  const capW = wt.vw || 1280;
  const capH = wt.vh || 720;
  const labels = wt.paneLabels || ["V0", "V1", "V2", "V3"];
  const notes = wt.paneNotes || ["", "", "", ""];
  const focusMode = step.layout === "focus";
  const focusPane = Math.max(0, Math.min(3, step.focusPane ?? 3));
  const paneW = Math.floor((WTG_W - SIDE * 2 - GAP) / 2);
  const paneH = 360;
  const focusW = 1292;
  const focusH = 658;
  const thumbW = WTG_W - SIDE * 2 - focusW - GAP;
  const thumbH = Math.floor((focusH - GAP * 2) / 3);
  const startY = 152;
  const panes = Array.from({ length: 4 }, (_, paneIndex) => {
    const pane = step.panes?.[paneIndex] || {};
    const previousPane = prev?.panes?.[paneIndex] || {};
    return {
      pane: {
        ...pane,
        prevCursor: pane.prevCursor || previousPane.cursor || null,
        prevZoom: pane.prevZoom || previousPane.zoom || null,
        active: pane.active || (focusMode && paneIndex === focusPane),
      },
      img: paneImage(pane, step, localFrame),
      prevImg: paneImage(previousPane, prev, 99999),
    };
  });

  return (
    <AbsoluteFill style={{ background: "#070b14", color: "#eef4ff", fontFamily: FONT }}>
      <Background />

      <div style={{ position: "absolute", left: SIDE, top: 30, right: SIDE, display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            background: "linear-gradient(135deg, #7c5cff, #22d3ee)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 14px 34px rgba(124,92,255,0.26)",
            fontWeight: 900,
            fontSize: 21,
          }}
        >
          OS
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#f8fbff", fontSize: 34, lineHeight: 1.04, fontWeight: 900, letterSpacing: 0 }}>{wt.title}</div>
          <div style={{ color: "#9fb1c9", fontSize: 16, fontWeight: 650, marginTop: 5 }}>
            Live prod capture: same user interrupt, four coordination layers, no mock transcript.
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 999,
              padding: "8px 13px",
              color: "#aebdd3",
              fontFamily: MONO,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            step {index + 1}/{steps.length}
          </div>
          <div
            style={{
              border: `1px solid ${wt.accent || "#7c5cff"}`,
              color: wt.accent || "#a78bfa",
              borderRadius: 999,
              padding: "8px 13px",
              fontFamily: MONO,
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            room-os-live.vercel.app
          </div>
        </div>
      </div>

      {panes.map((p, paneIndex) => {
        if (focusMode) {
          if (paneIndex === focusPane) {
            return (
              <Pane
                key={paneIndex}
                x={SIDE}
                y={startY}
                w={focusW}
                h={focusH}
                img={p.img}
                prevImg={p.prevImg}
                pane={p.pane}
                label={labels[paneIndex]}
                note={notes[paneIndex]}
                accent={wt.accent || "#7c5cff"}
                localFrame={localFrame}
                fade={fade}
                capW={capW}
                capH={capH}
              />
            );
          }
          const before = paneIndex < focusPane ? paneIndex : paneIndex - 1;
          return (
            <Pane
              key={paneIndex}
              x={SIDE + focusW + GAP}
              y={startY + before * (thumbH + GAP)}
              w={thumbW}
              h={thumbH}
              img={p.img}
              prevImg={p.prevImg}
              pane={p.pane}
              label={labels[paneIndex]}
              note={notes[paneIndex]}
              accent={wt.accent || "#7c5cff"}
              localFrame={localFrame}
              fade={fade}
              capW={capW}
              capH={capH}
            />
          );
        }

        const col = paneIndex % 2;
        const row = Math.floor(paneIndex / 2);
        return (
          <Pane
            key={paneIndex}
            x={SIDE + col * (paneW + GAP)}
            y={startY + row * (paneH + GAP)}
            w={paneW}
            h={paneH}
            img={p.img}
            prevImg={p.prevImg}
            pane={p.pane}
            label={labels[paneIndex]}
            note={notes[paneIndex]}
            accent={wt.accent || "#7c5cff"}
            localFrame={localFrame}
            fade={fade}
            capW={capW}
            capH={capH}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: SIDE,
          right: SIDE,
          bottom: 48,
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: captionOpacity,
          transform: `translateY(${captionY}px)`,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 18,
          background: "rgba(6,10,20,0.78)",
          padding: "17px 22px",
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ width: 6, height: 56, borderRadius: 999, background: wt.accent || "#7c5cff" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#f7fbff", fontSize: 28, lineHeight: 1.12, fontWeight: 900 }}>{step.caption}</div>
          {step.detail && (
            <div style={{ color: "#9fb1c9", fontSize: 17, lineHeight: 1.26, marginTop: 7, fontWeight: 650 }}>{step.detail}</div>
          )}
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 6, background: "rgba(255,255,255,0.08)" }}>
        <div style={{ width: WTG_W * progress, height: 6, background: wt.accent || "#7c5cff" }} />
      </div>
    </AbsoluteFill>
  );
};
