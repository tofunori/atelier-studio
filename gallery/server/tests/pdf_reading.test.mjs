import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {JSDOM} from "jsdom";
await import("../../assets/pdf_passage.js");
await import("../../assets/pdf_reading.js");
const R = globalThis.AtelierPdfReading;

const DOC = {
  version: 1, pages: [{w: 600, h: 800}, {w: 600, h: 800}],
  blocks: [
    {id: 0, page: 1, kind: "heading", level: 1, bbox: [60, 80, 300, 100], text: "1 Introduction", lines: [{page: 1, bbox: [60, 80, 300, 100], text: "1 Introduction"}]},
    {id: 1, page: 1, kind: "paragraph", bbox: [60, 110, 300, 150], text: "Surface albedo controls the energy balance of glaciers.",
      lines: [{page: 1, bbox: [60, 110, 300, 122], text: "Surface albedo controls the"}, {page: 1, bbox: [60, 124, 300, 136], text: "energy bal-"}, {page: 1, bbox: [60, 138, 200, 150], text: "ance of glaciers."}]},
    {id: 2, page: 1, kind: "figure", bbox: [60, 160, 300, 320], text: "", lines: []},
    {id: 3, page: 1, kind: "caption", bbox: [60, 324, 300, 336], text: "Figure 1. A figure.", lines: [{page: 1, bbox: [60, 324, 300, 336], text: "Figure 1. A figure."}]},
    {id: 4, page: 2, kind: "list", bbox: [60, 80, 300, 92], text: "- one", lines: [{page: 2, bbox: [60, 80, 300, 92], text: "- one"}]},
    {id: 5, page: 2, kind: "list", bbox: [60, 94, 300, 106], text: "- two", lines: [{page: 2, bbox: [60, 94, 300, 106], text: "- two"}]},
    {id: 6, page: 2, kind: "math", bbox: [60, 120, 300, 140], text: "", lines: [{page: 2, bbox: [60, 120, 300, 140], text: "α = 1 (1)"}]},
  ],
};

test("buildReadingDom : titres, paragraphes, légendes, listes, figures", () => {
  const dom = new JSDOM("<body></body>");
  const frag = R.buildReadingDom(DOC, {document: dom.window.document, makeFigure: (b) => { const c = dom.window.document.createElement("canvas"); c.dataset.crop = String(b.id); return c; }});
  const root = dom.window.document.createElement("div"); root.appendChild(frag);
  assert.equal(root.querySelector("h1[data-block='0']").textContent, "1 Introduction");
  const p = root.querySelector("p[data-block='1']");
  assert.equal(p.textContent, "Surface albedo controls the energy balance of glaciers.", "le DOM montre le texte DÉ-CÉSURÉ, comme block.text côté Rust");
  assert.equal(root.querySelector("figure[data-block='2'] canvas").dataset.crop, "2");
  assert.equal(root.querySelector("p.caption[data-block='3']").textContent, "Figure 1. A figure.");
  const lis = [...root.querySelectorAll("ul > li")];
  assert.equal(lis.length, 2);
  // ruling a du fix 1 : le marqueur reste dans le texte — textContent d'un
  // bloc vaut EXACTEMENT readingText(block), les offsets en dépendent.
  assert.equal(lis[0].textContent, "- one");
  for (const el of root.querySelectorAll("[data-block]")) {
    const b = DOC.blocks.find(x => String(x.id) === el.dataset.block);
    if (b.kind === "figure" || b.kind === "table" || b.kind === "math") continue;
    assert.equal(el.textContent, R.readingText(b), "bloc " + b.id);
  }
  assert.equal(root.querySelector("figure[data-block='6']").dataset.page, "2");
});

test("readingText dé-césure comme join_lines (Rust) et vaut block.text", () => {
  assert.equal(R.readingText(DOC.blocks[1]), "Surface albedo controls the energy balance of glaciers.");
  // parité Rust/JS : le texte affiché est EXACTEMENT celui du bloc analysé
  for (const b of DOC.blocks) {
    if (b.kind === "figure" || b.kind === "table" || b.kind === "math") continue;
    assert.equal(R.readingText(b), b.text, "bloc " + b.id);
  }
  // trait d'union conservé devant une majuscule (comme en Rust)
  assert.equal(R.readingText({lines: [{text: "long-"}, {text: "Term study"}]}), "long- Term study");
});

