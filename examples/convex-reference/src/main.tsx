import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";

// VITE_CONVEX_URL is written into .env.local by `npx convex dev`.
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Tiny global style: the blinking streaming caret + reset.
const style = document.createElement("style");
style.textContent = `
  * { margin: 0; }
  @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* ConvexProvider opens the WebSocket every useQuery subscribes over. */}
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>,
);
