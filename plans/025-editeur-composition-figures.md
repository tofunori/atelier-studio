# Éditeur de composition multi-panneaux — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Éditeur de composition dans la galerie : assembler des figures SVG/PNG en figure composite Nature (`.figcomp`), liée à ses sources, avec export PDF/EPS/TIFF intégré.

**Architecture:** Nouvelle page `gallery/assets/compose_editor.html` (layout 1A : rail sources / canevas mm / inspecteur) + 3 modules JS purs testables (`compose_model.js`, `svg_panel.js`, `reapply_edits.js`) + routes Node `gallery/server/routes/compose.mjs` (save/stat/new/export via Inkscape). Le manifeste `.figcomp` (JSON, mm) référence les sources par chemin relatif ; l'éditeur recharge les sources fraîches et ré-applique les deltas v2 par panneau.

**Tech Stack:** Vanilla JS (pages galerie), serveur Node `gallery/server/`, Inkscape CLI + sips, tests node:assert (style `diff_suite.mjs`), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-11-editeur-composition-design.md` (SOURCE DE VÉRITÉ — la lire avant chaque tâche).

## Global Constraints

- Design system CLAUDE.md : tailles 10/11/12/13/15 px ; poids 400/500/600 ; rayons 6/10/999 ; espacement ×4 ; 3 gris (`--txt/--muted` + éteint) ; icônes SVG monochromes stroke 1.3–1.5 ; transitions 120–150 ms ; `tabular-nums` sur les chiffres alignés ; AUCUNE couleur en dur — tokens `--bg/--card/--txt/--muted/--accent/--border` + IIFE `figTheme` (copier le bloc de `svg_viewer.html`).
- `node gallery/server/tests/diff_suite.mjs` doit rester vert après TOUTE modif sous `gallery/` (78 tests).
- `npx tsc --noEmit` et `npx vite build` doivent passer (ignorer `src/test_auto_review*.ts`).
- Lire `docs/PIEGES_CONNUS.md` avant de toucher un fichier listé dedans.
- Les SVG sources ne sont JAMAIS modifiés par l'éditeur. Ne jamais pusher.
- Toute modif de `gallery/assets/gallery_template.html` est reportée sur `src-tauri/gallery-dist/` (copie du fichier) — règle CLAUDE.md.
- Unités : manifeste en **mm** ; 1 mm = 96/25.4 px CSS à zoom 1 ; pt = px·72/96.
- Contrat `.edits.json` v2 : persisté **tel quel au niveau racine** (`{version:2, transforms, added, removed, styles}`), vide ⇔ les 4 listes vides (parité `fig_annotate_server.py:1381-1395`, consommé par `reapply_svg_edits.py:36-55`).
- Exécution sur branche isolée `feature/compose-editor` (worktree), commits fréquents.

---

### Task 1: Fix `.edits.json` v2 (Node) + harnais de tests compose

**Files:**
- Create: `gallery/server/tests/compose_suite.mjs`
- Modify: `gallery/server/routes/editors.mjs:793-805` (bloc `Array.isArray(payload.edits)`)

**Interfaces:**
- Produces: harnais réutilisé par toutes les tâches serveur : `startServer(root)` → `{port, kill()}` ; `loadBrowserScript(relAssetPath, ctx)` → `window` (harnais VM) ; `ok(name, cond, detail)` compteur/échec.

- [ ] **Step 1: Écrire le harnais + le test qui échoue**

`gallery/server/tests/compose_suite.mjs` :

```js
// Suite compose : fix .edits.json v2, routes /compose/*, modules compose_*.js.
//   node gallery/server/tests/compose_suite.mjs  → « compose suite: ok (N tests) »
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GALLERY = path.resolve(HERE, "..", "..");
const ASSETS = path.join(GALLERY, "assets");
const SERVER = path.join(GALLERY, "server", "main.mjs");

let passed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; return; }
  console.error(`✗ ${name}${detail ? " — " + detail : ""}`);
  process.exitCode = 1;
  throw new Error(`test failed: ${name}`);
}

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "compose-suite-"));
  fs.writeFileSync(path.join(root, "figures_data.json"), JSON.stringify({ files: [] }));
  fs.writeFileSync(path.join(root, "figures_index.html"), "<html></html>");
  return root;
}