test("lineOffsets : début de chaque ligne dans readingText, césure absorbée", () => {
  assert.deepEqual(R.lineOffsets(DOC.blocks[1]), [0, 28, 38]);
  const t = R.readingText(DOC.blocks[1]);
  assert.equal(t.slice(38), "ance of glaciers.");
});

test("cropViewport : viewport décalé sur le bloc, taille en px CSS", () => {
  const calls = [];
  const page = {getViewport: (o) => { calls.push(o); return {scale: o.scale, offsetX: o.offsetX, offsetY: o.offsetY}; }};
  const r = R.cropViewport(page, DOC.blocks[2], 1.5, 2);
  assert.deepEqual(calls[0], {scale: 1.5, offsetX: -90, offsetY: -240});
  assert.equal(r.width, 360); assert.equal(r.height, 240);
  assert.equal(r.canvasWidth, 720); assert.equal(r.canvasHeight, 480);
});

test("selectionToAnnotation : rects par ligne, x interpolé aux extrémités", () => {
  const text = R.readingText(DOC.blocks[1]);
  const start = text.indexOf("controls"), end = text.indexOf("ance") + "ance".length;
  const a = R.selectionToAnnotation(DOC.blocks[1], start, end, DOC.pages);
  assert.equal(a.page, 1);
  assert.equal(a.text, "controls the energy balance");
  assert.equal(a.rects.length, 3);
  const [r1, r2, r3] = a.rects;
  // ligne 1 : commence à "controls" (15/27 des caractères) → x ≈ 60 + 240*15/27
  assert.ok(Math.abs(r1[0] * 600 - (60 + 240 * 15 / 27)) < 2, `x1=${r1[0] * 600}`);
  assert.ok(Math.abs((r1[0] + r1[2]) * 600 - 300) < 1);
  assert.ok(Math.abs(r1[1] * 800 - 110) < 0.01 && Math.abs(r1[3] * 800 - 12) < 0.01);
  // ligne 2 entière : la césure est absorbée à l'affichage mais le « - » est
  // le dernier caractère PEINT sur la page — le rect va jusqu'au bout.
  assert.ok(Math.abs(r2[0] * 600 - 60) < 0.01 && Math.abs(r2[2] * 600 - 240) < 0.01);
  // ligne 3 : finit après "ance" (4/17 des caractères de "ance of glaciers.")
  assert.ok(Math.abs(r3[0] * 600 - 60) < 0.01);
  assert.ok(Math.abs((r3[0] + r3[2]) * 600 - (60 + 140 * 4 / 17)) < 2);
});

test("selectionToAnnotation : un paragraphe fusionné rend les rects d'UNE page", () => {
  // Bloc à cheval sur deux pages (fusion inter-pages côté Rust) : la
  // sélection porte sur la 2e ligne → page 2, un seul rect, normalisé avec
  // les dimensions de la page 2.
  const block = {id: 9, page: 1, kind: "paragraph", bbox: [60, 700, 300, 760],
    text: "fin de page suite en haut",
    lines: [{page: 1, bbox: [60, 700, 300, 712], text: "fin de page"}, {page: 2, bbox: [60, 60, 300, 72], text: "suite en haut"}]};
  const doc = {pages: [{w: 600, h: 800}, {w: 600, h: 400}]};
  const t = R.readingText(block);
  const a = R.selectionToAnnotation(block, t.indexOf("suite"), t.length, doc.pages);
  assert.equal(a.page, 2);
  assert.equal(a.rects.length, 1);
  assert.ok(Math.abs(a.rects[0][1] * 400 - 60) < 0.01, "normalisé avec la hauteur de la page 2");
  // sélection à cheval sur la coupure : seules les lignes de la page de la
  // PREMIÈRE ligne couverte sont gardées.
  const b2 = R.selectionToAnnotation(block, 0, t.length, doc.pages);
  assert.equal(b2.page, 1);
  assert.equal(b2.rects.length, 1);
  // comportement actuel volontairement figé : `text` porte la citation
  // SÉLECTIONNÉE en entier (les deux pages), alors que `rects` ne couvre
  // que la page gardée (voir docs/PIEGES_CONNUS.md § Mode lecture PDF).
  assert.equal(b2.text, t, "text = citation complète, pas tronquée à la page gardée");
});

