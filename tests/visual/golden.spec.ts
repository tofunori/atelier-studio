// Golden states (plan 021, partie E). Fixtures des bancs + horloge figée
// (page.clock) : les heures relatives (« 1h », « 2j ») sont constantes.
// Mise à jour des baselines : npm run test:visual -- --update-snapshots
// (revue explicite exigée — jamais en CI).
import { test, expect, type Page } from "@playwright/test";

const FIXED_TIME = new Date("2026-07-09T18:00:00Z");

async function shoot(page: Page, opts: {
  name: string; hash: string; width: number; height: number;
  theme?: "dark" | "light"; settle?: number; freshStorage?: boolean;
}) {
  await page.clock.install({ time: FIXED_TIME });
  await page.setViewportSize({ width: opts.width, height: opts.height });
  await page.goto(`/${opts.hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(opts.settle ?? 500);
  await expect(page).toHaveScreenshot(`${opts.name}.png`);
}

test.describe("golden — Research Home (#homebench)", () => {
  test("home rich 1512 dark", async ({ page }) =>
    shoot(page, { name: "home-rich-1512-dark", hash: "#homebench-rich", width: 1512, height: 883 }));
  test("home projet vide 800", async ({ page }) =>
    shoot(page, { name: "home-empty-800-dark", hash: "#homebench-empty-project", width: 800, height: 600 }));
});

test.describe("golden — panneau Projets (#navbench)", () => {
  test("navigator rich 1512 dark", async ({ page }) =>
    shoot(page, { name: "nav-rich-1512-dark", hash: "#navbench", width: 1512, height: 883 }));
  test("navigator sans projet 800", async ({ page }) =>
    shoot(page, { name: "nav-unscoped-800-dark", hash: "#navbench-unscoped", width: 800, height: 600 }));
});

test.describe("golden — chat et composer (#chatbench)", () => {
  test("tour riche 1512 dark", async ({ page }) =>
    shoot(page, { name: "chat-rich-1512-dark", hash: "#chatbench", width: 1512, height: 883 }));
  test("tour riche 1512 light", async ({ page }) =>
    shoot(page, { name: "chat-rich-1512-light", hash: "#chatbench-light", width: 1512, height: 883 }));
  test("running 1280 dark", async ({ page }) =>
    shoot(page, { name: "chat-running-1280-dark", hash: "#chatbench-running", width: 1280, height: 800 }));
  test("goal en attente 1280 dark", async ({ page }) =>
    shoot(page, { name: "chat-goal-1280-dark", hash: "#chatbench-goal", width: 1280, height: 800 }));
  test("erreur 800 dark", async ({ page }) =>
    shoot(page, { name: "chat-error-800-dark", hash: "#chatbench-error", width: 800, height: 600 }));
  test("composer 6 contextes 1512", async ({ page }) =>
    shoot(page, { name: "chat-contexts-1512-dark", hash: "#chatbench-contexts", width: 1512, height: 883 }));
  test("markdown mermaid+code 1512", async ({ page }) =>
    shoot(page, { name: "chat-markdown-1512-dark", hash: "#chatbench-markdown", width: 1512, height: 883, settle: 1800 }));
});

test.describe("golden — Settings (#setbench)", () => {
  test("général 1280 dark", async ({ page }) =>
    shoot(page, { name: "settings-general-1280-dark", hash: "#setbench", width: 1280, height: 800 }));
  test("setup déconnecté 1280 dark", async ({ page }) =>
    shoot(page, { name: "settings-setup-1280-dark", hash: "#setbench-setup", width: 1280, height: 800 }));
});

test.describe("golden — app déconnectée", () => {
  test("boot sans sidecar 1512 dark", async ({ page }) => {
    // stockage vierge (contexte Playwright neuf) : zéro donnée personnelle
    await shoot(page, { name: "app-disconnected-1512-dark", hash: "", width: 1512, height: 883, settle: 1200 });
  });
});
