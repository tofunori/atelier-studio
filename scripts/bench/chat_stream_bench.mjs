#!/usr/bin/env node
// Banc « streaming » de la webview : la vraie app (dist/) dans Chromium
// Playwright, sans Tauri ni serveur Rust — __TAURI_INTERNALS__ stubbé et le
// WebSocket du sidecar simulé par page.routeWebSocket. On charge un fil long,
// on le sélectionne, puis on lui pousse une réponse en deltas au rythme d'un
// provider réel, et on mesure ce que ça coûte à la page (métriques CDP +
// profil CPU échantillonné). Chromium plutôt que WebKit : le profileur CDP
// nomme les fonctions chaudes, et celles-ci ne dépendent pas du moteur.
//
//   node scripts/bench/chat_stream_bench.mjs                # fil synthétique (2 000 événements)
//   node scripts/bench/chat_stream_bench.mjs --history f.json --seconds 20 --hz 20 --top 20
//   node scripts/bench/chat_stream_bench.mjs --events 200   # petit fil, point de comparaison
//
// Prérequis : `npx vite build` (dist/ à jour). Sortie : JSON sur stdout.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "1" : all[i + 1]] : []).filter(Boolean));
const SECONDS = Number(args.seconds ?? 20);
const HZ = Number(args.hz ?? 20);
// --chunk N : N caractères par delta (défaut : un mot). Fable/Haiku streament
// par paquets de ~110 caractères toutes les 300-750 ms : `--chunk 110 --hz 2.5`.
const CHUNK = args.chunk ? Number(args.chunk) : null;
const TOP = Number(args.top ?? 15);
const EVENTS = Number(args.events ?? 2000);
// --dist dist-bench : build non minifié (`npx vite build --minify false --outDir dist-bench`)
// pour que le profil nomme les fonctions ; les chiffres, eux, se lisent sur dist/.
const DIST = resolve(args.dist ?? "dist");
const PORT_SIDECAR = 4242;
if (!existsSync(join(DIST, "index.html"))) { console.error("dist/ absent — lancer `npx vite build`"); process.exit(1); }

const THREAD = { id: "bench-thread", projectRoot: "/tmp/bench/albedo", title: "Banc streaming", provider: "codex", sessionId: "bench-session", status: "idle", updatedAt: new Date().toISOString() };

/** Fil synthétique : tours user → outils → usage → texte → done, dans les proportions
 * observées sur un vrai fil de thèse (≈ 10 événements par tour, un tiers d'usage). */
function syntheticHistory(n) {
  const events = [];
  let seq = 0;
  const meta = (turn, extra = {}) => ({ schemaVersion: 1, eventId: `e-${++seq}`, provider: "codex", threadId: THREAD.id, turnId: `turn-${turn}`, sequence: seq, ts: 1_700_000_000_000 + seq * 1000, durable: true, origin: "provider", ...extra });
  const para = "Le rétablissement de l'albédo dépend du lessivage des impuretés par l'eau de fonte ; à Athabasca il reste bas deux étés, à Haig il remonte dès l'été suivant. ";
  for (let turn = 1; events.length < n; turn++) {
    events.push({ kind: "user", text: `Question ${turn} : compare les deux glaciers.`, ts: 0, meta: meta(turn, { origin: "atelier" }) });
    for (let k = 0; k < 3; k++) events.push({ kind: "tool_update", id: `t-${turn}-${k}`, name: "Bash", detail: `python scripts/plot_${k}.py`, status: "completed", output: "ok\n".repeat(20), ts: 0, meta: meta(turn) });
    for (let k = 0; k < 3; k++) events.push({ kind: "usage", input: 1000 + k, output: 200, ts: 0, meta: meta(turn) });
    events.push({ kind: "text", text: `## Tour ${turn}\n\n${para.repeat(3)}\n\n- point un\n- point deux\n\n$$E = mc^2$$\n`, ts: 0, meta: meta(turn) });
    events.push({ kind: "done", ok: true, result: "", ts: 0, meta: meta(turn) });
  }
  return events.slice(0, n);
}

const history = args.history
  ? JSON.parse(readFileSync(args.history, "utf8")).events.map((e) => ({ ...e, ...(e.meta ? { meta: { ...e.meta, threadId: THREAD.id } } : {}) }))
  : syntheticHistory(EVENTS);
