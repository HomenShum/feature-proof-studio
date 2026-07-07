import React from "react";
import { Composition } from "remotion";
import { ROOMOS_WALKTHROUGHS } from "./walkthrough.roomos.data.js";
import { WalkthroughGrid, WTG_FPS, WTG_H, WTG_W, wtgDuration } from "./WalkthroughGrid.jsx";

export const RoomOsRoot = () => (
  <>
    {ROOMOS_WALKTHROUGHS.map((wt) => (
      <Composition
        key={`WTG-${wt.id}`}
        id={`WTG-${wt.id}`}
        component={WalkthroughGrid}
        durationInFrames={Math.max(1, wtgDuration(wt))}
        fps={WTG_FPS}
        width={WTG_W}
        height={WTG_H}
        defaultProps={{ wt }}
      />
    ))}
  </>
);
