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
function ok(name, cond, detail) {
  if (cond) { passed++; return; }
  console.error(`✗ ${name}${detail ? " — " + detail : ""}`);
  process.exitCode = 1;
  throw new Error(`test failed: ${name}`);
}

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
function makeModuleHarness({ headText = null, serverItems = [], serverLast = null, headTs = 0 } = {}) {
  const el = () => {
    const e = { style: {}, classList: { toggle() {}, contains: () => false }, appendChild() {}, insertBefore() {},
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
      body: { appendChild() {} }, addEventListener() {}, querySelector: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: (u, opts) => {
      const url = String(u);
      if (url.startsWith("/githead"))
        return headText === null
          ? Promise.resolve({ json: () => Promise.resolve({ ok: false }) })
          : Promise.resolve({ json: () => Promise.resolve({ ok: true, text: headText, sha: "abc1234", ts: headTs }) });
      if (url.startsWith("/versions") && opts && opts.method === "POST") {
        posts.push(JSON.parse(opts.body));
        return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
      }
      if (url.startsWith("/versions"))
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, items: serverItems, last: serverLast }) });
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
  group.insertBefore = (n) => { if (n && n.id === "dvNav") navPill = n; };
  const dv = ctx.window.DiffVersions({
    getCm: () => cm, path: "/x/m.tex", notify: (m) => notes.push(m),
    els: { tag, prev: null, next: null, restore: null, group },
    restoreText: async () => {},
  });
  const nav = () => navPill && {
    prev: navPill.querySelector('[data-d="-1"]'),
    next: navPill.querySelector('[data-d="1"]'),
    count: navPill.querySelector(".dvNavC"),
  };
  return { ctx, cm, dv, tag, notes, marksLog, gutterLog, posts, nav };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // B6. persistance : push → POST serveur {items,last} ; restore serveur → versions
  {
    const h = makeModuleHarness({ headText: "base\n" });
    h.cm._v = "base MODIFIEE\n";
    h.dv.push("base\n", "base MODIFIEE\n");
    await sleep(30);
    const p = h.posts[h.posts.length - 1];
    ok("persist POST items+last", p && p.items.length === 1 && p.last === "base MODIFIEE\n", JSON.stringify(p));
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
  await latexStudioTests();
  await timelineTests();
  console.log(`diff suite: ok (${passed} tests)`);
} catch (e) {
  console.error(String(e.message || e));
  console.error(`diff suite: ÉCHEC après ${passed} tests verts`);
  process.exit(1);
}
