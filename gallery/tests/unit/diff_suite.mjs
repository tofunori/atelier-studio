// Suite de tests de la mécanique diff/versions/rewrap de l'éditeur.
// Verrouille les 9 corrections de la passe de solidification (2026-07-08) :
// toute régression future doit être attrapée ICI avant le build.
//
//   node gallery/tests/unit/diff_suite.mjs   → « diff suite: ok (N tests) »
//
// Trois étages :
//   A. endpoints serveur réels (dépôt git temporaire, atelier-gallery-server
//      Rust spawné — voir gallery/tests/gallery_server.mjs)
//   B. module diff_versions.js réel (harnais VM, stubs CodeMirror/DOM)
//   C. contrats des modules TypeScript extraits des surfaces éditeur
// Aucun appel réseau externe, aucun appel IA — < 30 s.

import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnGalleryServer } from "../gallery_server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GALLERY = path.resolve(HERE, "..", "..");
const ASSETS = path.join(GALLERY, "assets");

let passed = 0;
const TODOS = [];
const CONTRACT_FAILURES = [];
function todo(name, reason) { TODOS.push({name, reason}); }

function ok(name, cond, detail) {
  if (cond) { passed++; return; }
  console.error(`✗ ${name}${detail ? " — " + detail : ""}`);
  process.exitCode = 1;
  throw new Error(`test failed: ${name}`);
}

function contractOk(name, cond, detail) {
  if (cond) { passed++; return; }
  const message = `✗ ${name}${detail ? " — " + detail : ""}`;
  console.error(message);
  CONTRACT_FAILURES.push(message);
}

const INTERVENTION_SOURCES = new Set([
  "user-save", "external-reload", "external-merge", "external-conflict", "restore", "legacy",
]);
const INTERVENTION_STATUSES = new Set(["applied", "pending-conflict"]);

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
function durableState(pathname, revision, base, entries, current) {
  const texts = {};
  const put = (text) => { const hash = sha256(text); texts[hash] = text; return hash; };
  const baseHash = put(base);
  return { v: 2, path: pathname, revision,
    base: { hash: baseHash, kind: "session", sha: "", ts: 1 }, texts,
    interventions: entries.map((it) => ({ id: it.id, fromHash: put(it.before), toHash: put(it.after),
      ts: it.ts, source: it.source, status: it.status })), legacySnapshots: [],
    current: { hash: put(current), ts: Date.now() } };
}

