// Walkthrough spec for the solo-founder-3d-proof-run app.
// Shows: builder console → generate scroll story → customer-facing page → proof report.
export const SOLO_FOUNDER_SPECS = [
  {
    id: "SoloFounder",
    title: "Solo Founder · 3D Proof Run",
    accent: "#8b5cf6",
    vw: 1280, vh: 800,
    retries: 1,
    steps: [
      // Step 1: Builder console with 3D Research Forge
      { cap: "Builder console — 3D Research Forge", hold: 80 },

      // Step 2: Switch to ScrollStory Agent tab
      { cap: "Switch to ScrollStory Agent", cursor: "btn:ScrollStory Agent", click: true, hold: 60 },
      { act: "click", sel: "btn:ScrollStory Agent" },
      { act: "sleep", ms: 800 },

      // Step 3: Generate scroll story
      { cap: "Generate a scroll-driven 3D product story", cursor: "btn:Generate scroll story", click: true, hold: 60 },
      { act: "click", sel: "btn:Generate scroll story" },
      { act: "sleep", ms: 2500 },

      // Step 4: Show the generated 3D scroll story in the builder
      { cap: "3D scroll story generated — with proof gates", burst: { ms: 2000, every: 400 }, hold: 100 },

      // Step 5: Navigate to customer-facing page
      { cap: "Open the customer-facing landing page", cursor: "link:View ScrollStory", click: true, hold: 60 },
      { act: "click", sel: "link:View ScrollStory" },
      { act: "sleep", ms: 1500 },

      // Step 6: Customer page with animated brand text and 3D viewer
      { cap: "Customer page — animated brand, 3D viewer, scroll beats", hold: 100 },

      // Step 7: Navigate to proof report via direct URL
      { cap: "Open the internal proof report", hold: 60 },
      { act: "goto", url: "http://localhost:5179/#/proof" },
      { act: "sleep", ms: 1200 },

      // Step 8: Proof report with gates
      { cap: "Proof report — 32/33 gates passed, design contract verified", hold: 120 },
    ],
  },
];
