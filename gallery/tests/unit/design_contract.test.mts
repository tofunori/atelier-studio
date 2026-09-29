import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Contrat de design des éditeurs de la galerie (iframes) : mêmes échelles que
// le shell React (CLAUDE.md, « Système de design »). Toute valeur hors échelle
// doit être une exception listée ici, avec sa raison — jamais une valeur locale.

const GALLERY = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(GALLERY, rel), "utf8");

// Feuilles et pages « chrome » (hors contenu utilisateur).
const CHROME_FILES = [
  "assets/gallery_template.html",
  "assets/latex_studio.css",
  "assets/latex_studio.html",
  "assets/pdf_viewer.html",
  "assets/code_editor.css",
  "assets/code_editor.html",
  "assets/md_viewer.css",
  "assets/md_viewer.html",
  "assets/md_studio.html",
  "assets/svg_viewer.html",
  "assets/csv_table.css",
  "assets/diff_viewer.html",
  "assets/latex_cm6.html",
  "assets/annotation_ui.css",
  "assets/scrollbars.css",
  "assets/gallery_viewer_toolbar.css",
  "assets/pdf_reading.css",
];

// Sources TS qui injectent du CSS de chrome (les pages HTML ci-dessus en
// reçoivent la sortie compilée dans leurs créneaux data-atelier-source, que
// l'on retire pour ne vérifier que la source).
function tsSources(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const ent of fs.readdirSync(path.join(GALLERY, rel), { withFileTypes: true })) {
      const child = rel + "/" + ent.name;
      if (ent.isDirectory()) walk(child);
      else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".d.ts")) out.push(child);
    }
  };
  walk("src/browser");
  walk("src/studio");
  return out.sort();
}

// Barre de sélection partagée (createSelectionActions) : hors périmètre de ce
// contrat, elle a son propre dessin verrouillé ailleurs.
const OUT_OF_SCOPE_SELECTOR = /\.atelier-selection|\.atelier-capsule/;

// Rayon 2px : réservé aux surlignages de texte et micro-marqueurs, listés par
// sélecteur (fichier → sélecteurs exacts).
const RADIUS_2PX: Record<string, string[]> = {
  "assets/gallery_template.html": [
    ".card.sel2::after", // barre de sélection 2px en bord de carte
  ],
  "assets/latex_studio.css": [
    // surlignages de mots du diff
    ".cm-editor.cm-merge-b .cm-changedText,.cm-editor .cm-insertedLine",
    ".cm-editor.cm-merge-a .cm-changedText,.cm-editor.cm-merge-b .cm-deletedText,.cm-editor .cm-deletedChunk .cm-deletedLine,.cm-editor .cm-deletedChunk .cm-deletedText",
    ".cm-editor.cm-merge-b .cm-inlineChangedLine .cm-changedText",
    ".cm-editor.cm-merge-b .cm-inlineChangedLine .cm-deletedText",
    ".tr-cut::before",
    ".tr-cut-text",
    ".texc-hl.texc-comment",
    ".cm-editor .atelier-review-bracket",
  ],
  "assets/pdf_viewer.html": [
    ".pdfsel",
    ".textLayer span.auto-hl",
    ".pg .pdfhl",
    ".pdfcomment-line",
    ".textLayer span.find-hit",
    ".textLayer span.find-cur",
    ".pdfarea",
  ],
  "assets/code_editor.css": [".CodeMirror-selectedtext", ".cm-clsel"],
  "assets/md_viewer.css": [".CodeMirror-selectedtext", ".cm-clsel"],
  "assets/svg_viewer.html": [".hbox", ".movehi", ".selbox", ".selhandle"],
  "src/browser/diff_versions.ts": [".dAddM", ".dDelW", "#dvNav canvas.dvRib"],
};

interface Rule { file: string; selector: string; body: string }

function stripComments(text: string, ts: boolean): string {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, " ");
  if (ts) t = t.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  return t;
}

function textOf(file: string): string {
  let t = read(file);
  if (file.endsWith(".html")) {
    // créneaux générés : leur source TS est vérifiée à part
    t = t.replace(/<script\b[^>]*data-atelier-source="[^"]*"[^>]*>[\s\S]*?<\/script>/g, "");
  }
  return stripComments(t, file.endsWith(".ts"));
}

// Règles « feuilles » : blocs {…} sans accolade interne. Suffisant pour du CSS
// plat, des @media imbriqués et du CSS concaténé dans des chaînes TS.
function rulesOf(file: string): Rule[] {
  const text = textOf(file);
  const rules: Rule[] = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const rawSel = m[1].split(/[;"'`+]\s*(?=[^;"'`+]*$)/).pop() || m[1];
    const selector = rawSel.replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();
    rules.push({ file, selector, body: m[2] });
  }
  // attributs style="…" (HTML et gabarits TS)
  for (const s of text.matchAll(/style="([^"]*)"/g)) rules.push({ file, selector: "[style]", body: s[1] });
  return rules.filter(r => !OUT_OF_SCOPE_SELECTOR.test(r.selector));
}

const ALL_FILES = [...CHROME_FILES, ...tsSources()];
const ALL_RULES = ALL_FILES.flatMap(rulesOf);

function decls(body: string, prop: RegExp): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(new RegExp("(?:^|[;{\\s\"'])(" + prop.source + ")\\s*:\\s*([^;}\"'`]*)", "g"))) out.push(m[2].trim());
  return out;
}

