// Visionneuse SVG (audit du 2026-10-18, problème 18) : le SVG d'un projet est
// assaini dans le document de DOMParser, avant d'être inséré dans la page de
// confiance de la galerie. Ce qui exécute du code part ; le reste — dont ce
// que l'éditeur relit (ids, transform, style, commentaires de matplotlib,
// métadonnées) — reste à l'identique, puisque l'enregistrement réécrit le
// fichier depuis le DOM affiché.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import '../../assets/svg_sanitize.js';

const { sanitize, describe, unsafeUrl } = globalThis.AtelierSvgSanitize;
const window = new JSDOM('<!doctype html><html><body></body></html>').window;

function parse(text: string) {
  const doc = new window.DOMParser().parseFromString(text, 'image/svg+xml');
  assert.equal(doc.querySelector('parsererror'), null, 'fixture SVG must parse');
  return doc.querySelector('svg');
}
const serialize = (node) => new window.XMLSerializer().serializeToString(node);

const MATPLOTLIB = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns:xlink="http://www.w3.org/1999/xlink" width="460.8pt" height="345.6pt" viewBox="0 0 460.8 345.6" xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" version="1.1">
 <metadata>
  <rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
   <cc:Work><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/><dc:date>2026-10-18T10:00:00</dc:date><dc:format>image/svg+xml</dc:format></cc:Work>
  </rdf:RDF>
 </metadata>
 <defs>
  <style type="text/css">*{stroke-linejoin: round; stroke-linecap: butt}</style>
  <path id="m0" d="M 0 0 L 0 3.5" style="stroke: #000000; stroke-width: 0.8"/>
  <clipPath id="p1"><rect x="57.6" y="41.47" width="357.12" height="266.11"/></clipPath>
 </defs>
 <g id="figure_1" inkscape:label="Figure">
  <g id="axes_1">
   <g id="xtick_1">
    <!-- 0.0 -->
    <use xlink:href="#m0" x="73.83" y="307.58" style="stroke: #000000"/>
   </g>
   <path d="M 73.8 300 L 398 52" clip-path="url(#p1)" style="fill: none; stroke: #1f77b4" transform="translate(1 2)"/>
   <image href="data:image/png;base64,iVBORw0KGgo=" x="0" y="0" width="4" height="4"/>
   <a href="https://doi.org/10.5194/tc-15-1-2021"><text x="10" y="20">Albédo JJA</text></a>
  </g>
 </g>
</svg>`;

test('un SVG de matplotlib ordinaire ressort à l’identique', () => {
  const svg = parse(MATPLOTLIB);
  const before = serialize(svg);
  const report = sanitize(svg);
  assert.equal(report.total, 0, describe(report));
  assert.equal(serialize(svg), before);
});

const TRAP = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:html="http://www.w3.org/1999/xhtml"
     viewBox="0 0 100 100" onload="steal()">
  <script>fetch('/codesave', {method:'POST'})</script>
  <SCRIPT type="text/ecmascript">steal()</SCRIPT>
  <image href="x" onerror="steal()" OnMouseOver="steal()"/>
  <animate attributeName="x" onbegin="steal()" dur="1s"/>
  <set attributeName="href" to="javascript:steal()"/>
  <animate attributeName="xlink:href" values="javascript:steal()"/>
  <animate attributeName="onclick" to="steal()"/>
  <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="steal()"/></div></foreignObject>
  <html:iframe src="/delete"/>
  <a xlink:href="javascript:steal()"><text id="lien">clic</text></a>
  <a href=" java&#9;script:steal()"><text>tab</text></a>
  <a href="JaVaScRiPt:steal()"><text>casse</text></a>
  <use href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=#a"/>
  <use xlink:href="https://evil.example/x.svg#a"/>
  <image href="data:text/html,&lt;script&gt;steal()&lt;/script&gt;"/>
  <image href="data:image/png;base64,iVBORw0KGgo=" id="png"/>
  <handler ev:event="load">steal()</handler>
  <g ev:event="click" id="garde"><rect width="1" height="1" style="fill:red"/></g>
  <rect style="background:url(javascript:steal())"/>
  <iframe src="/regenerate"/>
  <embed src="x.swf"/>
  <object data="x.html"/>
  <animate attributeName="opacity" from="0" to="1" dur="1s" id="anim"/>
  <use href="#png" id="local"/>
</svg>`;

test('un SVG piégé perd tout ce qui exécute du code, et seulement cela', () => {
  const svg = parse(TRAP);
  const report = sanitize(svg);
  const out = serialize(svg);
  for (const banned of [/onload/i, /onerror/i, /onbegin/i, /onmouseover/i, /onclick/i, /<script/i, /foreignObject/i,
    /javascript/i, /steal\(\)/, /data:text\/html/, /evil\.example/, /data:image\/svg\+xml/, /<handler/, /ev:event/,
    /iframe/, /<embed/, /<object/, /<html:/]) {
    assert.doesNotMatch(out, banned, `${banned} survived: ${out}`);
  }
  // Ce qui est inoffensif reste en place.
  assert.match(out, /<text id="lien">clic<\/text>/);
  assert.match(out, /<text>tab<\/text>/);
  assert.match(out, /id="png"/);
  assert.match(out, /data:image\/png;base64/);
  assert.match(out, /<g id="garde">/);
  assert.match(out, /id="anim"/);
  assert.match(out, /<use href="#png" id="local"\/>/);
  assert.ok(report.total >= 20, describe(report));
  assert.equal(report.removed['on*'], 4); // onload, onerror, OnMouseOver, onbegin (le onerror du <img> part avec foreignObject)
  assert.match(describe(report), /script ×2/);
});

test('les URL dangereuses sont reconnues malgré blancs, casse et caractères invisibles', () => {
  for (const url of ['javascript:x', ' JAVASCRIPT:x', 'java\tscript:x', 'java\u200bscript:x', '\u0000javascript:x',
    'vbscript:x', 'data:text/html,x', 'data:application/xhtml+xml,x']) {
    assert.equal(unsafeUrl(url, 'a'), true, url);
  }
  for (const url of ['#m0', 'fig/a.png', '../b.svg#c', 'https://doi.org/x', 'data:image/png;base64,AA',
    'data:image/svg+xml;base64,AA']) {
    assert.equal(unsafeUrl(url, 'image'), false, url);
  }
  // <use> : seulement une référence interne ou relative.
  assert.equal(unsafeUrl('#m0', 'use'), false);
  assert.equal(unsafeUrl('other.svg#a', 'use'), false);
  assert.equal(unsafeUrl('https://h/x.svg#a', 'use'), true);
  assert.equal(unsafeUrl('data:image/svg+xml,AA', 'use'), true);
});

test('la visionneuse charge l’assainisseur et l’applique avant importNode', async () => {
  const html = await readFile(new URL('../../assets/svg_viewer.html', import.meta.url), 'utf8');
  const loader = html.indexOf('<script src="svg_sanitize.js"></script>');
  const page = html.indexOf('data-atelier-source="gallery/src/browser/pages/svg_viewer_2.ts"');
  assert.ok(loader > 0 && loader < page, 'svg_sanitize.js doit être chargé avant le script de la page');
  const body = html.slice(page);
  const clean = body.indexOf('AtelierSvgSanitize.sanitize(root)');
  const imported = body.indexOf('document.importNode(root, true)');
  assert.ok(clean > 0 && clean < imported, 'le SVG doit être assaini avant son insertion');
});
