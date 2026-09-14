import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../../assets/pdf_viewer.html", import.meta.url), "utf8");

/** pdfRenderOrder est une fonction PURE : on l'extrait du source et on
 *  l'exécute telle quelle, sans DOM ni pdf.js. */
const orderSource = html.slice(
  html.indexOf("function pdfRenderOrder("),
  html.indexOf("/** Une peinture abandonnée"),
);
const pdfRenderOrder = vm.runInNewContext(orderSource + "\npdfRenderOrder;");

const arr = (x) => Array.from(x);
const pages = (count, height = 800) =>
  Array.from({length: count}, (_, i) => ({n: i + 1, top: i * height, height}));

// ---- contrat de rendu -----------------------------------------------------

test("les pages sont peintes en intent display, jamais en intent print", () => {
  assert.doesNotMatch(html, /intent:\s*["']print["']/);
  assert.match(html, /intent:\s*"display"/);
});

test("le canvas est plafonné à 2x quelle que soit la densité de l'écran", () => {
  assert.match(html, /const DPR = Math\.min\(2, window\.devicePixelRatio \|\| 1\)/);
  // plus aucun dimensionnement de canvas sur devicePixelRatio brut
  assert.doesNotMatch(html, /cv\.width = vp\.width \* devicePixelRatio/);
  assert.doesNotMatch(html, /ctx\.scale\(devicePixelRatio/);
  assert.match(html, /cv\.width = Math\.round\(vp\.width \* DPR\)/);
  assert.match(html, /ctx\.scale\(DPR, DPR\)/);
});

test("une peinture en vol est annulée et son abandon n'est pas une erreur", () => {
  assert.match(html, /slot\.task = task;/);
  assert.match(html, /function cancelRender\(slot\)\{[\s\S]*?slot\.task\.cancel\(\)/);
  assert.match(html, /RenderingCancelledException/);
  // sortie d'écran et nouvelle génération annulent toutes les deux
  assert.match(html, /slot\.want = false;\s*\n\s*cancelRender\(slot\);/);
  assert.match(html, /for \(const old of _slots\) cancelRender\(old\);/);
  // le drapeau `rendering` est TOUJOURS rendu, même sur annulation
  assert.match(html, /finally \{ slot\.rendering = false; \}/);
});

test("deux pages en vol au plus", () => {
  assert.match(html, /const RENDER_CONCURRENCY = 2;/);
  assert.match(html, /runQueue\(plan\.visible, RENDER_CONCURRENCY\)/);
  assert.match(html, /runQueue\(plan\.lookahead, RENDER_CONCURRENCY\)/);
});

test("le canvas ne dépend plus de la couche texte, qui reste construite ensuite", () => {
  const paint = html.slice(html.indexOf("const paint = async function(slot"), html.indexOf("// 3) FILE PRIORISÉE"));
  assert.ok(paint.indexOf("slot.page.render(") < paint.indexOf("slot.page.getTextContent()"),
    "le canvas doit partir AVANT getTextContent()");
  // toutes les pages gardent une couche texte (recherche, ?quote, annotations)
  assert.match(html, /await paint\(s, !_pageObserver\);/);
});

test("onVisibleReady sonne encore une fois les pages visibles peintes", () => {
  const tail = html.slice(html.indexOf("// 3) FILE PRIORISÉE"));
  assert.ok(tail.indexOf("runQueue(plan.visible") < tail.indexOf("onVisibleReady()"));
  assert.ok(tail.indexOf("onVisibleReady()") < tail.indexOf("runQueue(plan.lookahead"));
});

test("le squelette pose toujours toutes les pages à leur taille finale", () => {
  assert.match(html, /div\.style\.width = vp1\.width \+ "px"; div\.style\.height = vp1\.height \+ "px";/);
  assert.match(html, /div\.dataset\.vscale = vp1\.scale;/);   // synctex
});

// ---- confort sombre -------------------------------------------------------

test("le confort sombre n'inverse que le canvas et se souvient du choix", () => {
  assert.match(html, /const KEY = "pdf_invert";/);
  assert.match(html, /body\.pdf-invert \.pg canvas\{filter:invert\(1\) hue-rotate\(180deg\)\}/);
  assert.doesNotMatch(html, /body\.pdf-invert \.textLayer/);
  assert.doesNotMatch(html, /body\.pdf-invert \.pdfhl/);
  assert.match(html, /id="invBtn"[^>]*aria-pressed="false"/);
  assert.match(html, /#invBtn\{[^}]*border-radius:6px/);
  assert.doesNotMatch(html.slice(html.indexOf('<button id="invBtn"'), html.indexOf('<span id="selinfo"')), /[\u{1F300}-\u{1FAFF}]/u);
  const section = html.slice(html.indexOf("// ---- confort sombre"), html.indexOf("// ---- recherche dans le document"));
  let inverted;
  let saved = null;
  const button = { setAttribute() {} };
  const listeners = [];
  vm.runInNewContext(section, {
    document: { getElementById: () => button,
      documentElement: { dataset: { theme: "dark" }, style: { colorScheme: "dark" } },
      body: { classList: { toggle: (_, value) => { inverted = value; } } } },
    localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value; } },
    window: { __atelierTheme: { colorScheme: "dark" }, addEventListener: (_, fn) => listeners.push(fn) },
  });
  assert.equal(inverted, false);
  listeners.forEach(fn => fn());
  assert.equal(inverted, false);
  button.onclick();
  assert.equal(inverted, true);
  assert.equal(saved, "1");
  button.onclick();
  assert.equal(inverted, false);

});

// ---- recherche ------------------------------------------------------------

test("la barre de recherche est présente, comptée en chiffres tabulaires et temporisée", () => {
  assert.match(html, /<div id="findBar">/);
  assert.match(html, /#findBar \.cnt\{[^}]*font-variant-numeric:tabular-nums/);
  assert.match(html, /e\.key\.toLowerCase\(\) === "f"/);
  assert.match(html, /setTimeout\(\(\) => run\(input\.value\), 150\)/);
  assert.match(html, /if \(e\.key === "Escape"\) \{ e\.preventDefault\(\); close\(\); \}/);
});

// ---- ordonnancement (fonction pure) ---------------------------------------

test("les pages visibles passent d'abord, du centre de la fenêtre vers les bords", () => {
  // fenêtre 0..1600 sur des pages de 800 : pages 1 et 2 visibles, centre à 800
  const plan = pdfRenderOrder(pages(6), 0, 1600);
  assert.deepEqual(arr(plan.visible), [1, 2]);
  // scroll au milieu de la page 3 : elle passe avant ses voisines
  const mid = pdfRenderOrder(pages(6), 2000, 600);
  assert.equal(mid.visible[0], 3);
});

test("l'anticipation vaut une page au-dessus et deux en dessous, pas plus", () => {
  const plan = pdfRenderOrder(pages(10), 2400, 800);   // page 4 visible
  assert.deepEqual(arr(plan.visible), [4]);
  assert.deepEqual(arr(plan.lookahead).slice().sort((a, b) => a - b), [3, 5, 6]);
  assert.equal(plan.order.length, 4, "aucune page lointaine n'est pré-peinte");
});

test("l'anticipation ne déborde jamais du document", () => {
  const head = pdfRenderOrder(pages(3), 0, 800);
  assert.deepEqual(arr(head.visible), [1]);
  assert.deepEqual(arr(head.lookahead), [2, 3]);      // pas de page 0
  const tail = pdfRenderOrder(pages(3), 1600, 800);
  assert.deepEqual(arr(tail.visible), [3]);
  assert.deepEqual(arr(tail.lookahead), [2]);         // pas de page 4 ni 5
});

test("une mesure prise avant la mise en page retombe sur les deux premières pages", () => {
  const plan = pdfRenderOrder(pages(8), 99999, 800);
  assert.deepEqual(arr(plan.visible), [1, 2]);
  assert.deepEqual(arr(plan.lookahead), [3, 4]);
  assert.deepEqual(arr(pdfRenderOrder([], 0, 800).order), []);
});
