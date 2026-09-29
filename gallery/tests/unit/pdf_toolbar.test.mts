import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html = fs.readFileSync(new URL("../../assets/pdf_viewer.html", import.meta.url), "utf8");

test("barre unique : les outils de marquage ont le gabarit des autres boutons (26×24, icône 14)", () => {
  assert.match(html, /\.pdf-mark-tools button\{width:26px;height:24px;/);
  assert.match(html, /\.pdf-mark-tools svg\{width:14px;height:14px;/);
  assert.match(html, /\.pdf-current-color\{width:12px;height:12px;border-radius:999px;/);
  assert.doesNotMatch(html, /\.pdf-mark-tools button\{[^}]*32px/, "plus de boutons à 32 px");
  assert.doesNotMatch(html, /pdf-mark-color\{[^}]*border:7px/, "plus de pastille bordée de 7 px");
});

test("outil actif en graphite : fond --card2 et icône --txt, jamais l'accent", () => {
  assert.match(html, /\.pdf-mark-tools button\[aria-pressed="true"\]\{background:var\(--card2,#2c313a\);color:var\(--txt,#dadee3\)\}/);
  assert.match(html, /header button\[aria-pressed="true"\]\{background:#2c313a !important;color:var\(--txt\) !important\}/);
  assert.match(html, /header\.pdf-compact-toolbar button\[aria-pressed="true"\] \{ background:var\(--card2\)!important; color:var\(--txt\)!important; \}/);
  assert.doesNotMatch(html, /pdf-mark-tools button\[aria-pressed="true"\]\{[^}]*--accent/);
});

test("mode intégré : une seule rangée de 44 px, sans retour à la ligne ni override 32 px", () => {
  const emb = html.slice(html.indexOf("if(window.self !== window.top){\n  const st = document.createElement(\"style\")"));
  const style = emb.slice(0, emb.indexOf("document.head.appendChild(st)"));
  assert.match(style, /header\{flex-wrap:nowrap !important;height:44px !important;min-height:44px !important/);
  assert.doesNotMatch(style, /flex-wrap:wrap/);
  assert.doesNotMatch(style, /\.pdf-mark-tools button\{padding:7px/);
  assert.doesNotMatch(style, /border:7px solid/);
  assert.match(style, /header \.zoomctl button\{padding:3px 8px/);
});

test("pastille de couleur sans flèche, palette au modèle de menu commun", () => {
  assert.match(html, /colorToggle\.innerHTML = '<span class="pdf-current-color"><\/span>';/);
  assert.doesNotMatch(html, /pdf-current-color"><\/span><span aria-hidden="true">⌄/);
  assert.match(html, /gap:8px !important;overflow:visible\}/, "le popover des couleurs ne doit pas être coupé par l'en-tête");
  const pop = html.match(/\n\.pdf-tool-pop\{([^}]*)\}/);
  assert.ok(pop, "règle .pdf-tool-pop introuvable");
  assert.doesNotMatch(pop[1], /\bborder:/, "une surface élevée n'a pas de bordure");
  assert.match(pop[1], /border-radius:10px/);
  assert.match(pop[1], /box-shadow:var\(--elev/);
  assert.match(html, /\.pdf-mark-tools\.palette-open \.pdf-mark-colors,\.pdf-mark-tools\.stamps-open \.pdf-stamp-menu\{display:flex;/);
  // Bascule explicite (booléen) et état exposé aux lecteurs d'écran : le
  // bouton de couleur porte aria-expanded/aria-controls vers la palette.
  assert.match(html, /bar\.classList\.toggle\("palette-open", open\)/);
  assert.match(html, /colorToggle\.setAttribute\("aria-expanded", String\(open\)\)/);
  assert.match(html, /colorToggle\.setAttribute\("aria-controls", "pdf-color-palette"\)/);
  assert.match(html, /palette\.id="pdf-color-palette"/);
  assert.match(html, /button\.classList\.add\("pdf-mark-pen"\)/);
  assert.match(html, /bar\.style\.setProperty\("--mark-current"/);
});

test("Zone et Gomme dans la barre ; en fenêtre étroite, les outils repartent dans ⋯", () => {
  assert.match(html, /marks\.insertBefore\(areaBtn, marks\.querySelector\("\.pdf-mark-sep-end"\)\)/);
  assert.doesNotMatch(html, /\["areaBtn", "invBtn", "readBtn", "compileBtn"\]\.forEach\(id => move\(id, menu\)\)/);
  assert.match(html, /@media\(max-width:620px\) \{[^}]*#areaBtn[^}]*\[data-t="erase"\]/);
  assert.match(html, /@media\(max-width:560px\) \{[^}]*\[data-tool="note"\][^}]*\[data-tool="text"\][^}]*\[data-tool="stamp"\]/);
});

test("système de design : transitions ≤ 150 ms et reduced-motion sur la barre de marquage et les objets posés", () => {
  const start = html.indexOf("/* Marquage : MÊME gabarit");
  const block = html.slice(start, html.indexOf("#selPill .hlbar{display:none!important}"));
  for (const m of block.matchAll(/(?:transition|animation):[^;}]*?(\d+)ms/g)) assert.ok(Number(m[1]) <= 150, m[0]);
  assert.match(block, /@media \(prefers-reduced-motion:reduce\)\{\.pdf-mark-tools button\{transition:none\}/);
  const page = html.slice(html.indexOf("/* Objets posés sur la page"), html.indexOf("#sendBtn{"));
  for (const m of page.matchAll(/(?:transition|animation):[^;}]*?(\d+)ms/g)) assert.ok(Number(m[1]) <= 150, m[0]);
  assert.match(page, /prefers-reduced-motion: reduce\)\{ \.pg \.pdfnote/);
  // tailles de texte du système uniquement dans la barre de mise en forme
  for (const m of page.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)) assert.ok([10, 11, 12, 13, 15].includes(Number(m[1])), m[0]);
});

test("note libre : pastille graphite centrée sur le point cliqué, sans ambre codé en dur", () => {
  assert.match(html, /\.pg \.pdfnote\{[^}]*transform:translate\(-50%,-50%\)/);
  assert.match(html, /\.pg \.pdfnote\{[^}]*background:var\(--pin-bg\);color:var\(--pin-ink\)/);
  assert.doesNotMatch(html, /stroke="#e0b74a"/);
});
