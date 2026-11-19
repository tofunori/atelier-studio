import { chromium } from "@playwright/test";
import { createServer } from "vite";
process.env.VITE_VISUAL_BENCH = "1";
const out = process.argv[2];
const vite = await createServer({ root: process.cwd(), server: { port: 5233 } });
await vite.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const theme of ["dark"]) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 }, deviceScaleFactor: 2, locale: "fr-FR" });
  await page.goto("http://localhost:5233/#setbench", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/debug.png` });
  await page.getByText("Apparence", { exact: true }).first().click();
  await page.waitForTimeout(800);
  const row = page.getByText("Fond du code", { exact: true }).first();
  await row.scrollIntoViewIfNeeded();
  await page.evaluate(() => { const el = [...document.querySelectorAll("*")].find(e => e.textContent === "Fond du code"); el?.scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/reglage-${theme}.png` });
  await page.close();
}
await browser.close(); await vite.close();