const headSequence = history.reduce((m, e) => Math.max(m, e.meta?.sequence ?? 0), 0);

// ---- serveur statique pour dist/ ------------------------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/uistate") { res.writeHead(204, { "access-control-allow-origin": "*" }); res.end(); return; }
  if (url.pathname === "/blank.html") { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>galerie factice</title>"); return; }
  let file = join(DIST, url.pathname === "/" ? "index.html" : url.pathname);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---- navigateur -------------------------------------------------------------
// --browser webkit : moteur JSC (comme WKWebView). Pas de CDP : on mesure le
// temps CPU cumulé de l'arbre de processus du navigateur (ps), avant/après.
const ENGINE = args.browser === "webkit" ? "webkit" : "chromium";
const browser = ENGINE === "webkit" ? await webkit.launch() : await chromium.launch();
function browserCpuByRole() {
  // processus du navigateur Playwright (bundle ms-playwright/<moteur>), par rôle :
  // WebContent (page + JS + layout/peinture), GPU, Networking, navigateur. Un seul
  // banc à la fois. `time` = CPU cumulé du processus (tous threads).
  const marker = ENGINE === "webkit" ? "ms-playwright/webkit" : "ms-playwright/chromium";
  const rows = execFileSync("ps", ["-axo", "pid=,time=,command="], { encoding: "utf8" }).trim().split("\n");
  const toSec = (t) => t.split(":").reduce((acc, v) => acc * 60 + Number(v), 0);
  const out = { total: 0, byRole: {}, pids: {} };
  for (const row of rows) {
    if (!row.includes(marker)) continue;
    const [pid, time, ...cmd] = row.trim().split(/\s+/);
    const c = cmd.join(" ");
    const role = /WebContent\.xpc/.test(c) ? "webcontent" : /WebKit\.GPU\.xpc/.test(c) ? "gpu" : /Networking\.xpc/.test(c) ? "networking"
      : /Playwright\.app\/Contents\/MacOS\/Playwright/.test(c) ? "browser"
      : /--type=renderer/.test(c) ? "webcontent" : /--type=gpu-process/.test(c) ? "gpu" : /--type=utility.*network/i.test(c) ? "networking"
      : /Chromium\.app\/Contents\/MacOS\/Chromium(?:\s|$)/.test(c) && !/--type=/.test(c) ? "browser" : null;
    if (!role) continue; // wrappers (bash pw_run.sh, shells) et autres helpers : hors mesure
    const sec = toSec(time);
    out.total += sec; out.byRole[role] = (out.byRole[role] ?? 0) + sec; out.pids[pid] = role;
  }
  return out;
}
const cpuDelta = (a, b) => ({
  total: +(b.total - a.total).toFixed(2),
  byRole: Object.fromEntries([...new Set([...Object.keys(a.byRole), ...Object.keys(b.byRole)])].map((r) => [r, +(((b.byRole[r] ?? 0) - (a.byRole[r] ?? 0))).toFixed(2)])),
  sameProcesses: JSON.stringify(Object.keys(a.pids).sort()) === JSON.stringify(Object.keys(b.pids).sort()),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on("pageerror", (e) => console.error("[page error]", e.message));
const DEBUG = "debug" in args;
if (DEBUG) page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.error(`[console ${m.type()}]`, m.text().slice(0, 300)); });
const PROBES = "probes" in args;
await page.addInitScript(({ port, root, galleryUrl, probes }) => {
  // Projet actif = celui du fil, sinon l'app ouvre sur les discussions libres
  // et la barre latérale ne liste pas le fil.
  try { localStorage.setItem("atelier-studio.projects", JSON.stringify([root])); } catch {}
  // Tauri absent : on répond aux commandes que le boot appelle, null ailleurs.
  const answers = { sidecar_port: { port, token: "bench" }, start_atelier: galleryUrl, gallery_token: "bench", boot_clock_elapsed_ms: 0, "plugin:event|listen": 1 };
  window.isTauri = true;
  if (location.search.includes("nomargin")) window.__benchNoMarginMeasure = true;
  if (location.search.includes("nullbubble")) window.__benchNullBubble = true;
  window.__TAURI_INTERNALS__ = {
    invoke: (cmd) => Promise.resolve(cmd in answers ? answers[cmd] : null),
    transformCallback: () => 0,
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  // compteurs côté page (--probes seulement : la capture de pile à chaque rAF
  // et le MutationObserver coûtent du CPU et fausseraient une mesure nue)
  window.__bench = { mutations: 0, rafs: 0, timers: 0, rafSites: {} };
  if (!probes) return;
  const rawRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    // site d'appel = première ligne de pile hors de ce wrapper
    const site = (new Error().stack || "").split("\n").slice(2, 4).map((l) => l.trim().replace(/^at /, "").replace(/\(?https?:\/\/[^)]*\/([^/)]+)\)?$/, "$1")).join(" ← ");
    window.__bench.rafSites[site] = (window.__bench.rafSites[site] ?? 0) + 1;
    return rawRaf((t) => { window.__bench.rafs++; cb(t); });
  };
  const rawTimeout = window.setTimeout.bind(window);
  window.setTimeout = (cb, ms, ...rest) => rawTimeout((...a) => { window.__bench.timers++; if (typeof cb === "function") cb(...a); }, ms, ...rest);
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver((records) => { window.__bench.mutations += records.length; })
      .observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}, { port: PORT_SIDECAR, root: THREAD.projectRoot, galleryUrl: `${origin}/blank.html`, probes: PROBES });

