export const SPECS = [
  {
    id: "VisualLabsFlow",
    title: "VisualLabs full demo flow",
    accent: "#f3a05d",
    start: "/",
    steps: [
      {
        cap: "VisualLabs turns trends into shippable image prompts",
        cursor: "link:Try Remix",
        hold: 72,
      },
      {
        cap: "Click into the studio",
        cursor: "link:Try Remix",
        click: true,
        hold: 48,
      },
      { act: "click", sel: "link:Try Remix" },
      { act: "waitText", value: "Remix chat|Generate image" },
      {
        cap: "Studio view keeps remix, chat, render, and analytics in one place",
        cursor: "placeholder:How can I improve this remix?",
        hold: 78,
      },
      {
        act: "fill",
        sel: "placeholder:How can I improve this remix?",
        value:
          "Improve this VisualLabs remix prompt for a TikTok image: locked character, late-night hackathon, teacher/student/lunch-lady hook, stronger cinematic specificity.",
      },
      {
        cap: "Ask the agent for a better prompt",
        cursor: "aria:Send remix prompt",
        click: true,
        hold: 54,
      },
      { act: "click", sel: "aria:Send remix prompt" },
      {
        cap: "OpenAI agent refines the render prompt",
        burst: { ms: 4200, every: 420 },
        hold: 88,
      },
      { act: "waitText", value: "Improved Remix Prompt|Agent note|Prompt updated", timeout: 90000 },
      {
        cap: "The refined prompt becomes the image-render input",
        cursor: "btn:Generate image",
        hold: 70,
      },
      {
        cap: "Generate the image",
        cursor: "btn:Generate image",
        click: true,
        hold: 52,
      },
      { act: "click", sel: "btn:Generate image" },
      {
        cap: "Render request runs through /api/render",
        burst: { ms: 2600, every: 320 },
        hold: 78,
      },
      { act: "waitText", value: "Generated remix image|Mock image ready|Live image ready", timeout: 90000 },
      {
        cap: "Good image prompt is saved for the Fastino export loop",
        cursor: "btn:Make post",
        hold: 80,
      },
      {
        cap: "Prepare a safe post draft",
        cursor: "btn:Make post",
        click: true,
        hold: 52,
      },
      { act: "click", sel: "btn:Make post" },
      { act: "waitText", value: "dry-run post prepared", timeout: 30000 },
      {
        cap: "Composio publish stays dry-run for the walkthrough",
        cursor: "btn:Get analytics",
        hold: 74,
      },
      {
        cap: "Pull live social analytics",
        cursor: "btn:Get analytics",
        click: true,
        hold: 52,
      },
      { act: "click", sel: "btn:Get analytics" },
      {
        cap: "Composio analytics streams back into OpenUI chat",
        burst: { ms: 3600, every: 360 },
        hold: 84,
      },
      { act: "waitText", value: "Instagram analytics pulled via Composio MCP|Mock Instagram analytics", timeout: 90000 },
      {
        cap: "Analytics artifact gives the post context",
        cursor: "btn:Fastino loop",
        hold: 82,
      },
      {
        cap: "Export chat and render history for Fastino",
        cursor: "btn:Fastino loop",
        click: true,
        hold: 52,
      },
      { act: "click", sel: "btn:Fastino loop" },
      {
        cap: "ClickHouse history becomes Fastino-ready training data",
        burst: { ms: 3000, every: 360 },
        hold: 86,
      },
      {
        act: "waitText",
        value: "Fastino-ready JSONL|Prompt model training loop|ClickHouse to Fastino",
        timeout: 90000,
      },
      {
        cap: "Training export behavior is visible and mock-safe",
        hold: 104,
      },
    ],
  },
];
