// Vite du banc de bout en bout du cahier : racine = dépôt (Tailwind v4
// scanne les sources depuis la racine), alias « @ » comme l'app.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
export default defineConfig({
  root: repo,
  configFile: false,
  plugins: [react(), tailwindcss()],
  define: { __ATELIER_BUILD__: JSON.stringify({ commit: "bench", date: "" }) },
  resolve: { alias: { "@": path.join(repo, "src") } },
  server: { port: Number(process.env.NB_E2E_VITE_PORT ?? 5198), strictPort: true, fs: { allow: [repo] } },
  logLevel: "warn",
});