// ---------------------------------------------------------------- A. serveur
async function serverTests() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "diffsuite-"));
  git(["init", "-q"], repo);
  git(["config", "user.email", "t@t"], repo);
  git(["config", "user.name", "t"], repo);
  fs.writeFileSync(path.join(repo, "m.tex"), "version un du texte\n");
  git(["add", "m.tex"], repo);
  git(["commit", "-qm", "redaction section intro"], repo);
  fs.writeFileSync(path.join(repo, "m.tex"), "version deux apres edit\n");
  git(["commit", "-aqm", "auto: reformule un passage"], repo);
  fs.writeFileSync(path.join(repo, "m.tex"), "version trois encore mieux\n");
  git(["commit", "-aqm", "auto: session 2026-07-08 13:31"], repo);
  const baseSha = git(["log", "--format=%h", "--grep=redaction"], repo).trim();

  const port = 19700 + 90 + Math.floor(Math.random() * 100);
  const srv = spawnGalleryServer({ root: repo, port });
  const j = async (url, opts) => (await fetch(`http://localhost:${port}${url}`, opts)).json();
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try { up = (await j("/health")).ok; } catch {}
    }
    ok("serveur démarré", up);
    const file = path.join(repo, "m.tex");
    const q = "?path=" + encodeURIComponent(file);

    // /githead : la base saute les commits « auto: » (les deux formats)
    let r = await j("/githead" + q);
    ok("githead base significative", r.ok && r.text === "version un du texte\n" && r.sha === baseSha,
      JSON.stringify(r));
    const snapshotSha = git(["rev-parse", "HEAD~1"], repo).trim();
    r = await j(`/githead${q}&base=${snapshotSha}`);
    ok("githead snapshot explicite avant tour", r.ok && r.text === "version deux apres edit\n"
      && snapshotSha.startsWith(r.sha), JSON.stringify(r));

    // /gitlog + /gitshow
    r = await j("/gitlog" + q);
    ok("gitlog liste les commits", r.ok && r.items.length === 3 && r.items[2].msg.startsWith("redaction"));
    r = await j(`/gitshow${q}&sha=${baseSha}`);
    ok("gitshow contenu exact", r.ok && r.text === "version un du texte\n");
    r = await j(`/gitshow${q}&sha=;rm`);
    ok("gitshow refuse un sha invalide", r.ok === false);

    // /gitcommit : jalon --allow-empty quand l'arbre est propre mais ≠ base
    r = await j("/gitcommit", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, message: "ameliorer le texte v3" }) });
    ok("gitcommit jalon sur arbre propre", r.ok && r.sha, JSON.stringify(r));
    r = await j("/githead" + q);
    ok("base déplacée sur le jalon", r.ok && r.text === "version trois encore mieux\n");
    r = await j("/gitcommit", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, message: "doublon" }) });
    ok("gitcommit refuse sans changement", r.ok === false);

    // /versions v2 : init + append, révision autoritaire et stockage gzip atomique.
    const before = "avant\n", after = "apres\n";
    const fromHash = sha256(before), toHash = sha256(after);
    r = await j("/versions", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, expectedRevision: 0, ops: [
        { type: "init", base: { hash: fromHash, kind: "session", sha: "", ts: 42 },
          current: { hash: fromHash, ts: 42 }, texts: { [fromHash]: before } },
        { type: "append", intervention: { id: "i-1", fromHash, toHash, ts: 43,
          source: "user-save", status: "applied" }, current: { hash: toHash, ts: 43 },
          texts: { [toHash]: after } },
      ] }) });
    ok("versions POST v2 revision", r.ok && r.revision === 1, JSON.stringify(r));
    r = await j("/versions" + q);
    ok("versions GET v2 compact", r.ok && r.v === 2 && r.revision === 1
      && r.interventions.length === 1 && r.texts[fromHash] === before && r.texts[toHash] === after,
    JSON.stringify(r));
    const stale = await fetch(`http://localhost:${port}/versions`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, expectedRevision: 0, ops: [] }) });
    const staleBody = await stale.json();
    ok("versions révision obsolète → 409", stale.status === 409 && staleBody.error === "revision-conflict"
      && staleBody.revision === 1 && staleBody.state?.interventions?.[0]?.id === "i-1", JSON.stringify(staleBody));
    const invalid = await fetch(`http://localhost:${port}/versions`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, expectedRevision: 1, ops: [{ type: "append",
        intervention: { id: "bad", fromHash, toHash: "0".repeat(64), ts: 44,
          source: "user-save", status: "applied" }, texts: { [toHash]: after } }] }) });
    ok("versions payload hash invalide refusé", invalid.status === 400);

    // /versions op `review` : décisions de revue durables (2026-09-11). Le
    // localStorage du WebView meurt au redémarrage (PIEGES_CONNUS §1) ; la
    // décision vit dans le journal, rendue par GET, `null` la retire.
    // Même contrat côté Rust : `une_decision_de_revue_persiste_dans_le_journal`
    // (http_smoke.rs) — la route que l'app exécute (§3b).
    const reviewFile = path.join(repo, "review.tex");
    fs.writeFileSync(reviewFile, after);
    const rq = "?path=" + encodeURIComponent(reviewFile);
    const rpost = (expectedRevision, ops) => j("/versions", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: reviewFile, expectedRevision, ops }) });
    r = await rpost(0, [
      { type: "init", base: { hash: fromHash, kind: "session", sha: "", ts: 1 },
        current: { hash: fromHash, ts: 1 }, texts: { [fromHash]: before } },
      { type: "append", intervention: { id: "i-1", fromHash, toHash, ts: 2,
        source: "user-save", status: "applied" }, current: { hash: toHash, ts: 2 },
        texts: { [toHash]: after } },
    ]);
    ok("versions review : journal de départ", r.ok && r.revision === 1, JSON.stringify(r));
    const adjusted = "avant ajuste\n", adjustedHash = sha256(adjusted);
    r = await rpost(1, [{ type: "review", id: "i-1",
      review: { baseHash: adjustedHash, textHash: toHash }, texts: { [adjustedHash]: adjusted } }]);
    ok("versions review : décision acquittée", r.ok && r.revision === 2, JSON.stringify(r));
    r = await j("/versions" + rq);
    ok("versions review : GET renvoie la décision et garde son texte",
      r.ok && r.review?.["i-1"]?.baseHash === adjustedHash && r.review["i-1"].textHash === toHash
        && r.review["i-1"].accepted === undefined && r.texts[adjustedHash] === adjusted, JSON.stringify(r));
    r = await rpost(2, [{ type: "review", id: "i-1",
      review: { baseHash: toHash, textHash: toHash, accepted: true }, texts: {} }]);
    ok("versions review : « Tout accepter » acquitté", r.ok && r.revision === 3, JSON.stringify(r));
    r = await j("/versions" + rq);
    ok("versions review : accepted:true rendu, ancienne base collectée",
      r.review?.["i-1"]?.accepted === true && r.texts[adjustedHash] === undefined, JSON.stringify(r));
    r = await rpost(3, [{ type: "review", id: "i-1", review: null, texts: {} }]);
    ok("versions review : null retire la décision", r.ok && r.revision === 4, JSON.stringify(r));
    r = await j("/versions" + rq);
    ok("versions review : GET sans la décision retirée", r.ok && r.review && !("i-1" in r.review), JSON.stringify(r));
    const emptyId = await fetch(`http://localhost:${port}/versions`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: reviewFile, expectedRevision: 4, ops: [{ type: "review", id: "",
        review: { baseHash: toHash, textHash: toHash }, texts: {} }] }) });
    const emptyIdBody = await emptyId.json();
    ok("versions review : id vide → invalid op", emptyId.status === 400 && /invalid op/.test(emptyIdBody.error || ""),
      JSON.stringify(emptyIdBody));
    r = await j("/versions" + rq);
    ok("versions review : révision inchangée après refus", r.revision === 4, JSON.stringify(r));
    for (const [label, review] of [
      ["accepted:false", { baseHash: toHash, textHash: toHash, accepted: false }],
      ["hash inconnu", { baseHash: "0".repeat(64), textHash: toHash }],
      ["clé inconnue", { baseHash: toHash, textHash: toHash, extra: 1 }],
    ]) {
      const bad = await fetch(`http://localhost:${port}/versions`, { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: reviewFile, expectedRevision: 4, ops: [{ type: "review", id: "i-1", review, texts: {} }] }) });
      ok(`versions review : forme invalide refusée (${label})`, bad.status === 400, String(bad.status));
    }
    r = await j("/versions" + rq);
    ok("versions review : révision inchangée après formes invalides", r.revision === 4, JSON.stringify(r));

    const storeDir = path.join(repo, ".fig_thumbs", "dv_versions");
    // clé déterministe : le dossier contient aussi le journal de review.tex
    const store = `${crypto.createHash("md5").update(fs.realpathSync(file)).digest("hex")}.json`;
    const storeFile = path.join(storeDir, store);
    const onDisk = JSON.parse(zlib.gunzipSync(fs.readFileSync(storeFile)));
    ok("versions disque gzip valide", onDisk.v === 2 && onDisk.revision === 1);

    // Un deuxième ack crée le backup; un principal tronqué récupère ce dernier état valide.
    r = await j("/versions", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, expectedRevision: 1, ops: [{ type: "set-current",
        current: { hash: toHash, ts: 45 }, texts: {} }] }) });
    ok("versions second ack", r.ok && r.revision === 2, JSON.stringify(r));
    fs.writeFileSync(storeFile, Buffer.from("gzip-truncated"));
    r = await j("/versions" + q);
    ok("versions principal tronqué récupère backup", r.ok && r.v === 2 && r.revision === 1
      && r.interventions[0].id === "i-1", JSON.stringify(r));
    ok("versions recovery repare principal et garde backup valide", (() => {
      try {
        return JSON.parse(zlib.gunzipSync(fs.readFileSync(storeFile))).revision === 1
          && JSON.parse(zlib.gunzipSync(fs.readFileSync(`${storeFile}.bak`))).revision === 1;
      } catch { return false; }
    })());
    fs.writeFileSync(storeFile, Buffer.from("gzip-truncated-again"));
    r = await j("/versions" + q);
    ok("versions double recovery garde backup valide", r.ok && r.revision === 1 && (() => {
      try {
        return JSON.parse(zlib.gunzipSync(fs.readFileSync(storeFile))).revision === 1
          && JSON.parse(zlib.gunzipSync(fs.readFileSync(`${storeFile}.bak`))).revision === 1;
      } catch { return false; }
    })(), JSON.stringify(r));

    const manyOps = [];
    let prior = after, priorHash = toHash;
    for (let i = 2; i <= 45; i += 1) {
      const nextText = `${after.trim()} intervention ${i} ${"donnees-repetitives ".repeat(20)}\n`;
      const nextHash = sha256(nextText);
      manyOps.push({ type: "append", intervention: { id: `i-${i}`, fromHash: priorHash,
        toHash: nextHash, ts: 43 + i, source: "user-save",
        status: i === 20 ? "pending-conflict" : "applied" },
      current: { hash: nextHash, ts: 43 + i }, texts: { [priorHash]: prior, [nextHash]: nextText } });
      prior = nextText; priorHash = nextHash;
    }
    r = await j("/versions", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, expectedRevision: 1, ops: manyOps }) });
    ok("versions 45 interventions ack", r.ok && r.revision === 2, JSON.stringify(r));
    r = await j("/versions" + q);
    ok("versions 45 préserve N ids ordre status base", r.interventions.length === 45
      && r.interventions[0].id === "i-1" && r.interventions[19].id === "i-20"
      && r.interventions[19].status === "pending-conflict" && r.interventions[44].id === "i-45"
      && r.base.hash === fromHash && r.current.hash === priorHash, JSON.stringify(r.interventions));
    ok("versions 45 chaque hash correspond", Object.entries(r.texts).every(([hash, text]) => sha256(text) === hash));
    const compressed = fs.readFileSync(storeFile);
    ok("versions 45 gzip compresse", compressed.length < Buffer.byteLength(JSON.stringify(r)));

    const legacyFile = path.join(repo, "legacy.tex");
    fs.writeFileSync(legacyFile, "legacy courant\n");
    const legacyKey = crypto.createHash("md5").update(fs.realpathSync(legacyFile)).digest("hex");
    const legacyStore = path.join(storeDir, `${legacyKey}.json`);
    fs.writeFileSync(legacyStore, JSON.stringify({items: [
      {b: "legacy base\n", t: 1}, {b: "legacy milieu\n", t: 2},
    ], last: "legacy courant\n"}));
    r = await j("/versions?path=" + encodeURIComponent(legacyFile));
    ok("versions migration v1 → v2 conserve snapshots et chaîne", r.ok && r.v === 2
      && r.interventions.length === 2 && r.legacySnapshots.length === 3
      && r.texts[r.base.hash] === "legacy base\n" && r.texts[r.current.hash] === "legacy courant\n",
    JSON.stringify(r));
    ok("versions migration v1 réécrite gzip", zlib.gunzipSync(fs.readFileSync(legacyStore)).length > 0);

    const divergentFile = path.join(repo, "legacy-divergent.tex");
    fs.writeFileSync(divergentFile, "divergent\n");
    const divergentKey = crypto.createHash("md5").update(fs.realpathSync(divergentFile)).digest("hex");
    const divergentStore = path.join(storeDir, `${divergentKey}.json`);
    const divergentRaw = JSON.stringify({items: "not-an-array", last: null, unexpected: true});
    fs.writeFileSync(divergentStore, divergentRaw);
    r = await j("/versions?path=" + encodeURIComponent(divergentFile));
    ok("versions v1 divergent refuse sans reecriture", r.ok === false
      && fs.readFileSync(divergentStore, "utf8") === divergentRaw, JSON.stringify(r));

    // /commitmsg : pas de diff vs base → ok:false (pas d'appel IA)
    r = await j("/commitmsg" + q);
    ok("commitmsg sans diff → refus propre", r.ok === false);

    // sécurité : chemin hors projet refusé
    r = await j("/githead?path=" + encodeURIComponent("/etc/hosts"));
    ok("githead hors projet refusé", r.ok === false);
  } finally {
    srv.kill("SIGKILL");
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

// ------------------------------------------------- B. module diff_versions.js
function makeModuleHarness({
  headText = null,
  serverItems = [],
  serverLast = null,
  serverState = null,
  versionsPromise = null,
  localState = null,
  localReview = null,
  headTs = 0,
  filePath = "/x/m.tex",
  restoreResult = true,
  gitItems = [],
  gitTexts = {},
  postResponses = [],
  workerAvailable = false,
  search = "",
  onMarks = null,
  onNavigate = null,
  individualReview = false,
} = {}) {
  const el = () => {
    const e = { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, _children: [],
      appendChild(n) { e._children.push(n); return n; }, insertBefore(n) { e._children.push(n); return n; },
      append(...nodes) { nodes.forEach((n) => e.appendChild(n)); },
      querySelectorAll: () => [], addEventListener() {}, dataset: {}, disabled: false,
      setAttribute(name, value) { (e._attrs ??= {})[name] = String(value); },
      getBoundingClientRect: () => ({}), onclick: null, contains: () => false };
    // mémoïsé : le module garde des refs internes (navPrev…) — les tests doivent
    // retrouver LES MÊMES stubs via le même sélecteur
    e.querySelector = (s) => ((e._q ??= {})[s] ??= el());
    Object.defineProperty(e, "textContent", { get() { return e._t || ""; }, set(v) { e._t = v; } });
    Object.defineProperty(e, "innerHTML", { get() { return e._h || ""; }, set(v) { e._h = v; } });
    return e;
  };
  const marksLog = [];
  const gutterLog = [];
  const scrollLog = [];
  const posts = [];
  const workers = [];
  const headRequests = [];
  const docListeners = [];
  const timers = new Map();
  let timerSeq = 0;
  const runTimers = (maxDelay = Infinity) => {
    let fired = 0;
    for (const [id, { f, d }] of [...timers]) {
      if (d > maxDelay) continue;
      timers.delete(id); f(); fired++;
    }
    return fired;
  };
  const body = el();
  const storage = new Map();
  if (localState !== null) storage.set("texDiffV1:" + filePath, JSON.stringify(localState));
  if (localReview !== null) storage.set("texReviewV1:" + filePath, JSON.stringify(localReview));
  const activeHead = { text: headText, ts: headTs, sha: "abc1234" };
  const cm = {
    _v: "",
    getValue() { return cm._v; },
    lineCount() { return cm._v.split("\n").length; },
    posFromIndex(i) {
      const upto = cm._v.slice(0, i);
      return { line: (upto.match(/\n/g) || []).length, ch: i - (upto.lastIndexOf("\n") + 1), _idx: i };
    },
    indexFromPos(p) { return p._idx ?? 0; },
    getCursor() { return cm.posFromIndex(0); },
    getViewportAnchor() { return {line: 77, ch: 0}; },
    setValue(v) { cm._v = v; },
    getOption() { return false; },
    setBookmark(pos, o) { marksLog.push({ type: "del", idx: pos._idx, text: o.widget._t }); return { clear() { marksLog.push({type:"clear"}); } }; },
    markText(f, t) { marksLog.push({ type: "add", from: f._idx, to: t._idx }); return { clear() { marksLog.push({type:"clear"}); } }; },
    _options: {},
    setOption(name, value) { cm._options[name] = value; }, on() {}, operation(f) { f(); },
    clearGutter() { gutterLog.length = 0; },
    setGutterMarker(line, g, cell) { gutterLog.push({ line, html: cell._h }); },
    scrollIntoView(pos) { scrollLog.push(pos); }, refresh() {}, setCursor() {}, addLineClass() {}, removeLineClass() {},
  };
  const ctx = {
    window: {}, console, Date, JSON, Math, Infinity, crypto: crypto.webcrypto, TextEncoder,
    URLSearchParams, location: { search },
    document: { getElementById: () => null, createElement: el, head: { appendChild() {} },
      body, addEventListener(type, fn, opts) { docListeners.push({ type, fn, opts }); },
      querySelector: () => null },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    fetch: (u, opts) => {
      const url = String(u);
      if (url.startsWith("/githead")) {
        headRequests.push(url);
        return activeHead.text === null
          ? Promise.resolve({ json: () => Promise.resolve({ ok: false }) })
          : Promise.resolve({ json: () => Promise.resolve({ ok: true, text: activeHead.text, sha: activeHead.sha, ts: activeHead.ts }) });
      }
      if (url.startsWith("/versions") && opts && opts.method === "POST") {
        const payload = JSON.parse(opts.body);
        posts.push(payload);
        const configured = postResponses[posts.length - 1];
        const answer = typeof configured === "function" ? configured(payload) : configured;
        const body = answer?.body || { ok: true, revision: posts.length };
        return Promise.resolve({ status: answer?.status || 200, json: () => Promise.resolve(body) });
      }
      if (url.startsWith("/versions"))
        return versionsPromise
          ? versionsPromise.then((value) => ({ json: () => Promise.resolve(value) }))
          : Promise.resolve({ json: () => Promise.resolve(serverState || { ok: true, items: serverItems, last: serverLast }) });
      if (url.startsWith("/gitlog"))
        return Promise.resolve({ json: () => Promise.resolve({ok: true, items: gitItems}) });
      if (url.startsWith("/gitshow")) {
        const sha = new URL(url, "http://x").searchParams.get("sha");
        return Promise.resolve({ json: () => Promise.resolve(
          Object.prototype.hasOwnProperty.call(gitTexts, sha)
            ? { ok: true, text: gitTexts[sha] } : { ok: false }) });
      }
      return new Promise(() => {});
    },
    setInterval(f) { ctx.__tick = f; return 1; }, clearInterval() {},
    // ≤ 400 ms : synchrone (debounce de persistance). Au-delà (toast Annuler
    // 8 s, flash…) : retenu dans `timers`, déclenché par h.runTimers(maxDelay).
    setTimeout(f, d) {
      if (f && (d === undefined || d <= 400)) { f(); return 0; }
      const id = ++timerSeq; timers.set(id, { f, d }); return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  if (workerAvailable) ctx.Worker = class {
    constructor(url) { this.url = url; this.posts = []; this.onmessage = null; this.onerror = null; workers.push(this); }
    postMessage(message) { this.posts.push(message); }
    terminate() { this.terminated = true; }
    respond(message) { this.onmessage?.({data: message}); }
    fail() { this.onerror?.(new Error("worker failed")); }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ASSETS, "diff.min.js"), "utf8"), ctx);
  ctx.Diff = ctx.window.Diff || ctx.Diff;
  vm.runInContext(fs.readFileSync(path.join(ASSETS, "diff_versions.js"), "utf8"), ctx);
  const notes = [];
  const tag = el();
  const restore = el();
  const restored = [];
  // groupe qui capture le navPill inséré par ensureNavUi (timeline ‹ k/N ›)
  const group = el();
  let navPill = null;
  group.insertBefore = (n) => { group._children.push(n); if (n && n.id === "dvNav") navPill = n; };
  const dv = ctx.window.DiffVersions({
    getCm: () => cm, path: filePath, notify: (m) => notes.push(m),
    els: { tag, prev: null, next: null, restore, group },
    restoreText: async (text) => { restored.push(text); return restoreResult; },
    ...(onMarks ? { onMarks } : {}),
    ...(onNavigate ? { onNavigate } : {}),
    ...(individualReview ? { individualReview: true } : {}),
  });
  const fireKeydown = (e) => docListeners
    .filter((l) => l.type === "keydown")
    .forEach((l) => l.fn({ preventDefault() {}, stopPropagation() {}, ...e }));
  const nav = () => navPill && {
    prev: navPill._children.find((child) => child?.dataset?.d === "-1") || navPill.querySelector('[data-d="-1"]'),
    next: navPill._children.find((child) => child?.dataset?.d === "1") || navPill.querySelector('[data-d="1"]'),
    count: tag.querySelector(".dv-count"),
  };
  const historyButton = () => group._children.find((child) => child && child.id === "dvHist") || null;
  const historyRows = () => {
    const pop = body._children.find((child) => child?._q?.["#dvHistList"]);
    return pop?._q?.["#dvHistList"]?._children || [];
  };
  const setHead = (text, ts, sha = activeHead.sha) => Object.assign(activeHead, { text, ts, sha });
  return { ctx, cm, dv, tag, group, restore, restored, notes, marksLog, gutterLog, scrollLog, posts, workers, headRequests, nav, storage, setHead, filePath,
    historyButton, historyRows, fireKeydown, runTimers, timers };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function persistedState(h, filePath = h.filePath) {
  const raw = h.storage.get("texDiffV1:" + filePath);
  if (!raw) return { interventions: [], legacySnapshots: [], last: null };
  const state = JSON.parse(raw);
  if (!state.texts) return state;
  return {
    interventions: (state.interventions || []).map((it) => ({...it,
      before: state.texts[it.fromHash], after: state.texts[it.toHash]})),
    legacySnapshots: (state.legacySnapshots || []).map((it) => ({...it, text: state.texts[it.hash]})),
    last: state.current ? state.texts[state.current.hash] : state.lastKnown ?? null,
  };
}

const persistedInterventions = (h, filePath) => persistedState(h, filePath).interventions;

function assertPersistedInterventions(name, h, expected, expectedLegacy = []) {
  const payload = persistedState(h);
  const actual = payload.interventions;
  const shapeOk = Array.isArray(actual) && actual.every((it) => it
    && typeof it.before === "string"
    && typeof it.after === "string"
    && INTERVENTION_SOURCES.has(it.source)
    && INTERVENTION_STATUSES.has(it.status));
  const valuesOk = shapeOk && actual.length === expected.length && expected.every((want, i) => {
    const got = actual[i];
    return got.before === want.before && got.after === want.after
      && got.source === want.source && got.status === want.status;
  });
  const legacy = payload && payload.legacySnapshots;
  const legacyOk = Array.isArray(legacy) && legacy.length === expectedLegacy.length
    && expectedLegacy.every((want, i) => legacy[i] && legacy[i].text === want.text
      && legacy[i].ts === want.ts && typeof legacy[i].label === "string");
  contractOk(`${name}: /versions persists {before, after, source, status}`,
    valuesOk && legacyOk, JSON.stringify(payload));
}

async function moduleTests() {
  {
    const baseSha = "a".repeat(40);
    const h = makeModuleHarness({
      headText: "avant agent\n",
      search: `?diff=1&base=${baseSha}`,
    });
    h.cm._v = "après agent\n";
    h.ctx.__tick();
    await sleep(0);
    contractOk("ouverture IDE diff transmet le snapshot exact",
      h.headRequests.some((url) => url.includes(`base=${baseSha}`)), JSON.stringify(h.headRequests));
    contractOk("ouverture IDE diff active la comparaison lecture seule",
      h.dv.isShown() && h.cm._options.readOnly === true,
      JSON.stringify({shown:h.dv.isShown(), options:h.cm._options, notes:h.notes}));
  }

  // B0. Contrat Worker: same-origin, stale ignoré, cache et annulation de vue.
  contractOk("diff worker source incluse", fs.existsSync(path.join(ASSETS, "diff_worker.js")));
  {
    const base = "alpha base\n", first = "alpha premier\n", second = "alpha deuxieme\n";
    const h = makeModuleHarness({headText: base, workerAvailable: true});
    h.cm._v = first; h.dv.push(base, first); h.tag.onclick();
    const worker = h.workers[0];
    const request1 = worker?.posts.at(-1);
    h.cm._v = second; h.dv.push(first, second);
    const worker2 = h.workers.at(-1), request2 = worker2?.posts.at(-1);
    contractOk("nouvelle generation termine physiquement ancien worker",
      worker?.terminated === true && worker2 !== worker && request1?.requestId < request2?.requestId,
      JSON.stringify({workers:h.workers.length, request1, request2}));
    worker2?.respond({requestId: request2?.requestId, parts: [{removed:true,value:base},{added:true,value:second}]});
    await sleep(0);
    const afterLatest = h.notes.at(-1);
    const marksAfterLatest = h.marksLog.length;
    worker?.respond({requestId: request1?.requestId, parts: [{removed:true,value:base},{added:true,value:first}]});
    await sleep(0);
    contractOk("worker resultat stale ignore", h.notes.at(-1) === afterLatest && h.marksLog.length === marksAfterLatest,
      JSON.stringify({notes:h.notes, marks:h.marksLog}));

    h.cm._v = "alpha troisieme\n"; h.dv.push(second, h.cm._v);
    const worker3 = h.workers.filter(item => item.posts.some(post => post.kind !== "gutter")).at(-1);
    contractOk("nouveau calcul efface anciennes marques immediatement",
      h.marksLog.slice(marksAfterLatest).some(mark => mark.type === "clear"), JSON.stringify(h.marksLog));
    worker3.fail(); await sleep(0);
    contractOk("worker error declenche fallback visible",
      h.notes.at(-1) === "diff Worker indisponible — fallback local", JSON.stringify(h.notes.slice(-3)));

    const postCount = worker2.posts.length;
    h.dv.compareExternal(base, "cache-pair");
    const cacheWorker = h.workers.at(-1), cachedRequest = cacheWorker.posts.at(-1);
    if(cacheWorker.posts.length > postCount) cacheWorker.respond({requestId:cachedRequest.requestId,
      parts:[{removed:true,value:base},{added:true,value:second}]});
    await sleep(0);
    h.dv.compareExternal(base, "cache-pair");
    const renderWorkers = h.workers.filter(item => item.posts.some(post => post.kind !== "gutter"));
    contractOk("worker cache paire identique evite recalcul", renderWorkers.length <= 3,
      JSON.stringify(h.workers.map(item => item.posts)));
    h.tag.onclick();
    const beforeCancel = h.marksLog.length;
    const pendingWorker = h.workers.at(-1), pending = pendingWorker.posts.at(-1);
    pendingWorker.respond({requestId:pending.requestId, parts:[{removed:true,value:base},{added:true,value:"stale ferme\n"}]});
    await sleep(0);
    contractOk("worker fermeture annule rendu pending", !h.dv.isShown() && h.marksLog.length === beforeCancel,
      JSON.stringify(h.marksLog));
  }
  {
    const before = "avant\n", after = "après\n";
    const h = makeModuleHarness({headText: before});
    h.cm._v = after;
    h.dv.push(before, after);
    h.tag.onclick();
    h.tag.onclick();
    const restored = h.scrollLog.at(-1);
    contractOk("sortie du diff restaure la ligne logique visible",
      !h.dv.isShown() && restored?.line === 77,
      JSON.stringify({shown:h.dv.isShown(), scroll:h.scrollLog}));
  }
  {
    const base = "ligne ancienne longue\n".repeat(1800);
    const after = "ligne nouvelle longue\n".repeat(1800);
    const h = makeModuleHarness({headText: base, workerAvailable: false});
    h.cm._v = after; h.dv.push(base, after); h.tag.onclick();
    await sleep(20);
    contractOk("fallback >50000 avertit rendu lignes exact",
      h.notes.some((note) => note === "diff détaillé indisponible — affichage par lignes"), JSON.stringify(h.notes.slice(-3)));
  }
  {
    const head="a\nb\nc\n",after="a\nB\nc\n",h=makeModuleHarness({headText:head,workerAvailable:true});
    h.cm._v=after; h.ctx.__tick(); await sleep(0);
    const gutterWorker=h.workers.find(item=>item.posts.some(post=>post.kind==="gutter"));
    const request=gutterWorker?.posts.find(post=>post.kind==="gutter");
    gutterWorker?.respond({requestId:request?.requestId,gutter:{blocks:1,markers:[{line:1,openLine:1,kind:"modified",deleted:false}]}});
    await sleep(0);
    contractOk("gouttiere applique resultat Worker async",request?.before===head&&request?.after===after
      &&h.gutterLog.length===1&&h.gutterLog[0].line===1,JSON.stringify({request,gutter:h.gutterLog}));
  }
  // B1. fusion sémantique : phrase récrite par un agent → peu de stops, offsets sûrs
  {
    const h = makeModuleHarness();
    const before = "By contrast, the no-fire carbon coefficient carries the opposite, physically implausible sign; we do not read this sign contrast as evidence of specificity, and instead argue specificity from the independent May fire/no-fire contrast.\n";
    const after = "By contrast, the no-fire carbon coefficient has the opposite, physically unexpected sign. We do not treat this sign flip as proof that fire itself is responsible; that case is made instead by the independent May fire/no-fire comparison.\n";
    h.cm._v = after;
    h.dv.push(before, after);
    h.tag.onclick();
    const note = h.notes[h.notes.length - 1];
    ok("fusion sémantique ≤ 4 stops", /· [1-4] modifications?/.test(note), note);
    for (const m of h.marksLog)
      if (m.type === "add") ok("offsets add valides", after.slice(m.from, m.to).trim().length > 0);
  }

  // B2. bruit de rewrap (mot descendu ET remonté) → aucun changement
  {
    const h = makeModuleHarness();
    const before = "Because this\nstricter model absorbs real signal, we report the effect in the\ntransition zone here.\n";
    const after = "Because this stricter\nmodel absorbs real signal, we report the effect in the transition\nzone here.\n";
    h.cm._v = after;
    h.dv.push(before, after);
    ok("rewrap-only : aucune version créée", h.notes.length === 0 || !h.notes.some((n) => /comparaison/.test(n)));
    // forcé via une vraie modif + retours déplacés : le bruit reste filtré
    const before2 = before.replace("here", "ICI");
    h.cm._v = after; // after garde "here" → 1 vraie modif + rewrap
    h.dv.push(before2, after);
    h.tag.onclick();
    const note = h.notes[h.notes.length - 1];
    ok("rewrap + 1 modif : 1 seule modification", /· 1 modification /.test(note), note);
  }

  // B3. sauvegarde blancs-seulement : pas de version vide, idx stable
  {
    const h = makeModuleHarness();
    h.cm._v = "aa bb\ncc\n";
    h.dv.push("aa\nbb cc\n", "aa bb\ncc\n");
    h.tag.onclick(); // ne doit PAS s'ouvrir (aucune version)
    ok("version blancs-seulement refusée", !h.notes.some((n) => /comparaison/.test(n)));
  }

  // B4. gouttière : rewrap + 1 mot changé → 1 barre ; rewrap pur → 0
  {
    const head = "Le glacier recule chaque annee sous\nl'effet de la temperature et du feu\nqui depose du carbone sombre sur la\nsurface de la glace en ete.\n";
    const h = makeModuleHarness({ headText: head });
    h.cm._v = "Le glacier recule chaque annee sous l'effet\nde la temperature et du INCENDIE qui depose\ndu carbone sombre sur la surface de la\nglace en ete.\n";
    h.ctx.__tick();
    await sleep(30);
    ok("gouttière raffinée : 1 barre", h.gutterLog.length === 1 && h.gutterLog[0].html.includes("bar m"),
      JSON.stringify(h.gutterLog));
    h.cm._v = "Le glacier recule chaque annee sous l'effet\nde la temperature et du feu qui depose\ndu carbone sombre sur la surface de la\nglace en ete.\n";
    h.gutterLog.length = 0;
    const h2 = makeModuleHarness({ headText: head });
    h2.cm._v = h.cm._v;
    h2.ctx.__tick();
    await sleep(30);
    ok("gouttière rewrap pur : 0 barre", h2.gutterLog.length === 0, JSON.stringify(h2.gutterLog));
  }

  // B5. gouttière : ajout net → vert ; suppression nette → triangle
  {
    const h = makeModuleHarness({ headText: "a\nb\nc\n" });
    h.cm._v = "a\nb\nnouvelle ligne pleine de mots\nc\n";
    h.ctx.__tick();
    await sleep(30);
    ok("ajout net → barre verte", h.gutterLog.length === 1 && h.gutterLog[0].html.includes("bar a"));
    const h2 = makeModuleHarness({ headText: "a\nb pleine de mots\nc\n" });
    h2.cm._v = "a\nc\n";
    h2.ctx.__tick();
    await sleep(30);
    ok("suppression nette → triangle", h2.gutterLog.length === 1 && h2.gutterLog[0].html.includes("dv-del"));
  }

  // B6. persistance durable v2 côté client via ops/révision.
  {
    const h = makeModuleHarness({ headText: "base\n" });
    h.cm._v = "base MODIFIEE\n";
    h.dv.push("base\n", "base MODIFIEE\n");
    await sleep(30);
    const p = h.posts[h.posts.length - 1];
    const stored = persistedState(h);
    ok("persist POST compact ops+revision seulement", p
      && Object.keys(p).sort().join(",") === "expectedRevision,ops,path"
      && p.ops.some((op) => op.type === "append")
      && stored.interventions.length === 1
      && stored.interventions[0].before === "base\n"
      && stored.interventions[0].after === "base MODIFIEE\n"
      && stored.last === "base MODIFIEE\n", JSON.stringify(p));
  }
  {
    const h = makeModuleHarness({ headText: "v base\n", serverItems: [{ b: "ancienne version\n", t: 1 }], serverLast: "v base\n" });
    h.cm._v = "v base\n";
    h.ctx.__tick();
    await sleep(30);
    h.tag.onclick();
    ok("restore serveur : comparaison dispo", h.notes.some((n) => /comparaison/.test(n)), h.notes.join("|"));
  }

  // B7. rattrapage : fichier changé pendant que l'app était fermée → version
  {
    const h = makeModuleHarness({ headText: "t base\n", serverItems: [], serverLast: "t base AVANT fermeture\n" });
    h.cm._v = "t base APRES agent\n";
    h.ctx.__tick();
    await sleep(30);
    ok("rattrapage hors-session", h.notes.some((n) => /app était fermée/.test(n)), h.notes.join("|"));
  }

  // B8. cible par défaut du ± = base (cumulatif), et stable pendant l'affichage
  // (les deux modifs sont éloignées de > 16 car. pour ne pas être fusionnées)
  {
    const base = "mot un pour commencer la phrase et ensuite beaucoup de texte commun avant trois\n";
    const s1 = "mot UN pour commencer la phrase et ensuite beaucoup de texte commun avant trois\n";
    const s2 = "mot UN pour commencer la phrase et ensuite beaucoup de texte commun avant TROIS\n";
    const h = makeModuleHarness({ headText: base });
    h.cm._v = s1;
    h.ctx.__tick();
    await sleep(30);
    h.dv.push(base, s1); // save 1
    h.cm._v = s2;
    h.dv.push(s1, s2);   // save 2
    await sleep(30);
    h.tag.onclick();
    const note = h.notes[h.notes.length - 1];
    ok("± par défaut = base, cumulatif", /HEAD \(abc1234\) · 2 modifications/.test(note), note);
  }

  // B9. contrat du journal explicite : une action reste une intervention, même
  // lorsqu'elle touche plusieurs paragraphes éloignés.
  {
    const base = [
      "Premier paragraphe sur la neige fraiche et la glace claire du bassin alpin.",
      "Cette deuxieme ligne intacte documente les observations du debut de saison.",
      "Une troisieme ligne intacte termine ce premier paragraphe substantiel.",
      "",
      "Deuxieme paragraphe entierement intact entre les zones modifiees.",
      "Il contient plusieurs observations longues qui ne changent pas pendant l'action.",
      "Sa derniere ligne fournit une separation textuelle volontairement importante.",
      "",
      "Troisieme paragraphe sur la temperature moyenne du site de mesure.",
      "Cette ligne centrale reste intacte pour espacer les deux modifications.",
      "Le paragraphe se termine avec une autre phrase scientifique conservee.",
      "",
      "Quatrieme paragraphe intact servant de second grand espace documentaire.",
      "Ses donnees et son interpretation restent strictement identiques.",
      "Une ligne finale intacte precede la derniere zone de changement.",
      "",
      "Cinquieme paragraphe sur l'albedo de surface mesure en fin de saison.",
      "Cette conclusion conserve encore une ligne complete sans modification.",
      "",
    ].join("\n");
    const after = base
      .replace("neige fraiche", "neige soufflee")
      .replace("temperature moyenne", "temperature estivale")
      .replace("albedo de surface", "albedo estival");
    const h = makeModuleHarness({ headText: base });
    h.cm._v = after;
    h.dv.push(base, after, { source: "user-save", status: "applied" });
    await sleep(0);
    assertPersistedInterventions("journal user-save multi-paragraphes", h, [
      { before: base, after, source: "user-save", status: "applied" },
    ]);
    h.tag.onclick();
    const nav = h.nav();
    contractOk("une action multi-paragraphes = tout · 1", nav?.count.textContent === "tout · 1", nav?.count.textContent);
    nav?.prev.onclick();
    contractOk("une action multi-paragraphes = 1 / 1", nav?.count.textContent === "1 / 1", nav?.count.textContent);
  }

  // B10. sources externes explicites : reload appliqué, merge dans un buffer
  // dirty, et conflit conservé sans prétendre que le disque est appliqué.
  {
    const base = "alpha utilisateur\nligne commune longue\nomega agent\n";
    const disk = base.replace("omega agent", "omega agent externe");
    const h = makeModuleHarness({ headText: base });
    h.cm._v = disk;
    h.dv.push(base, disk, { source: "external-reload", status: "applied" });
    await sleep(0);
    assertPersistedInterventions("journal external-reload", h, [
      { before: base, after: disk, source: "external-reload", status: "applied" },
    ]);
  }
  {
    const base = "alpha utilisateur\nligne commune longue\nomega agent\n";
    const mine = base.replace("alpha utilisateur", "alpha local non sauvegarde");
    const disk = base.replace("omega agent", "omega agent externe");
    const merged = mine.replace("omega agent", "omega agent externe");
    const h = makeModuleHarness({ headText: base });
    h.cm._v = merged;
    h.dv.push(base, disk, { source: "external-merge", status: "applied" });
    await sleep(0);
    assertPersistedInterventions("journal external-merge dirty", h, [
      { before: base, after: disk, source: "external-merge", status: "applied" },
    ]);
    h.tag.onclick();
    const nav = h.nav();
    nav?.prev.onclick();
    contractOk("dirty merge : 1/1 montre l'after disque, pas le buffer fusionné",
      nav?.count.textContent === "1 / 1" && h.cm._v === disk,
      JSON.stringify({ count: nav?.count.textContent, buffer: h.cm._v }));
    h.tag.onclick();
    contractOk("dirty merge : quitter 1/1 restaure le buffer fusionné", h.cm._v === merged, h.cm._v);
  }
  {
    const base = "meme ligne avant\ncontexte commun\n";
    const mine = "ma version locale\ncontexte commun\n";
    const disk = "version externe concurrente\ncontexte commun\n";
    const h = makeModuleHarness({ headText: base });
    h.cm._v = mine;
    h.dv.push(base, disk, { source: "external-conflict", status: "pending-conflict" });
    await sleep(0);
    assertPersistedInterventions("journal external-conflict pending", h, [
      { before: base, after: disk, source: "external-conflict", status: "pending-conflict" },
    ]);
    h.tag.onclick();
    const nav = h.nav();
    nav?.prev.onclick();
    contractOk("pending conflict : 1/1 montre l'after externe sans l'appliquer au présent",
      nav?.count.textContent === "1 / 1" && h.cm._v === disk,
      JSON.stringify({ count: nav?.count.textContent, buffer: h.cm._v }));
    h.tag.onclick();
    contractOk("pending conflict : quitter 1/1 restaure le buffer local", h.cm._v === mine, h.cm._v);
  }

  // B11. deux actions opposées restent deux interventions, même si le diff
  // cumulatif contre la base est nul.
  {
    const base = "Texte de base qui doit revenir exactement.\n";
    const edited = "Texte temporairement modifie avant annulation.\n";
    const h = makeModuleHarness({ headText: base });
    h.cm._v = edited;
    h.dv.push(base, edited, { source: "user-save", status: "applied" });
    h.cm._v = base;
    h.dv.push(edited, base, { source: "user-save", status: "applied" });
    await sleep(0);
    assertPersistedInterventions("edit puis undo-to-base", h, [
      { before: base, after: edited, source: "user-save", status: "applied" },
      { before: edited, after: base, source: "user-save", status: "applied" },
    ]);
    h.tag.onclick();
    const nav = h.nav();
    const note = h.notes[h.notes.length - 1] || "";
    contractOk("undo-to-base : N=2", nav?.count.textContent === "tout · 2", nav?.count.textContent);
    contractOk("undo-to-base : tout a zéro changement net", /aucun changement de texte/.test(note), note);
  }

  // B11b. `restore` appartient au contrat du journal explicite.
  {
    const before = "texte courant avant restauration directe\n";
    const after = "texte cible restaure depuis un historique\n";
    const h = makeModuleHarness({ headText: before });
    h.cm._v = after;
    h.dv.push(before, after, { source: "restore", status: "applied" });
    await sleep(0);
    assertPersistedInterventions("journal restore direct sans flux UI", h, [
      { before, after, source: "restore", status: "applied" },
    ]);
  }

  // B12. classification des blancs dépendante du langage. Une frontière de
  // paragraphe LaTeX, l'indentation Python et le contenu verbatim sont sémantiques.
  // Seul le rewrap visuel d'un paragraphe de prose reste ignorable.
  {
    const before = "\\section{A}\nPremier paragraphe.\nSecond paragraphe.\n";
    const after = "\\section{A}\nPremier paragraphe.\n\nSecond paragraphe.\n";
    const h = makeModuleHarness({ filePath: "/x/blank.tex", headText: before });
    h.cm._v = after;
    h.dv.push(before, after, { source: "user-save", status: "applied" });
    await sleep(0);
    assertPersistedInterventions("ligne vide LaTeX significative", h, [
      { before, after, source: "user-save", status: "applied" },
    ]);
  }
  {
    const before = "if ready:\n    run_model()\n";
    const after = "if ready:\n  run_model()\n";
    const h = makeModuleHarness({ filePath: "/x/model.py", headText: before });
    h.cm._v = after;
    h.dv.push(before, after, { source: "user-save", status: "applied" });
    await sleep(0);
    assertPersistedInterventions("indentation Python significative", h, [
      { before, after, source: "user-save", status: "applied" },
    ]);
  }
  {
    const before = "\\begin{verbatim}\na b\n\\end{verbatim}\n";
    const after = "\\begin{verbatim}\na  b\n\\end{verbatim}\n";
    const h = makeModuleHarness({ filePath: "/x/verbatim.tex", headText: before });
    h.cm._v = after;
    h.dv.push(before, after, { source: "user-save", status: "applied" });
    await sleep(0);
    assertPersistedInterventions("blanc LaTeX verbatim significatif", h, [
      { before, after, source: "user-save", status: "applied" },
    ]);
  }
  {
    const before = "Ce paragraphe de prose est seulement\nreplie visuellement sur deux lignes.\n";
    const after = "Ce paragraphe de prose est\nseulement replie visuellement sur deux lignes.\n";
    const h = makeModuleHarness({ filePath: "/x/rewrap.tex", headText: before });
    h.cm._v = after;
    h.dv.push(before, after, { source: "user-save", status: "applied" });
    h.tag.onclick();
    contractOk("rewrap visuel de prose : aucune intervention, chrome stable",
      h.nav()?.count.textContent === "tout · 0" && h.posts.length === 0, JSON.stringify(h.posts));
  }
  {
    const latex = makeModuleHarness({ filePath: "/x/equivalence.tex" });
    const blankBefore = "Premier paragraphe.\nSecond paragraphe.\n";
    const blankAfter = "Premier paragraphe.\n\nSecond paragraphe.\n";
    contractOk("API equivalence : ligne vide LaTeX reste dirty",
      typeof latex.dv.isEquivalent === "function" && !latex.dv.isEquivalent(blankBefore, blankAfter));
    contractOk("API equivalence : rewrap prose LaTeX peut rester clean",
      typeof latex.dv.isEquivalent === "function"
        && latex.dv.isEquivalent("Une phrase longue repliee\nsur deux lignes.\n", "Une phrase longue\nrepliee sur deux lignes.\n"));
    const python = makeModuleHarness({ filePath: "/x/equivalence.py" });
    contractOk("API equivalence : indentation Python reste dirty",
      typeof python.dv.isEquivalent === "function"
        && !python.dv.isEquivalent("if ready:\n    run()\n", "if ready:\n  run()\n"));
  }

  // B13. migration v1 : `last` est le dernier buffer réel de l'ancien format,
  // donc il complète la dernière paire. Sans `last`, le snapshot reste orphelin.
  {
    const before = "snapshot v1 avec successeur last\n";
    const current = "texte courant connu du serveur\n";
    const edited = "texte courant puis vraie sauvegarde\n";
    const h = makeModuleHarness({
      headText: current,
      serverState: { ok: true, v: 1, items: [{ b: before, t: 42 }], last: current },
    });
    h.cm._v = current;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    contractOk("snapshot v1 suivi par last : N=1", h.nav()?.count.textContent === "tout · 1", h.nav()?.count.textContent);
    if (h.dv.isShown()) h.tag.onclick();
    h.cm._v = edited;
    h.dv.push(current, edited, { source: "user-save", status: "applied" });
    await sleep(0);
    assertPersistedInterventions("migration snapshot v1 legacy", h, [
      { before, after: current, source: "legacy", status: "applied" },
      { before: current, after: edited, source: "user-save", status: "applied" },
    ]);
  }
  {
    const orphan = "snapshot v1 reellement orphelin\n";
    const current = "buffer courant sans lien invente\n";
    const edited = "buffer courant sauvegarde ensuite\n";
    const h = makeModuleHarness({
      headText: current,
      serverState: {ok: true, v: 1, items: [{b: orphan, t: 42}], last: null},
    });
    h.cm._v = current;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    const count = h.nav()?.count.textContent;
    if(h.dv.isShown()) h.tag.onclick();
    h.cm._v = edited;
    h.dv.push(current, edited, {source: "user-save", status: "applied"});
    assertPersistedInterventions("migration snapshot v1 orphelin sans last", h, [
      {before: current, after: edited, source: "user-save", status: "applied"},
    ], [{text: orphan, ts: 42}]);
    contractOk("snapshot v1 sans last : N=0 avant push", count === "tout · 0", count);
  }

  // B14. Compatibilité migration : une réponse v1 vide ne doit pas masquer le
  // journal v2 plus riche du localStorage.
  {
    const base = "base locale v2\n";
    const current = "etat restaure depuis local v2\n";
    const next = "nouvelle sauvegarde apres reload\n";
    const old = { id: "local-1", before: base, after: current, ts: 50,
      source: "user-save", status: "applied" };
    const h = makeModuleHarness({
      headText: base,
      serverState: { ok: true, v: 1, items: [], last: current },
      localState: { v: 2, interventions: [old], legacySnapshots: [], last: current },
    });
    h.cm._v = current;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    const reloaded = h.nav()?.count.textContent === "tout · 1";
    if(h.dv.isShown()) h.tag.onclick();
    h.cm._v = next;
    h.dv.push(current, next, {source: "user-save", status: "applied"});
    const saved = persistedInterventions(h);
    contractOk("reload v2 local survit a une reponse serveur v1 vide",
      reloaded && saved.length === 2 && saved[0].id === "local-1"
        && saved[1].before === current && saved[1].after === next,
      JSON.stringify({count: h.nav()?.count.textContent, saved}));
  }
  {
    const base = "base locale v1 fallback\n";
    const current = "after locale v1 fallback\n";
    const h = makeModuleHarness({
      headText: base,
      serverState: {ok: true, v: 1, items: [], last: null},
      localState: {v: 1, items: [{b: base, t: 10}, {b: current, t: 20}], last: current},
    });
    h.cm._v = current;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    contractOk("fallback local v1 survit a une reponse serveur v1 vide",
      h.nav()?.count.textContent === "tout · 1", h.nav()?.count.textContent);
  }
  {
    const pre = "etat prehistorique\n", base = "base partagee\n", a = "etat a\n", b = "etat b\n";
    const current = "etat local le plus recent\n", next = "etat runtime suivant\n";
    const shared = {id: "shared-20", before: a, after: b, ts: 20, source: "user-save", status: "applied"};
    const h = makeModuleHarness({
      headText: pre,
      localState: {v: 2, interventions: [
        {id: "local-10", before: base, after: a, ts: 10, source: "user-save", status: "applied"},
        shared,
        {id: "local-30", before: b, after: current, ts: 30, source: "user-save", status: "applied"},
      ], legacySnapshots: [], last: current},
      serverState: {ok: true, v: 2, interventions: [
        {id: "server-5", before: pre, after: base, ts: 5, source: "legacy", status: "applied"},
        {...shared},
      ], legacySnapshots: [], last: b},
    });
    h.cm._v = current;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    const count = h.nav()?.count.textContent;
    if(h.dv.isShown()) h.tag.onclick();
    h.cm._v = next;
    h.dv.push(current, next, {source: "user-save", status: "applied"});
    const saved = persistedInterventions(h);
    contractOk("reconciliation v2 garde local plus recent et ordre chronologique",
      count === "tout · 4" && saved.length === 5
        && saved.slice(0, 4).map((it) => it.id).join(",") === "server-5,local-10,shared-20,local-30"
        && saved.filter((it) => it.id === "shared-20").length === 1,
      JSON.stringify({count, ids: saved.map((it) => it.id), saved}));
  }
  {
    const base = "base autorite serveur\n", local = "etat local ancien\n";
    const server = "etat serveur reellement recent\n", next = "etat apres reconciliation serveur\n";
    const shared = {id: "shared-10", before: base, after: local, ts: 10, source: "user-save", status: "applied"};
    const h = makeModuleHarness({
      headText: base,
      localState: {v: 2, interventions: [shared], legacySnapshots: [], last: local},
      serverState: {ok: true, v: 2, interventions: [shared,
        {id: "server-20", before: local, after: server, ts: 20, source: "external-reload", status: "applied"},
      ], legacySnapshots: [], last: server},
    });
    h.cm._v = server;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    const count = h.nav()?.count.textContent;
    if(h.dv.isShown()) h.tag.onclick();
    h.cm._v = next;
    h.dv.push(server, next, {source: "user-save", status: "applied"});
    const saved = persistedInterventions(h);
    contractOk("reconciliation v2 accepte serveur vraiment plus recent",
      count === "tout · 2" && saved.slice(0, 2).map((it) => it.id).join(",") === "shared-10,server-20",
      JSON.stringify({count, ids: saved.map((it) => it.id)}));
  }
  {
    const base = "base egalite autorite\n", sharedAfter = "etat partage\n";
    const local = "last local a egalite\n", server = "last serveur a egalite\n";
    const next = "etat suivant egalite\n";
    const shared = {id: "eq-shared", before: base, after: sharedAfter, ts: 10, source: "user-save", status: "applied"};
    const h = makeModuleHarness({
      headText: base,
      localState: {v: 2, interventions: [shared,
        {id: "eq-local", before: sharedAfter, after: local, ts: 20, source: "user-save", status: "applied"},
      ], legacySnapshots: [], last: local},
      serverState: {ok: true, v: 2, interventions: [shared,
        {id: "eq-server", before: sharedAfter, after: server, ts: 20, source: "external-reload", status: "applied"},
      ], legacySnapshots: [], last: server},
    });
    h.cm._v = local;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    const count = h.nav()?.count.textContent;
    if(h.dv.isShown()) h.tag.onclick();
    h.cm._v = next;
    h.dv.push(local, next, {source: "user-save", status: "applied"});
    const saved = persistedInterventions(h);
    contractOk("reconciliation v2 egalite donne autorite au local",
      count === "tout · 3" && saved.slice(0, 3).map((it) => it.id).join(",") === "eq-shared,eq-local,eq-server",
      JSON.stringify({count, ids: saved.map((it) => it.id)}));
  }
  {
    const base = "base timestamp inconnu\n", local = "last local timestamp inconnu\n";
    const server = "last serveur date mais incertain\n", next = "etat suivant inconnu\n";
    const h = makeModuleHarness({
      headText: base,
      localState: {v: 2, interventions: [
        {id: "null-local", before: base, after: local, ts: null, source: "legacy", status: "applied"},
      ], legacySnapshots: [], last: local},
      serverState: {ok: true, v: 2, interventions: [
        {id: "dated-server", before: base, after: server, ts: 20, source: "external-reload", status: "applied"},
      ], legacySnapshots: [], last: server},
    });
    h.cm._v = local;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    const count = h.nav()?.count.textContent;
    if(h.dv.isShown()) h.tag.onclick();
    h.cm._v = next;
    h.dv.push(local, next, {source: "user-save", status: "applied"});
    const saved = persistedInterventions(h);
    contractOk("reconciliation v2 timestamp absent reste conservative",
      count === "tout · 2" && saved.slice(0, 2).map((it) => it.id).join(",") === "null-local,dated-server",
      JSON.stringify({count, ids: saved.map((it) => it.id)}));
  }

  // B15. Un conflit pending journalise l'after externe, mais `last` reste le
  // vrai buffer local qui n'a pas reçu cet after.
  {
    const base = "base avant conflit\n";
    const mine = "buffer local non applique\n";
    const disk = "after externe pending\n";
    const h = makeModuleHarness({headText: base});
    h.cm._v = mine;
    h.dv.push(base, disk, {source: "external-conflict", status: "pending-conflict"});
    const payload = persistedState(h);
    contractOk("pending conflict persiste le vrai buffer dans last",
      payload?.last === mine && payload?.interventions?.[0]?.after === disk,
      JSON.stringify(payload));
    h.tag.onclick();
    h.nav()?.prev.onclick();
    const timelineTitle = h.nav()?.count.title || "";
    const hist = h.historyButton();
    if(hist) await hist.onclick();
    if(hist && !h.historyRows().length) await hist.onclick();
    const historyMessage = h.historyRows()[0]?.querySelector(".msg")?.textContent || "";
    contractOk("pending conflict affiche source et statut non applique dans timeline et historique",
      /external-conflict/.test(timelineTitle) && /non appliqu/.test(timelineTitle)
        && /external-conflict/.test(historyMessage) && /non appliqu/.test(historyMessage),
      JSON.stringify({timelineTitle, historyMessage}));
  }

  // B16. Si un push arrive pendant le GET initial, sa génération gagne : la
  // réponse stale ne peut ni doubler l'action ni inverser le journal.
  {
    let resolveVersions;
    const versionsPromise = new Promise((resolve) => { resolveVersions = resolve; });
    const base = "base course get\n";
    const edited = "edition runtime pendant get\n";
    const final = "edition suivante ordonnee\n";
    const h = makeModuleHarness({headText: base, versionsPromise});
    h.cm._v = base;
    h.ctx.__tick();
    h.cm._v = edited;
    h.dv.push(base, edited, {source: "user-save", status: "applied"});
    resolveVersions({ok: true, v: 2, interventions: [
      {id: "stale-duplicate", before: base, after: edited, ts: 1, source: "user-save", status: "applied"},
    ], legacySnapshots: [], last: edited});
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    const count = h.nav()?.count.textContent;
    if(h.dv.isShown()) h.tag.onclick();
    h.cm._v = final;
    h.dv.push(edited, final, {source: "user-save", status: "applied"});
    const saved = persistedInterventions(h);
    contractOk("push pendant GET ignore la reponse stale sans doublon ni inversion",
      count === "tout · 1" && saved.length === 2
        && saved[0].before === base && saved[0].after === edited
        && saved[1].before === edited && saved[1].after === final,
      JSON.stringify({count, saved}));
  }

  // B17. 409 : fusion append-only par id puis un seul retry avec la révision
  // serveur. Les pending locaux restent présents dans le second POST.
  {
    const base = "base concurrence\n", remote = "etat page distante\n", local = "etat page locale\n";
    const remoteEntry = {id: "remote-1", before: base, after: remote, ts: 10,
      source: "external-reload", status: "applied"};
    const state = durableState("/x/m.tex", 1, base, [remoteEntry], remote);
    const h = makeModuleHarness({headText: base, postResponses: [
      {status: 409, body: {ok: false, error: "revision-conflict", revision: 1, state}},
      {status: 200, body: {ok: true, revision: 2}},
    ]});
    h.cm._v = local;
    h.dv.push(base, local, {source: "user-save", status: "applied"});
    await sleep(0); await sleep(0); await sleep(0);
    const retry = h.posts[1];
    contractOk("409 retry unique utilise revision serveur et garde pending local",
      h.posts.length === 2 && retry?.expectedRevision === 1
        && persistedInterventions(h).some((it) => it.id === "remote-1")
        && persistedInterventions(h).some((it) => it.before === base && it.after === local),
      JSON.stringify(h.posts));
  }
  {
    const base = "base id conflict\n", local = "local divergent\n", remote = "remote divergent\n";
    const state = durableState("/x/m.tex", 1, base, [{id: "same-id", before: base, after: remote,
      ts: 10, source: "user-save", status: "applied"}], remote);
    const h = makeModuleHarness({headText: base, postResponses: [
      {status: 409, body: {ok: false, error: "revision-conflict", revision: 1, state}},
    ]});
    h.cm._v = local;
    h.dv.push(base, local, {source: "user-save", status: "applied"});
    // Remplacer l'id généré par l'id distant dans le payload conflictuel simule
    // deux contenus sous le même id (la fusion doit STOP, pas choisir).
    state.interventions[0].id = h.posts[0]?.ops?.find((op) => op.type === "append")?.intervention?.id || "same-id";
    await sleep(0); await sleep(0);
    contractOk("409 même id contenu divergent STOP visible sans retry",
      h.posts.length === 1 && h.notes.some((note) => /persistance du diff arrêtée/.test(note)),
      JSON.stringify({posts: h.posts, notes: h.notes}));
  }
  {
    const base = "base locale A\n", otherBase = "base distante B\n", local = "edition locale\n";
    const state = durableState("/x/m.tex", 1, otherBase, [], otherBase);
    const h = makeModuleHarness({headText: base, postResponses: [
      {status: 409, body: {ok: false, error: "revision-conflict", revision: 1, state}},
    ]});
    h.cm._v = local;
    h.dv.push(base, local, {source: "user-save", status: "applied"});
    await sleep(0); await sleep(0);
    contractOk("409 base divergente STOP visible sans retry",
      h.posts.length === 1 && h.notes.some((note) => /conflit de base/.test(note)),
      JSON.stringify({posts: h.posts, notes: h.notes}));
  }
  {
    const base = "base reload conflict\n", local = "contenu local\n", remote = "contenu remote\n";
    const common = {id: "reload-same-id", before: base, ts: 10, source: "user-save", status: "applied"};
    const h = makeModuleHarness({headText: base,
      localState: {v: 2, interventions: [{...common, after: local}], legacySnapshots: [], last: local},
      serverState: {ok: true, v: 2, interventions: [{...common, after: remote}], legacySnapshots: [], last: remote},
    });
    h.cm._v = local; h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    contractOk("reload même id contenu divergent STOP visible",
      h.notes.some((note) => /identifiant d'intervention divergent/.test(note)), JSON.stringify(h.notes));
  }
  {
    const localBase = "base locale reload\n", serverBase = "base serveur reload\n";
    const local = durableState("/x/m.tex", 0, localBase, [], localBase);
    const remote = {ok: true, ...durableState("/x/m.tex", 1, serverBase, [], serverBase)};
    const h = makeModuleHarness({headText: null, localState: local, serverState: remote});
    h.cm._v = localBase; h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    contractOk("reload bases divergentes STOP visible",
      h.notes.some((note) => /conflit de base/.test(note)), JSON.stringify(h.notes));
  }
  {
    const base = "base pending restart\n", current = "intervention locale non acquittee\n";
    const localEntry = {id: "local-pending-restart", before: base, after: current, ts: 10,
      source: "user-save", status: "applied"};
    const localState = durableState("/x/m.tex", 0, base, [localEntry], current);
    const serverState = {ok: true, ...durableState("/x/m.tex", 0, base, [], current)};
    const h = makeModuleHarness({headText: base, localState, serverState});
    h.cm._v = current; h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    const appends = h.posts.flatMap((post) => post.ops || []).filter((op) => op.type === "append");
    contractOk("restart programme flush des ids locaux non acquittes",
      appends.length === 1 && appends[0].intervention.id === "local-pending-restart",
      JSON.stringify(h.posts));
  }
  {
    const base = "base quarante-cinq\n";
    const states = [base];
    const entries = [];
    for(let i = 1; i <= 45; i += 1){
      states.push(`etat exact ${i} sur quarante-cinq\n`);
      entries.push({id: `nav-${String(i).padStart(2, "0")}`, before: states[i - 1], after: states[i],
        ts: i, source: "user-save", status: i === 20 ? "pending-conflict" : "applied"});
    }
    const localState = durableState("/x/m.tex", 3, base, entries, states[45]);
    const h = makeModuleHarness({headText: null, localState,
      serverState: {ok: true, v: 1, items: [], last: states[45]}});
    h.cm._v = states[45]; h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick(); const nav = h.nav();
    const allOk = nav?.count.textContent === "tout · 45";
    nav?.prev.onclick();
    const lastOk = nav?.count.textContent === "45 / 45" && h.cm._v === states[45];
    for(let i = 0; i < 25; i++) nav?.prev.onclick();
    const middleOk = nav?.count.textContent === "20 / 45" && h.cm._v === states[20]
      && /pending-conflict/.test(nav?.count.title || "");
    for(let i = 0; i < 19; i++) nav?.prev.onclick();
    contractOk("45 interventions reload garde N navigation exacte et status",
      allOk && lastOk && middleOk && nav?.count.textContent === "1 / 45" && h.cm._v === states[1],
      JSON.stringify({count: nav?.count.textContent, buffer: h.cm._v, title: nav?.count.title}));
  }

  // B17. L'absence de timestamp v1 reste `null`, donc non filtrable par la
  // date Git. Zéro inventerait un passé fictif et ferait disparaître la paire.
  {
    const base = "base legacy sans timestamp\n";
    const after = "after legacy valide\n";
    const final = "nouvelle action apres legacy\n";
    const h = makeModuleHarness({
      headText: base,
      headTs: Math.floor(Date.now() / 1000) - 60,
      serverState: {ok: true, v: 1, items: [{b: base}, {b: after}], last: after},
    });
    h.cm._v = after;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    const count = h.nav()?.count.textContent;
    if(h.dv.isShown()) h.tag.onclick();
    h.cm._v = final;
    h.dv.push(after, final, {source: "user-save", status: "applied"});
    const saved = persistedInterventions(h);
    contractOk("migration v1 sans timestamp reste visible sous base Git",
      count === "tout · 1" && saved[0]?.source === "legacy" && saved[0]?.ts === null,
      JSON.stringify({count, saved}));
  }

  // B18. En LaTeX, commandes et frontières structurelles restent exactes;
  // seul l'artefact d'un unique retour terminal peut être ignoré.
  {
    const before = "\\item A\n\\item B\n";
    const after = "\\item A \\item B\n";
    const h = makeModuleHarness({filePath: "/x/list.tex", headText: before});
    h.cm._v = after;
    h.dv.push(before, after, {source: "user-save", status: "applied"});
    contractOk("frontiere de lignes entre commandes LaTeX significative",
      persistedInterventions(h).length === 1,
      JSON.stringify(h.posts));
  }
  {
    const before = "Paragraphe terminal.\n";
    const after = "Paragraphe terminal.\n\n";
    const h = makeModuleHarness({filePath: "/x/trailing.tex", headText: before});
    h.cm._v = after;
    h.dv.push(before, after, {source: "user-save", status: "applied"});
    contractOk("ligne blanche terminale LaTeX significative",
      persistedInterventions(h).length === 1,
      JSON.stringify(h.posts));
  }
  {
    const h = makeModuleHarness({filePath: "/x/final-newline.tex", headText: "Texte sans retour"});
    h.cm._v = "Texte sans retour\n";
    h.dv.push("Texte sans retour", "Texte sans retour\n", {source: "user-save", status: "applied"});
    contractOk("artefact du retour terminal unique reste ignorable", h.posts.length === 0, JSON.stringify(h.posts));
  }

  // B19. La base suit le dépôt. `gitBase` saute les commits « auto: » : un
  // nouveau sha SIGNIFIE un vrai commit — ce qui vient d'y entrer quitte le
  // cumul « tout » et le ruban. L'ancre du journal PERSISTÉ, elle, ne bouge
  // jamais : la déplacer ferait diverger `serverBaseHash` (« conflit de base »).
  {
    const now = Math.floor(Date.now() / 1000);
    const base = "alpha original avec beaucoup de contexte stable entre les zones\nomega original fin\n";
    const s1 = base.replace("alpha original", "alpha premiere edition");
    const s2 = s1.replace("omega original", "omega seconde edition");
    const s3 = s2.replace("contexte stable", "contexte retouche");
    const h = makeModuleHarness({
      headText: base, headTs: now - 600,
      serverState: {ok: true, v: 2, interventions: [
        {id: "b19-1", before: base, after: s1, ts: (now - 500) * 1000, source: "user-save", status: "applied"},
        {id: "b19-2", before: s1, after: s2, ts: (now - 400) * 1000, source: "user-save", status: "applied"},
      ], legacySnapshots: [], last: s2},
    });
    h.cm._v = s2;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    const before = h.nav()?.count.textContent;
    const anchorBefore = JSON.parse(h.storage.get("texDiffV1:" + h.filePath)).base.hash;
    // commit significatif de s2 (le jalon du bouton commit), puis une sauvegarde
    h.setHead(s2, now - 100, "c0ffee1");
    h.cm._v = s3;
    h.dv.push(s2, s3, {source: "user-save", status: "applied"});
    await sleep(0); await sleep(0);
    const after = h.nav()?.count.textContent;
    const anchorAfter = JSON.parse(h.storage.get("texDiffV1:" + h.filePath)).base.hash;
    const saved = persistedInterventions(h);
    contractOk("base git avancee purge le cumul des interventions committees",
      before === "tout · 2" && after === "tout · 1"
        && anchorBefore === anchorAfter && saved.length === 3,
      JSON.stringify({before, after, anchor: anchorBefore === anchorAfter, saved: saved.length,
        note: h.notes[h.notes.length - 1]}));
  }
  // B19b. Sans nouveau commit (même sha), un simple rafraîchissement du texte
  // HEAD ne déplace RIEN : la base d'une session ne bouge que sur un commit.
  {
    const now = Math.floor(Date.now() / 1000);
    const base = "alpha original avec beaucoup de contexte stable entre les zones\nomega original fin\n";
    const s1 = base.replace("alpha original", "alpha premiere edition");
    const s2 = s1.replace("omega original", "omega seconde edition");
    const h = makeModuleHarness({headText: base, headTs: now - 60});
    h.cm._v = base;
    h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.cm._v = s1;
    h.dv.push(base, s1, {source: "user-save", status: "applied"});
    h.setHead(s1, now + 60); // même sha : aucun commit n'a eu lieu
    h.cm._v = s2;
    h.dv.push(s1, s2, {source: "user-save", status: "applied"});
    await sleep(0); await sleep(0);
    h.tag.onclick();
    const count = h.nav()?.count.textContent;
    const note = h.notes[h.notes.length - 1] || "";
    contractOk("base Git immuable sans nouveau commit",
      count === "tout · 2" && /· 2 modifications /.test(note),
      JSON.stringify({count, note}));
  }
}

// --------------------------------------- C. contrats des surfaces TypeScript
function extract(src, startRe, endMarker, what) {
  const m = src.match(startRe);
  if (!m) throw new Error(`extraction impossible (${what}) — le test doit être mis à jour`);
  const start = m.index;
  const end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error(`fin d'extraction introuvable (${what})`);
  return src.slice(start, end + endMarker.length);
}

function sourceBlock(src, startMarker, endMarker, what) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`début de bloc introuvable (${what})`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`fin de bloc introuvable (${what})`);
  return src.slice(start, end);
}

function reEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function callCarriesMeta(block, callee, before, after, source, status) {
  const calls = [...block.matchAll(new RegExp(
    `${reEscape(callee)}\\s*\\(\\s*${reEscape(before)}\\s*,\\s*${reEscape(after)}\\s*,\\s*(\\{[^{}]*\\})\\s*\\)`,
    "g",
  ))];
  return calls.some((call) => new RegExp(`\\bsource\\s*:\\s*["']${reEscape(source)}["']`).test(call[1])
    && new RegExp(`\\bstatus\\s*:\\s*["']${reEscape(status)}["']`).test(call[1]));
}

function editorCallSiteTests() {
  const specs = [
    {
      name: "latex_studio",
      src: fs.readFileSync(path.join(GALLERY, "src", "studio", "surfaces", "latex.ts"), "utf8"),
      callee: "diff.push",
      start: "const ensureSession =",
      end: "const initializeEditor =",
    },
    {
      name: "code_editor",
      src: fs.readFileSync(path.join(GALLERY, "src", "studio", "surfaces", "code.ts"), "utf8"),
      callee: "diff.push",
      start: "const ensureSession =",
      end: "const initializeEditor =",
    },
  ];

  for (const spec of specs) {
    const session = sourceBlock(spec.src, spec.start, spec.end, `${spec.name} document session`);
    contractOk(`${spec.name} call site user-save/applied`,
      callCarriesMeta(session, spec.callee, "event.previousText", "event.snapshot.text", "user-save", "applied"));
    contractOk(`${spec.name} call site external-reload/applied`,
      callCarriesMeta(session, spec.callee, "event.previousText", "event.snapshot.text", "external-reload", "applied"));
    contractOk(`${spec.name} politique de rechargement explicite sans fusion`,
      (spec.name === "latex_studio" ? /externalReload:\s*["']when-clean["']/.test(session) : /externalReload:\s*["']always["']/.test(session))
      && /conflictPolicy:\s*["']reload["']/.test(session)
      && !/Diff\.applyPatch|conflictGuard/.test(session));
  }
  contractOk("latex_studio composes the shared typed diff controller",
    /diff\s*=\s*createStudioDiffController\s*\(/.test(specs[0].src));
}

function commitComposerContractTests() {
  // Le parseur/compositeur du message de commit IA vit côté serveur Rust
  // (git.rs : parse_editor_commit_message, editor_commit_message_prompts) et
  // y est testé (editor_commit_*). Ici : seulement le contrat de l'UI.
  const src = fs.readFileSync(path.join(ASSETS, "diff_versions.js"), "utf8");
  const block = sourceBlock(src, "// ---- commit rapide du fichier courant", "function updateCommitBtn", "commit UI");
  contractOk("commit UI utilise les classes Atelier", /id\s*=\s*["']dvCommitPop["']/.test(block)
    && /dvCommitBtn dvCommitAi/.test(block) && /dvCommitBtn dvCommitDo/.test(block));
  contractOk("commit UI sans ancienne palette bleue inline", !/background:rgba\(24,27,34/.test(block)
    && !/border:1px solid #3a4150/.test(block));
  contractOk("commit UI génération explicite sans message auto", !/const auto\s*=/.test(block)
    && /Génération…/.test(block));
  contractOk("commit UI réserve la largeur de génération sans déborder",
    /\.dvCommitFoot\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/.test(src)
    && /\.dvCommitHint\{min-width:0;overflow:hidden;text-overflow:ellipsis/.test(src)
    && /\.dvCommitAi\{min-width:108px/.test(src));

  const latex = fs.readFileSync(path.join(ASSETS, "latex_studio.html"), "utf8");
  const latexCss = fs.readFileSync(path.join(ASSETS, "latex_studio.css"), "utf8");
  const latexAnnotations = fs.readFileSync(path.join(GALLERY, "src", "studio", "features", "latex", "annotations.ts"), "utf8");
  const latexReading = fs.readFileSync(path.join(GALLERY, "src", "studio", "features", "latex", "reading.ts"), "utf8");
  const latexStatus = fs.readFileSync(path.join(GALLERY, "src", "studio", "features", "latex", "status_bar.ts"), "utf8");
  const diffController = fs.readFileSync(path.join(GALLERY, "src", "studio", "core", "diff_controller.ts"), "utf8");
  contractOk("commentaire LaTeX utilise une largeur extérieure responsive",
    /\.atelier-note\{[^}]*box-sizing:border-box;[^}]*max-width:calc\(100vw - 16px\)/s.test(fs.readFileSync(path.join(ASSETS,"annotation_ui.css"),"utf8")));
  contractOk("commentaire LaTeX se place avec sa largeur réelle",
    /const width = options\.popover\.getBoundingClientRect\(\)\.width;/.test(latexAnnotations)
    && /win\.innerWidth - width - margin/.test(latexAnnotations)
    && !/innerWidth - 310/.test(latexAnnotations));
  contractOk("barre LaTeX retire complètement le mode Visuel",
    !/texvisual\.min\.js|id=["']visBtn["']|texVisMode|#texvis|classList\.contains\(["']visual["']/.test(latex + latexCss));
  contractOk("barre LaTeX conserve seulement Édition et Split dans le segment",
    /segment\.appendChild\(editButton\);\s*segment\.appendChild\(options\.splitButton\)/.test(latexReading)
    && !/appendChild\(visBtn\)/.test(latexReading));
  contractOk("barre LaTeX garde Rewrap visible en espace serré",
    /id=["']rewrapAllBtn["']/.test(latex)
    && !/tight2[^\n{]*#outlineBtn[^\n{]*#rewrapAllBtn/.test(latex));
  contractOk("barre LaTeX déplace Plan et Recherche dans Plus",
    /data-act=["']outline["']/.test(latex) && /data-act=["']find["']/.test(latex)
    && /action === ["']outline["']/.test(latexStatus) && /action === ["']find["']/.test(latexStatus));
  contractOk("état non sauvegardé reste près des modes sans déplacer la barre",
    /id=["']documentModes["'][^>]*>\s*<span id=["']ddot["']/.test(latex)
    && /#ddot\{position:absolute;display:none;[^}]*width:5px;height:5px;/s.test(latexCss)
    && /#documentModes\{position:relative\}/.test(latexCss)
    && /#documentModes #ddot\{[^}]*background:var\(--accent\)/.test(latexCss));
  // Bouton Compiler de l'onglet PDF (2026-08-24) : l'agent édite le .tex, le
  // PDF se recharge tout seul (veille mtime) — mais quand l'agent n'a pas
  // recompilé, il faut pouvoir le faire d'un clic depuis le PDF lui-même.
  const pdfViewer = fs.readFileSync(path.join(ASSETS, "pdf_viewer.html"), "utf8");
  contractOk("onglet PDF porte un bouton Compiler branché sur /compile",
    /id=["']compileBtn["']/.test(pdfViewer)
    && /fetch\(["']\/compile["'], *\{ *method: *["']POST["']/.test(pdfViewer)
    && /body: *JSON\.stringify\(\{path: *texPath\}\)/.test(pdfViewer));
  contractOk("bouton Compiler apparaît avec une valeur de display explicite",
    /compileBtn\.style\.display = ["']inline-flex["']/.test(pdfViewer));
  // Ouvert depuis la GALERIE, l'URL n'a pas de ?tex= (seul « PDF ↗ » du studio
  // en pose un) : c'est pourtant le chemin principal de Thierry. Le viewer
  // cherche donc un .tex frère du PDF avant de renoncer au bouton (2026-08-24).
  contractOk("sans ?tex=, le viewer cherche un .tex frère du PDF",
    /async function findTexSource\(\)/.test(pdfViewer)
    && /\.replace\(\/\\\.pdf\$\/i, *["']\.tex["']\)/.test(pdfViewer)
    && /\/statfile\?path=/.test(pdfViewer));
  // Un PDF recompilé pendant la fenêtre entre le chargement et le premier
  // sondage était silencieusement avalé : le premier tick posait la référence
  // au lieu de comparer à l'état du chargement (2026-08-24).
  contractOk("la référence mtime est posée AU CHARGEMENT, pas au premier sondage",
    /watched = await currentMtime\(\)/.test(pdfViewer));

  contractOk("compilation en cours verrouille le bouton et rend l'erreur LaTeX",
    /compileBtn\.disabled = true/.test(pdfViewer)
    && /j\.error/.test(pdfViewer)
    && /__reloadPdf/.test(pdfViewer));
  // Un PDF SANS source LaTeX (article Zotero, rapport téléchargé, figure
  // exportée) ne montre rien : findTexSource rend null, le bloc s'arrête.
  contractOk("PDF sans source LaTeX : aucun bouton",
    /const texPath = await findTexSource\(\);\s*\n\s*if\(!texPath\) return;/.test(pdfViewer));
  // Icône seule (2026-08-24) : le libellé texte alourdissait la barre et
  // l'ancienne icône (flèche vers un plateau) disait « télécharger ».
  contractOk("bouton Compiler = icône seule, flèche circulaire, sans libellé",
    !/id=["']compileLabel["']/.test(pdfViewer)
    && /#compileBtn\{[^}]*width:26px;height:24px/s.test(pdfViewer)
    && !/<span id=["']compileLabel["']/.test(pdfViewer));
  contractOk("états du bouton portés par des classes CSS, jamais par du texte",
    // les trois états sont demandés…
    /etat\(["']busy["']/.test(pdfViewer)
    && /etat\(["']done["']/.test(pdfViewer)
    && /etat\(["']err["']/.test(pdfViewer)
    // …rendus par des règles CSS…
    && /#compileBtn\.busy svg\{animation:compileSpin/.test(pdfViewer)
    && /#compileBtn\.done\{color:var\(--accent/.test(pdfViewer)
    && /#compileBtn\.err::after\{/.test(pdfViewer)
    // …et jamais par du texte écrit dans la barre
    && !/compileBtn\.textContent/.test(pdfViewer));
  contractOk("l'animation d'attente respecte prefers-reduced-motion",
    /@media \(prefers-reduced-motion: reduce\)\{ #compileBtn\.busy svg\{animation:none/.test(pdfViewer));

  contractOk("instrument Git garde une empreinte fixe",
    /#dvNav\{display:inline-flex/.test(src)
    && /commitBtn\.disabled = blocks <= 0/.test(src)
    && /els\.restore\.disabled = !shown/.test(src)
    && !/navPill\.style\.display = on \? ["']inline-flex["'] : ["']none["']/.test(src));
}

async function latexStudioTests() {
  const src = fs.readFileSync(path.join(ASSETS, "latex_studio.html"), "utf8");

  // C1. rewrap : structure intacte, commentaires jamais fusionnés, prose refluée
  {
    const featureContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(ASSETS, "latex_features.bundle.js"), "utf8"), featureContext);
    const createRewrapController = featureContext.AtelierStudioLatex.createRewrapController;
    const run = (linesArr, IS_TEX = true, col = "50", ext) => {
      let lines = [...linesArr];
      const cm = {
        lineCount: () => lines.length, getLine: (i) => lines[i],
        operation: (f) => f(), getCursor: () => ({ line: 0, ch: 0 }), setCursor() {},
        replaceRange(txt, from, to) { lines.splice(from.line, to.line - from.line + 1, ...txt.split("\n")); },
        getGutterElement: () => ({ offsetWidth: 40 }), getWrapperElement: () => ({ clientWidth: 600 }),
        defaultCharWidth: () => 8, somethingSelected: () => false, focus() {},
      };
      createRewrapController({
        editor: cm, isTex: IS_TEX, extension: ext ?? (IS_TEX ? "tex" : "py"),
        getWrapValue: () => col, setState: () => {},
        document: { addEventListener() {} }, button: { onclick: null },
      }).all();
      return lines;
    };
    let out = run([
      "\\documentclass{article}",
      "\\begin{document}",
      "Une phrase tres longue sans commentaire qui doit etre repliee a cinquante colonnes pour verifier le comportement normal du rewrap.",
      "\\end{document}",
    ]);
    ok("rewrap : structure intacte", out[0] === "\\documentclass{article}" && out[1] === "\\begin{document}"
      && out[out.length - 1] === "\\end{document}");
    ok("rewrap : prose repliée", Math.max(...out.map((l) => l.length)) <= 50, JSON.stringify(out));

    out = run(["\\usepackage{lineno} % line numbers for review et ce commentaire est long", "\\usepackage{natbib}"]);
    ok("rewrap : bloc avec % inline intouché", out.join("|").includes("% line numbers for review"));

    out = run(["% un long commentaire qui depasse la colonne de cinquante caracteres et doit etre replie", "% suite"]);
    ok("rewrap : bloc commentaire garde son préfixe", out.every((l) => l.startsWith("% ")));

    out = run(["x = compute(a, b, c) + call(un, deux, trois) + encore(quatre, cinq, six)"], false);
    ok("rewrap : code jamais fusionné", out.length === 1);

    // « # » n'est PAS un commentaire LaTeX : une typo Markdown ###{…} ne doit
    // jamais être traitée comme préfixe (espace injecté → # nu fatal au compile)
    out = run(["###{Sensibilite au seuil} avec du texte assez long pour forcer un repli de la ligne ici meme."]);
    ok("rewrap tex : ###{…} intact (pas un commentaire)", out.join(" ").includes("###{Sensibilite"), JSON.stringify(out));
    ok("rewrap tex : # jamais propagé en préfixe", out.slice(1).every((l) => !/^\s*#/.test(l)), JSON.stringify(out));
    // …mais # reste bien un préfixe de commentaire en Python
    out = run(["# un commentaire python tres long qui depasse la colonne de cinquante caracteres fixee"], false);
    ok("rewrap py : préfixe # préservé", out.length > 1 && out.every((l) => l.startsWith("# ")), JSON.stringify(out));
  }

  // C3. texPreflight : typos Markdown fatales attrapées avant latexmk
  {
    const featureContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(ASSETS, "latex_features.bundle.js"), "utf8"), featureContext);
    const pf = featureContext.AtelierStudioLatex.texPreflight;
    let r = pf("texte normal\n###{Sensibilite au seuil}\nsuite\n");
    ok("preflight : ###{…} détecté à la bonne ligne", r && r.line === 2, JSON.stringify(r));
    r = pf("avant\n### Un titre markdown\n");
    ok("preflight : ### titre détecté", r && r.line === 2, JSON.stringify(r));
    r = pf("avant\n```\ncode\n```\n");
    ok("preflight : clôture ``` détectée", r && r.line === 2, JSON.stringify(r));
    ok("preflight : % ###… ignoré (commentaire)", pf("% ### plan de section en commentaire\n") === null);
    ok("preflight : #1 macro toléré", pf("\\newcommand{\\x}[1]{#1 en gras}\n") === null);
    ok("preflight : texte sain → null", pf("\\section{Intro}\nDu texte avec 50\\% et \\cite{a}.\n") === null);
  }

  // C4. autoForwardSync : forward-sync auto en split (curseur → PDF), gardé
  {
    // loadPdf journalise ses échecs via console.warn : les rendre visibles
    // pour que le harnais échoue sur la cause, pas sur un symptôme aval.
    const featureContext = { console: { error() {}, warn: (...a) => console.error("[loadPdf]", ...a.map(String)), log() {} } };
    vm.runInNewContext(fs.readFileSync(path.join(ASSETS, "latex_features.bundle.js"), "utf8"), featureContext);
    let now = 100000, requests = [], timers = [], cursorLine = 5;
    const flush = () => { const t = timers; timers = []; t.forEach((f) => f()); };
    const right = {
      style: { display: "" }, scrollTop: 0, clientWidth: 900, clientHeight: 700,
      classList: { _s: new Set(), contains(c) { return this._s.has(c); } },
      querySelectorAll: () => [], appendChild() {},
    };
    const fakeWindow = {
      performance: {now: () => now}, parent: {}, devicePixelRatio: 1,
      setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, addEventListener() {},
      fetch: async (_url, init) => { requests.push(JSON.parse(init.body)); return {json: async () => ({page: 1, y: 2})}; },
    };
    const api = featureContext.AtelierStudioLatex.createLatexPdfSyncController({
      path: "main.tex", isPdfMode: false, getPdfPath: () => "main.pdf", getZoom: () => 1,
      getEditor: () => ({getCursor: () => ({line: cursorLine})}), right, marker: {style: {}},
      pdfjs: {getDocument: () => ({promise: Promise.resolve({numPages: 0, getPage() {}})})},
      channel: null, setState() {}, revealLine() {}, wallNow: () => now,
      document: {
        addEventListener() {},
        getElementById: () => null,
        // loadPdf (2026-09-14) monte un conteneur de mise en page hors écran
        // dans document.body puis le retire dans son finally : le faux
        // document doit offrir body.appendChild et remove() sur ses éléments.
        body: {appendChild() {}},
        createElement: () => ({style: {}, dataset: {}, scrollHeight: 0, setAttribute() {}, replaceChildren() {}, appendChild() {}, remove() {}, querySelectorAll: () => []}),
        createDocumentFragment: () => ({appendChild() {}, append() {}}),
        createTextNode: (text) => ({textContent: text}),
      }, window: fakeWindow,
    });
    await api.loadPdf();
    requests = []; cursorLine = 5; api.autoForwardSync(); flush();
    ok("autosync : navigation → forward silencieux", requests.length === 1 && requests[0].dir === "view");
    requests = []; api.autoForwardSync(); flush();
    ok("autosync : même ligne → pas de re-sync", requests.length === 0);
    cursorLine = 8; api.noteEdit(); requests = []; api.autoForwardSync(); flush();
    ok("autosync : frappe en cours → pas de sync", requests.length === 0);
    now += 500; cursorLine = 9; requests = []; api.autoForwardSync(); flush();
    ok("autosync : navigation après pause → sync", requests.length === 1);
    right.style.display = "none"; cursorLine = 12; requests = []; api.autoForwardSync(); flush();
    ok("autosync : PDF caché → pas de sync", requests.length === 0);
    right.style.display = ""; right.classList._s.add("reading"); cursorLine = 15; requests = []; api.autoForwardSync(); flush();
    ok("autosync : mode lecture → pas de sync", requests.length === 0);
  }

  // C2. texcFind : ré-ancrage exact + normalisé aux blancs
  {
    const featureContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(ASSETS, "latex_features.bundle.js"), "utf8"), featureContext);
    const doc = "aaa\ntemperature moyenne\nbeta ensuite\nccc temperature moyenne beta fin\n";
    const cm = {
      indexFromPos: () => 0,
      posFromIndex: (i) => ({ _idx: i }),
    };
    const fn = featureContext.AtelierStudioLatex.findAnnotationRange;
    let r = fn(doc, { text: "temperature moyenne beta", from: { line: 0, ch: 0 } }, cm);
    ok("texcFind normalisé : trouvé à cheval sur \\n", r && doc.slice(r.from._idx, r.to._idx).replace(/\s+/g, " ") === "temperature moyenne beta",
      JSON.stringify(r));
    r = fn(doc, { text: "introuvable dans le doc", from: { line: 0, ch: 0 } }, cm);
    ok("texcFind : orphelin = null", r === null);
  }
}

// ------------------------------------------------ D. timeline d'interventions
// Une intervention (sauvegarde ou passage d'agent) = UNE entrée ‹ k/N ›, même
// si elle touche plusieurs mots. ‹ › remonte/redescend la timeline ; les vues
// historiques remplacent temporairement le buffer et le restaurent TOUJOURS.
async function timelineTests() {
  const base = "Premier paragraphe sur la neige alpha.\nDeuxieme sur la temperature beta.\nTroisieme sur l'albedo gamma.\n";
  const s1 = base.replace("la neige alpha", "la neige fraiche et poudreuse alpha");
  const s2 = s1.replace("la temperature beta", "la temperature moyenne estivale beta");
  const s3 = s2.replace("l'albedo gamma", "l'albedo de surface reduit gamma");

  const h = makeModuleHarness({ headText: base });
  await sleep(0); await sleep(0); // fetchHead + restoreVersions
  h.cm._v = s1; h.dv.push(base, s1);
  h.cm._v = s2; h.dv.push(s1, s2);
  h.cm._v = s3; h.dv.push(s2, s3);
  await sleep(0);

  h.tag.onclick(); // ouvrir ± → « tout » (cumulatif vs base)
  const nav = h.nav();
  ok("timeline : pill créée", !!nav && !!nav.count, String(nav));
  ok("timeline : défaut « tout · 3 »", nav.count.textContent === "tout · 3", nav.count.textContent);
  ok("timeline : « tout » = 3 modifications", /· 3 modifications/.test(h.notes[h.notes.length - 1]), h.notes[h.notes.length - 1]);

  // ‹ → 3/3 (intervention vivante : buffer réel, seule l'interv. 3 marquée)
  h.marksLog.length = 0;
  nav.prev.onclick();
  ok("timeline 3/3 : compteur", nav.count.textContent === "3 / 3", nav.count.textContent);
  ok("timeline 3/3 : buffer réel intact", h.cm._v === s3);
  ok("timeline 3/3 : une seule marque (multi-mots = UNE interv.)",
    h.marksLog.filter((m) => m.type === "add").length === 1
    && s3.slice(h.marksLog[0].from, h.marksLog[0].to).includes("de surface reduit"),
    JSON.stringify(h.marksLog));
  ok("timeline 3/3 : pas de voyage temporel", !h.dv.isBusy());

  // ‹ → 2/3 : voyage temporel — buffer = état APRÈS l'intervention 2
  h.marksLog.length = 0;
  nav.prev.onclick();
  ok("timeline 2/3 : compteur", nav.count.textContent === "2 / 3", nav.count.textContent);
  ok("timeline 2/3 : buffer d'époque (i2 sans i3)", h.cm._v === s2 && h.cm._v.includes("estivale") && !h.cm._v.includes("reduit"));
  ok("timeline 2/3 : isBusy (les hôtes suspendent le rechargement disque)", h.dv.isBusy());
  ok("timeline 2/3 : seule l'interv. 2 marquée",
    h.marksLog.filter((m) => m.type === "add").length === 1
    && s2.slice(h.marksLog[0].from, h.marksLog[0].to).includes("moyenne estivale"),
    JSON.stringify(h.marksLog));

  // ‹ → 1/3 puis › ×3 → retour à « tout », buffer réel restauré
  nav.prev.onclick();
  ok("timeline 1/3 : borne basse (‹ désactivé)", nav.prev.disabled === true, String(nav.prev.disabled));
  nav.next.onclick(); nav.next.onclick(); nav.next.onclick();
  ok("timeline retour « tout »", nav.count.textContent === "tout · 3", nav.count.textContent);
  ok("timeline retour : buffer réel restauré", h.cm._v === s3 && !h.dv.isBusy());

  // vue historique ouverte puis fermeture : restauration inconditionnelle
  nav.prev.onclick(); nav.prev.onclick(); // 2/3 (voyage temporel)
  ok("timeline re-2/3", h.dv.isBusy());
  h.tag.onclick(); // fermer la comparaison
  ok("timeline fermeture : buffer réel restauré", h.cm._v === s3 && !h.dv.isBusy());
  ok("timeline fermeture : comparaison fermée", !h.dv.isShown());

  // Rétablir depuis 2/3 cible exactement le texte affiché, quitte le voyage
  // temporel avant l'écriture et ajoute UNE intervention restore.
  h.tag.onclick();
  const restoreNav = h.nav();
  restoreNav.prev.onclick(); restoreNav.prev.onclick(); // 2 / 3
  await sleep(0); await sleep(0);
  const postsBeforeRestore = h.posts.length;
  await h.restore.onclick();
  await sleep(0); await sleep(0);
  ok("restore 2/3 : texte affiché exact", h.restored.at(-1) === s2, JSON.stringify(h.restored));
  ok("restore 2/3 : sortie voyage temporel", !h.dv.isBusy() && !h.dv.isShown());
  const restorePayload = h.posts.at(-1);
  const restoreOps = restorePayload?.ops || [];
  ok("restore 2/3 : une intervention restore", h.posts.length > postsBeforeRestore
    && restoreOps.filter((op) => op.type === "append" && op.intervention?.source === "restore").length === 1,
  JSON.stringify(restorePayload));

  // Un 409 du writer hôte ne peut ni journaliser ni écraser la vue réelle.
  {
    const failed = makeModuleHarness({ headText: base, restoreResult: false });
    failed.cm._v = s1; failed.dv.push(base, s1);
    failed.cm._v = s2; failed.dv.push(s1, s2);
    failed.tag.onclick(); failed.nav().prev.onclick(); failed.nav().prev.onclick();
    await sleep(0); await sleep(0);
    const count = failed.posts.length;
    await failed.restore.onclick();
    ok("restore 409 : aucune intervention", failed.posts.length === count, JSON.stringify(failed.posts));
    ok("restore 409 : buffer réel récupéré", failed.cm._v === s2 && !failed.dv.isBusy());
  }

  // Historique Git externe : Rétablir utilise le commit affiché, pas VERSIONS[idx].
  {
    const external = "contenu exact du commit externe\n";
    const hx = makeModuleHarness({ headText: base });
    hx.cm._v = s1; hx.dv.push(base, s1);
    hx.dv.compareExternal(external, "commit deadbee");
    await hx.restore.onclick();
    ok("restore commit externe : texte exact", hx.restored.at(-1) === external, JSON.stringify(hx.restored));
    const ops = hx.posts.at(-1)?.ops || [];
    ok("restore commit externe : intervention restore", ops.some((op) =>
      op.type === "append" && op.intervention?.source === "restore"), JSON.stringify(hx.posts.at(-1)));
  }
  {
    const hall = makeModuleHarness({headText: base});
    hall.cm._v = s1; hall.dv.push(base, s1);
    hall.tag.onclick();
    await hall.restore.onclick();
    ok("restore vue tout cible buffer courant exact", hall.restored.at(-1) === s1, JSON.stringify(hall.restored));
  }

  // interventions ANTÉRIEURES à la base (déjà committées) : exclues du compteur
  // — « tout · N » doit refléter exactement ce que le diff cumulé montre
  {
    const now = Date.now();
    // base = s2 (les interventions 1 et 2 sont DÉJÀ dans le commit-base) ;
    // le serveur restaure deux vieilles versions d'avant la base
    const h3 = makeModuleHarness({
      headText: s2,
      headTs: Math.floor(now / 1000) - 60,
      serverItems: [{ b: base, t: now - 300000 }, { b: s1, t: now - 200000 }],
      serverLast: s2,
    });
    await sleep(0); await sleep(0); await sleep(0);
    // une seule intervention vivante depuis la base : i3
    h3.cm._v = s3;
    h3.dv.push(s2, s3);
    h3.tag.onclick();
    const nav3 = h3.nav();
    ok("timeline vs base : vieilles interventions committées exclues",
      nav3.count.textContent === "tout · 1", nav3.count.textContent);
    ok("timeline vs base : cumul = 1 modification (i3 seule)",
      /· 1 modification /.test(h3.notes[h3.notes.length - 1]), h3.notes[h3.notes.length - 1]);
    // …mais l'historique complet reste accessible : ‹ n'entre que sur i3
    nav3.prev.onclick();
    ok("timeline vs base : ‹ = 1/1 (la seule postérieure)", nav3.count.textContent === "1 / 1", nav3.count.textContent);
    ok("timeline vs base : borne (‹ éteint)", nav3.prev.disabled === true);
    h3.tag.onclick();
  }

  // une écriture externe pendant une vue historique : retour au présent propre
  const h2 = makeModuleHarness({ headText: base });
  await sleep(0); await sleep(0);
  h2.cm._v = s1; h2.dv.push(base, s1);
  h2.cm._v = s2; h2.dv.push(s1, s2);
  h2.tag.onclick();
  const nav2 = h2.nav();
  nav2.prev.onclick(); nav2.prev.onclick(); // 1/2 → voyage temporel
  ok("timeline h2 : en voyage", h2.dv.isBusy());
  // l'hôte recharge (agent) : setValue puis push — le module doit lâcher tt
  h2.cm._v = s3;
  h2.dv.push(s2, s3);
  ok("timeline écriture externe : sortie du voyage", !h2.dv.isBusy());
  ok("timeline écriture externe : buffer = disque (pas d'écrasement)", h2.cm._v === s3);

  // fichier NON SUIVI (pas de HEAD) : « tout » doit rester CUMULATIF (1ʳᵉ snapshot
  // → buffer), pas seulement le dernier delta — bug « je ne vois que Smith2020 »
  {
    const hU = makeModuleHarness({ headText: null }); // /githead → !ok
    await sleep(0); await sleep(0);
    hU.cm._v = s1; hU.dv.push(base, s1);
    hU.cm._v = s2; hU.dv.push(s1, s2);
    hU.cm._v = s3; hU.dv.push(s2, s3);
    hU.tag.onclick();
    const navU = hU.nav();
    ok("sans HEAD : pill « tout · 3 »", navU.count.textContent === "tout · 3", navU.count.textContent);
    // les 3 ajouts doivent tous être marqués (cumul), pas seulement le 3ᵉ
    const adds = hU.marksLog.filter((m) => m.type === "add");
    const joined = adds.map((m) => s3.slice(m.from, m.to)).join(" | ");
    ok("sans HEAD : « tout » marque l'interv. 1 (neige)", joined.includes("fraiche") || joined.includes("poudreuse"), joined);
    ok("sans HEAD : « tout » marque l'interv. 2 (température)", joined.includes("estivale") || joined.includes("moyenne"), joined);
    ok("sans HEAD : « tout » marque l'interv. 3 (albedo)", joined.includes("reduit") || joined.includes("surface"), joined);
    ok("sans HEAD : au moins 3 marques d'ajout (cumul)", adds.length >= 3, JSON.stringify(adds));
    hU.tag.onclick();
  }
}

// ------------------------------------------- marques SOURCE pour la Lecture
// Améliorations 2026-08-22 : kind « bridge » pour les fragments inchangés
// absorbés par la fusion sémantique, texte de suppression NON tronqué dans les
// marques publiées, et relais onNavigate (⌥↓/⌥↑ suivis par la vue Lecture).
async function readingMarksTests() {
  const before = "aa bb cc dd ee\n";
  const after = "aa XX cc YY ee\n";
  // R1. chemin cm5 (applyRender) : le pont « cc » est publié à part, en bridge
  {
    const published = [];
    const h = makeModuleHarness({ onMarks: (list) => published.push(list) });
    h.cm._v = after;
    h.dv.push(before, after);
    h.tag.onclick();
    await sleep(50);
    const last = published.at(-1) || [];
    const kinds = last.map((m) => m.kind + ":" + m.text.trim());
    ok("bridge cm5 : ajout XX publié", kinds.some((k) => k === "add:XX"), JSON.stringify(last));
    ok("bridge cm5 : ajout YY publié", kinds.some((k) => k === "add:YY"), JSON.stringify(last));
    ok("bridge cm5 : pont cc en kind bridge", kinds.some((k) => k === "bridge:cc"), JSON.stringify(last));
    ok("bridge cm5 : cc jamais en add", !kinds.some((k) => k === "add:cc" || /^add:XX cc/.test(k)), JSON.stringify(last));
    h.tag.onclick();
  }
  // R2. chemin cm6 (computeSrcMarks) : même contrat que le chemin cm5
  {
    const published = [];
    const h = makeModuleHarness({ onMarks: (list) => published.push(list) });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = () => [];
    h.cm._v = after;
    h.dv.push(before, after);
    h.tag.onclick();
    await sleep(50);
    const last = published.at(-1) || [];
    const kinds = last.map((m) => m.kind + ":" + m.text.trim());
    ok("bridge cm6 : ajouts XX et YY publiés", kinds.some((k) => k === "add:XX") && kinds.some((k) => k === "add:YY"), JSON.stringify(last));
    ok("bridge cm6 : pont cc en kind bridge", kinds.some((k) => k === "bridge:cc"), JSON.stringify(last));
    h.tag.onclick();
  }
  // R3. suppression longue : le texte publié pour la Lecture n'est PAS tronqué
  {
    const cutText = ("glacier albedo declines sharply after each fire season and ").repeat(4).trim(); // > 160 car.
    const longBefore = "debut " + cutText + " fin\n";
    const longAfter = "debut fin\n";
    const published = [];
    const h = makeModuleHarness({ onMarks: (list) => published.push(list) });
    h.cm.hasNativeMergeDiff = true; // chemin cm6 : c'est computeSrcMarks qui tronquait
    h.cm.showMergeDiff = () => [];
    h.cm._v = longAfter;
    h.dv.push(longBefore, longAfter);
    h.tag.onclick();
    await sleep(50);
    const del = (published.at(-1) || []).find((m) => m.kind === "del");
    ok("del non tronqué : marque publiée", !!del, JSON.stringify(published.at(-1)));
    ok("del non tronqué : texte complet (> 160 car., sans ⋯)",
      del && del.text.length > 160 && !del.text.includes("⋯"), del && del.text.length + " car.");
    // la marque porte le CONTEXTE SUIVANT la coupe : la Lecture y ancre le
    // barré déplié à sa vraie position dans la prose, pas en tête de bloc
    ok("del : contexte suivant publié (next)", del && typeof del.next === "string" && del.next.startsWith("fin"), del && JSON.stringify(del.next));
    h.tag.onclick();
  }
  // R3b. remplacement : le contexte suivant d'une suppression = le texte AJOUTÉ
  // qui la remplace (présent dans la prose rendue, donc ancrable) — les deux
  // chemins cm5 et cm6 publient le même contrat
  for (const native of [false, true]) {
    const published = [];
    const h = makeModuleHarness({ onMarks: (list) => published.push(list) });
    if (native) { h.cm.hasNativeMergeDiff = true; h.cm.showMergeDiff = () => []; }
    const b2 = "intro formally RAQDPS-FW with emissions considered here\n";
    const a2 = "intro officially designated RAQDPS-FW with emissions considered here\n";
    h.cm._v = a2;
    h.dv.push(b2, a2);
    h.tag.onclick();
    await sleep(50);
    const del2 = (published.at(-1) || []).find((m) => m.kind === "del");
    ok(`del remplacement (${native ? "cm6" : "cm5"}) : next ancre sur le texte de remplacement`,
      del2 && typeof del2.next === "string" && /officially/.test(del2.next), del2 && JSON.stringify(del2));
    h.tag.onclick();
  }
  // R4. onNavigate : l'hôte peut router ⌥↓/⌥↑ vers la Lecture (retour true =
  // pas de défilement éditeur)
  {
    const navCalls = [];
    const h = makeModuleHarness({ onNavigate: (line, index, total) => { navCalls.push({line, index, total}); return true; } });
    h.cm._v = after;
    h.dv.push(before, after);
    h.tag.onclick();
    await sleep(50);
    ok("onNavigate : appelé à l'ouverture de la comparaison", navCalls.length >= 1, JSON.stringify(navCalls));
    ok("onNavigate : index/total cohérents", navCalls.every((c) => c.total >= 1 && c.index >= 0 && c.index < c.total), JSON.stringify(navCalls));
    ok("onNavigate true : l'éditeur ne défile pas", h.scrollLog.length === 0, JSON.stringify(h.scrollLog));
    h.tag.onclick();
  }
}

// --------------------------------- F2. revue ancrée (variante F2, 2026-09-10)
// render() appelle cm.showMergeDiff(v.before, {onDecision, individual: true,
// anchored: true, onLatest}) — plus de `toolbar`, plus de #dvReview flottant :
// la pilule inline + le trait en rangées visuelles vivent DANS CodeMirror
// (donc hors de portée de ce faux cm). Ce qui reste testable côté module :
// - les options passées à showMergeDiff (anchored/individual/onLatest/onDecision) ;
// - cm.setReviewFocus(ch) à l'ouverture et à la navigation (gotoChange) ;
// - le clavier ⌥↩/⌥⌫ (document) → decideCurrent() → cm.decideMergeChunk() ;
// - le toast d'annulation (#diffUndo, .dv-undo-toast), monté paresseusement
//   par showUndo() dans undoToastHost() (cm.getWrapperElement().closest("#left")
//   ou son parentElement), jamais dans la barre (els.group).
function fakeReviewHost() {
  const host = { _children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
  host.appendChild = (n) => { host._children.push(n); return n; };
  return host;
}
async function individualReviewCardTests() {
  const before = "aa bb cc\n", after = "aa XX cc\n";
  const onePoint = () => [{ pos: { line: 0, ch: 0 }, ch: 0 }];

  // 1. showMergeDiff reçoit anchored: true (ni gouttière, ni carte flottante)
  {
    const h = makeModuleHarness({ individualReview: true });
    const host = fakeReviewHost();
    h.cm.getWrapperElement = () => ({ parentElement: host }); // pas de .closest → repli parentElement
    h.cm.hasNativeMergeDiff = true;
    let capturedOpts = null;
    h.cm.showMergeDiff = (b, opts) => { capturedOpts = opts; return onePoint(); };
    h.cm._v = after;
    h.dv.push(before, after);
    h.tag.onclick(); // ouvre la revue de la dernière intervention
    ok("revue individuelle : showMergeDiff reçoit anchored: true et onLatest (ni gouttière, ni carte)",
      !!capturedOpts && capturedOpts.anchored === true && capturedOpts.individual === true
        && typeof capturedOpts.onLatest === "function" && capturedOpts.toolbar === undefined,
      JSON.stringify(capturedOpts));
    ok("revue individuelle : aucune carte #dvReview montée (F2 est ancrée dans CodeMirror)",
      !host._children.some((c) => c && c.id === "dvReview"), JSON.stringify(host._children.map((c) => c && c.id)));
    h.tag.onclick(); // toggle(false) : referme la revue
  }

  // 2. Ouvrir un passage désigne le changement courant via cm.setReviewFocus
  {
    const h = makeModuleHarness({ individualReview: true });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    const focus = [];
    h.cm.setReviewFocus = (ch) => focus.push(ch);
    h.cm._v = after;
    h.dv.push(before, after);
    h.tag.onclick(); // gotoChange(0, true) au premier rendu du passage
    ok("revue individuelle : ouvrir un passage désigne le changement courant (setReviewFocus)",
      focus.includes(0), JSON.stringify(focus));
    h.tag.onclick();
  }

  // 3. ⌥↩ (document, altKey+code Enter) garde le bloc courant via decideMergeChunk
  // et range la décision dans reviewState (persisté sous texReviewV1:<path>)
  {
    const h = makeModuleHarness({ individualReview: true });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = after;
    h.dv.push(before, after);
    await sleep(50); // laisse /versions journaliser l'intervention (id auto-généré)
    h.tag.onclick();
    const it = persistedInterventions(h)[0];
    ok("revue individuelle : intervention journalisée avant décision", !!it && it.after === after, JSON.stringify(it));
    const calls = [];
    h.cm.decideMergeChunk = (kind, ch) => {
      calls.push([kind, ch]);
      return { kind, current: h.cm.getValue(), text: h.cm.getValue(), base: "<base ajustée>" };
    };
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false, code: "Enter", key: "Enter" });
    await sleep(50);
    ok("revue individuelle : ⌥↩ garde le bloc courant via decideMergeChunk(\"accept\", ch)",
      calls.length === 1 && calls[0][0] === "accept" && calls[0][1] === 0, JSON.stringify(calls));
    const saved = JSON.parse(h.storage.get("texReviewV1:" + h.filePath) || "{}");
    ok("revue individuelle : ⌥↩ enregistre la base ajustée dans reviewState",
      !!it && saved[it.id] && saved[it.id].base === "<base ajustée>", JSON.stringify(saved));
    h.tag.onclick();
  }

  // 4. ⌥⌫ (keydown global document, hors focus texte) ignore le bloc courant
  {
    const h = makeModuleHarness({ individualReview: true });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = after;
    h.dv.push(before, after);
    await sleep(50);
    h.tag.onclick();
    h.cm.decideMergeChunk = (kind, ch) => ({ kind, current: h.cm.getValue(), text: before, base: before });
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false, code: "Backspace", key: "Backspace" });
    await sleep(50);
    ok("revue individuelle : ⌥⌫ (document, altKey+code Backspace) ignore le bloc courant et restaure le texte du refus",
      h.restored.at(-1) === before, JSON.stringify(h.restored));
    h.tag.onclick();
  }

  // 5. Le toast d'annulation est monté paresseusement dans le volet éditeur
  // (jamais dans la barre) au premier décision, puis s'efface à la fermeture.
  {
    const h = makeModuleHarness({ individualReview: true });
    const host = fakeReviewHost();
    h.cm.getWrapperElement = () => ({ parentElement: host });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = after;
    h.dv.push(before, after);
    await sleep(50);
    h.tag.onclick();
    ok("revue individuelle : aucun toast d'annulation avant décision",
      !host._children.some((c) => c && c.id === "diffUndo"), JSON.stringify(host._children.map((c) => c && c.id)));
    h.cm.decideMergeChunk = (kind) => ({ kind, current: h.cm.getValue(), text: h.cm.getValue(), base: "<base ajustée>" });
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false, code: "Enter", key: "Enter" });
    await sleep(50);
    const undo = host._children.find((c) => c && c.id === "diffUndo");
    ok("revue individuelle : le toast d'annulation est monté dans le volet éditeur après une décision",
      !!undo && undo.className === "dv-undo-toast" && undo.hidden === false,
      JSON.stringify({found: !!undo, className: undo && undo.className, hidden: undo && undo.hidden}));
    ok("revue individuelle : le toast n'est pas ajouté à la barre",
      !h.group._children.some((c) => c && c.id === "diffUndo"), JSON.stringify(h.group._children.map((c) => c && c.id)));
    h.tag.onclick(); // fermeture de la revue (toggle(false) → hideUndo())
    ok("revue individuelle : fermer la revue cache le toast d'annulation", undo.hidden === true, String(undo.hidden));
  }

  // 6. Retouches de l'auteur après l'intervention : le Diff s'ouvre QUAND MÊME
  // sur le texte vivant (refuser laissait la comparaison muette — Thierry
  // 2026-09-10, « Sauvegarde tes retouches » sur methods_en.tex 29/29) et le
  // passage reste décidable (onDecision est fourni, pas null).
  {
    const h = makeModuleHarness({ individualReview: true });
    h.cm.hasNativeMergeDiff = true;
    let comparedBefore = null, capturedOpts = null;
    h.cm.showMergeDiff = (b, opts) => { comparedBefore = b; capturedOpts = opts; return onePoint(); };
    h.cm._v = after;
    h.dv.push(before, after);
    // L'auteur retouche le paragraphe après le passage de l'agent.
    const edited = "aa XX cc retouché par l'auteur\n";
    h.cm._v = edited;
    h.notes.length = 0;
    h.tag.onclick();
    ok("revue individuelle : une retouche postérieure n'empêche plus d'ouvrir le Diff",
      h.dv.isShown() === true, JSON.stringify(h.notes));
    ok("revue individuelle : aucune invite « Sauvegarde tes retouches »",
      !h.notes.some((note) => /Sauvegarde tes/.test(note)), JSON.stringify(h.notes));
    ok("revue individuelle : la comparaison part de l'état d'avant l'intervention",
      comparedBefore === before, JSON.stringify(comparedBefore));
    ok("revue individuelle : le buffer vivant n'est pas remplacé par un état historique",
      h.cm.getValue() === edited, JSON.stringify(h.cm.getValue()));
    ok("revue individuelle : le passage reste décidable (onDecision fourni, pas null)",
      !!capturedOpts && typeof capturedOpts.onDecision === "function", JSON.stringify(capturedOpts && typeof capturedOpts.onDecision));
  }
}

// ---------------------------------------- décisions de revue durables (2026-09-11)
// Le localStorage du WebView ne survit pas au redémarrage (PIEGES_CONNUS §1) :
// les décisions « Garder »/« Ignorer »/« Tout accepter » se journalisent via
// l'op `review` de /versions, et se reconstruisent depuis le serveur.
async function durableReviewTests() {
  const before = "aa bb cc\n", after = "aa XX cc\n";
  const onePoint = () => [{ pos: { line: 0, ch: 0 }, ch: 0 }];
  const reviewOps = (h) => h.posts.flatMap((post) => post.ops || []).filter((op) => op.type === "review");

  // 1. Une décision poste une op `review` avec les empreintes de la base
  // ajustée et du texte résultant (et leurs textes).
  {
    const h = makeModuleHarness({ individualReview: true });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = after;
    h.dv.push(before, after);
    await sleep(50);
    h.tag.onclick();
    const it = persistedInterventions(h)[0];
    const adjusted = "aa bb cc ajusté\n";
    h.cm.decideMergeChunk = (kind) => ({ kind, current: h.cm.getValue(), text: h.cm.getValue(), base: adjusted });
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false, code: "Enter", key: "Enter" });
    await sleep(50);
    const ops = reviewOps(h);
    ok("revue durable : la décision poste une op review avec les bons hashes",
      ops.length === 1 && ops[0].id === it.id && ops[0].review?.baseHash === sha256(adjusted)
        && ops[0].review?.textHash === sha256(after) && ops[0].review.accepted === undefined
        && ops[0].texts?.[sha256(adjusted)] === adjusted && !(sha256(after) in ops[0].texts),
      JSON.stringify(ops));
    // Une même décision acquittée ne repart pas ; une nouvelle repart.
    h.cm.decideMergeChunk = (kind) => ({ kind, current: h.cm.getValue(), text: h.cm.getValue(), base: adjusted });
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false, code: "Enter", key: "Enter" });
    await sleep(50);
    ok("revue durable : une décision identique acquittée ne repart pas", reviewOps(h).length === 1,
      JSON.stringify(reviewOps(h)));
    const adjusted2 = "aa bb cc ajusté deux\n";
    h.cm.decideMergeChunk = (kind) => ({ kind, current: h.cm.getValue(), text: h.cm.getValue(), base: adjusted2 });
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false, code: "Enter", key: "Enter" });
    await sleep(50);
    ok("revue durable : une décision différente repart", reviewOps(h).length === 2
      && reviewOps(h)[1].review.baseHash === sha256(adjusted2), JSON.stringify(reviewOps(h)));
    // Le snapshot local (texDiffV1) porte aussi la décision (repli).
    const local = JSON.parse(h.storage.get("texDiffV1:" + h.filePath) || "{}");
    ok("revue durable : compactState inclut review dans le snapshot local",
      local.review?.[it.id]?.baseHash === sha256(adjusted2) && local.texts?.[sha256(adjusted2)] === adjusted2,
      JSON.stringify(local.review));
    h.tag.onclick();
  }

  // 2. « Tout accepter » journalise accepted:true pour chaque intervention.
  {
    const h = makeModuleHarness({ individualReview: true });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = after;
    h.dv.push(before, after);
    await sleep(50);
    const it = persistedInterventions(h)[0];
    const acceptAll = h.group._children.find((c) => c && c.id === "diffAcceptAll");
    ok("revue durable : bouton Tout accepter présent", !!acceptAll);
    acceptAll.onclick();
    await sleep(50);
    const ops = reviewOps(h);
    ok("revue durable : Tout accepter poste review accepted:true",
      ops.length === 1 && ops[0].id === it.id && ops[0].review?.accepted === true
        && ops[0].review.baseHash === sha256(after) && ops[0].review.textHash === sha256(after),
      JSON.stringify(ops));
    ok("revue durable : Tout accepter ne renvoie pas les textes déjà journalisés",
      Object.keys(ops[0].texts || {}).length === 0, JSON.stringify(Object.keys(ops[0].texts || {})));
  }

  // 2b. « Tout accepter » sur un long historique chargé du serveur : 189 ops
  // review sans un seul texte (chaque texte y est déjà, par l'append). Avec
  // les textes, 189 × 17 Ko = 3,2 Mo → 413 côté Rust (Thierry 2026-09-11).
  {
    const n = 189, filler = "x".repeat(17 * 1024);
    const entries = []; let prev = "base longue\n";
    for (let i = 1; i <= n; i++) {
      const next = `version ${i} ${filler}\n`;
      entries.push({ id: `i-${i}`, before: prev, after: next, ts: i, source: "external-reload", status: "applied" });
      prev = next;
    }
    const serverState = durableState("/x/long.tex", 7, "base longue\n", entries, prev);
    const h = makeModuleHarness({ individualReview: true, headText: null, serverState: { ok: true, ...serverState } });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = prev; h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    ok("revue durable : 189 interventions chargées (compteur 189/189)", h.nav()?.count.textContent === `${n}/${n}`,
      JSON.stringify({ count: h.nav()?.count.textContent, notes: h.notes }));
    const acceptAll = h.group._children.find((c) => c && c.id === "diffAcceptAll");
    acceptAll.onclick();
    await sleep(50);
    const ops = reviewOps(h);
    const bytes = Buffer.byteLength(JSON.stringify(h.posts[h.posts.length - 1] || {}));
    ok("revue durable : Tout accepter sur 189 interventions = 189 ops review, aucun texte, corps < 200 Ko",
      ops.length === n && ops.every((op) => op.review?.accepted === true && Object.keys(op.texts || {}).length === 0)
        && bytes < 200 * 1024,
      JSON.stringify({ ops: ops.length, bytes, texts: ops.slice(0, 3).map((op) => Object.keys(op.texts || {}).length) }));
    ok("revue durable : après Tout accepter, l'historique est vide",
      h.nav()?.count.textContent === "0" || h.nav()?.count.textContent === "0/0",
      JSON.stringify(h.nav()?.count.textContent));
  }

  // 3. Rechargement depuis un état serveur qui porte `review` : reviewState est
  // reconstruit (le serveur fait foi, localStorage vide au redémarrage) et
  // l'intervention acceptée est absente de l'historique ‹ n/N ›.
  {
    const base = "base durable\n", mid = "milieu durable\n", last = "fin durable\n";
    const serverState = durableState("/x/m.tex", 2, base, [
      { id: "i-1", before: base, after: mid, ts: 1, source: "user-save", status: "applied" },
      { id: "i-2", before: mid, after: last, ts: 2, source: "user-save", status: "applied" },
    ], last);
    serverState.review = { "i-2": { baseHash: sha256(last), textHash: sha256(last), accepted: true } };
    const h = makeModuleHarness({ individualReview: true, headText: null, serverState: { ok: true, ...serverState } });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = last; h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    const count = h.nav()?.count.textContent;
    ok("revue durable : l'intervention acceptée côté serveur quitte l'historique (compteur 1/1)",
      count === "1/1", JSON.stringify({ count, notes: h.notes }));
    const saved = JSON.parse(h.storage.get("texReviewV1:" + h.filePath) || "{}");
    ok("revue durable : reviewState reconstruit depuis le serveur",
      saved["i-2"]?.accepted === true && saved["i-2"].base === last && saved["i-2"].text === last, JSON.stringify(saved));
    ok("revue durable : rien à re-poster après reconstruction (décision acquittée)",
      reviewOps(h).length === 0, JSON.stringify(h.posts));
  }

  // 3b. Une décision PARTIELLE journalisée survit au redémarrage : la revue
  // repart de la base ajustée, pas du `before` de l'intervention (symptôme 3).
  {
    const base = "base partielle\n", last = "fin partielle\n", adjusted = "base partielle ajustée\n";
    const serverState = durableState("/x/m.tex", 1, base, [
      { id: "i-1", before: base, after: last, ts: 1, source: "user-save", status: "applied" },
    ], last);
    serverState.texts[sha256(adjusted)] = adjusted;
    serverState.review = { "i-1": { baseHash: sha256(adjusted), textHash: sha256(last) } };
    const h = makeModuleHarness({ individualReview: true, headText: null, serverState: { ok: true, ...serverState } });
    h.cm.hasNativeMergeDiff = true;
    const compared = [];
    h.cm.showMergeDiff = (b) => { compared.push(b); return onePoint(); };
    h.cm._v = last; h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    ok("revue durable : une décision partielle ne retire pas l'intervention (1/1)", h.nav()?.count.textContent === "1/1",
      h.nav()?.count.textContent);
    h.tag.onclick();
    ok("revue durable : la revue repart de la base ajustée journalisée", compared.at(-1) === adjusted, JSON.stringify(compared));
    h.tag.onclick();
  }

  // 3c. Annuler une décision poste `review: null` (le serveur la retire).
  {
    const before = "aa bb cc\n", after = "aa XX cc\n";
    const h = makeModuleHarness({ individualReview: true });
    const host = fakeReviewHost();
    h.cm.getWrapperElement = () => ({ parentElement: host });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = after; h.dv.push(before, after);
    await sleep(50);
    h.tag.onclick();
    const it = persistedInterventions(h)[0];
    h.cm.decideMergeChunk = (kind) => ({ kind, current: h.cm.getValue(), text: h.cm.getValue(), base: "aa bb cc ajusté\n" });
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false, code: "Enter", key: "Enter" });
    await sleep(50);
    ok("revue durable (annulation) : décision acquittée d'abord", reviewOps(h).length === 1 && reviewOps(h)[0].review !== null);
    const undo = host._children.find((c) => c && c.id === "diffUndo");
    await undo.onclick();
    await sleep(50);
    const ops = reviewOps(h);
    ok("revue durable (annulation) : l'annulation poste review:null pour l'id",
      ops.length === 2 && ops[1].id === it.id && ops[1].review === null, JSON.stringify(ops));
    const local = JSON.parse(h.storage.get("texDiffV1:" + h.filePath) || "{}");
    ok("revue durable (annulation) : le snapshot local ne porte plus la décision", !local.review?.[it.id], JSON.stringify(local.review));
    h.tag.onclick();
  }

  // 3d. Conflit de révision (409) : les décisions du serveur sont adoptées et
  // acquittées ; la décision locale non acquittée repart à la reprise.
  {
    const base = "base conflit\n", mid = "milieu conflit\n", last = "fin conflit\n";
    const remote = durableState("/x/m.tex", 5, base, [
      { id: "i-1", before: base, after: mid, ts: 1, source: "user-save", status: "applied" },
      { id: "i-2", before: mid, after: last, ts: 2, source: "user-save", status: "applied" },
    ], last);
    remote.review = { "i-1": { baseHash: sha256(mid), textHash: sha256(mid), accepted: true } };
    const initial = { ...durableState("/x/m.tex", 4, base, remote.interventions.map((it) => ({
      id: it.id, before: remote.texts[it.fromHash], after: remote.texts[it.toHash], ts: it.ts, source: it.source, status: it.status })), last) };
    const h = makeModuleHarness({ individualReview: true, headText: null, serverState: { ok: true, ...initial },
      postResponses: [(payload) => payload.ops.some((op) => op.type === "review")
        ? { status: 409, body: { ok: false, error: "revision-conflict", revision: 5, state: remote } } : undefined] });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = last; h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    h.tag.onclick();
    const adjusted = "milieu conflit ajusté\n";
    h.cm.decideMergeChunk = (kind) => ({ kind, current: h.cm.getValue(), text: h.cm.getValue(), base: adjusted });
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false, code: "Enter", key: "Enter" });
    await sleep(50);
    const ops = reviewOps(h);
    const retry = h.posts.at(-1);
    ok("revue durable (409) : la reprise ne renvoie que la décision locale, à la révision serveur",
      h.posts.length === 2 && retry.expectedRevision === 5
        && ops.filter((op) => op.id === "i-2").length === 2 && !ops.some((op) => op.id === "i-1"),
      JSON.stringify(h.posts.map((post) => ({ rev: post.expectedRevision, ops: post.ops.map((op) => op.type + ":" + (op.id || "")) }))));
    const saved = JSON.parse(h.storage.get("texReviewV1:" + h.filePath) || "{}");
    ok("revue durable (409) : la décision du serveur est adoptée (i-1 accepté), la locale conservée",
      saved["i-1"]?.accepted === true && saved["i-2"]?.base === adjusted, JSON.stringify(saved));
    h.tag.onclick();
  }

  // 4. Repli localStorage : une décision locale jamais acquittée est rejouée
  // au serveur au rechargement ; sur un id commun, le serveur fait foi.
  {
    const base = "base repli\n", mid = "milieu repli\n", last = "fin repli\n";
    const serverState = durableState("/x/m.tex", 2, base, [
      { id: "i-1", before: base, after: mid, ts: 1, source: "user-save", status: "applied" },
      { id: "i-2", before: mid, after: last, ts: 2, source: "user-save", status: "applied" },
    ], last);
    serverState.review = { "i-2": { baseHash: sha256(last), textHash: sha256(last), accepted: true } };
    const localAdjusted = "base ajustée locale\n";
    const h = makeModuleHarness({ individualReview: true, headText: null,
      serverState: { ok: true, ...serverState },
      localReview: { "i-1": { base: localAdjusted, text: mid }, "i-2": { base: mid, text: last } } });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = last; h.ctx.__tick();
    await sleep(0); await sleep(0); await sleep(0);
    const saved = JSON.parse(h.storage.get("texReviewV1:" + h.filePath) || "{}");
    ok("revue durable : le serveur gagne sur un id commun (i-2 accepté)",
      saved["i-2"]?.accepted === true && saved["i-2"].base === last, JSON.stringify(saved));
    ok("revue durable : la décision locale orpheline est conservée (i-1)",
      saved["i-1"]?.base === localAdjusted, JSON.stringify(saved));
    const ops = reviewOps(h);
    ok("revue durable : seule la décision locale non acquittée est rejouée",
      ops.length === 1 && ops[0].id === "i-1" && ops[0].review?.baseHash === sha256(localAdjusted)
        && ops[0].texts?.[sha256(localAdjusted)] === localAdjusted, JSON.stringify(h.posts));
  }
}

// --------------------------- une intervention entièrement décidée quitte l'historique
// Symptôme (Thierry 2026-09-11) : après avoir accepté tous les passages d'une
// intervention, elle restait dans ‹ n/N › et ses diffs restaient visibles —
// seul « Tout accepter » posait `accepted`.
async function reviewCompletionTests() {
  const onePoint = () => [{ pos: { line: 0, ch: 0 }, ch: 0 }];
  const reviewOps = (h) => h.posts.flatMap((post) => post.ops || []).filter((op) => op.type === "review");
  const decide = (h, kind, base) => {
    h.cm.decideMergeChunk = (k) => ({ kind: k, current: h.cm.getValue(), text: h.cm.getValue(), base });
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false,
      code: kind === "accept" ? "Enter" : "Backspace", key: kind === "accept" ? "Enter" : "Backspace" });
  };

  // 1. Deux interventions : la dernière décision de la 2ᵉ la retire, le
  // compteur passe de 2/2 à 1/1 et la revue reste ouverte sur la 1ʳᵉ.
  {
    const base = "aa bb cc\n", mid = "aa XX cc\n", last = "aa XX cc dd\n";
    const h = makeModuleHarness({ individualReview: true });
    const host = fakeReviewHost();
    h.cm.getWrapperElement = () => ({ parentElement: host });
    h.cm.hasNativeMergeDiff = true;
    const compared = [];
    h.cm.showMergeDiff = (b) => { compared.push(b); return onePoint(); };
    h.cm._v = mid; h.dv.push(base, mid);
    h.cm._v = last; h.dv.push(mid, last);
    await sleep(50);
    h.tag.onclick();
    ok("intervention décidée : revue ouverte sur 2/2", h.nav()?.count.textContent === "2/2", h.nav()?.count.textContent);
    const ids = persistedInterventions(h).map((it) => it.id);
    // Décision partielle : base ajustée ≠ texte vivant → l'intervention reste.
    decide(h, "accept", "aa XX cc\n");
    await sleep(50);
    ok("intervention décidée : une décision partielle ne la retire pas", h.nav()?.count.textContent === "2/2",
      h.nav()?.count.textContent);
    // Dernière décision : la base ajustée rejoint le texte vivant → plus aucun bloc.
    decide(h, "accept", last);
    await sleep(50);
    ok("intervention décidée : la dernière décision la retire de l'historique (compteur 1/1)",
      h.nav()?.count.textContent === "1/1", JSON.stringify({ count: h.nav()?.count.textContent, notes: h.notes }));
    // Fixture d'une seule ligne : le delta accepté chevauche la modification
    // de la 1ʳᵉ intervention → pas de transplantation, base inchangée (repli).
    ok("intervention décidée : la revue reste ouverte sur l'intervention précédente (repli : base inchangée)",
      h.dv.isShown() === true && compared.at(-1) === base, JSON.stringify(compared));
    const saved = JSON.parse(h.storage.get("texReviewV1:" + h.filePath) || "{}");
    ok("intervention décidée : reviewState porte accepted:true", saved[ids[1]]?.accepted === true, JSON.stringify(saved));
    const last2 = reviewOps(h).filter((op) => op.id === ids[1]).at(-1);
    ok("intervention décidée : l'op review journalise accepted:true",
      !!last2 && last2.review?.accepted === true && last2.review.baseHash === sha256(last), JSON.stringify(reviewOps(h)));
    const undo = host._children.find((c) => c && c.id === "diffUndo");
    ok("intervention décidée : la décision qui clôt reste annulable (toast offert après la navigation automatique)",
      !!undo && undo.hidden === false, String(undo && undo.hidden));
    h.tag.onclick();
  }

  // 1b. Fixture multi-paragraphes : le delta accepté de la 2ᵉ intervention est
  // transplanté dans la base de la 1ʳᵉ — ses blocs déjà acceptés n'y
  // réapparaissent pas ; la transplantation est journalisée et annulable.
  {
    const base = "p1\n\np2\n\np3\n", mid = "P1\n\np2\n\np3\n", last = "P1\n\np2\n\nP3\n";
    const seeded = "p1\n\np2\n\nP3\n";
    const h = makeModuleHarness({ individualReview: true });
    const host = fakeReviewHost();
    h.cm.getWrapperElement = () => ({ parentElement: host });
    h.cm.hasNativeMergeDiff = true;
    const compared = [];
    h.cm.showMergeDiff = (b) => { compared.push(b); return onePoint(); };
    h.cm._v = mid; h.dv.push(base, mid);
    h.cm._v = last; h.dv.push(mid, last);
    await sleep(50);
    h.tag.onclick();
    const ids = persistedInterventions(h).map((it) => it.id);
    decide(h, "accept", last);
    await sleep(50);
    ok("transplantation : compteur 1/1 après la clôture de la 2ᵉ", h.nav()?.count.textContent === "1/1", h.nav()?.count.textContent);
    ok("transplantation : la 1ʳᵉ se compare à sa base + delta accepté (P3 n'est plus un bloc)",
      compared.at(-1) === seeded, JSON.stringify(compared));
    const saved = JSON.parse(h.storage.get("texReviewV1:" + h.filePath) || "{}");
    ok("transplantation : base transplantée dans reviewState sans accepted",
      saved[ids[0]]?.base === seeded && saved[ids[0]].accepted === undefined && saved[ids[1]]?.accepted === true, JSON.stringify(saved));
    const opsPrev = reviewOps(h).filter((op) => op.id === ids[0]);
    ok("transplantation : journalisée par une op review", opsPrev.length === 1 && opsPrev[0].review?.baseHash === sha256(seeded),
      JSON.stringify(reviewOps(h)));
    // Annuler la décision qui a clos la 2ᵉ : elle revient, la transplantation est rendue.
    const undo = host._children.find((c) => c && c.id === "diffUndo");
    ok("transplantation : toast Annuler offert", !!undo && undo.hidden === false);
    await undo.onclick();
    await sleep(50);
    const restored = JSON.parse(h.storage.get("texReviewV1:" + h.filePath) || "{}");
    ok("transplantation (annulation) : la 2ᵉ revient (2/2) et la base transplantée est rendue",
      h.nav()?.count.textContent === "2/2" && restored[ids[0]] === undefined && restored[ids[1]]?.accepted === undefined,
      JSON.stringify({ count: h.nav()?.count.textContent, restored }));
    const nullOps = reviewOps(h).filter((op) => op.id === ids[0] && op.review === null);
    ok("transplantation (annulation) : review:null journalisé pour la base transplantée", nullOps.length === 1,
      JSON.stringify(reviewOps(h)));
    h.tag.onclick();
  }

  // 2. Une seule intervention : la dernière décision ferme la revue et le dit.
  {
    const before = "aa bb cc\n", after = "aa XX cc\n";
    const h = makeModuleHarness({ individualReview: true });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = after; h.dv.push(before, after);
    await sleep(50);
    h.tag.onclick();
    ok("intervention décidée (seule) : revue ouverte sur 1/1", h.nav()?.count.textContent === "1/1");
    decide(h, "accept", after);
    await sleep(50);
    ok("intervention décidée (seule) : la revue se ferme", h.dv.isShown() === false, JSON.stringify(h.notes));
    ok("intervention décidée (seule) : compteur à 0", h.nav()?.count.textContent === "0", h.nav()?.count.textContent);
    ok("intervention décidée (seule) : message « Toutes les modifications sont acceptées »",
      h.notes.some((note) => /Toutes les modifications sont acceptées/.test(note)), JSON.stringify(h.notes));
    ok("intervention décidée (seule) : l'éditeur est rendu (readOnly false)", h.cm._options.readOnly === false,
      JSON.stringify(h.cm._options));
  }

  // 3. « Ignorer » le dernier bloc : le texte revient à la base, plus aucun
  // bloc → l'intervention est décidée elle aussi.
  {
    const before = "aa bb cc\n", after = "aa XX cc\n";
    const h = makeModuleHarness({ individualReview: true });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = after; h.dv.push(before, after);
    await sleep(50);
    h.tag.onclick();
    h.cm.decideMergeChunk = (kind) => ({ kind, current: h.cm.getValue(), text: before, base: before });
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false, code: "Backspace", key: "Backspace" });
    await sleep(50);
    ok("intervention décidée (refus) : le fichier est restauré", h.restored.at(-1) === before, JSON.stringify(h.restored));
    ok("intervention décidée (refus) : la revue se ferme, compteur à 0",
      h.dv.isShown() === false && h.nav()?.count.textContent === "0", JSON.stringify({ count: h.nav()?.count.textContent, notes: h.notes }));
    ok("intervention décidée (refus) : message « décidées », pas « acceptées »",
      h.notes.at(-1) === "Toutes les modifications sont décidées", JSON.stringify(h.notes));
  }

  // 4. Seule intervention, dernière décision : le toast Annuler reste offert
  // après la fermeture automatique et l'annulation rouvre la revue.
  {
    const before = "aa bb cc\n", after = "aa XX cc\n";
    const h = makeModuleHarness({ individualReview: true });
    const host = fakeReviewHost();
    h.cm.getWrapperElement = () => ({ parentElement: host });
    h.cm.hasNativeMergeDiff = true;
    h.cm.showMergeDiff = onePoint;
    h.cm._v = after; h.dv.push(before, after);
    await sleep(50);
    h.tag.onclick();
    decide(h, "accept", after);
    await sleep(50);
    const undo = host._children.find((c) => c && c.id === "diffUndo");
    ok("intervention décidée (seule) : toast Annuler offert après la fermeture", h.dv.isShown() === false && !!undo && undo.hidden === false,
      String(undo && undo.hidden));
    await undo.onclick();
    await sleep(50);
    ok("intervention décidée (seule, annulation) : la revue rouvre sur l'intervention (1/1)",
      h.dv.isShown() === true && h.nav()?.count.textContent === "1/1", JSON.stringify({ count: h.nav()?.count.textContent, notes: h.notes }));
    ok("intervention décidée (seule, annulation) : review:null journalisé",
      reviewOps(h).some((op) => op.review === null), JSON.stringify(reviewOps(h)));
    h.tag.onclick();
  }
}

// ------------------------------------------------ toast Annuler (transitoire)
// Symptôme (Thierry 2026-09-11) : après « Garder », le bouton « Annuler »
// restait affiché. Contrat : il s'efface au bout de UNDO_GRACE_MS, à la
// navigation vers une autre intervention et à la fermeture de la revue.
async function undoToastTests() {
  const onePoint = () => [{ pos: { line: 0, ch: 0 }, ch: 0 }];
  const base = "aa bb cc\n", mid = "aa XX cc\n", last = "aa XX cc dd\n";
  const h = makeModuleHarness({ individualReview: true });
  const host = fakeReviewHost();
  h.cm.getWrapperElement = () => ({ parentElement: host });
  h.cm.hasNativeMergeDiff = true;
  h.cm.showMergeDiff = onePoint;
  h.cm._v = mid; h.dv.push(base, mid);
  h.cm._v = last; h.dv.push(mid, last);
  await sleep(50);
  h.tag.onclick();
  const decidePartial = () => {
    // base ajustée ≠ texte vivant : l'intervention reste, le toast s'affiche
    h.cm.decideMergeChunk = (kind) => ({ kind, current: h.cm.getValue(), text: h.cm.getValue(), base: "aa XX cc\n" });
    h.fireKeydown({ altKey: true, metaKey: false, ctrlKey: false, code: "Enter", key: "Enter" });
  };
  decidePartial();
  await sleep(50);
  const undo = host._children.find((c) => c && c.id === "diffUndo");
  ok("toast Annuler : visible après une décision", !!undo && undo.hidden === false, JSON.stringify({ undo: !!undo, hidden: undo?.hidden }));
  const pending = [...h.timers.values()].filter((t) => t.d >= 1000);
  ok("toast Annuler : une minuterie d'effacement est armée (≥ 1 s, ≤ 10 s)",
    pending.length === 1 && pending[0].d <= 10000, JSON.stringify([...h.timers.values()].map((t) => t.d)));
  // Une re-décision avant l'échéance ré-arme UNE minuterie (pas d'accumulation).
  decidePartial();
  await sleep(50);
  ok("toast Annuler : une nouvelle décision ré-arme une seule minuterie",
    [...h.timers.values()].filter((t) => t.d >= 1000).length === 1 && undo.hidden === false,
    JSON.stringify([...h.timers.values()].map((t) => t.d)));
  h.runTimers();
  ok("toast Annuler : caché après le délai", undo.hidden === true, String(undo.hidden));
  // Après l'échéance, un rendu ou une mise à jour de la barre ne le ré-affiche pas.
  h.nav().prev.onclick(); h.nav().next.onclick();
  ok("toast Annuler : la navigation ne le ré-affiche pas", undo.hidden === true, String(undo.hidden));

  // Navigation vers une autre intervention : caché avant le délai.
  decidePartial();
  await sleep(50);
  ok("toast Annuler : visible à nouveau après une décision", undo.hidden === false);
  h.nav().prev.onclick(); // showStep(0)
  ok("toast Annuler : caché à la navigation (‹)", undo.hidden === true, String(undo.hidden));
  ok("toast Annuler : la minuterie est désarmée à la navigation", [...h.timers.values()].every((t) => t.d < 1000),
    JSON.stringify([...h.timers.values()].map((t) => t.d)));
  h.nav().next.onclick(); // retour sur la dernière (2/2)

  // Fermeture de la revue : caché avant le délai.
  decidePartial();
  await sleep(50);
  ok("toast Annuler : visible avant fermeture", undo.hidden === false);
  h.tag.onclick(); // toggle(false)
  ok("toast Annuler : caché à la fermeture", undo.hidden === true, String(undo.hidden));
  ok("toast Annuler : aucune minuterie résiduelle après fermeture", [...h.timers.values()].every((t) => t.d < 1000),
    JSON.stringify([...h.timers.values()].map((t) => t.d)));
}

// -------------------------------------------------------------------- run all
try {
  await serverTests();
  await moduleTests();
  await readingMarksTests();
  editorCallSiteTests();
  commitComposerContractTests();
  await latexStudioTests();
  await timelineTests();
  await individualReviewCardTests();
  await durableReviewTests();
  await reviewCompletionTests();
  await undoToastTests();
  if (CONTRACT_FAILURES.length)
    throw new Error(`${CONTRACT_FAILURES.length} explicit intervention contract assertion(s) failed`);
  console.log(`diff suite: ok (${passed} tests)`);
  console.log(`diff suite: todo (${TODOS.length})`);
} catch (e) {
  console.error(String(e.message || e));
  console.error(`diff suite: ÉCHEC après ${passed} tests verts`);
  console.log(`diff suite: todo (${TODOS.length})`);
  process.exit(1);
}
