import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sidecarDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(sidecarDir, "../src"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.mjs"],
  },
});
