import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "../..")

export default defineConfig({
  root: here,
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(root, "src") } },
  build: {
    emptyOutDir: true,
    outDir: path.resolve(root, "gallery/assets/shadcn-ui"),
    lib: {
      entry: path.resolve(here, "main.tsx"),
      formats: ["es"],
      fileName: () => "gallery-ui.js",
      cssFileName: "gallery-ui",
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith(".css") ? "gallery-ui.css" : "[name][extname]",
      },
    },
  },
})