let sock = null;
let streaming = null;
await page.routeWebSocket(new RegExp(`^ws://127\\.0\\.0\\.1:${PORT_SIDECAR}`), (ws) => {
  sock = ws;
  const send = (m) => ws.send(JSON.stringify(m));
  ws.onMessage((raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (DEBUG) console.error("[ws ←]", msg.type);
    if (msg.type === "listThreads") send({ type: "threads", threads: [THREAD] });
    if (msg.type === "getHistory" && msg.threadId === THREAD.id) {
      send({ type: "history", threadId: THREAD.id, requestId: msg.requestId, events: history, historyMode: "snapshot", historyCursor: null, historyHeadSequence: headSequence, historyEpoch: "bench", historyRevision: 1 });
    }
    if (msg.type === "getSettings") send({ type: "settings", settings: {} });
  });
});

// --reduced-motion : le lissage est court-circuité (texte publié tel quel) —
// isole le coût de la boucle rAF 120 Hz de useSmoothedStream.
if ("reduced-motion" in args) await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto(origin + "/" + ("nomargin" in args ? "?nomargin=1" : "nullbubble" in args ? "?nullbubble=1" : ""));
// --no-animations : neutralise toute animation/transition CSS (fondu des mots,
// shimmer, glyphes) — isole leur coût de rendu.
if ("no-animations" in args) await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
// ablations CSS ciblées (sans rebuild) : fondu par mot, curseur, transitions
if ("no-wordfade" in args) await page.addStyleTag({ content: ".msg.is-streaming .sw, .thinking-live-stream .sw { animation: none !important; }" });
if ("no-caret" in args) await page.addStyleTag({ content: ".stream-caret, .stream-caret::after { animation: none !important; }" });
if ("no-transitions" in args) await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
try {
  await page.locator(".sidebar").getByText(THREAD.title).first().click({ timeout: 15000 });
} catch (e) {
  await page.screenshot({ path: "/tmp/chat_stream_bench_fail.png" });
  console.error("sélection du fil impossible — capture /tmp/chat_stream_bench_fail.png ; body:", (await page.evaluate(() => document.body.innerText.slice(0, 400))));
  throw e;
}
await page.waitForFunction(() => document.querySelectorAll(".user-bubble, .user-message").length > 0, null, { timeout: 15000 });
await page.waitForTimeout(1500); // laisser la page se poser

// ---- mesure ----------------------------------------------------------------
// --noprofile : métriques seules — le profileur (échantillon 500 µs) gonfle
// TaskDuration ; pour comparer des chiffres CPU, mesurer sans lui.
const PROFILE = ENGINE === "chromium" && !("noprofile" in args);
const cdp = ENGINE === "chromium" ? await page.context().newCDPSession(page) : null;
if (cdp) await cdp.send("Performance.enable");
if (PROFILE) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
}
const metricsOf = async () => cdp ? Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])) : {};