test("anchorAnnotations retrouve une citation dans le bloc de sa page", () => {
  const annots = [
    {id: "a1", kind: "comment", page: 1, text: "energy balance of glaciers", rects: [[0, 0, 0, 0]]},
    {id: "a2", kind: "area", page: 1, text: "", rects: [[0, 0, 0.1, 0.1]]},
    {id: "a3", kind: "comment", page: 2, text: "absent sentence", rects: []},
  ];
  const anchored = R.anchorAnnotations(DOC, annots);
  assert.equal(anchored.length, 1);
  assert.equal(anchored[0].annotId, "a1");
  assert.equal(anchored[0].blockId, 1);
  const t = R.readingText(DOC.blocks[1]);
  assert.equal(t.slice(anchored[0].start, anchored[0].end), "energy balance of glaciers");
});

test("anchorAnnotations ancre aussi soulignements et barrés", () => {
  const kinds = ["hl", "ul", "st", "comment"].map((kind, i) =>
    ({id: "k" + i, kind, page: 1, text: "energy balance of glaciers"}));
  const anchored = R.anchorAnnotations(DOC, kinds.concat([{id: "area", kind: "area", page: 1, text: "energy balance of glaciers"}]));
  assert.deepEqual(anchored.map(a => a.annotId), ["k0", "k1", "k2", "k3"]);
});

test("anchorAnnotations : pas d'espace en tête après affinage (fix 1, ruling b)", () => {
  const doc = {version: 1, pages: [{w: 600, h: 800}], blocks: [
    {id: 0, page: 1, kind: "paragraph", bbox: [60, 80, 300, 110], text: "",
      lines: [{page: 1, bbox: [60, 80, 300, 92], text: "Surface albedo"}, {page: 1, bbox: [60, 94, 300, 106], text: "controls the"}]},
  ]};
  const anchored = R.anchorAnnotations(doc, [{id: "q", kind: "comment", page: 1, text: "albedo controls"}]);
  assert.equal(anchored.length, 1);
  const t = R.readingText(doc.blocks[0]);
  assert.equal(t.slice(anchored[0].start, anchored[0].end), "albedo controls");
});

test("blockAtScrollTop et pageForBlock", () => {
  const entries = [{id: 0, top: 0}, {id: 1, top: 200}, {id: 2, top: 900}];
  assert.equal(R.blockAtScrollTop(entries, 250), 1);
  assert.equal(R.blockAtScrollTop(entries, 0), 0);
  assert.equal(R.blockAtScrollTop(entries, 5000), 2);
  assert.equal(R.pageForBlock(DOC, 5), 2);
  assert.equal(R.pageForBlock(DOC, 99), 1);
});

// ---- contrat du lecteur ---------------------------------------------------
const html = fs.readFileSync(new URL("../../assets/pdf_viewer.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../../assets/pdf_reading.css", import.meta.url), "utf8");

