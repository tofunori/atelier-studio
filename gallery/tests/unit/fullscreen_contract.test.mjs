// Contrat plein écran + coquille embarquée de la galerie et du viewer SVG.
// Porté de tests/test_fullscreen_regression.py (2026-09-14) quand les
// serveurs Python (fig_annotate_server.py, cmux_gallery.py) ont quitté le
// dépôt ; seules les assertions sur les ASSETS navigateur survivent — le
// backend est atelier-gallery-server (Rust), testé dans rust/crates.
//
// LEÇON (apprise deux fois) : le WebKit embarqué d'Orca ACCEPTE
// `requestFullscreen()` mais IGNORE `document.exitFullscreen()` — le panneau
// reste bloqué plein écran. Aucune astuce cliente ne le corrige. Dans Orca
// on n'entre donc jamais en plein écran WebKit : la galerie demande au
// serveur local (`/orca-native-fullscreen`, host.rs) un viewer natif macOS.
// Les vrais navigateurs gardent `?nativeFs=1` ; les autres coquilles
// embarquées restent en CSS seul sauf opt-in explicite.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");
const gallery = fs.readFileSync(path.join(ASSETS, "gallery_template.html"), "utf8");
const viewer = fs.readFileSync(path.join(ASSETS, "svg_viewer.html"), "utf8");
const has = (hay, needle, msg) => assert.ok(hay.includes(needle), msg || `attendu : ${needle}`);
const hasNot = (hay, needle, msg) => assert.ok(!hay.includes(needle), msg || `interdit : ${needle}`);

test("gallery skips native fullscreen in embedded shells", () => {
  has(gallery, "function lbNativeFsAllowed()");
  has(gallery, "function lbOrcaFsExitAllowed()");
  has(gallery, "function lbOrcaNativeFullscreen()");
  has(gallery, "/orca-native-fullscreen");
  has(gallery, "p.get('orcaFs')==='1'||p.get('cssFs')==='1'");
  has(gallery, "if(lbOrcaFsExitAllowed()) return false;");
  has(gallery, String.raw`\b(Orca|Electron|cmux)\b`);
  has(gallery, "if(lbOrcaFsExitAllowed()){\n    await lbOrcaNativeFullscreen();\n    return;\n  }");
  const guard = "if(!lbNativeFsAllowed()){nativeFsOk=false;return;}";
  const nativeCall = "const req=root.requestFullscreen||root.webkitRequestFullscreen;";
  has(gallery, guard);
  has(gallery, nativeCall);
  assert.ok(gallery.indexOf(guard) < gallery.indexOf(nativeCall), "la garde précède l'appel natif");
});

test("svg viewer skips native fullscreen in embedded shells", () => {
  has(viewer, "function nativeFsAllowed()");
  has(viewer, String.raw`\b(Orca|Electron|cmux)\b`);
  const guard = "if(!nativeFsAllowed()) return;";
  const nativeCall = "const req=document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;";
  has(viewer, guard);
  has(viewer, nativeCall);
  assert.ok(viewer.indexOf(guard) < viewer.indexOf(nativeCall), "la garde précède l'appel natif");
  has(viewer, "body.fs-mode header{display:none}");
  has(viewer, "if(window.self!==window.top) return false;");
  has(viewer.split("function nativeFsAllowed()")[1], "return false;");
});

test("gallery defaults to CSS fullscreen without the native flag", () => {
  has(gallery.split("function lbNativeFsAllowed()")[1], "return false;");
});

test("embedded gallery open actions route supported files to IDE tabs", () => {
  has(gallery, "get('embedded')==='atelier' || window.self!==window.top");
  has(gallery, "function openInContext(rel){");
  // L'INTENTION : en galerie embarquée, les formats ouvrables partent en
  // onglet IDE. Condition et formats vérifiés séparément — une chaîne
  // littérale cassait la release à chaque format ajouté (CSV, 2026-08-30).
  const parts = gallery.split("if(EMB && f && (", 2);
  assert.equal(parts.length, 2, "la garde d'ouverture embarquée a disparu");
  const cond = parts[1].split("\n", 1)[0];
  for (const ext of ["tex", "md", "pdf", "svg", "csv"]) has(cond, `f.ext==='${ext}'`, `format ${ext} non routé vers l'IDE`);
  has(cond, "codeExt(f.ext)");
  has(gallery, "else if(isSvg) u='/.fig_thumbs/svg_viewer.html?file='");
  has(gallery.split("function openInContext(rel){", 2)[1].split("function ", 2)[0], "lbOpenAny(rel);");
  has(gallery, "body.querySelector('#inspOpen').onclick=()=>openInContext(rel);");
  has(gallery, "if(EMB || el.tagName==='BUTTON') openInContext(rel);");
  has(gallery, "type:'atelier-open-tab'");
});

