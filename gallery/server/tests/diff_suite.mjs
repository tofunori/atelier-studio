// Suite de tests de la mécanique diff/versions/rewrap de l'éditeur.
// Verrouille les 9 corrections de la passe de solidification (2026-07-08) :
// toute régression future doit être attrapée ICI avant le build.
//
//   node gallery/server/tests/diff_suite.mjs   → « diff suite: ok (N tests) »
//
// Trois étages :
//   A. endpoints serveur réels (dépôt git temporaire, serveur spawné)
//   B. module diff_versions.js réel (harnais VM, stubs CodeMirror/DOM)
//   C. fonctions extraites de latex_studio.html (rewrap, texcFind)
// Aucun appel réseau externe, aucun appel IA — < 30 s.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

todo("restore from an intervention", "Lock the intervention count after restoring a saved step.");
todo("restore from an external commit", "Lock the intervention count after restoring Git history.");

const INTERVENTION_SOURCES = new Set([
  "user-save", "external-reload", "external-merge", "external-conflict", "restore", "legacy",
]);
const INTERVENTION_STATUSES = new Set(["applied", "pending-conflict"]);

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
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
  const srv = spawn(process.execPath, [path.join(GALLERY, "server", "main.mjs")], {
    env: { ...process.env, FIG_PORT: String(port), GALLERY_ROOT: repo },
    stdio: "ignore",
  });
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

    // /versions : write → read (persistance serveur des versions)
    r = await j("/versions", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, items: [{ b: "avant", t: 42 }], last: "dernier connu" }) });
    ok("versions POST", r.ok);
    r = await j("/versions" + q);
    ok("versions GET", r.ok && r.items.length === 1 && r.items[0].b === "avant" && r.last === "dernier connu");

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
  headTs = 0,
  filePath = "/x/m.tex",
} = {}) {
  const el = () => {
    const e = { style: {}, classList: { toggle() {}, contains: () => false }, _children: [],
      appendChild(n) { e._children.push(n); return n; }, insertBefore(n) { e._children.push(n); return n; },
      querySelectorAll: () => [], addEventListener() {}, dataset: {}, disabled: false,
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
  const posts = [];
  const body = el();
  const storage = new Map();
  if (localState !== null) storage.set("texDiffV1:" + filePath, JSON.stringify(localState));
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
    setValue(v) { cm._v = v; },
    getOption() { return false; },
    setBookmark(pos, o) { marksLog.push({ type: "del", idx: pos._idx, text: o.widget._t }); return { clear() {} }; },
    markText(f, t) { marksLog.push({ type: "add", from: f._idx, to: t._idx }); return { clear() {} }; },
    setOption() {}, on() {}, operation(f) { f(); },
    clearGutter() { gutterLog.length = 0; },
    setGutterMarker(line, g, cell) { gutterLog.push({ line, html: cell._h }); },
    scrollIntoView() {}, refresh() {}, setCursor() {}, addLineClass() {}, removeLineClass() {},
  };
  const ctx = {
    window: {}, console, Date, JSON, Math, Infinity,
    document: { getElementById: () => null, createElement: el, head: { appendChild() {} },
      body, addEventListener() {}, querySelector: () => null },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    fetch: (u, opts) => {
      const url = String(u);
      if (url.startsWith("/githead"))
        return activeHead.text === null
          ? Promise.resolve({ json: () => Promise.resolve({ ok: false }) })
          : Promise.resolve({ json: () => Promise.resolve({ ok: true, text: activeHead.text, sha: activeHead.sha, ts: activeHead.ts }) });
      if (url.startsWith("/versions") && opts && opts.method === "POST") {
        posts.push(JSON.parse(opts.body));
        return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
      }
      if (url.startsWith("/versions"))
        return versionsPromise
          ? versionsPromise.then((value) => ({ json: () => Promise.resolve(value) }))
          : Promise.resolve({ json: () => Promise.resolve(serverState || { ok: true, items: serverItems, last: serverLast }) });
      if (url.startsWith("/gitlog"))
        return Promise.resolve({ json: () => Promise.resolve({ok: true, items: []}) });
      return new Promise(() => {});
    },
    setInterval(f) { ctx.__tick = f; return 1; }, clearInterval() {},
    setTimeout(f, d) { if (f && (d === undefined || d <= 400)) f(); return 0; }, clearTimeout() {},
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ASSETS, "diff.min.js"), "utf8"), ctx);
  ctx.Diff = ctx.window.Diff || ctx.Diff;
  vm.runInContext(fs.readFileSync(path.join(ASSETS, "diff_versions.js"), "utf8"), ctx);
  const notes = [];
  const tag = el();
  // groupe qui capture le navPill inséré par ensureNavUi (timeline ‹ k/N ›)
  const group = el();
  let navPill = null;
  group.insertBefore = (n) => { group._children.push(n); if (n && n.id === "dvNav") navPill = n; };
  const dv = ctx.window.DiffVersions({
    getCm: () => cm, path: filePath, notify: (m) => notes.push(m),
    els: { tag, prev: null, next: null, restore: null, group },
    restoreText: async () => {},
  });
  const nav = () => navPill && {
    prev: navPill.querySelector('[data-d="-1"]'),
    next: navPill.querySelector('[data-d="1"]'),
    count: navPill.querySelector(".dvNavC"),
  };
  const historyButton = () => group._children.find((child) => child && child.id === "dvHist") || null;
  const historyRows = () => {
    const pop = body._children.find((child) => child?._q?.["#dvHistList"]);
    return pop?._q?.["#dvHistList"]?._children || [];
  };
  const setHead = (text, ts, sha = activeHead.sha) => Object.assign(activeHead, { text, ts, sha });
  return { ctx, cm, dv, tag, notes, marksLog, gutterLog, posts, nav, storage, setHead,
    historyButton, historyRows };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assertPersistedInterventions(name, h, expected, expectedLegacy = []) {
  const payload = h.posts[h.posts.length - 1];
  const actual = payload && payload.interventions;
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

  // B6. persistance transitoire v2 côté client ; le serveur durable reste v1
  // jusqu'au plan 028.
  {
    const h = makeModuleHarness({ headText: "base\n" });
    h.cm._v = "base MODIFIEE\n";
    h.dv.push("base\n", "base MODIFIEE\n");
    await sleep(30);
    const p = h.posts[h.posts.length - 1];
    ok("persist POST v2 interventions+last", p && p.v === 2
      && p.interventions.length === 1
      && p.interventions[0].before === "base\n"
      && p.interventions[0].after === "base MODIFIEE\n"
      && Array.isArray(p.legacySnapshots)
      && p.last === "base MODIFIEE\n", JSON.stringify(p));
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

  // B11b. `restore` appartient au contrat du journal, sans activer les deux
  // parcours UI Rétablir qui restent explicitement TODO jusqu'au plan 028.
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
    contractOk("rewrap visuel de prose : aucune intervention", h.nav() === null, JSON.stringify(h.posts));
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

  // B14. Le serveur durable reste v1 pendant la transition : une réponse v1
  // vide ne doit pas masquer le journal v2 plus riche du localStorage.
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
    const saved = h.posts[h.posts.length - 1]?.interventions || [];
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
    const saved = h.posts[h.posts.length - 1]?.interventions || [];
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
    const saved = h.posts[h.posts.length - 1]?.interventions || [];
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
    const saved = h.posts[h.posts.length - 1]?.interventions || [];
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
    const saved = h.posts[h.posts.length - 1]?.interventions || [];
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
    const payload = h.posts[h.posts.length - 1];
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
    const saved = h.posts[h.posts.length - 1]?.interventions || [];
    contractOk("push pendant GET ignore la reponse stale sans doublon ni inversion",
      count === "tout · 1" && saved.length === 2
        && saved[0].before === base && saved[0].after === edited
        && saved[1].before === edited && saved[1].after === final,
      JSON.stringify({count, saved}));
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
    const saved = h.posts[h.posts.length - 1]?.interventions || [];
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
      h.posts[h.posts.length - 1]?.interventions?.length === 1,
      JSON.stringify(h.posts));
  }
  {
    const before = "Paragraphe terminal.\n";
    const after = "Paragraphe terminal.\n\n";
    const h = makeModuleHarness({filePath: "/x/trailing.tex", headText: before});
    h.cm._v = after;
    h.dv.push(before, after, {source: "user-save", status: "applied"});
    contractOk("ligne blanche terminale LaTeX significative",
      h.posts[h.posts.length - 1]?.interventions?.length === 1,
      JSON.stringify(h.posts));
  }
  {
    const h = makeModuleHarness({filePath: "/x/final-newline.tex", headText: "Texte sans retour"});
    h.cm._v = "Texte sans retour\n";
    h.dv.push("Texte sans retour", "Texte sans retour\n", {source: "user-save", status: "applied"});
    contractOk("artefact du retour terminal unique reste ignorable", h.posts.length === 0, JSON.stringify(h.posts));
  }

  // B19. La première base Git d'une session est immuable : un HEAD plus récent
  // peut rafraîchir la gouttière, pas rétrécir la timeline ni changer `tout`.
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
    h.setHead(s1, now + 60, "newhead");
    h.cm._v = s2;
    h.dv.push(s1, s2, {source: "user-save", status: "applied"});
    await sleep(0); await sleep(0);
    h.tag.onclick();
    const count = h.nav()?.count.textContent;
    const note = h.notes[h.notes.length - 1] || "";
    contractOk("base Git de session immuable malgre HEAD ulterieur",
      count === "tout · 2" && /· 2 modifications /.test(note),
      JSON.stringify({count, note}));
  }
}