// calques composités du document (LayerTree) : Layerize/Commit y sont proportionnels
let layerCount = null;
if (cdp) try {
  const layers = [];
  cdp.on("LayerTree.layerTreeDidChange", (e) => { layers.length = 0; if (e.layers) layers.push(...e.layers); });
  await cdp.send("LayerTree.enable");
  await page.waitForTimeout(300);
  layerCount = { total: layers.length, withDrawsContent: layers.filter((l) => l.drawsContent).length, byReason: Object.entries(layers.reduce((acc, l) => { const r = l.compositingReasons?.[0] ?? l.compositingReasonIds?.[0] ?? "?"; acc[r] = (acc[r] ?? 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6) };
  await cdp.send("LayerTree.disable");
} catch { layerCount = null; }
const before = await metricsOf();
const cpuBefore = browserCpuByRole();
// garde : un seul navigateur de banc vivant, sinon la mesure agrège un orphelin
const browserCount = Object.values(cpuBefore.pids).filter((r) => r === "browser").length;
if (browserCount !== 1) { console.error(`ÉCHEC — ${browserCount} instances ${ENGINE} de banc vivantes (orphelins ?) : pkill -f ms-playwright/${ENGINE}`); await browser.close(); server.close(); process.exit(2); }
const countersBefore = await page.evaluate(() => ({ ...window.__bench }));
// --trace : trace Chromium (devtools.timeline) agrégée par nom d'événement —
// attribue le temps hors script (peinture, calques, GC, frames).
const TRACE = "trace" in args;
if (TRACE && cdp) await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute", "blink.user_timing"] });
if (PROFILE) await cdp.send("Profiler.start");
const t0 = Date.now();
// --offscreen : les deltas visent un fil qui n'est pas affiché — coût pur de
// l'injection WS + réduction dans le store, sans aucun rendu.
const TARGET = "offscreen" in args ? "bench-offscreen" : THREAD.id;
const emit = (event) => sock.send(JSON.stringify({ type: "event", threadId: TARGET, event: TARGET === THREAD.id ? event : { ...event, meta: event.meta ? { ...event.meta, threadId: TARGET } : event.meta } }));
let seq = headSequence;
const meta = (extra = {}) => ({ schemaVersion: 1, eventId: `live-${++seq}`, provider: "codex", threadId: THREAD.id, turnId: "turn-live", sequence: seq, ts: Date.now(), durable: false, origin: "provider", ...extra });
// --idle : rien n'est envoyé pendant SECONDS — plancher de bruit du banc
const IDLE = "idle" in args;
// --raf-loop : avec --idle, une boucle rAF vide tourne pendant la mesure —
// coût nu d'une frame d'animation du moteur sur cette page.
if (IDLE && "raf-loop" in args) await page.evaluate(() => { const f = () => { window.__benchRaf = requestAnimationFrame(f); }; f(); });
if (IDLE) await page.waitForTimeout(SECONDS * 1000);
if (IDLE && "raf-loop" in args) await page.evaluate(() => cancelAnimationFrame(window.__benchRaf));
if (!IDLE) emit({ kind: "user", text: "Explique la formation des nuages en 400 mots.", ts: Date.now(), meta: meta({ origin: "atelier", durable: true }) });
if (!IDLE) emit({ kind: "started", ts: Date.now(), meta: meta() });
const words = "Les nuages naissent quand l'air humide se refroidit sous son point de rosée et que la vapeur se condense sur des noyaux ; la convection, le relief et les fronts fournissent l'ascendance nécessaire. ".split(" ");
let i = 0, deltas = 0;
let sent = "";
const total = IDLE ? 0 : SECONDS * HZ;
// --scroll-away : après le premier delta, on remonte le fil en haut (le suivi
// se coupe) — la bulle vivante n'est plus dans la fenêtre. Si le coût tombe,
// c'est du layout/peinture de la bulle ; sinon c'est React/JS.
let scrolledAway = false;
while (deltas < total) {
  if ("scroll-away" in args && deltas === 3 && !scrolledAway) {
    scrolledAway = true;
    await page.evaluate(() => { const el = document.querySelector(".messages"); if (el) { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); } });
  }
  let chunk = "";
  // paragraphes réalistes (~60 mots) : le bloc de queue re-rendu à chaque
  // publication ne doit pas grossir sans fin comme un paragraphe de 900 mots
  if (CHUNK) { while (chunk.length < CHUNK) { chunk += words[i++ % words.length] + " "; if (i % 60 === 0) chunk += "\n\n"; } }
  else chunk = words[i++ % words.length] + " " + (deltas % 40 === 39 ? "\n\n" : "");
  emit({ kind: "delta", text: chunk, ts: Date.now(), meta: meta() });
  sent += chunk;
  deltas++;
  await page.waitForTimeout(1000 / HZ);
}
const streamWall = (Date.now() - t0) / 1000;
const cpuAfterStream = browserCpuByRole();
const streamedText = await page.evaluate(() => (document.querySelector(".is-streaming")?.textContent ?? "").length);
const liveRows = await page.evaluate(() => ({ streaming: document.querySelectorAll(".is-streaming").length, liveThinking: document.querySelectorAll(".thinking.live, .thinking-live").length, rows: document.querySelectorAll(".timeline-virtual-row").length }));
// garde-fous : la bulle affiche bien le texte reçu (≥ 90 % — le lissage peut
// avoir un pas de retard) et la liste suit toujours le bas pendant le stream
const sentChars = sent.length;
const follow = await page.evaluate(() => {
  const el = document.querySelector(".messages") ?? document.scrollingElement;
  return el ? { gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), scrollable: el.scrollHeight > el.clientHeight + 10 } : null;
});
// le texte final est EXACTEMENT ce qui a été streamé : un texte différent
// changerait la géométrie de la bulle à la finalisation, hors sujet
if (!IDLE) emit({ kind: "text", text: sent, ts: Date.now(), meta: meta() });
if (!IDLE) emit({ kind: "done", ok: true, result: "", ts: Date.now(), meta: meta() });
await page.waitForTimeout(1500);
const wall = (Date.now() - t0) / 1000;
const profile = PROFILE ? (await cdp.send("Profiler.stop")).profile : { nodes: [], samples: [], timeDeltas: [] };
const cpuAfter = browserCpuByRole();
let traceSummary = null;
if (TRACE && cdp) {
  const buf = await browser.stopTracing();
  const events = JSON.parse(buf.toString("utf8")).traceEvents ?? [];
  // temps PROPRE par nom : dur de l'événement moins celle de ses enfants
  // (événements complets "X" du thread principal, imbriqués par [ts, ts+dur])
  const main = events.filter((e) => e.ph === "X" && typeof e.dur === "number" && e.tid === (events.find((m) => m.name === "thread_name" && m.args?.name === "CrRendererMain")?.tid ?? e.tid));
  main.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const stack = []; const selfByName = new Map();
  for (const e of main) {
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) stack.pop();
    if (stack.length) { const parent = stack[stack.length - 1]; parent.childDur = (parent.childDur ?? 0) + e.dur; }
    stack.push(e);
  }
  for (const e of main) selfByName.set(e.name, (selfByName.get(e.name) ?? 0) + e.dur - (e.childDur ?? 0));
  const totalMs = [...selfByName.values()].reduce((a, b) => a + b, 0) / 1000;
  traceSummary = { mainThreadSelfMs: Math.round(totalMs), top: [...selfByName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([name, us]) => ({ name, ms: Math.round(us / 1000), pct: +((us / 1000) / totalMs * 100).toFixed(1) })) };
}
const after = await metricsOf();
const countersAfter = await page.evaluate(() => ({ ...window.__bench }));
const rafSites = Object.entries(countersAfter.rafSites).map(([site, n]) => [site, n - (countersBefore.rafSites?.[site] ?? 0)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([site, n]) => ({ site, perSecond: +(n / wall).toFixed(1) }));
const perSecond = (k) => +((countersAfter[k] - countersBefore[k]) / wall).toFixed(1);

// ---- agrégation du profil : temps propre par fonction --------------------
const byNode = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
for (let k = 0; k < profile.samples.length; k++) {
  const n = byNode.get(profile.samples[k]);
  const cf = n.callFrame;
  const key = `${cf.functionName || "(anonyme)"} ${(cf.url || "").split("/").pop()}:${cf.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + (dt[k] ?? 0));
}
const isMeta = (k) => /^\((idle|program|garbage collector|root)\)/.test(k);
const busy = [...self.entries()].filter(([k]) => !isMeta(k));
const busyMs = busy.reduce((a, [, us]) => a + us, 0) / 1000;
const top = busy.sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, us]) => ({ fn: k, ms: Math.round(us / 1000), pct: +((us / 1000) / busyMs * 100).toFixed(1) }));
const gcMs = Math.round((self.get("(garbage collector) :-1") ?? 0) / 1000);
// Temps inclusif (soi + descendants) par fonction : dit qui COMMANDE le coût,
// là où le temps propre le disperse dans React. Un nœud récursif n'est compté
// qu'une fois par chaîne d'appel.
const selfByNode = new Map();
for (let k = 0; k < profile.samples.length; k++) selfByNode.set(profile.samples[k], (selfByNode.get(profile.samples[k]) ?? 0) + (dt[k] ?? 0));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const keyOf = (n) => `${n.callFrame.functionName || "(anonyme)"} ${(n.callFrame.url || "").split("/").pop()}:${n.callFrame.lineNumber}`;
const inclusive = new Map();
for (const [id, us] of selfByNode) {
  const seen = new Set();
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const k = keyOf(byNode.get(cur));
    if (seen.has(k)) continue;
    seen.add(k);
    inclusive.set(k, (inclusive.get(k) ?? 0) + us);
  }
}
const topInclusive = [...inclusive.entries()].filter(([k]) => !isMeta(k) && !/^\(anonyme\)/.test(k) && !/react-vendor/.test(k))
  .sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, us]) => ({ fn: k, ms: Math.round(us / 1000), pct: +((us / 1000) / busyMs * 100).toFixed(1) }));
const d = (k) => +((after[k] ?? 0) - (before[k] ?? 0)).toFixed(3);

console.log(JSON.stringify({
  history: { events: history.length, source: args.history ? "captured" : "synthetic" },
  stream: { seconds: SECONDS, hz: HZ, chunk: CHUNK ?? "word", deltas, wallSeconds: +wall.toFixed(1), renderedChars: streamedText, sentCharsApprox: sentChars, liveRows, follow },
  engine: ENGINE,
  probes: PROBES,
  // CPU du navigateur (s) : pendant les deltas seulement, puis finalisation (text+done+1,5 s)
  cpu: {
    streaming: { ...cpuDelta(cpuBefore, cpuAfterStream), wallSeconds: +streamWall.toFixed(1),
      pctOfWall: +((cpuAfterStream.total - cpuBefore.total) / streamWall * 100).toFixed(1),
      webcontentPctOfWall: +(((cpuAfterStream.byRole.webcontent ?? 0) - (cpuBefore.byRole.webcontent ?? 0)) / streamWall * 100).toFixed(1) },
    finalization: cpuDelta(cpuAfterStream, cpuAfter),
  },
  page: {
    scriptSeconds: d("ScriptDuration"), layoutSeconds: d("LayoutDuration"), styleSeconds: d("RecalcStyleDuration"), taskSeconds: d("TaskDuration"),
    cpuPctOfWall: +((d("TaskDuration") / wall) * 100).toFixed(1),
    jsHeapMiBBefore: +(before.JSHeapUsedSize / 1048576).toFixed(0), jsHeapMiBAfter: +(after.JSHeapUsedSize / 1048576).toFixed(0),
    nodes: after.Nodes, layers: layerCount, layoutCount: d("LayoutCount"), styleRecalcCount: d("RecalcStyleCount"),
    perSecond: { domMutations: perSecond("mutations"), rafFrames: perSecond("rafs"), timerCallbacks: perSecond("timers") },
    // toutes les durées CDP (delta), pour voir ce que TaskDuration contient hors script
    durations: Object.fromEntries(Object.keys(after).filter((k) => /Duration$/.test(k)).map((k) => [k, d(k)])),
    rafSites,
  },
  profile: { busyMs: Math.round(busyMs), gcMs, top, topInclusive },
  trace: traceSummary,
}, null, 2));
await browser.close();
server.close();