async function startServer(root, extraEnv = {}) {
  const port = 18100 + Math.floor(Math.random() * 1800);
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, GALLERY_ROOT: root, FIG_PORT: String(port), ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/figures_data.json`);
      up = r.status < 500;
    } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  ok("serveur démarré", up);
  return { port, kill: () => { try { child.kill("SIGKILL"); } catch {} } };
}

function loadBrowserScript(relAssetPath, ctx = {}) {
  const code = fs.readFileSync(path.join(ASSETS, relAssetPath), "utf8");
  const sandbox = { window: {}, console, ...ctx };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relAssetPath });
  return sandbox.window;
}

const MINI_SVG = `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80">\n <!-- legend_1 -->\n <g id="legend_1" transform="translate(10 10)"><text font-size="10">L1</text></g>\n <g id="axes_1"><path id="line_a" d="M0 0L50 50" stroke="#000"/></g>\n</svg>\n`;

// ---- A. /save-svg persiste les edits v2 (fix editors.mjs) ----
{
  const root = tmpProject();
  fs.writeFileSync(path.join(root, "fig.svg"), MINI_SVG);
  const srv = await startServer(root);
  const v2 = { version: 2, transforms: [{ id: "legend_1", text: "L1", delta: "translate(3 4)" }], added: [], removed: [], styles: [] };
  const r = await fetch(`http://127.0.0.1:${srv.port}/save-svg`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rel: "fig.svg", svg: MINI_SVG, edits: v2 }),
  });
  ok("save-svg v2: 200", r.status === 200, String(r.status));
  const ep = path.join(root, "fig.edits.json");
  ok("save-svg v2: sidecar écrit", fs.existsSync(ep));
  const side = JSON.parse(fs.readFileSync(ep, "utf8"));
  ok("save-svg v2: v2 tel quel à la racine", side.version === 2 && Array.isArray(side.transforms) && side.transforms[0].delta === "translate(3 4)");
  // v2 entièrement vide → sidecar supprimé
  const empty = { version: 2, transforms: [], added: [], removed: [], styles: [] };
  await fetch(`http://127.0.0.1:${srv.port}/save-svg`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rel: "fig.svg", svg: MINI_SVG, edits: empty }),
  });
  ok("save-svg v2 vide: sidecar supprimé", !fs.existsSync(ep));
  // v1 (liste) fonctionne toujours, enveloppé {svg, edits}
  await fetch(`http://127.0.0.1:${srv.port}/save-svg`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rel: "fig.svg", svg: MINI_SVG, edits: [{ id: "legend_1", delta: "translate(1 2)" }] }),
  });
  const legacy = JSON.parse(fs.readFileSync(ep, "utf8"));
  ok("save-svg v1: enveloppe {svg, edits}", legacy.svg === "fig.svg" && Array.isArray(legacy.edits));
  srv.kill();
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`compose suite: ok (${passed} tests)`);
```

- [ ] **Step 2: Vérifier l'échec**

Run: `node gallery/server/tests/compose_suite.mjs`
Expected: `✗ save-svg v2: sidecar écrit` (le bug : `Array.isArray` sur l'objet v2 → sidecar jamais écrit).

- [ ] **Step 3: Corriger `editors.mjs`**

Remplacer le bloc `if (Array.isArray(payload.edits)) { … }` de `/save-svg` par :

```js
      const edits = payload.edits;
      const V2_KEYS = ["transforms", "added", "removed", "styles"];
      const isV1 = Array.isArray(edits);
      const isV2 = !isV1 && edits && typeof edits === "object"
        && (edits.version === 2 || V2_KEYS.some((k) => Array.isArray(edits[k])));
      if (isV1 || isV2) {
        const ep = `${dst.slice(0, -4)}.edits.json`;
        const hasContent = isV1 ? edits.length > 0 : V2_KEYS.some((k) => (edits[k] || []).length > 0);
        if (hasContent) {
          // v1 : enveloppe legacy {svg, edits} ; v2 : payload tel quel
          // (parité fig_annotate_server.py — contrat consommé par reapply_svg_edits.py)
          const body = isV1 ? { svg: path.basename(dst), edits } : edits;
          const [fd2, t2] = tempFile(ddir, ".edits.", ".tmp");
          fs.writeFileSync(fd2, JSON.stringify(body, null, 1), "utf8");
          fs.closeSync(fd2);
          fs.renameSync(t2, ep);
        } else if (fs.existsSync(ep) && !fs.lstatSync(ep).isSymbolicLink()) {
          fs.rmSync(ep);
        }
      }