test("embedded gallery header uses the shared canvas", () => {
  // Fond et hauteur réservée vérifiés séparément (règle scindée le 2026-08-23).
  has(gallery, "html.emb header{background:var(--bg)}");
  has(gallery, "html.emb header{padding:4px 12px;height:44px;box-sizing:border-box}");
});

test("gallery controls and cards follow the quiet instrument geometry", () => {
  has(gallery, "--control-h:30px");
  has(gallery, ".controls>.csel-btn,.controls>select,.controls>button,.controls>.chip{height:var(--control-h)}");
  has(gallery, "border-color:color-mix(in srgb,var(--hairline) 78%,transparent)");
  has(gallery, ".hov button{box-shadow:none;background:transparent;border-color:transparent}");
  has(gallery, "transform:scale(1.006)");
  has(gallery, "box-shadow:0 3px 10px rgba(0,0,0,.14)");
});

test("gallery scrollbar track uses the theme canvas", () => {
  has(gallery, "html{background:var(--bg);color-scheme:dark;scrollbar-color:var(--faint) var(--bg)");
  has(gallery, "::-webkit-scrollbar-track{background:var(--bg)}");
  has(gallery, "border:3px solid var(--bg);border-radius:999px");
  has(gallery, "document.documentElement.style.colorScheme=");
  has(gallery, "(r*299+g*587+b*114)/1000>150");
  has(gallery, "html.emb{scrollbar-width:none}");
  has(gallery, "html.emb::-webkit-scrollbar,html.emb body::-webkit-scrollbar{width:0;height:0;display:none}");
});

test("gallery opens directly without inspector or double-click fullscreen", () => {
  has(gallery, "html.emb #inspector,html.emb #inspScrim{display:none!important}");
  has(gallery, "else if(act==='lb'){ closeInspector(false); lbOpen(rel); }");
  has(gallery, "if(EMB || el.tagName==='BUTTON') openInContext(rel);");
  has(gallery, "selectedRel=rel;\n  document.body.classList.remove('has-insp');\n  paintSelection();");
  hasNot(gallery, "document.addEventListener('dblclick'");
  hasNot(gallery, "if(!EMB) lbFsToggle();");
});

test("fullscreen image fills the viewport", () => {
  // 100vw/100vh : tout l'écran en vrai plein écran (cmux), tout le panneau en
  // remplissage CSS (Orca) ; object-fit:contain garde le ratio.
  const fsImg = gallery.split("#lb.fs img{")[1].split("}")[0];
  has(fsImg, "width:100vw;height:100vh");
  has(fsImg, "object-fit:contain");
});

test("gallery has workflow, shortlist, health, recent and compare tools", () => {
  has(gallery, "let collections = JSON.parse(localStorage.getItem('figCollections')");
  has(gallery, "function buildCollectionChip()");
  has(gallery, "function applyCollectionToSel(name)");
  has(gallery, "if(!name) return;");
  hasNot(gallery, "if(!collections[name].length) delete collections[name];");
  for (const dead of ['id="tagChip"', 'id="tagSel"', "document.getElementById('tagChip')", "document.getElementById('tagSel')"]) hasNot(gallery, dead);
  has(gallery, "let workflow = JSON.parse(localStorage.getItem('figWorkflow')");
  has(gallery, "const WORKFLOW_STATUSES");
  has(gallery, "function buildWorkflowChip()");
  has(gallery, "Status &#9662;");
  // Statut par carte dans le menu « … » au survol (redesign sobre 2026-07).
  has(gallery, "function cardMenu(");
  has(gallery, "data-wfset=");
  hasNot(gallery, "Workflow &#9662;");
  hasNot(gallery, "Workflow: none");
  // workflow part dans le POST /state et l'hydratation le relit ; le
  // listener <select> mort (.wfsel) ne doit jamais revenir.
  has(gallery, "hideRules,collections,workflow");
  has(gallery, "if(st.workflow");
  hasNot(gallery, ".wfsel");
  has(gallery, "let recents = JSON.parse(localStorage.getItem('figRecent')");
  // Sans filtre de type explicite, la recherche couvre aussi les formats
  // masqués ; les favoris restent exhaustifs avec masque implicite/explicite.
  has(gallery, "let formatFilterExplicit");
  has(gallery, "(!terms.length || formatFilterExplicit) && !exts[f.ext]");
  has(gallery, "&& !(onlyFavs && favs.has(f.rel))");
  has(gallery, "function buildRecentChip()");
  has(gallery, "function checkHealth()");
  has(gallery, "function healthRows(data)");
  has(gallery, "Server health");
  has(gallery, "Settings &#9662;");
  hasNot(gallery, 'id="healthChip"');
  hasNot(gallery, 'id="healthMenu"');
  has(gallery, "fetch('/ping')");
  for (const k of ["cmpZoom", "cmpPanX", "wheel", "pointermove"]) has(gallery, k);
});
