import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
await import("../../assets/pdf_passage.js");
await import("../../assets/pdf_reading.js");
const R = globalThis.AtelierPdfReading;

const DOC = {
  version: 1, pages: [{w: 600, h: 800}, {w: 600, h: 800}],
  blocks: [
    {id: 0, page: 1, kind: "heading", level: 1, bbox: [60, 80, 300, 100], text: "1 Introduction", lines: [{bbox: [60, 80, 300, 100], text: "1 Introduction"}]},
    {id: 1, page: 1, kind: "paragraph", bbox: [60, 110, 300, 150], text: "Surface albedo controls the energy balance of glaciers.",
      lines: [{bbox: [60, 110, 300, 122], text: "Surface albedo controls the"}, {bbox: [60, 124, 300, 136], text: "energy bal-"}, {bbox: [60, 138, 200, 150], text: "ance of glaciers."}]},
    {id: 2, page: 1, kind: "figure", bbox: [60, 160, 300, 320], text: "", lines: []},
    {id: 3, page: 1, kind: "caption", bbox: [60, 324, 300, 336], text: "Figure 1. A figure.", lines: [{bbox: [60, 324, 300, 336], text: "Figure 1. A figure."}]},
    {id: 4, page: 2, kind: "list", bbox: [60, 80, 300, 92], text: "- one", lines: [{bbox: [60, 80, 300, 92], text: "- one"}]},
    {id: 5, page: 2, kind: "list", bbox: [60, 94, 300, 106], text: "- two", lines: [{bbox: [60, 94, 300, 106], text: "- two"}]},
    {id: 6, page: 2, kind: "math", bbox: [60, 120, 300, 140], text: "", lines: [{bbox: [60, 120, 300, 140], text: "α = 1 (1)"}]},
  ],
};

test("buildReadingDom : titres, paragraphes, légendes, listes, figures", () => {
  const dom = new JSDOM("<body></body>");
  const frag = R.buildReadingDom(DOC, {document: dom.window.document, makeFigure: (b) => { const c = dom.window.document.createElement("canvas"); c.dataset.crop = String(b.id); return c; }});
  const root = dom.window.document.createElement("div"); root.appendChild(frag);
  assert.equal(root.querySelector("h1[data-block='0']").textContent, "1 Introduction");
  const p = root.querySelector("p[data-block='1']");
  assert.equal(p.textContent, "Surface albedo controls the energy bal- ance of glaciers.", "le DOM montre le texte des lignes (offsets stables), la césure est masquée par CSS/rendu ultérieur");
  assert.equal(root.querySelector("figure[data-block='2'] canvas").dataset.crop, "2");
  assert.equal(root.querySelector("p.caption[data-block='3']").textContent, "Figure 1. A figure.");
  assert.equal(root.querySelectorAll("ul > li").length, 2);
  assert.equal(root.querySelector("figure[data-block='6']").dataset.page, "2");
});

test("readingText joint les lignes par un espace, sans dé-césure", () => {
  assert.equal(R.readingText(DOC.blocks[1]), "Surface albedo controls the energy bal- ance of glaciers.");
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
  const a = R.selectionToAnnotation(DOC.blocks[1], start, end, {w: 600, h: 800});
  assert.equal(a.page, 1);
  assert.equal(a.text, "controls the energy bal- ance");
  assert.equal(a.rects.length, 3);
  const [r1, r2, r3] = a.rects;
  // ligne 1 : commence à "controls" (15/27 des caractères) → x ≈ 60 + 240*15/27
  assert.ok(Math.abs(r1[0] * 600 - (60 + 240 * 15 / 27)) < 2, `x1=${r1[0] * 600}`);
  assert.ok(Math.abs((r1[0] + r1[2]) * 600 - 300) < 1);
  assert.ok(Math.abs(r1[1] * 800 - 110) < 0.01 && Math.abs(r1[3] * 800 - 12) < 0.01);
  // ligne 2 entière
  assert.ok(Math.abs(r2[0] * 600 - 60) < 0.01 && Math.abs(r2[2] * 600 - 240) < 0.01);
  // ligne 3 : finit après "ance" (4/17 des caractères de "ance of glaciers.")
  assert.ok(Math.abs(r3[0] * 600 - 60) < 0.01);
  assert.ok(Math.abs((r3[0] + r3[2]) * 600 - (60 + 140 * 4 / 17)) < 2);
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
  assert.equal(t.slice(anchored[0].start, anchored[0].end), "energy bal- ance of glaciers");
});

test("blockAtScrollTop et pageForBlock", () => {
  const entries = [{id: 0, top: 0}, {id: 1, top: 200}, {id: 2, top: 900}];
  assert.equal(R.blockAtScrollTop(entries, 250), 1);
  assert.equal(R.blockAtScrollTop(entries, 0), 0);
  assert.equal(R.blockAtScrollTop(entries, 5000), 2);
  assert.equal(R.pageForBlock(DOC, 5), 2);
  assert.equal(R.pageForBlock(DOC, 99), 1);
});
