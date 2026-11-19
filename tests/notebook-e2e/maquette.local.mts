// Captures de maquette (non suivi par git) : vrai NotebookTab, vrai serveur.
// node tests/notebook-e2e/maquette.local.mts <jobs.mjs> <dossier-sortie>
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const [jobsFile, out] = process.argv.slice(2);
const { project, nb, jobs } = (await import(pathToFileURL(path.resolve(jobsFile)).href)).default;
fs.mkdirSync(out, { recursive: true });
const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "maq-app-"));
const server = spawn(path.join(repo, "rust/target/debug/atelier-studio-server"), [], {
  env: { ...process.env, ATELIER_APP_DIR: appDir, ATELIER_SKIP_SINGLE_INSTANCE: "1", ATELIER_TOKEN: "maq" },
  stdio: ["ignore", "pipe", "pipe"],
});
const port = await new Promise<number>((res) => {
  let buf = "";
  server.stdout!.on("data", (d) => { buf += d; const m = buf.match(/"port":(\d+)/); if (m) res(Number(m[1])); });
});
const vite = await createServer({ configFile: path.join(here, "vite.config.mts") });
await vite.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: job.viewport ?? { width: 980, height: 1000 }, deviceScaleFactor: 2 });
    const q = new URLSearchParams({ port: String(port), token: "maq", path: path.join(project, nb), root: project, theme: job.theme ?? "dark", preset: "claude-code", noanchor: "1" });
    await page.goto(`http://localhost:${vite.config.server.port}/tests/notebook-e2e/harness.html?${q}`);
    await page.waitForSelector(".nb-cell[data-cell-index]", { timeout: 30000 });
    await page.waitForTimeout(800);
    if (job.css) await page.addStyleTag({ content: job.css });
    if (job.js) await page.evaluate(job.js);
    if (job.scrollTo) await page.evaluate((sel) => {
      const el = document.querySelector(sel)!; const sc = document.querySelector(".nb-scroll")!;
      sc.scrollTop += el.getBoundingClientRect().top - 70;
    }, job.scrollTo);
    if (job.hover) await page.hover(job.hover);
    if (job.act) await job.act(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, job.name + ".png"), clip: job.clip });
    console.log("ok", job.name);
    await page.close();
  }
} finally {
  await browser.close(); await vite.close(); server.kill();
}