// --------------------------------------- C. fonctions extraites de latex_studio
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
  const call = new RegExp(
    `${reEscape(callee)}\\s*\\(\\s*${reEscape(before)}\\s*,\\s*${reEscape(after)}\\s*,\\s*(\\{[^{}]*\\})\\s*\\)`,
  ).exec(block);
  if (!call) return false;
  return new RegExp(`\\bsource\\s*:\\s*["']${reEscape(source)}["']`).test(call[1])
    && new RegExp(`\\bstatus\\s*:\\s*["']${reEscape(status)}["']`).test(call[1]);
}

function editorCallSiteTests() {
  const specs = [
    {
      name: "latex_studio",
      src: fs.readFileSync(path.join(ASSETS, "latex_studio.html"), "utf8"),
      callee: "diffPush",
      saveEnd: "// Preflight",
      watcherStart: "// L'agent modifie le .tex sur le disque",
    },
    {
      name: "code_editor",
      src: fs.readFileSync(path.join(ASSETS, "code_editor.html"), "utf8"),
      callee: "__dv.push",
      saveEnd: "document.addEventListener(\"keydown\"",
      watcherStart: "// L'agent modifie le fichier sur le disque",
    },
  ];

  for (const spec of specs) {
    const save = sourceBlock(spec.src, "async function save(){", spec.saveEnd, `${spec.name} save`);
    const watcher = sourceBlock(spec.src, spec.watcherStart, "}, 2000);", `${spec.name} external watcher`);
    contractOk(`${spec.name} call site user-save/applied`,
      callCarriesMeta(save, spec.callee, "lastSavedText", "savedNow", "user-save", "applied"));
    contractOk(`${spec.name} call site external-reload/applied`,
      callCarriesMeta(watcher, spec.callee, "before", "diskText", "external-reload", "applied"));
    contractOk(`${spec.name} call site external-merge/applied`,
      callCarriesMeta(watcher, spec.callee, "beforePush", "diskText", "external-merge", "applied"));
    contractOk(`${spec.name} call site external-conflict/pending-conflict`,
      callCarriesMeta(watcher, spec.callee, "base", "diskText", "external-conflict", "pending-conflict"));
    contractOk(`${spec.name} effectivelyClean utilise la politique DiffVersions`,
      /__dv\.isEquivalent\s*\(\s*cm\.getValue\(\)\s*,\s*lastSavedText\s*\)/.test(watcher));
  }

  const latex = specs[0].src;
  contractOk("latex_studio diffPush forwards meta to DiffVersions.push",
    /const\s+diffPush\s*=\s*\(\s*before\s*,\s*after\s*,\s*meta\s*\)\s*=>\s*__dv\.push\s*\(\s*before\s*,\s*after\s*,\s*meta\s*\)/.test(latex));
}

