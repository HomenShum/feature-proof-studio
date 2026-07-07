# Storyboard Standard

Feature walkthroughs should read like short product films, not like zoom-in/zoom-out screen recordings. The camera is only useful when the viewer already knows what to look for.

## Required Story Beats

Every serious walkthrough should define these beats before capture:

1. **Premise**: What live product situation is being tested?
2. **Viewer question**: What should the viewer try to answer in this scene?
3. **Comparison axis**: What changed from the previous scene or between panes?
4. **Conflict**: What input, failure, wait state, or constraint forces the product to prove itself?
5. **Evidence**: What UI state, transcript, trace, artifact, metric, or receipt proves the claim?
6. **Verdict**: What did this version or flow prove, and what did it fail to prove?
7. **Exit decision**: What should the viewer believe or do after the final scene?

## Scene Fields

Use explicit scene metadata whenever the renderer supports it:

```js
{
  scene: "SCENE 4 / CONFLICT",
  axis: "same human interrupt",
  question: "Does the steer become authoritative state or just another message?",
  caption: "Same human input: switch goals and count from 1 to 6",
  detail: "The exact same steer is sent to every room.",
  takeaway: "This is the plot turn: new goal, same live run.",
  verdicts: [
    { label: "risk", text: "Steer is transcript text.", tone: "fail" },
    { label: "state", text: "Reducer can retarget count state.", tone: "pass" },
  ],
}
```

For comparison demos, include a final scorecard scene. A viewer should not need to reverse-engineer the conclusion from small UI differences.

For dense comparisons, ship static README sections as the primary artifact: one section per version or actor, one full-width still per section, and a final markdown table. Keep GIF/MP4 as optional supporting motion, not the only explanation.

Run the video judge on the rendered MP4 before publishing. It scores `storyboard_clarity` alongside legibility, state coverage, cursor truth, proof feel, and loop etiquette.

## Quality Bar

- Start with the test, not the interface.
- Use the same input across panes when claiming a comparison.
- Show the blank or baseline state before the product works.
- Show loading, streaming, waiting, retries, and intermediate states when they matter.
- Show receipts: internal state, trace logs, metrics, saved artifacts, source rows, or audit panels.
- Write captions as claims with evidence, not as click instructions.
- Put verdicts on screen. Do not make the viewer infer the lesson from motion alone.
- Use zoom only to reveal evidence that was already named by the story.
- End with a decision table or final proof screen when the walkthrough compares systems.

## Anti-Patterns

- A sequence of pretty zooms with no stated comparison.
- Showing only final output and hiding the user input that produced it.
- Claiming live behavior without showing the state or trace that proves it.
- Switching panes or scenes without explaining why the viewer is looking there.
- Letting captions describe camera movement instead of product meaning.

## Room OS Example

The Room OS V0 to V3 walkthrough uses this structure:

1. Same live production task across four versions.
2. Normal baseline turn.
3. V0 transcript-only failure baseline.
4. Same mid-run human interrupt sent to every room.
5. V1 reducer-owned count proof.
6. V2 typed-intent proof.
7. V3 goal, worker, cost, latency, and artifact control plane.
8. Internal state drawer receipts.
9. Final scorecard summarizing what each version proves.
