import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite + React. `npx convex dev` runs the backend separately and
// writes VITE_CONVEX_URL into .env.local, which main.tsx reads.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
