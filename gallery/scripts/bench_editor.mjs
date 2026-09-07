// bench_editor.mjs — banc de fluidité de l'éditeur LaTeX (moteur cm6) dans
// WebKit, le moteur du WKWebView de l'app. Mesure, sur un .tex long avec
// word wrap actif :
//   - drag : sélection à la souris en N pas, temps mur + mutations DOM dans
//     .cm-content (proxy du redécoupage de spans) + cycles de mise à jour CM6
//   - typing : frappe de N caractères, mêmes métriques
// Usage : node gallery/scripts/bench_editor.mjs [--browser webkit|chromium]
//         [--steps 240] [--chars 240] [--runs 3] [--json]
import {spawn} from "node:child_process";
import {mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import path from "node:path";
import net from "node:net";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {chromium, webkit} = require("playwright");

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] == null ? "1" : process.argv[++i]);
}
const BROWSER = args.get("browser") || "webkit";
const STEPS = Number(args.get("steps") || 240);
const CHARS = Number(args.get("chars") || 240);
const RUNS = Number(args.get("runs") || 3);
const JSON_OUT = args.has("json");

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.unref(); socket.on("error", reject);
    socket.listen(0, "127.0.0.1", () => { const {port} = socket.address(); socket.close(() => resolve(port)); });
  });
}

// Prose réaliste : paragraphes longs (wrap), commandes, labels, citations.
function longLatex() {
  const para = "We estimate the albedo trend over the accumulation zone using a hierarchical model " +
    "that pools information across regions~\\cite{ref1,ref2}. The surface \\emph{darkening} observed in " +
    "Figure~\\ref{fig:trend} suggests a persistent decline, which is consistent with earlier results " +
    "\\citep{ref3}. Therefore the model indicates that the results are robust to the choice of prior.";
  const out = ["\\documentclass{article}", "\\begin{document}"];
  for (let s = 1; s <= 40; s += 1) {
    out.push(`\\section{Section ${s}}\\label{sec:${s}}`);
    for (let p = 0; p < 6; p += 1) out.push(para, "");
    out.push("\\begin{equation}", `  \\alpha_${s} = \\beta + \\gamma x^2`, "\\end{equation}", "");
  }
  out.push("\\end{document}", "");
  return out.join("\n");
}

async function withServer(run) {
  const root = mkdtempSync(path.join(tmpdir(), "atelier-bench-"));
  const target = path.join(root, "main.tex");
  writeFileSync(target, longLatex());
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(GALLERY, "server", "main.mjs")], {
    cwd: root, env: {...process.env, FIG_PORT: String(port), GALLERY_ROOT: root}, stdio: "ignore",
  });
  try {
    for (let i = 0; i < 200; i += 1) {
      const ok = await fetch(`http://127.0.0.1:${port}/ping`).then((r) => r.ok).catch(() => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await run(`http://127.0.0.1:${port}/.fig_thumbs/latex_studio.html?path=${encodeURIComponent(target)}&engine=cm6`);
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    if (server.exitCode === null) server.kill("SIGKILL");
    rmSync(root, {recursive: true, force: true});
  }
}

const startProbe = () => {
  const content = document.querySelector(".cm-content");
  window.__bench = {mutations: 0, frames: 0, updates: 0, running: true};
  window.__benchObserver = new MutationObserver((records) => { window.__bench.mutations += records.length; });
  window.__benchObserver.observe(content, {childList: true, subtree: true, characterData: true, attributes: true});
  const tick = () => { if (!window.__bench.running) return; window.__bench.frames += 1; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  // Cycles de mise à jour de la vue : chaque cursorActivity/change de la façade.
  // La façade n'expose pas `off` : un seul abonnement, filtré par le drapeau.
  if (window.cm?.on && !window.__benchHooked) {
    window.__benchHooked = true;
    window.cm.on("cursorActivity", () => { if (window.__bench?.running) window.__bench.updates += 1; });
  }
  window.__benchStart = performance.now();
};
const stopProbe = () => {
  const b = window.__bench;
  b.running = false;
  window.__benchObserver.disconnect();
  return {ms: performance.now() - window.__benchStart, mutations: b.mutations, frames: b.frames, updates: b.updates};
};

async function benchDrag(page) {
  await page.evaluate(() => cm.scrollIntoView({line: 60, ch: 0}, 80));
  await page.locator("#moreBtn").focus().catch(() => {});
  const pts = await page.evaluate(() => ({
    from: cm.charCoords({line: 58, ch: 4}, "window"),
    to: cm.charCoords({line: 72, ch: 40}, "window"),
  }));
  await page.mouse.move(pts.from.left, (pts.from.top + pts.from.bottom) / 2);
  await page.mouse.down();
  await page.evaluate(startProbe);
  await page.mouse.move(pts.to.left, (pts.to.top + pts.to.bottom) / 2, {steps: STEPS});
  const result = await page.evaluate(stopProbe);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.keyboard.press("ArrowLeft");
  return result;
}

async function benchTyping(page) {
  await page.evaluate(() => { cm.setCursor({line: 80, ch: 0}); cm.focus(); });
  await page.waitForTimeout(200);
  const text = "the model suggests that these results are robust and the analysis is consistent ".repeat(4).slice(0, CHARS);
  await page.evaluate(startProbe);
  await page.keyboard.type(text, {delay: 0});
  const result = await page.evaluate(stopProbe);
  await page.waitForTimeout(400);
  return result;
}

const fmt = (r, n) => `${(r.ms / n).toFixed(2)} ms/pas · ${r.mutations} mutations · ${r.updates} maj · ${r.frames} frames (${(r.frames / (r.ms / 1000)).toFixed(0)} fps)`;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const summarize = (rs, n) => ({
  msPerStep: median(rs.map((r) => r.ms / n)), mutations: median(rs.map((r) => r.mutations)),
  updates: median(rs.map((r) => r.updates)), fps: median(rs.map((r) => r.frames / (r.ms / 1000))),
});

await withServer(async (url) => {
  const browser = await (BROWSER === "chromium" ? chromium : webkit).launch();
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  await page.goto(url);
  for (let i = 0; i < 100 && (await page.evaluate(() => window.__ENGINE)) !== "cm6"; i += 1) await page.waitForTimeout(50);
  await page.locator(".cm-editor").waitFor();
  await page.waitForTimeout(600);
  const drags = [], typings = [];
  for (let run = 0; run < RUNS; run += 1) {
    drags.push(await benchDrag(page));
    typings.push(await benchTyping(page));
  }
  await browser.close();
  const out = {browser: BROWSER, steps: STEPS, chars: CHARS, runs: RUNS,
    drag: summarize(drags, STEPS), typing: summarize(typings, CHARS)};
  if (JSON_OUT) { console.log(JSON.stringify(out)); return; }
  console.log(`bench_editor (${BROWSER}, ${RUNS} runs, médianes)`);
  console.log(`  drag   ${STEPS} pas   : ${out.drag.msPerStep.toFixed(2)} ms/pas · ${out.drag.mutations} mutations · ${out.drag.updates} maj · ${out.drag.fps.toFixed(0)} fps`);
  console.log(`  typing ${CHARS} chars : ${out.typing.msPerStep.toFixed(2)} ms/char · ${out.typing.mutations} mutations · ${out.typing.updates} maj · ${out.typing.fps.toFixed(0)} fps`);
  for (const [i, r] of drags.entries()) console.log(`    drag run ${i + 1}: ${fmt(r, STEPS)}`);
  for (const [i, r] of typings.entries()) console.log(`    typing run ${i + 1}: ${fmt(r, CHARS)}`);
});