test("contrat lecteur : bouton, colonne, script compagnon, clés persistées", () => {
  assert.match(html, /<script src="pdf_reading\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="pdf_reading\.css">/);
  assert.match(html, /id="readBtn"[^>]*aria-pressed="false"/);
  assert.match(html, /<section id="reading" hidden>/);
  assert.match(html, /id="readBar"/);
  for (const k of ["pdfRead.fs", "pdfRead.width", "pdfRead.lh", "pdfRead.font"]) assert.ok(html.includes(`"${k}"`), k);
  assert.match(html, /fetch\("\/reflow\?path=" \+ encodeURIComponent\(rel\)\)/);
  assert.match(html, /window\.__readingMode\s*=/);
  assert.doesNotMatch(html, /intent:\s*"print"/);
});

test("contrat lecteur (fix 1) : bouton actif visible, barre sous l'en-tête, jeton de génération", () => {
  // constat n°2 — #readBtn a son propre état :hover et [aria-pressed="true"],
  // comme #invBtn (même gabarit, --accent au repos actif).
  assert.match(html, /#readBtn\[aria-pressed="true"\]\{background:var\(--card2,#2c313a\);color:var\(--accent,#e77f3e\)\}/);
  // constat n°1 — la barre est calée sous le <header> collant via une
  // variable posée en JS à l'entrée, pas un top:0 fixe qui la fait
  // disparaître sous l'en-tête au scroll.
  assert.match(html, /--read-top/);
  assert.match(css, /--read-top/);
  assert.match(css, /#readBar\{[^}]*top:var\(--read-top/);
  // constat n°3 — un fetch /reflow en vol ne doit pas ressusciter reset()/leave().
  assert.match(html, /let gen = 0;/);
  assert.ok(html.includes("gen !== "), "jeton de génération vérifié quelque part (enter/load)");
  // M1 — seul reset() coupe le fetch partagé ; leave() garde la page capturée
  // par enter() comme repli quand l'analyse n'a pas abouti.
  const leaveBody = html.slice(html.indexOf("function leave(){"), html.indexOf("function reset(){"));
  assert.doesNotMatch(leaveBody, /loading = null/, "leave() ne coupe plus le fetch partagé");
  assert.match(leaveBody, /currentBlockId\(\)\) : enteredPage/);
  assert.match(html.slice(html.indexOf("function reset(){")), /loading = null/);
});

test("contrat css : tailles du système, transitions ≤ 200 ms, aucune couleur en dur", () => {
  assert.match(css, /body\.read-mode #pages\{display:none\}/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, "hex en dur interdit — variables CSS seulement");
  for (const m of css.matchAll(/transition:[^;]*?(\d+)ms/g)) assert.ok(Number(m[1]) <= 200, m[0]);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /--read-fs/); assert.match(css, /--read-width/); assert.match(css, /--read-lh/);
  assert.match(css, /:disabled/, "boutons désactivés sans chrome UA — fix 1, aussi trivial du ruling");
  // aucune teinte rgba en dur : seules les variables de marquage et l'ombre
  // documentée du système de design en portent.
  for (const line of css.split("\n")) {
    if (!line.includes("rgba(")) continue;
    assert.ok(/^\s*--read-[a-z-]+:rgba\(/.test(line) || line.includes("box-shadow:0 4px 16px rgba(0,0,0,.25)"),
      "rgba en dur hors variable de teinte / ombre du système : " + line.trim());
  }
  // légendes et notes ne passent pas sous 13 px quand le corps est à 13
  assert.match(css, /#reading p\.caption\{font-size:max\(13px,/);
  assert.match(css, /#reading p\.footnote\{font-size:max\(13px,/);
});

test("contrat lecteur : la navigation par page quitte la colonne, outils de page éteints", () => {
  // I5 — jump (panneau), gotoAnn (flèches de la barre) et revealTargetAnnot
  // (?annot=) visent une page : sans sortie du mode lecture ils défilaient
  // dans #pages, masqué.
  for (const fn of ["function jump(a){", "function gotoAnn(dir){", "function revealTargetAnnot(){"]) {
    const body = html.slice(html.indexOf(fn), html.indexOf(fn) + 400);
    assert.match(body, /window\.__readingMode\?\.isOn\(\) *\) *window\.__readingMode\.leave\(\)|__readingMode\?\.isOn\(\)\) window\.__readingMode\.leave\(\)/, fn);
  }
  assert.match(html, /function disablePageTools\(off\)/);
  assert.match(html, /disablePageTools\(true\)/); assert.match(html, /disablePageTools\(false\)/);
  assert.match(html, /eraser\.dataset\.t="erase"/);
  assert.match(css, /body\.read-mode \.pdf-mark-tools \[data-t="erase"\]/);
});

test("contrat css : la recherche en lecture est un repère, pas un aplat", () => {
  // Un résultat = un BLOC entier : pas de fond pleine largeur sur le
  // paragraphe, un filet en marge et un voile très léger.
  const hit = css.match(/#reading \.find-hit\{[^}]*\}/);
  assert.ok(hit, "règle #reading .find-hit présente");
  assert.match(hit[0], /box-shadow:inset 2px 0 0 var\(--accent\)/);
  assert.match(hit[0], /background:var\(--read-hit-bg\)/);
});

test("contrat lecteur : recherche, passage et annotations câblés au mode lecture", () => {
  assert.match(html, /function drawReadingAnnots\(\)/);
  assert.match(html, /function addHighlightFromReadingSel\(/);
  assert.match(html, /AtelierPdfReading\.anchorAnnotations\(/);
  assert.match(html, /AtelierPdfReading\.selectionToAnnotation\(/);
  assert.match(html, /atelier-reading-rendered/);
  // la recherche choisit ses spans selon le mode
  assert.match(html, /__readingMode\.isOn\(\)\s*\?/);
  // le passage ?quote est résolu dans la colonne en mode lecture
  assert.match(html, /function revealReadingPassage\(/);
});

test("contrat lecteur (fix 1) : marques en flux, ordre du scroll, rect du menu", () => {
  // constat n°1 — la règle des pages est scopée, la colonne redéclare
  // position/mix-blend-mode : une marque de lecture reste du texte en flux.
  assert.match(html, /\.pg \.pdfhl\{position:absolute/);
  assert.doesNotMatch(html, /^\s*\.pdfhl\{/m, "règle .pdfhl non scopée interdite");
  const markRule = css.match(/#reading mark\.pdfhl\{[^}]*\}/);
  assert.ok(markRule, "règle #reading mark.pdfhl présente");
  assert.match(markRule[0], /position:static/);
  assert.match(markRule[0], /mix-blend-mode:normal/);
  // ruling a — la puce du navigateur est éteinte, le marqueur vit dans le texte
  assert.match(css, /#reading ul\{[^}]*list-style:none/);
  // constat n°2 — l'évènement part APRÈS la restauration de position
  const enterBody = html.slice(html.indexOf("async function enter(){"), html.indexOf("function leave(){"));
  assert.ok(enterBody.indexOf("scrollToBlockOfPage(page)") <
    enterBody.indexOf('dispatchEvent(new CustomEvent("atelier-reading-rendered"))'),
    "atelier-reading-rendered émis après scrollToBlockOfPage");
  assert.doesNotMatch(html.slice(html.indexOf("function render(){"), html.indexOf("function topPage(){")),
    /atelier-reading-rendered/, "render() n'émet plus l'évènement");
  // constat n°3 — le rect du menu est mesuré avant toute mutation du DOM
  const addBody = html.slice(html.indexOf("function addHighlightFromReadingSel("), html.indexOf("// PDF marks live"));
  assert.ok(addBody.indexOf("rng.getBoundingClientRect()") < addBody.indexOf("PDF_ANNOTS.push"),
    "getBoundingClientRect mesuré avant PDF_ANNOTS.push");
  // gardes une ligne
  assert.match(addBody, /if\(!doc\.pages \|\| !doc\.pages\[block\.lines\[0\]\.page - 1\]\) return;/);
  assert.match(addBody, /selectionToAnnotation\(block, start, end, doc\.pages\)/);
  assert.match(html, /function readingBlockOf\(n\)/);
  // I4 — soulignement et barré sont rendus dans la colonne, et les défauts
  // kind/color sont posés AVANT l'aiguillage vers la sélection de lecture.
  assert.match(html, /pdfhl-" \+ a\.kind/);
  assert.match(css, /#reading mark\.pdfhl-ul\{[^}]*text-decoration:underline/);
  assert.match(css, /#reading mark\.pdfhl-st\{[^}]*text-decoration:line-through/);
  const sw = html.slice(html.indexOf("function addHighlightFromSel("), html.indexOf("/** Sélection dans #readBody"));
  assert.ok(sw.indexOf('kind = kind || "hl"') < sw.indexOf("addHighlightFromReadingSel(kind, color)"),
    "défauts kind/color posés avant l'aiguillage vers le mode lecture");
  assert.match(html, /let readingPassageRevealed = false;/);
});