async function latexStudioTests() {
  const src = fs.readFileSync(path.join(ASSETS, "latex_studio.html"), "utf8");

  // C1. rewrap : structure intacte, commentaires jamais fusionnés, prose refluée
  {
    const code = extract(src, /function rewrapCol\(\)/, "window.__rewrapAll = rewrapAll;", "bloc rewrap")
      .replace(/document\.addEventListener\("keydown"[\s\S]*?\}, true\);/, "")
      .replace(/document\.getElementById\("rewrapBtn"\).*\n/, "");
    const run = (linesArr, IS_TEX = true, col = "50", ext) => {
      let lines = [...linesArr];
      const cm = {
        lineCount: () => lines.length, getLine: (i) => lines[i],
        operation: (f) => f(), getCursor: () => ({ line: 0, ch: 0 }), setCursor() {},
        replaceRange(txt, from, to) { lines.splice(from.line, to.line - from.line + 1, ...txt.split("\n")); },
        getGutterElement: () => ({ offsetWidth: 40 }), getWrapperElement: () => ({ clientWidth: 600 }),
        defaultCharWidth: () => 8, somethingSelected: () => false, focus() {},
      };
      const w = {};
      new Function("cm", "wrapSel", "setState", "window", "IS_TEX", "__EXT", "document", code + "; return window.__rewrapAll;")(
        cm, { value: col }, () => {}, w, IS_TEX, ext ?? (IS_TEX ? "tex" : "py"),
        { addEventListener() {}, getElementById: () => ({ onclick: null }) },
      )();
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
    const code = extract(src, /function texPreflight\(text\)/, "\n}", "texPreflight");
    const pf = new Function(code + "; return texPreflight;")();
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
    const block = src.slice(src.indexOf("let __lastEditAt = 0"),
      src.indexOf("__fwdT = setTimeout(() => synctexView(true), 350);") + 60);
    let now = 100000, calls = [], timers = [], cursorLine = 5;
    const flush = () => { const t = timers; timers = []; t.forEach((f) => f()); };
    const right = { style: { display: "" }, classList: { _s: new Set(), contains(c) { return this._s.has(c); } } };
    const api = new Function(
      "cm", "isPdfMode", "pdfDoc", "document", "Date", "setTimeout", "clearTimeout", "synctexView",
      block + "; return {autoForwardSync,pdfPaneVisible,setEdit:(t)=>{__lastEditAt=t}};",
    )(
      { getCursor: () => ({ line: cursorLine }) }, false, {}, { getElementById: () => right },
      { now: () => now }, (fn) => timers.push(fn), () => {}, (s) => calls.push(s),
    );
    now = 100000; api.setEdit(0); cursorLine = 5; calls = []; api.autoForwardSync(); flush();
    ok("autosync : navigation → forward silencieux", calls.length === 1 && calls[0] === true);
    calls = []; api.autoForwardSync(); flush();
    ok("autosync : même ligne → pas de re-sync", calls.length === 0);
    cursorLine = 8; api.setEdit(now - 100); calls = []; api.autoForwardSync(); flush();
    ok("autosync : frappe en cours → pas de sync", calls.length === 0);
    cursorLine = 9; api.setEdit(now - 500); calls = []; api.autoForwardSync(); flush();
    ok("autosync : navigation après pause → sync", calls.length === 1);
    right.style.display = "none"; cursorLine = 12; api.setEdit(0); calls = []; api.autoForwardSync(); flush();
    ok("autosync : PDF caché → pas de sync", calls.length === 0);
    right.style.display = ""; right.classList._s.add("reading"); cursorLine = 15; calls = []; api.autoForwardSync(); flush();
    ok("autosync : mode lecture → pas de sync", calls.length === 0);
  }

  // C2. texcFind : ré-ancrage exact + normalisé aux blancs
  {
    const code = extract(src, /function texcFind\(doc, c\)/, "\n}", "texcFind");
    const doc = "aaa\ntemperature moyenne\nbeta ensuite\nccc temperature moyenne beta fin\n";
    const cm = {
      indexFromPos: () => 0,
      posFromIndex: (i) => ({ _idx: i }),
    };
    const fn = new Function("cm", code + "; return texcFind;")(cm);
    let r = fn(doc, { text: "temperature moyenne beta", from: { line: 0, ch: 0 } });
    ok("texcFind normalisé : trouvé à cheval sur \\n", r && doc.slice(r.from._idx, r.to._idx).replace(/\s+/g, " ") === "temperature moyenne beta",
      JSON.stringify(r));
    r = fn(doc, { text: "introuvable dans le doc", from: { line: 0, ch: 0 } });
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

// -------------------------------------------------------------------- run all
try {
  await serverTests();
  await moduleTests();
  editorCallSiteTests();
  await latexStudioTests();
  await timelineTests();
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