```

- [ ] **Step 4: Vérifier le passage**

Run: `node gallery/server/tests/compose_suite.mjs` → `compose suite: ok (…)`.
Run: `node gallery/server/tests/diff_suite.mjs` → `diff suite: ok (78 tests)`.

- [ ] **Step 5: Commit**

```bash
git add gallery/server/routes/editors.mjs gallery/server/tests/compose_suite.mjs
git commit -m "fix(gallery): persister .edits.json v2 côté Node (parité Python) + harnais compose_suite"
```

---

### Task 2: Module `compose_model.js` (manifeste, unités, labels, snap)

**Files:**
- Create: `gallery/assets/compose/compose_model.js`
- Test: `gallery/server/tests/compose_suite.mjs` (section B, harnais VM)

**Interfaces:**
- Produces (sur `window.ComposeModel`) :
  - `MM_PX = 96/25.4` ; `mmToPx(mm)` ; `pxToMm(px)`
  - `defaultManifest()` → manifeste §5 de la spec (canvas 183×110, grid {columns:2, gutter_mm:3, snap:true}, label_style {preset:"nature", size_pt:8}, panels:[], overlays:[])
  - `validateManifest(m)` → `{ok:boolean, errors:string[]}` (version===1 ; canvas 0<w,h≤400 ; panels: id string unique, src string non vide, x_mm/y_mm finis, scale>0 ; trim ∈ {"auto",null} ; edits objet v2 ou absent ; overlays kind==="text")
  - `panelLabel(index, preset)` → "a"/"(a)"/"A" selon preset ∈ nature|paren|upper (index≥26 → "aa", "ab"…)
  - `effectiveFontPt(minSourceFontPx, scale)` → `minSourceFontPx*scale*72/96`
  - `effectiveDpi(naturalPx, renderedWidthMm)` → `naturalPx/(renderedWidthMm/25.4)`
  - `gridColumns(canvas, grid)` → `[{x_mm, w_mm}]` positions des colonnes
  - `snapX(xMm, wMm, canvas, grid, others)` / `snapY(yMm, hMm, canvas, others)` → valeur aimantée (seuil 1.5 mm) aux bords de colonnes et aux bords/centres des autres panneaux (`others` = `[{x_mm,y_mm,w_mm,h_mm}]` hors panneau déplacé) ; retourne `{v, guide}` (guide = position de la ligne à dessiner ou null)

- [ ] **Step 1: Tests (section B dans compose_suite.mjs, avant le console.log final)** — exemples exigés :

```js
// ---- B. compose_model ----
{
  const w = loadBrowserScript("compose/compose_model.js");
  const M = w.ComposeModel;
  ok("mm↔px", Math.abs(M.mmToPx(25.4) - 96) < 1e-9);
  ok("label nature", M.panelLabel(0, "nature") === "a" && M.panelLabel(2, "nature") === "c");
  ok("label paren", M.panelLabel(1, "paren") === "(b)");
  ok("label upper", M.panelLabel(0, "upper") === "A");
  ok("pt effectif", Math.abs(M.effectiveFontPt(10, 0.5) - 3.75) < 1e-9);
  ok("dpi effectif", Math.abs(M.effectiveDpi(2000, 84.6667) - 600.0) < 0.1);
  const man = M.defaultManifest();
  ok("défaut valide", M.validateManifest(man).ok, M.validateManifest(man).errors.join(";"));
  man.panels.push({ id: "p1", src: "a.svg", x_mm: 0, y_mm: 0, scale: -1 });
  ok("scale<=0 rejeté", !M.validateManifest(man).ok);
  const cols = M.gridColumns({ width_mm: 183, height_mm: 110 }, { columns: 2, gutter_mm: 3 });
  ok("2 colonnes", cols.length === 2 && Math.abs(cols[0].w_mm - 90) < 1e-9 && Math.abs(cols[1].x_mm - 93) < 1e-9);
  ok("snap col", M.snapX(92.2, 90, { width_mm: 183 }, { columns: 2, gutter_mm: 3, snap: true }, []).v === 93);
}
```

- [ ] **Step 2: Vérifier l'échec** (`node gallery/server/tests/compose_suite.mjs` → module introuvable)

- [ ] **Step 3: Implémenter** `compose/compose_model.js` — script classique (pas de module ES), tout attaché à `window.ComposeModel`, zéro dépendance DOM (testable en VM). Colonnes : `w = (width_mm - gutter*(n-1))/n`, `x_i = i*(w+gutter)`. Snap : candidats = bords de colonnes + bords/centres des autres panneaux + 0/width ; retenir le plus proche sous 1.5 mm.

- [ ] **Step 4: Vérifier le passage** des deux suites.

- [ ] **Step 5: Commit** `feat(compose): modèle manifeste/unités/labels/snap (compose_model.js)`

---

### Task 3: Module `reapply_edits.js` (port client des deltas v2)

**Files:**
- Create: `gallery/assets/compose/reapply_edits.js`
- Test: `compose_suite.mjs` section C

**Interfaces:**
- Produces (`window.ComposeReapply`) : `applyEdits(svgText, editsV2)` → `{svg: string, unmatched: [{id, text, kind}]}`. Port fidèle de `gallery/reapply_svg_edits.py` (string-based, MÊMES sémantiques) : ordre transforms→styles→removed→added ; appariement par `id`, repli par carte `<!-- label --><g id=…>` ; delta préfixé au transform existant ; garde d'idempotence (transform commençant déjà par le delta → no-op) ; jamais deviner (non-apparié → listé).

- [ ] **Step 1: Tests** — sur `MINI_SVG` : (1) delta appliqué → `transform="translate(3 4) translate(10 10)"` ; (2) ré-application → no-op idempotent ; (3) id inconnu → `unmatched` non vide et svg inchangé ; (4) repli par texte de label (svg sans l'id mais avec le commentaire) ; (5) style props injectés ; (6) removed supprime l'élément ; (7) added insère avant `</svg>`.
- [ ] **Step 2: Vérifier l'échec.**
- [ ] **Step 3: Implémenter** en portant les fonctions `load_edits` (normalisation), `comment_id_map`, `find_open_tag`, `with_delta` et la boucle d'application de `reapply_svg_edits.py` (lire le fichier Python en entier avant d'écrire ; conserver les regex à l'identique).
- [ ] **Step 4: Suites vertes.**
- [ ] **Step 5: Commit** `feat(compose): ré-application client des deltas v2 (reapply_edits.js)`

---

### Task 4: Module `svg_panel.js` (préfixage id/defs, dimensions, trim)

**Files:**
- Create: `gallery/assets/compose/svg_panel.js`
- Test: `compose_suite.mjs` section D

**Interfaces:**
- Produces (`window.SvgPanel`) :
  - `prefixIds(svgText, prefix)` → svg avec `id="X"`→`id="<prefix>X"`, et TOUTES les références réécrites : `url(#X)` (attributs ET blocs `<style>`), `href="#X"`, `xlink:href="#X"`, `filter="url(#X)"`, `clip-path`, `mask`, `fill`, `stroke`, `marker-*`. RISQUE PRINCIPAL de la spec (§14) — couvrir par tests.
  - `parseSize(svgText)` → `{width_px, height_px, viewBox}` (unités mm/pt/px/in converties en px CSS ; sans width/height → viewBox).
  - `stripXmlProlog(svgText)` → contenu prêt à inliner.

- [ ] **Step 1: Tests** : svg avec `<defs><clipPath id="c1">` + `clip-path="url(#c1)"` + `<style>.a{fill:url(#g1)}</style>` + `<use xlink:href="#s1"/>` → tout préfixé de façon cohérente ; deux panneaux avec le même id source ne collisionnent plus ; `parseSize` sur `width="89mm"` → `Math.abs(width_px - 89*96/25.4) < 0.01`.
- [ ] **Step 2 → 5:** échec → implémentation (regex sur formes exactes `id="…"`, `url(#…)`, `href="#…"` ; ne PAS toucher aux data-URI) → suites vertes → commit `feat(compose): préfixage id/defs et mesure des SVG sources (svg_panel.js)`.

---

### Task 5: Routes serveur `/compose/save|stat|new`

**Files:**
- Create: `gallery/server/routes/compose.mjs`
- Modify: `gallery/server/main.mjs` (imports + 2 lignes de dispatch dans `route()`)
- Test: `compose_suite.mjs` section E (serveur réel)

**Interfaces:**
- Produces :
  - `handleComposeGet(req, res, url)` : `GET /compose/stat?rel=…` → `{manifest_mtime:number, sources:{[src:string]: number|null}}`
  - `handleComposePost(req, res, url)` : `POST /compose/save {rel, manifest}` → `{ok, path, mtime}` ; `POST /compose/new {dir?, name}` → `{ok, rel}`
  - Imports depuis `../shared.mjs` : recopier le style d'import de `editors.mjs:1-10` (`safePath`, `sendJson`, `readJsonRequest`, `requestLength`, `writeFileAtomicSync`, `PROJECT`, `relSlash`).

Règles : `rel` doit finir par `.figcomp`, `safePath` non nul, pas de symlink ; validation structurelle serveur (dupliquer les règles de `validateManifest` en version serveur dans `compose.mjs` — mêmes messages) + chaque `panels[].src` doit passer `safePath` et finir par `.svg|.png|.jpg|.jpeg` ; `new` : `name` filtré `[A-Za-z0-9_-]{1,64}`, dossier défaut `compositions/`, refus si le fichier existe, contenu = `defaultManifest()` sérialisé.

- [ ] **Step 1: Tests (section E)** : save valide → 200 + fichier ; rel hors projet (`../x.figcomp`) → 400 ; manifest invalide (scale −1) → 400 avec message ; src hors projet → 400 ; stat → mtimes cohérents et source manquante → null ; new → crée `compositions/test.figcomp` valide ; new sur existant → 409.
- [ ] **Step 2: Échec vérifié** (404 sur /compose/*).
- [ ] **Step 3: Implémenter + monter** dans `main.mjs` : `import { handleComposeGet, handleComposePost } from "./routes/compose.mjs";` puis dans `route()` ajouter `if (req.method === "GET" && await handleComposeGet(req, res, url)) return true;` (bloc GET, avant handleStatic) et `if (await handleComposePost(req, res, url)) return true;` (bloc POST).
- [ ] **Step 4: Suites vertes.**
- [ ] **Step 5: Commit** `feat(compose): routes save/stat/new + validation manifeste`

---

### Task 6: Route `/compose/export` (Inkscape + sips)

**Files:**
- Modify: `gallery/server/routes/compose.mjs`
- Test: `compose_suite.mjs` section F (inkscape FACTICE via PATH)

**Interfaces:**
- Produces : `POST /compose/export {rel, svg, formats:("svg"|"pdf"|"eps"|"tiff")[], dpi?=600}` → `{ok, files:{[format]: rel}, errors:{[format]: string}}`. Écrit toujours `<stem>.svg` (composite aplati) à côté du `.figcomp` ; `pdf|eps` : `inkscape --export-type=<f> --export-filename=<out> <in>` (spawnCollect, timeout 120 s) ; `tiff` : inkscape → PNG à `--export-dpi=<dpi>` puis `sips -s format tiff <png> --out <tiff>` (PNG temporaire supprimé). `findInkscape()` : `INKSCAPE_BIN` → `which inkscape` → `/Applications/Inkscape.app/Contents/MacOS/inkscape` → null. Inkscape absent → `errors.pdf = "inkscape introuvable (brew install --cask inkscape)"`, le SVG sort quand même.

- [ ] **Step 1: Tests** : bin factice `inkscape` (script sh qui copie l'entrée vers `--export-filename` et log ses args) posé dans un dossier temp prépendu au PATH du serveur spawné (`extraEnv: {PATH: fakeBin + ":" + process.env.PATH}`) ; export pdf → 200, fichier `.pdf` créé, args contiennent `--export-type=pdf` ; formats:["svg"] seul → pas d'appel inkscape ; PATH sans inkscape ni INKSCAPE_BIN → `errors.pdf` renseigné mais `files.svg` présent ; svg non valide (`svgRootLooksValid` copié d'editors.mjs) → 400.
- [ ] **Step 2 → 5:** échec → implémentation → suites vertes → commit `feat(compose): export composite SVG/PDF/EPS/TIFF via Inkscape CLI`.

---

### Task 7: Page `compose_editor.html` — squelette + rendu lecture seule

**Files:**
- Create: `gallery/assets/compose_editor.html`
- Test: vérification manuelle navigateur (serveur galerie) + les e2e arrivent en Task 15

**Interfaces:**
- Consumes : `ComposeModel`, `SvgPanel`, `ComposeReapply` (balises `<script src="/.fig_thumbs/compose/….js">`), routes Task 5.
- Produces : état global `S = {rel, man, zoom, panX, panY, sel:null|panelId, entered:null|panelId, dirty:false}` ; fonctions `loadManifest()`, `renderAll()`, `renderPanel(p, i)`, `layoutLabels()` réutilisées par les tâches 8-14.

- [ ] **Step 1: Structure** — copier depuis `svg_viewer.html` : le `:root` tokens (l.7), l'IIFE `figTheme` (l.83), le style de `<header>` toolbar et l'inclusion `annot_kit.js` (l.84). Corps en 3 zones flex : `#rail` (200 px, repliable), `#stage` (fond `--bg`, page blanche centrée ombrée `0 4px 16px rgba(0,0,0,.25)`), `#insp` (240 px, repliable). Page : `div#page` dimensionnée `man.canvas.width_mm*MM_PX*zoom`, contient un `<svg id="root">` unique avec `viewBox="0 0 <w_mm> <h_mm>"` (unités internes = mm) — les panneaux sont des `<g class="panel" data-pid>` avec `transform="translate(x_mm y_mm) scale(k)"` où `k = scale*mm_par_px_source`.
- [ ] **Step 2: Chargement** — `?file=<rel>` ; `fetch("/"+rel)` → JSON → `validateManifest` (erreurs → bandeau) ; pour chaque panneau : SVG → `fetch(src)` → `ComposeReapply.applyEdits(txt, p.edits)` → `SvgPanel.prefixIds(txt, p.id+"__")` → `parseSize` → inline ; PNG/JPG → `<image>` avec taille physique (dpi embarqué non lu en V1 : 300 dpi supposé, `px_per_in_hint` prioritaire — spec §5). `trim:"auto"` : après insertion, `getBBox()` du groupe → recadrer via `transform` interne compensant x/y du bbox. Erreurs (spec §10) : source manquante ou fetch/parse en échec → `<rect>` hachuré (pattern diagonal `--muted2`) aux dimensions du panneau + son `rel` en texte, le manifeste reste intact ; manifeste JSON invalide → bandeau d'erreur en haut de page, éditeur en lecture seule.
- [ ] **Step 3: Labels** — `layoutLabels()` : pour chaque panneau d'index i, `<text class="plabel">` au coin haut-gauche (x_mm, y_mm−0.8), `font-size = label_style.size_pt*(25.4/72)` mm, `font-weight:700`, `font-family:Helvetica,Arial`, contenu `ComposeModel.panelLabel(i, preset)`. Toggle toolbar.
- [ ] **Step 4: Zoom/pan** — molette+drag milieu, boutons ±/100 %, mêmes raccourcis que `svg_viewer.html` (s'inspirer de ses l.776-821). Sous la page : `183 mm × 110 mm` en `--muted` `tabular-nums`.
- [ ] **Step 5: Vérif manuelle** — créer un `.figcomp` de test à la main dans un projet-bac-à-sable avec 2 SVG matplotlib réels + 1 PNG ; servir (`GALLERY_ROOT=<bac> FIG_PORT=8791 node gallery/server/main.mjs`) ; ouvrir `http://127.0.0.1:8791/.fig_thumbs/compose_editor.html?file=test.figcomp` ; vérifier : rendu des 3 panneaux, labels a/b/c, aucune collision d'ids (gradients/clips corrects), zoom/pan.
- [ ] **Step 6: Commit** `feat(compose): page éditeur — squelette, rendu lié aux sources, labels, zoom`

---

### Task 8: Sélection, drag aimanté, nudge, undo/redo

**Files:**
- Modify: `gallery/assets/compose_editor.html`

**Interfaces:**
- Produces : `select(pid|null)`, `undoStack/redoStack` (entrées `{kind:"panel-move"|"panel-scale"|"panel-add"|"panel-remove"|"reorder"|"overlay"|"inner-edit"|"canvas", before, after}`), `pushUndo(entry)`, `applyEntry(entry, dir)` ; `markDirty()`.

- [ ] **Step 1:** clic panneau → sélection (contour `--accent` 1 px + 4 poignées d'angle 6 px) ; clic fond → désélection ; drag → `snapX/snapY` de ComposeModel (guides accent dessinés dans `#root` pendant le drag, ⌥ désactive) ; flèches = nudge 0.5 mm, ⇧ = 2 mm (coalescé en une entrée d'undo comme `svg_viewer.html:406-421`) ; ⌘Z/⇧⌘Z.
- [ ] **Step 2:** vérif manuelle : drag aimanté aux colonnes et aux bords du panneau voisin, undo/redo restaure exactement x_mm/y_mm.
- [ ] **Step 3: Commit** `feat(compose): sélection, déplacement aimanté, nudge, undo/redo`

---

### Task 9: Redimensionnement homothétique (ratio verrouillé)

**Files:**
- Modify: `gallery/assets/compose_editor.html`

- [ ] **Step 1:** drag d'une poignée d'angle → nouveau `scale` = distance courante/distance initiale au coin opposé (le coin opposé reste fixe) ; JAMAIS de scale_x/scale_y ; min 0.05. L'inspecteur (Task 10) reflète Échelle % en direct. Entrée d'undo `panel-scale`.
- [ ] **Step 2:** vérif : le ratio W/H du panneau est identique avant/après (mesurer `getBoundingClientRect`), le coin opposé n'a pas bougé (±0.2 mm).
- [ ] **Step 3: Commit** `feat(compose): resize homothétique par poignées d'angle`

---

### Task 10: Inspecteur (arbre, réordonnancement, propriétés mm, garde-fous)

**Files:**
- Modify: `gallery/assets/compose_editor.html`

**Interfaces:**
- Consumes : `effectiveFontPt`, `effectiveDpi`, `panelLabel`.

- [ ] **Step 1: Arbre** — une ligne par panneau : label + basename(src) + icône lien (source trouvée) ou alerte (manquante) ; clic = sélection ; drag = réordonner `man.panels` → renumérotation (entrée undo `reorder`).
- [ ] **Step 2: Propriétés du panneau sélectionné** — champs X/Y/Largeur en mm (saisie → set + undo), Échelle % (saisie), Ratio « verrouillé » (statique), **Police eff. min** : parcourir les `<text>/<tspan>` du panneau, min(font-size px)×scale → pt, rouge sous 5 pt ; **Résolution eff.** (rasters) : px natifs/(largeur mm/25.4), rouge sous 300 dpi ; bouton « Recharger la source » (re-fetch + reapply + re-trim). Deltas `edits` non appariés listés ici (depuis `unmatched` du chargement).
- [ ] **Step 3: Section canevas** — largeur presets 89/183 + libre, hauteur, colonnes, gouttière ; changement → re-render + undo `canvas`.
- [ ] **Step 4: Commit** `feat(compose): inspecteur — arbre, réordonnancement, propriétés mm, garde-fous pt/dpi`

---

### Task 11: Rail sources + ajout/suppression de panneaux

**Files:**
- Modify: `gallery/assets/compose_editor.html`

- [ ] **Step 1:** `fetch("/figures_data.json")` → lister `files` filtrés ext ∈ svg/png/jpg/jpeg, vignettes `f.thumb`, nom ; drag HTML5 vers le canevas → nouveau panneau à la position du drop (aimantée), `scale` initial = ajusté pour tenir dans une colonne (`w_source ≤ colonne` sinon `scale = w_colonne/w_source`), id `p<n>` unique ; undo `panel-add`. Suppr/⌫ sur panneau sélectionné → `panel-remove` (manifeste seulement, jamais la source).
- [ ] **Step 2:** vérif manuelle : ajout de 2 panneaux par drag, labels renumérotés, suppression/undo.
- [ ] **Step 3: Commit** `feat(compose): rail sources, ajout par glisser, suppression`

---

### Task 12: Sauvegarde, live reload, fig-selection

**Files:**
- Modify: `gallery/assets/compose_editor.html`
- Test: `compose_suite.mjs` section G (stat + save round-trip déjà couverts ; ajouter : save puis stat → mtime avance)

- [ ] **Step 1: Sauvegarde** — ⌘S + bouton : `POST /compose/save {rel, manifest}` ; mémoriser `lastSavedMtime` (réponse) ; indicateur point « modifié » dans la toolbar (`dirty`).
- [ ] **Step 2: Live reload** — `setInterval(2500)` (léger, pas 1 s : poll + parse) sur `GET /compose/stat` : si `manifest_mtime > lastSavedMtime` ET `!dirty` → recharger manifeste + re-render (conserver zoom/pan/sélection si le pid existe encore) ; si `dirty` → bandeau « le fichier a changé sur disque : Recharger / Écraser » (spec §10, pas de fusion) ; si une source change → re-render du panneau concerné seul. Garde anti-boucle : mtime ≤ `lastSavedMtime` ignoré.
- [ ] **Step 3: fig-selection** — repérer le canal existant : `grep -n "fig-selection\|/selection" gallery/assets/sel_overlay.js gallery/server/routes/*.mjs gallery/fig_annotate_server.py | head` ; publier sur le MÊME endpoint que `sel_overlay.js`, payload `{text: "panneau <label> — <src>", rel: <rel du .figcomp>, name, page: null, lines: null, ts}` à chaque changement de sélection (débounce 400 ms).
- [ ] **Step 4:** vérif manuelle : `touch` du `.figcomp` modifié par un `jq` externe → l'éditeur recharge ; modification locale non sauvée + modif externe → bandeau conflit.
- [ ] **Step 5: Commit** `feat(compose): sauvegarde atomique, live reload anti-boucle, sélection publiée`

---

### Task 13: Retouches légères in-panel (deltas v2)

**Files:**
- Modify: `gallery/assets/compose_editor.html`

**Interfaces:**
- Consumes : mécanique delta de `svg_viewer.html` (bookkeeping `data-orig0`, delta = transform courant moins suffixe pristine — voir ses l.634-717 et `collectEdits` l.862-895 AVANT d'implémenter).

- [ ] **Step 1:** double-clic sur un panneau → mode « entré » (autres panneaux `opacity:.35`, Échap sort) ; clic sur un élément signifiant (même heuristique `grabTarget` que svg_viewer) → sélection interne ; drag/flèches → translation ; à la sortie du mode, `collectPanelEdits(pid)` recalcule `p.edits.transforms` (delta par id SANS le préfixe panneau — les ids stockés sont ceux de la SOURCE) ; undo `inner-edit`.
- [ ] **Step 2:** test de boucle complète (manuel) : déplacer une légende dans le panneau a, sauvegarder, régénérer le SVG source (re-copier le fichier), rouvrir → la légende est déplacée, rien d'autre n'a bougé. C'est LE scénario cœur de la spec.
- [ ] **Step 3: Commit** `feat(compose): retouches légères par panneau (deltas v2 régénération-safe)`

---

### Task 14: Overlays texte, AnnotKit, aperçus, gabarits

**Files:**
- Modify: `gallery/assets/compose_editor.html`

- [ ] **Step 1: Overlays** — bouton T+ : clic sur la page → `<text>` overlay (édition inline comme `svg_viewer.html:430-484`), stocké dans `man.overlays` (`kind:"text"`), undo `overlay`.
- [ ] **Step 2: AnnotKit** — brancher `annot_kit.js` comme dans `svg_viewer.html:969-1021` ; le payload d'envoi inclut `rel` du `.figcomp` et la liste des `src` des panneaux.
- [ ] **Step 3: Aperçus** — boutons toolbar : deutéranopie/protanopie (`<filter><feColorMatrix values="…">` matrices standards appliquées à `#root`), niveaux de gris (`saturate(0)`) ; exclusifs, état `.on`.
- [ ] **Step 4: Gabarits** — menu toolbar : `2×2`, `a large + b/c empilés`, `pleine largeur + duo` → répartit les panneaux EXISTANTS sur la grille (positions+scales), undo `canvas`. (À la création : `/compose/new` reste vide — le gabarit s'applique après ajout des panneaux.)
- [ ] **Step 5: Commit** `feat(compose): overlays texte, annotations agent, aperçus daltonisme/gris, gabarits`

---

### Task 15: Pré-vol + dialogue d'export

**Files:**
- Modify: `gallery/assets/compose_editor.html`

- [ ] **Step 1: Pré-vol** (panneau du dialogue d'export, non bloquant — spec §9) : police eff. min ≥ 5 pt ; traits eff. min ≥ 0.25 pt (min stroke-width×scale) ; rasters ≥ 300 dpi ; largeur ∈ {89, 183} sinon avertissement ; hauteur ≤ 247 ; sources manquantes ; deltas non appariés. Chaque item : coche `--ok` ou alerte + détail (panneau, valeur).
- [ ] **Step 2: Export** — dialogue (formats cochés PDF/EPS/TIFF/SVG, dpi TIFF 300/600) → sérialiser `#root` APLATI : cloner, retirer poignées/guides/labels-UI (les labels FONT partie de l'export), retirer les `data-*`, `width/height` en mm → `POST /compose/export` ; toast résultat avec chemins ; erreurs affichées telles quelles (stderr inkscape).
- [ ] **Step 3:** vérif manuelle avec Inkscape réel : PDF ouvert dans Aperçu = dimensions 183×110 mm, texte sélectionnable.
- [ ] **Step 4: Commit** `feat(compose): pré-vol Nature + dialogue d'export`

---

### Task 16: Intégration galerie

**Files:**
- Modify: `gallery/server/builder.mjs:19-22` (DEFAULT_EXTS), `gallery/assets/gallery_template.html` (lbShow + bouton), `src-tauri/gallery-dist/gallery_template.html` (copie)
- Test: `compose_suite.mjs` section H

- [ ] **Step 1:** ajouter `".figcomp"` à `DEFAULT_EXTS` (builder.mjs). Note : si un projet définit `GALLERY_EXTS` custom (réglage app), `figcomp` doit y être ajouté par l'utilisateur — documenter dans le README galerie.
- [ ] **Step 2:** `gallery_template.html` : dans `lbShow` (l.1481-1507), ajouter la branche `else if (f.ext === "figcomp") { pdf.src='/.fig_thumbs/compose_editor.html?file='+encodeURIComponent(f.rel)+'&v=__VER__'; }` sur le modèle exact de la branche `isSvg` (l.1506) ; vignette : icône générique (pas de thumb) — vérifier le fallback vignette existant pour les ext sans thumb.
- [ ] **Step 3:** bouton « Nouvelle composition » dans la toolbar galerie (icône monochrome stroke 1.4) → prompt nom → `POST /compose/new` → ouvre la lightbox sur le rel retourné.
- [ ] **Step 4:** reporter `gallery_template.html` sur `src-tauri/gallery-dist/` (copie fichier) — règle CLAUDE.md ; test section H : builder spawné sur un projet temp contenant `x.figcomp` → `figures_data.json` contient l'entrée `ext:"figcomp"`.
- [ ] **Step 5:** suites vertes + commit `feat(compose): intégration galerie (.figcomp scanné, ouverture lightbox, création)`

---

### Task 17: E2E Playwright

**Files:**
- Create: `gallery/tests/e2e/compose.spec.js`
- Consulter d'abord : `gallery/tests/e2e/editor_cm6.spec.js` (comment il démarre/atteint le serveur — réutiliser exactement son bootstrap).

- [ ] **Step 1: Scénarios** (fixture : projet temp avec 2 SVG minimaux + 1 PNG 1×1) :
  1. `/compose/new` → ouvrir l'éditeur → page vide 183 mm rendue.
  2. Ajouter 2 panneaux (via drag simulé OU en écrivant le manifeste puis reload) → labels « a », « b » visibles.
  3. Drag du panneau b → x_mm changé et aimanté à la colonne (lire le manifeste après ⌘S).
  4. Resize coin → ratio conservé (bbox avant/après).
  5. Modifier le manifeste sur disque → l'éditeur recharge (attendre le nouveau x).
  6. Écraser un SVG source (variante) + panneau porteur d'un delta → delta ré-appliqué.
- [ ] **Step 2:** `cd gallery && npx playwright test tests/e2e/compose.spec.js` → vert.
- [ ] **Step 3: Commit** `test(compose): e2e Playwright — cycle création/édition/reload/régénération`

---

### Task 18: Vérifications finales

- [ ] `node gallery/server/tests/diff_suite.mjs` → 78 tests ok.
- [ ] `node gallery/server/tests/compose_suite.mjs` → ok.
- [ ] `cd gallery && npx playwright test` → vert (toutes suites e2e).
- [ ] `npx tsc --noEmit` et `npx vite build` → verts (rien sous `src/` ne doit avoir changé).
- [ ] Revue du diff complet contre la spec (§ par §) ; vérifier qu'AUCUN fichier hors `gallery/`, `src-tauri/gallery-dist/`, `plans/`, `docs/` n'est touché.
- [ ] Lancer un sous-agent vérificateur indépendant (règle globale CLAUDE.md) : il reçoit la spec + le diff, pas le raisonnement.
- [ ] NE PAS relancer l'app Tauri soi-même (`docs/PROTOCOLE_RELANCE.md` — Thierry lance `npm run tauri dev`) ; NE PAS pusher.