const where = (r: Rule) => `${r.file} « ${r.selector.slice(0, 90)} »`;

test("poids de police : 400 / 500 / 600 uniquement (hors @font-face)", () => {
  const bad: string[] = [];
  for (const r of ALL_RULES) {
    if (/@font-face/.test(r.selector)) continue;
    for (const v of decls(r.body, /font-weight/)) {
      if (/^(\d+|bold|bolder|lighter)$/.test(v) && !["400", "500", "600"].includes(v)) bad.push(`${where(r)} font-weight:${v}`);
    }
    for (const v of decls(r.body, /font/)) {
      const w = v.match(/^(?:italic\s+|normal\s+)?(\d{3})\s/);
      if (w && !["400", "500", "600"].includes(w[1])) bad.push(`${where(r)} font:${v}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("tailles de police en px : 10 / 11 / 12 / 13 / 15, ou 18–34 pour l'affichage", () => {
  const ok = (n: number) => [10, 11, 12, 13, 15].includes(n) || (n >= 18 && n <= 34);
  const bad: string[] = [];
  for (const r of ALL_RULES) {
    for (const v of [...decls(r.body, /font-size/), ...decls(r.body, /font/)]) {
      if (/calc\(/.test(v)) continue; // échelle dérivée de la page (tampons PDF, prose)
      for (const px of v.matchAll(/(\d+(?:\.\d+)?)px/g)) {
        if (!ok(Number(px[1]))) bad.push(`${where(r)} ${v}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("rayons : 6 / 10 / 999px ou 50 %, 2px seulement pour les exceptions listées", () => {
  const bad: string[] = [];
  const used2 = new Set<string>();
  for (const r of ALL_RULES) {
    for (const v of decls(r.body, /border(?:-top-left|-top-right|-bottom-left|-bottom-right)?-radius/)) {
      for (const px of v.matchAll(/(\d+(?:\.\d+)?)px/g)) {
        const n = Number(px[1]);
        if ([0, 6, 10, 999].includes(n)) continue;
        if (n === 2 && (RADIUS_2PX[r.file] || []).includes(r.selector)) { used2.add(r.file + " " + r.selector); continue; }
        bad.push(`${where(r)} border-radius:${v}`);
      }
    }
  }
  assert.deepEqual(bad, []);
  // la liste d'exceptions ne doit pas garder de sélecteurs morts
  const listed = Object.entries(RADIUS_2PX).flatMap(([f, sels]) => sels.map(s => f + " " + s));
  assert.deepEqual(listed.filter(k => !used2.has(k)), []);
});

test("toute étiquette en capitales porte letter-spacing .06em", () => {
  const bad: string[] = [];
  for (const r of ALL_RULES) {
    if (!decls(r.body, /text-transform/).includes("uppercase")) continue;
    const ls = decls(r.body, /letter-spacing/);
    if (!ls.some(v => /^0?\.06em$/.test(v))) bad.push(`${where(r)} letter-spacing:${ls.join(",") || "absent"}`);
  }
  assert.deepEqual(bad, []);
});

test("tout contour :focus-visible utilise le jeton d'anneau du shell", () => {
  const RING = /^var\(--focus-ring-width,\s*1px\)\s+solid\s+var\(--focus-ring-color,\s*var\(--accent\)\)$/;
  const OFFSET = /^(?:var\(--focus-ring-offset,\s*1px\)|calc\(-1\s*\*\s*var\(--focus-ring-offset,\s*1px\)\))$/;
  const bad: string[] = [];
  let seen = 0;
  for (const r of ALL_RULES) {
    if (!/:focus-visible/.test(r.selector)) continue;
    const outlines = decls(r.body, /outline/).filter(v => !/^(none|0)$/.test(v));
    if (!outlines.length) continue;
    seen++;
    for (const v of outlines) if (!RING.test(v)) bad.push(`${where(r)} outline:${v}`);
    const offs = decls(r.body, /outline-offset/);
    if (!offs.length || !offs.every(v => OFFSET.test(v))) bad.push(`${where(r)} outline-offset:${offs.join(",") || "absent"}`);
  }
  assert.ok(seen > 20, `trop peu de règles :focus-visible trouvées (${seen}) — l'analyse a-t-elle cassé ?`);
  assert.deepEqual(bad, []);
});

test("l'infobulle commune est chargée partout où le pont de thème l'est, et dans la galerie", () => {
  const pages = fs.readdirSync(path.join(GALLERY, "assets")).filter(f => f.endsWith(".html"));
  const missing: string[] = [];
  for (const page of pages) {
    const html = read("assets/" + page);
    const loadsTheme = /<script\b[^>]*src="[^"]*atelier_theme\.js[^"]*"/.test(html);
    const loadsTip = /<script\b[^>]*src="[^"]*atelier_tooltip\.js[^"]*"/.test(html);
    if ((loadsTheme || page === "gallery_template.html") && !loadsTip) missing.push(page);
  }
  assert.deepEqual(missing, []);
  const sources = JSON.parse(fs.readFileSync(new URL("../../../scripts/typescript-sources.json", import.meta.url), "utf8"));
  assert.ok(JSON.stringify(sources).includes("atelier_tooltip.ts"), "atelier_tooltip.ts absent de scripts/typescript-sources.json");
  assert.ok(fs.existsSync(path.join(GALLERY, "assets/atelier_tooltip.js")), "assets/atelier_tooltip.js non généré");
});
