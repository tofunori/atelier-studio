import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "atelier-diff-bench-"));
const file = path.join(root, "bench.txt");
const before = Array.from({length: 900}, (_, i) => `ligne ${String(i).padStart(4, "0")} glacier albedo temperature observation\n`).join("");
const insertion = before.slice(0, 10000) + "insertion scientifique deterministe\n" + before.slice(10000);
const rewrite = Array.from({length: 900}, (_, i) => `reecriture ${String(i).padStart(4, "0")} aerosol carbone neige surface\n`).join("");
fs.writeFileSync(file, before);

const port = await new Promise((resolve, reject) => {
  const socket = net.createServer(); socket.unref(); socket.on("error", reject);
  socket.listen(0, "127.0.0.1", () => { const value = socket.address().port; socket.close(() => resolve(value)); });
});
const server = spawn(process.execPath, [path.join(GALLERY, "server", "main.mjs")], {
  cwd: root, env: {...process.env, FIG_PORT: String(port), GALLERY_ROOT: root}, stdio: "ignore",
});
let browser;
try {
  const deadline = Date.now() + 8000;
  while(Date.now() < deadline){
    try { if((await fetch(`http://127.0.0.1:${port}/ping`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/code_editor.html?path=${encodeURIComponent(file)}`);
  const result = await page.evaluate(async ({before, insertion, rewrite}) => {
    const gaps = [], started = performance.now(); let previous = started;
    const heartbeat = setInterval(() => { const now = performance.now(); gaps.push(now - previous); previous = now; }, 50);
    const worker = new Worker("/.fig_thumbs/diff_worker.js");
    const run = (requestId, a, b) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("worker timeout")), 15000);
      worker.onmessage = ({data}) => { if(data.requestId !== requestId) return;
        clearTimeout(timeout); data.error ? reject(new Error(data.error)) : resolve(data.parts); };
      worker.postMessage({requestId, before:a, after:b});
    });
    const insertionStarted = performance.now();
    const insertionParts = await run(1, before, insertion);
    const insertionMs = performance.now() - insertionStarted;
    const rewriteStarted = performance.now();
    const rewriteParts = await run(2, before, rewrite);
    const rewriteMs = performance.now() - rewriteStarted;
    await new Promise(resolve => setTimeout(resolve, 60));
    clearInterval(heartbeat); worker.terminate();
    return {heartbeatMaxGapMs: Math.round(Math.max(0, ...gaps)), completedMs: Math.round(performance.now() - started),
      insertionMs: Math.round(insertionMs), rewriteMs: Math.round(rewriteMs),
      insertionParts: insertionParts.length, rewriteParts: rewriteParts.length,
      exact: insertionParts.filter(part => !part.removed).map(part => part.value).join("") === insertion
        && rewriteParts.filter(part => !part.removed).map(part => part.value).join("") === rewrite};
  }, {before, insertion, rewrite});
  if(result.heartbeatMaxGapMs >= 250) throw new Error(`heartbeat blocked: ${JSON.stringify(result)}`);
  if(result.completedMs >= 15000) throw new Error(`benchmark timeout: ${JSON.stringify(result)}`);
  if(!result.exact) throw new Error(`worker offsets changed: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.kill("SIGKILL");
  fs.rmSync(root, {recursive:true, force:true});
}
