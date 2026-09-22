import { defineConfig } from "vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

type ModuleInfoGetter = (id: string) => { importers: readonly string[] } | null;

/** Vrai si le module highlight.js est importé, directement ou via d'autres
 * modules highlight.js, par le rendu Markdown du chat (chemin critique). */
function reachedFromChatMarkdown(id: string, getModuleInfo: ModuleInfoGetter, seen = new Set<string>()): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  return (getModuleInfo(id)?.importers ?? []).some((importer) =>
    importer.endsWith("/src/components/chat/md.tsx")
    || (importer.includes("/node_modules/highlight.js/") && reachedFromChatMarkdown(importer, getModuleInfo, seen)));
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    rollupOptions: {
      output: {
        // Base UI is shared by the migrated primitives. Keep it in its own
        // cacheable chunk so the application entry remains within Atelier's
        // 950 KB critical-path budget as the migration grows.
        manualChunks(id: string, { getModuleInfo }: { getModuleInfo: ModuleInfoGetter }) {
          // Shared palette data is cacheable independently from application code.
          if (id.endsWith("/src/lib/themes.ts")) return "themes";
          if (id.includes("/node_modules/@base-ui/react/")) return "base-ui";
          if (id.includes("/node_modules/@tauri-apps/")) return "tauri-vendor";
          if (id.includes("/node_modules/lucide-react/")) return "icons-vendor";
          if (id.includes("/node_modules/react-resizable-panels/")) return "panels-vendor";
          if (
            id.includes("/node_modules/react/")
            || id.includes("/node_modules/react-dom/")
            || id.includes("/node_modules/scheduler/")
          ) return "react-vendor";
          if (id.includes("/node_modules/@legendapp/list/")) return "virtual-list";
          // highlight.js du chat (noyau + 18 langages de chat/md.tsx) : même
          // traitement que les autres vendors pour garder l'entrée sous son
          // budget. Seulement ce que md.tsx atteint : les autres langages de
          // `lib/common` (vue diff, chargée à la demande) restent paresseux.
          if (id.includes("/node_modules/highlight.js/") && reachedFromChatMarkdown(id, getModuleInfo)) {
            return "hljs-vendor";
          }
        },
      },
    },
  },
}));
