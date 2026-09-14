import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html = fs.readFileSync(new URL("../../assets/pdf_viewer.html", import.meta.url), "utf8");

test("barre unique : les outils de marquage ont le gabarit des autres boutons (26×24, icône 14, pastille 12)", () => {
  assert.match(html, /\.pdf-mark-tools button\{width:26px;height:24px;/);
  assert.match(html, /\.pdf-mark-tools svg\{width:14px;height:14px;/);
  assert.match(html, /\.pdf-mark-tools \.pdf-mark-color\{width:12px;height:12px;/);
  assert.doesNotMatch(html, /\.pdf-mark-tools button\{[^}]*32px/, "plus de boutons à 32 px");
  assert.doesNotMatch(html, /pdf-mark-color\{[^}]*border:7px/, "plus de pastille bordée de 7 px");
});

test("mode intégré : une seule rangée de 44 px, sans retour à la ligne ni override 32 px", () => {
  const emb = html.slice(html.indexOf("if(window.self !== window.top){\n  const st = document.createElement(\"style\")"));
  const style = emb.slice(0, emb.indexOf("document.head.appendChild(st)"));
  assert.match(style, /header\{flex-wrap:nowrap !important;height:44px !important;min-height:44px !important/);
  assert.doesNotMatch(style, /flex-wrap:wrap/);
  assert.doesNotMatch(style, /\.pdf-mark-tools button\{padding:7px/);
  assert.doesNotMatch(style, /border:7px solid/);
  assert.match(style, /header \.zoomctl button\{padding:3px 8px/);
  assert.match(style, /header button\[aria-pressed="true"\]\{background:#2c313a !important;color:var\(--accent/);
});

test("fenêtre étroite : la palette se replie dans le stylo et s'ouvre en popover", () => {
  assert.match(html, /@media \(max-width:720px\)\{\s*\.pdf-mark-tools \.pdf-mark-pen\[aria-pressed="true"\]::after\{display:block\}/);
  assert.match(html, /gap:8px !important;overflow:visible\}/, "le popover des couleurs ne doit pas être coupé par l'en-tête");
  assert.match(html, /\.pdf-mark-tools\.palette-open \.pdf-mark-colors\{display:flex\}/);
  assert.match(html, /button\.classList\.add\("pdf-mark-pen"\)/);
  assert.match(html, /bar\.style\.setProperty\("--mark-current"/);
  assert.match(html, /bar\.classList\.toggle\("palette-open"\)/);
});

test("système de design : transitions ≤ 150 ms et reduced-motion sur la barre de marquage", () => {
  const block = html.slice(html.indexOf(".pdf-mark-tools{display:flex"), html.indexOf(".pdf-mark-tools button:focus-visible"));
  for (const m of block.matchAll(/transition:[^;}]*?(\d+)ms/g)) assert.ok(Number(m[1]) <= 150, m[0]);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{\.pdf-mark-tools button,\.pdf-mark-tools \.pdf-mark-color\{transition:none\}\}/);
});
