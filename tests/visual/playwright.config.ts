// Harnais de régression visuelle (plan 021, partie E) — golden states
// déterministes sur les bancs (#homebench/#navbench/#chatbench/#setbench) et
// l'app en mode déconnecté. Chromium : même moteur que la CI (macos-latest),
// baselines committées, JAMAIS de mise à jour automatique.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  snapshotDir: "./__screenshots__",
  snapshotPathTemplate: "{snapshotDir}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  expect: {
    toHaveScreenshot: {
      // tolérance anti-aliasing/fontes entre machines macOS ; un vrai
      // changement de layout dépasse largement ce seuil
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    },
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:4173",
    deviceScaleFactor: 1,
    locale: "fr-FR",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: true,
    cwd: "../..",
  },
});
