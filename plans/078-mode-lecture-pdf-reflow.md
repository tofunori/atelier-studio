# Plan 078 : Mode lecture PDF (reflow en une colonne, façon Zotero 10)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Drift check (run first)**: `git diff --stat 9d3d2563..HEAD -- rust/crates/atelier-gallery/src gallery/assets/pdf_viewer.html gallery/assets/pdf_passage.js gallery/server/tests` — si `pdf_viewer.html` a bougé de plus de ~50 lignes, relire les ancrages de la tâche 5 avant de coder.

**Goal:** Un bouton du lecteur PDF bascule vers une colonne de texte recomposée (titres, paragraphes, figures découpées), typographie réglable, position, recherche et annotations conservées.

**Architecture:** Le serveur galerie Rust spawne `pdftohtml -xml`, regroupe et classe les lignes en blocs, met le JSON en cache par PDF et le sert sur `GET /reflow`. Un script compagnon `pdf_reading.js` construit la colonne dans `pdf_viewer.html`, peint les figures par découpe pdf.js, et fait l'aller-retour des annotations par ancrage textuel.

**Tech Stack:** Rust (axum 0.8, `roxmltree` nouveau, sha2 déjà présent), Poppler `pdftohtml` 26 (spawn), pdf.js 6.3 (déjà vendorisé), JS navigateur classique + tests `node:test`, Playwright WebKit.

**Spec:** `docs/superpowers/specs/2026-09-06-mode-lecture-pdf-design.md` — lire en entier avant de commencer.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: lot 1 fluidité (commits `2b453afd`, `2f610491`) — présent sur main
- **Category**: feature
- **Planned at**: commit `9d3d2563`, 2026-09-06

## Global Constraints

- Règle Rust-first : toute logique d'analyse en Rust (`rust/crates/atelier-gallery/src/reflow.rs`), aucune fonctionnalité nouvelle en Node côté `sidecar/`. Le JavaScript de `gallery/assets/` est de l'interface, autorisé.
- Système de design : tailles UI 10/11/12/13/15 px ; corps de lecture 13–24 px ; poids 400/500/600 ; rayons 6/10/999 ; espacements multiples de 4 ; couleurs uniquement par variables CSS ; icônes SVG monochromes stroke 1.4 ; transitions 120–150 ms + `prefers-reduced-motion`.
- Le script inline de `pdf_viewer.html` reste un script CLASSIQUE (les tests l'extraient par `vm`) ; pdf.js arrive par le shim module (`window.__pdfjsReady`).
- Lire `docs/PIEGES_CONNUS.md` avant de toucher `gallery/`. Après toute modification de `gallery/`, `node gallery/server/tests/diff_suite.mjs` doit imprimer `ok`.
- Ne jamais modifier `src-tauri/gallery-dist/` à la main (`bash scripts/stage-gallery.sh` le régénère ; il est ignoré par git).
- Ne pas pusher. Committer petit et tôt : les auto-commits galerie balaient le worktree.
- Tests Rust : ne jamais muter l'environnement dans un test unitaire (course) ; passer l'env au processus spawné dans `http_smoke.rs`.

## Why this matters

Zotero 10 (17 août 2026) a fait du « Reading Mode » son argument principal : un article deux colonnes se lit en une colonne à la typographie choisie, sans perdre les annotations. La bibliothèque Zotero d'Atelier et la galerie partagent un seul lecteur ; ce plan lui donne l'équivalent, avec l'analyse en Rust et mise en cache pour que la 2e ouverture soit instantanée.

## Current state

- `rust/crates/atelier-gallery/src/main.rs:2399-2470` : `Router::new()` avec les routes ; `zotero::zotero_pdf` sur `/zotero/{key}/{fname}` (l.2469) ; `AppState { root, port, … }` (l.62) ; `request_allowed(&headers, &state)` (l.907) ; les assets `.fig_thumbs/*` sont servis depuis `ATELIER_ASSETS_DIR` (l.1053).
- `rust/crates/atelier-gallery/src/zotero.rs:83` `zotero_cache_dir()` = `~/Library/Application Support/cmux-gallery` ; `zotero_pdf_path(rel) -> Option<PathBuf>` (l.~635) résout `zotero/<clé>/<fichier>` vers `~/Zotero/storage` (override `ATELIER_ZOTERO_DIR`).
- `rust/crates/atelier-gallery/src/files.rs:356` `statfile` : modèle d'un handler `Query<PathQuery>` + `safe_project_path(&state.root, &query.path)` + `json_error`.
- `rust/crates/atelier-kb/src/pdf.rs:47` `run_pdftotext` : motif de spawn externe (délai, stderr en erreur).
- `rust/crates/atelier-gallery/tests/http_smoke.rs:96-175` `start_server_with(extra_env)` : spawne le binaire avec un projet fixture temporaire ; `http(port, method, path, body)` renvoie `(status, body)`.
- `gallery/assets/pdf_viewer.html` : barre d'outils l.272-292 (`#zoomCtl`, `#compileBtn`, `#invBtn`) ; `#pages` l.293 ; `#findBar` l.294 ; recherche ~l.1330-1410 via `AtelierPdfPassage.findAllSpanRanges` (l.1373) ; `readingOrder()` (heuristique de gouttière) ~l.700 ; `addHighlightFromSel(kind, color)` l.1576-1612 (structure d'une annotation : `{id, page, rects:[[x,y,w,h] fractions], text, kind, color, note, number?}`) ; `PDF_ANNOTS`, `saveAnnots()` l.~1300, `drawAnnots(pgDiv, n)` l.1477, `annotMenu(a, x, y)` l.1770 ; pilule de sélection `onAnnotate` l.994 ; `revealLinkedPassage` (paramètres `?page`/`?quote`) ~l.640 ; `DPR`, `RENDER_CONCURRENCY`, `pdfRenderOrder` l.297-324 ; `__pdfjsReady` en tête.
- `gallery/assets/pdf_passage.js` : `{normalize, findPassageSpanRange(texts, quote), findAllSpanRanges(texts, query)}` sur `window.AtelierPdfPassage` (UMD classique).
- Tests galerie : `gallery/server/tests/pdf_passage.test.mjs` (modèle `node:test` + `await import("../../assets/…js")`), `pdf_render_pipeline.test.mjs` (extrait des fonctions du HTML par `vm`), `theme_contract.test.mjs` et `studio_editor_contract.test.mjs` scannent le lecteur.
- E2E : `gallery/playwright.config.js` (projets `webkit-*` par `testMatch`), `gallery/tests/e2e/latex_lezer.spec.js` (modèle : spawne le serveur Rust avec `ATELIER_ASSETS_DIR`, `freePort`, `temp-root.js`).
- Outils : `pdftohtml` 26.03 (Homebrew), `pdflatex` (`/Library/TeX/texbin`), Playwright WebKit installé.

## Commands you will need

```bash
cd rust && cargo build -p atelier-gallery && cargo test -p atelier-gallery
cd rust && cargo clippy -p atelier-gallery --all-targets && cargo fmt -p atelier-gallery
node gallery/server/tests/pdf_reading.test.mjs
node gallery/server/tests/pdf_render_pipeline.test.mjs
node gallery/server/tests/diff_suite.mjs        # doit finir par "ok"
node gallery/server/tests/theme_contract.test.mjs
node gallery/server/tests/studio_editor_contract.test.mjs
cd gallery && npx playwright test --project=webkit-reading
bash scripts/stage-gallery.sh                    # fin de plan seulement
```

## STOP conditions

- `pdftohtml -xml -stdout` n'émet ni `<fontspec>` ni `<text … font="…">` (version Poppler différente) : stop, reporter la sortie brute.
- `roxmltree` ne peut pas être ajouté (politique de dépendances, `cargo deny`) : stop.
- Une suite existante casse (`diff_suite`, `pdf_annotations`, `theme_contract`, `studio_editor_contract`) et la cause n'est pas une ligne de ce plan : stop.
- Le lecteur en mode lecture provoque une erreur console dans le spec WebKit après une tentative de correction : stop, joindre la trace.
- Toute modification nécessaire hors des fichiers listés dans les tâches : stop.

## File structure

| Fichier | Rôle |
|---|---|
| `rust/crates/atelier-gallery/src/reflow.rs` (nouveau) | parse XML → lignes ; colonnes ; blocs ; classification ; figures ; `ReflowDoc` sérialisable ; cache ; handler `GET/HEAD /reflow` |
| `rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.tex|.pdf|.xml` (nouveaux) | fixture deux colonnes avec figure, titre, légende, en-tête répété |
| `rust/crates/atelier-gallery/tests/http_smoke.rs` | 3 tests d'intégration `/reflow` |
| `gallery/assets/pdf_reading.js` (nouveau) | fonctions pures `AtelierPdfReading` (DOM, découpes, sélection→rects, ancrage, position) |
| `gallery/assets/pdf_reading.css` (nouveau) | colonne, typographie, barre de réglages, squelette |
| `gallery/assets/pdf_viewer.html` | bouton, `#reading`, chargement, découpes, réglages, position, recherche, annotations |
| `gallery/server/tests/pdf_reading.test.mjs` (nouveau) | tests des fonctions pures + contrat du lecteur |
| `gallery/tests/e2e/pdf_reading.spec.js` (nouveau) + `gallery/playwright.config.js` | projet `webkit-reading` |
| `docs/PIEGES_CONNUS.md`, `plans/README.md` | leçon + statut |

---

### Task 1 : Parse `pdftohtml -xml` en lignes, colonnes et blocs (Rust)

**Files:**
- Create: `rust/crates/atelier-gallery/src/reflow.rs`
- Create: `rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.tex`, `twocol.pdf`, `twocol.xml`
- Modify: `rust/crates/atelier-gallery/Cargo.toml` (ajout `roxmltree = "0.20"`)
- Modify: `rust/crates/atelier-gallery/src/main.rs:10` (ajout `mod reflow;`)

**Interfaces:**
- Produces : `pub(crate) fn parse_pdftohtml_xml(xml: &str) -> Result<Parsed, String>` avec `Parsed { pages: Vec<PageDim{w:f32,h:f32}>, lines: Vec<Line>, images: Vec<ImageBox> }`, `Line { page: u16, bbox: [f32;4], text: String, size: f32, family: String }`, `ImageBox { page: u16, bbox: [f32;4] }` ; `pub(crate) fn gutter_x(lines: &[&Line], page_w: f32) -> Option<f32>` ; `pub(crate) fn group_blocks(parsed: &Parsed) -> Vec<RawBlock>` avec `RawBlock { page: u16, column: u8, bbox: [f32;4], lines: Vec<Line>, size: f32, family: String }` ; `pub(crate) fn join_lines(lines: &[Line]) -> String` (dé-césure).

- [ ] **Step 1 : Vérifier le comportement du drapeau `-i` et générer la fixture**

```bash
mkdir -p rust/crates/atelier-gallery/tests/fixtures/reflow
cat > rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.tex <<'EOF'
\documentclass[10pt,twocolumn]{article}
\usepackage[margin=2cm]{geometry}
\usepackage{lipsum,fancyhdr,graphicx}
\pagestyle{fancy}\fancyhf{}\lhead{Reflow fixture running head}\cfoot{\thepage}
\title{\Large Albedo decline of mountain glaciers}
\author{A. Fixture \and B. Sample}
\date{}
\begin{document}
\maketitle
\section{Introduction}
Surface albedo controls the energy bal\-ance of glaciers and its long-term decrease is a measur\-able driver of mass loss. \lipsum[1-2]
\begin{figure}[t]\centering\rule{6cm}{3cm}\caption{A synthetic vector figure drawn with a rule.}\end{figure}
\section{Methods}
\lipsum[3]
\begin{equation}\alpha_t = \alpha_0 - k\,t \label{eq:trend}\end{equation}
\lipsum[4-6]
\subsection{Data}
\lipsum[7-8]
\end{document}
EOF
cd rust/crates/atelier-gallery/tests/fixtures/reflow && /Library/TeX/texbin/pdflatex -interaction=batchmode twocol.tex >/dev/null && rm -f twocol.aux twocol.log && cd -
pdfinfo rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf | grep Pages
pdftohtml -xml -i -stdout rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf | grep -c '<image' ; echo "(avec -i)"
pdftohtml -xml -stdout rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf | grep -c '<image' ; echo "(sans -i)"
```

Expected : 2 à 3 pages ; la figure `\rule` est vectorielle, donc `<image` = 0 dans les deux cas (c'est voulu : elle teste la figure synthétique de la tâche 2). Si `-i` donne 0 mais « sans -i » donne > 0 sur un PDF de `~/Zotero/storage` au choix, noter dans `reflow.rs` que le spawn se fait SANS `-i` ; sinon avec. Générer la fixture XML avec la variante retenue :

```bash
pdftohtml -xml -stdout rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf > rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.xml
grep -c '<fontspec' rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.xml; grep -c '<text' rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.xml
ls -la rust/crates/atelier-gallery/tests/fixtures/reflow/
```

Expected : ≥ 3 fontspec, ≥ 150 lignes `<text`, `twocol.pdf` < 100 Ko. STOP si `<fontspec` = 0.

- [ ] **Step 2 : Ajouter la dépendance et le module**

Dans `rust/crates/atelier-gallery/Cargo.toml`, sous `[dependencies]` après `ureq = …` :

```toml
roxmltree = "0.20"
```

Dans `main.rs` après `mod zotero;` (l.10) :

```rust
mod reflow;
```

- [ ] **Step 3 : Écrire les tests de parse, gouttière, regroupement et dé-césure (échouent)**

Créer `rust/crates/atelier-gallery/src/reflow.rs` avec seulement le module de tests :

```rust
//! Mode lecture : analyse d'un PDF en blocs (titres, paragraphes, figures…)
//! à partir de `pdftohtml -xml`, mise en cache par fichier, servie sur
//! `GET /reflow`. Spec : docs/superpowers/specs/2026-09-06-mode-lecture-pdf-design.md

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../tests/fixtures/reflow/twocol.xml");

    #[test]
    fn parse_lit_pages_fontspecs_et_lignes() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        assert!(p.pages.len() >= 2);
        assert!((p.pages[0].w - 595.0).abs() < 2.0, "A4/letter width, got {}", p.pages[0].w);
        let first = p.lines.iter().find(|l| l.text.contains("Introduction")).expect("Introduction line");
        assert_eq!(first.page, 1);
        assert!(first.size > 9.0 && first.size < 20.0);
        assert!(!first.family.is_empty());
        assert!(first.bbox[2] > first.bbox[0] && first.bbox[3] > first.bbox[1]);
    }

    #[test]
    fn parse_decode_les_entites_et_ignore_le_balisage_inline() {
        let xml = r#"<?xml version="1.0"?><pdf2xml><page number="1" width="600" height="800">
<fontspec id="0" size="10" family="Times" color="#000"/>
<text top="100" left="50" width="200" height="12" font="0">A &amp; <b>bold</b> <i>it</i>alic</text>
</page></pdf2xml>"#;
        let p = parse_pdftohtml_xml(xml).unwrap();
        assert_eq!(p.lines.len(), 1);
        assert_eq!(p.lines[0].text, "A & bold italic");
        assert_eq!(p.lines[0].bbox, [50.0, 100.0, 250.0, 112.0]);
    }

    #[test]
    fn gouttiere_trouvee_sur_une_page_deux_colonnes() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let page1: Vec<&Line> = p.lines.iter().filter(|l| l.page == 1).collect();
        let g = gutter_x(&page1, p.pages[0].w).expect("two columns");
        assert!(g > p.pages[0].w * 0.4 && g < p.pages[0].w * 0.6, "gutter at {g}");
    }

    #[test]
    fn pas_de_gouttiere_sur_une_page_une_colonne() {
        let mut lines = Vec::new();
        for i in 0..30 {
            lines.push(Line { page: 1, bbox: [60.0, 100.0 + i as f32 * 14.0, 540.0, 112.0 + i as f32 * 14.0],
                text: "wide line of text".into(), size: 10.0, family: "Times".into() });
        }
        let refs: Vec<&Line> = lines.iter().collect();
        assert_eq!(gutter_x(&refs, 600.0), None);
    }

    #[test]
    fn regroupement_respecte_colonnes_et_espacement() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let blocks = group_blocks(&p);
        assert!(blocks.len() >= 8, "got {}", blocks.len());
        // aucun bloc ne mélange deux colonnes
        for b in &blocks {
            let cols: std::collections::BTreeSet<u8> = std::iter::once(b.column).collect();
            assert_eq!(cols.len(), 1);
            assert!(b.bbox[2] - b.bbox[0] > 0.0);
        }
        // l'ordre est colonne 0 puis colonne 1 sur chaque page (les lignes larges = colonne 0)
        let page1: Vec<&RawBlock> = blocks.iter().filter(|b| b.page == 1).collect();
        let first_col1 = page1.iter().position(|b| b.column == 1).unwrap();
        assert!(page1[first_col1..].iter().all(|b| b.column == 1), "column 0 block after column 1");
        // le titre (grande taille) est un bloc à lui seul
        let title = blocks.iter().find(|b| b.lines.iter().any(|l| l.text.contains("Albedo decline"))).unwrap();
        assert!(title.lines.len() <= 2);
    }

    #[test]
    fn join_lines_decesure_et_joint_par_espace() {
        let mk = |t: &str| Line { page: 1, bbox: [0.0; 4], text: t.into(), size: 10.0, family: "T".into() };
        assert_eq!(join_lines(&[mk("energy bal-"), mk("ance of glaciers")]), "energy balance of glaciers");
        assert_eq!(join_lines(&[mk("a measur-"), mk("able driver")]), "a measurable driver");
        assert_eq!(join_lines(&[mk("long-"), mk("Term")]), "long- Term"); // majuscule : trait conservé
        assert_eq!(join_lines(&[mk("end."), mk("Next")]), "end. Next");
    }
}
```

- [ ] **Step 4 : Vérifier l'échec**

Run: `cd rust && cargo test -p atelier-gallery reflow 2>&1 | tail -5`
Expected : erreurs de compilation `cannot find function parse_pdftohtml_xml` etc.

- [ ] **Step 5 : Implémenter parse, gouttière, regroupement, dé-césure**

Ajouter en tête de `reflow.rs` (avant le module de tests) :

```rust
use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
pub(crate) struct PageDim { pub w: f32, pub h: f32 }

#[derive(Debug, Clone)]
pub(crate) struct Line {
    pub page: u16,
    /// [x1, y1, x2, y2] en points, origine haut-gauche (unités de pdftohtml).
    pub bbox: [f32; 4],
    pub text: String,
    pub size: f32,
    pub family: String,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ImageBox { pub page: u16, pub bbox: [f32; 4] }

#[derive(Debug, Default)]
pub(crate) struct Parsed {
    pub pages: Vec<PageDim>,
    pub lines: Vec<Line>,
    pub images: Vec<ImageBox>,
}

fn attr_f32(node: roxmltree::Node, name: &str) -> f32 {
    node.attribute(name).and_then(|v| v.parse::<f32>().ok()).unwrap_or(0.0)
}

/// Texte d'un `<text>` : concatène les nœuds texte, y compris ceux des
/// enfants `<b>`, `<i>`, `<a>` (roxmltree décode déjà `&amp;` etc.).
fn inner_text(node: roxmltree::Node) -> String {
    let mut out = String::new();
    for d in node.descendants() {
        if d.is_text() {
            out.push_str(d.text().unwrap_or(""));
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(crate) fn parse_pdftohtml_xml(xml: &str) -> Result<Parsed, String> {
    let doc = roxmltree::Document::parse(xml).map_err(|e| format!("xml: {e}"))?;
    let mut parsed = Parsed::default();
    let mut fonts: std::collections::HashMap<String, (f32, String)> = Default::default();
    for page in doc.descendants().filter(|n| n.has_tag_name("page")) {
        let number = page.attribute("number").and_then(|v| v.parse::<u16>().ok()).unwrap_or(0);
        parsed.pages.push(PageDim { w: attr_f32(page, "width"), h: attr_f32(page, "height") });
        for child in page.children().filter(|n| n.is_element()) {
            match child.tag_name().name() {
                "fontspec" => {
                    let id = child.attribute("id").unwrap_or("").to_string();
                    fonts.insert(id, (attr_f32(child, "size"), child.attribute("family").unwrap_or("").to_string()));
                }
                "text" => {
                    let text = inner_text(child);
                    if text.is_empty() { continue; }
                    let (size, family) = fonts.get(child.attribute("font").unwrap_or("")).cloned().unwrap_or((0.0, String::new()));
                    let (l, t, w, h) = (attr_f32(child, "left"), attr_f32(child, "top"), attr_f32(child, "width"), attr_f32(child, "height"));
                    parsed.lines.push(Line { page: number, bbox: [l, t, l + w, t + h], text, size, family });
                }
                "image" => {
                    let (l, t, w, h) = (attr_f32(child, "left"), attr_f32(child, "top"), attr_f32(child, "width"), attr_f32(child, "height"));
                    parsed.images.push(ImageBox { page: number, bbox: [l, t, l + w, t + h] });
                }
                _ => {}
            }
        }
    }
    if parsed.pages.is_empty() { return Err("no <page>".into()); }
    Ok(parsed)
}

/// Gouttière d'une page : abscisse entre 35 % et 65 % de la largeur croisée
/// par le moins de lignes étroites (port de `readingOrder()` du lecteur).
/// `None` si la page n'a pas deux colonnes.
pub(crate) fn gutter_x(lines: &[&Line], page_w: f32) -> Option<f32> {
    let narrow: Vec<&&Line> = lines.iter().filter(|l| (l.bbox[2] - l.bbox[0]) <= page_w * 0.55).collect();
    if narrow.len() <= 10 { return None; }
    let mut best = (f32::INFINITY, 0.0f32);
    let mut x = page_w * 0.35;
    while x <= page_w * 0.65 {
        let cross = narrow.iter().filter(|l| l.bbox[0] < x - 6.0 && l.bbox[2] > x + 6.0).count() as f32;
        if cross < best.0 { best = (cross, x); }
        x += page_w * 0.01;
    }
    let tolerated = (narrow.len() as f32 * 0.05).max(2.0);
    // deux colonnes seulement si des lignes existent de part et d'autre
    let left = narrow.iter().filter(|l| (l.bbox[0] + l.bbox[2]) / 2.0 < best.1).count();
    let right = narrow.len() - left;
    if best.0 <= tolerated && left > 3 && right > 3 { Some(best.1) } else { None }
}

#[derive(Debug, Clone)]
pub(crate) struct RawBlock {
    pub page: u16,
    pub column: u8,
    pub bbox: [f32; 4],
    pub lines: Vec<Line>,
    pub size: f32,
    pub family: String,
}

fn union(a: [f32; 4], b: [f32; 4]) -> [f32; 4] {
    [a[0].min(b[0]), a[1].min(b[1]), a[2].max(b[2]), a[3].max(b[3])]
}

/// Lignes consécutives (ordre du flux) de même page, même colonne, écart
/// vertical < 0,6 × hauteur de ligne, même taille (± 0,5 pt) → un bloc.
pub(crate) fn group_blocks(parsed: &Parsed) -> Vec<RawBlock> {
    let mut out: Vec<RawBlock> = Vec::new();
    for (idx, page) in parsed.pages.iter().enumerate() {
        let pno = (idx + 1) as u16;
        let page_lines: Vec<&Line> = parsed.lines.iter().filter(|l| l.page == pno).collect();
        let gutter = gutter_x(&page_lines, page.w);
        let column_of = |l: &Line| -> u8 {
            match gutter {
                Some(g) if (l.bbox[2] - l.bbox[0]) <= page.w * 0.55 && (l.bbox[0] + l.bbox[2]) / 2.0 >= g => 1,
                _ => 0,
            }
        };
        // ordre de lecture : colonne 0 (et pleine largeur) puis colonne 1, chacune par y
        let mut ordered: Vec<&Line> = page_lines.clone();
        ordered.sort_by(|a, b| {
            (column_of(a), (a.bbox[1] / 2.0).round() as i32, a.bbox[0] as i32)
                .cmp(&(column_of(b), (b.bbox[1] / 2.0).round() as i32, b.bbox[0] as i32))
        });
        let mut current: Option<RawBlock> = None;
        for l in ordered {
            let col = column_of(l);
            let h = (l.bbox[3] - l.bbox[1]).max(1.0);
            let joinable = current.as_ref().is_some_and(|c| {
                c.column == col
                    && (l.bbox[1] - c.bbox[3]).abs() < 0.6 * h
                    && (l.size - c.size).abs() <= 0.5
            });
            if joinable {
                let c = current.as_mut().unwrap();
                c.bbox = union(c.bbox, l.bbox);
                c.lines.push(l.clone());
            } else {
                if let Some(c) = current.take() { out.push(c); }
                current = Some(RawBlock { page: pno, column: col, bbox: l.bbox, lines: vec![l.clone()], size: l.size, family: l.family.clone() });
            }
        }
        if let Some(c) = current.take() { out.push(c); }
    }
    out
}

/// Joint les lignes d'un bloc : `-` final suivi d'une minuscule = césure
/// (jointure sans espace), sinon espace.
pub(crate) fn join_lines(lines: &[Line]) -> String {
    let mut out = String::new();
    for l in lines {
        let t = l.text.trim();
        if out.is_empty() { out.push_str(t); continue; }
        let next_lower = t.chars().next().is_some_and(|c| c.is_lowercase());
        if out.ends_with('-') && next_lower {
            out.pop();
            out.push_str(t);
        } else {
            out.push(' ');
            out.push_str(t);
        }
    }
    out
}
```

- [ ] **Step 6 : Vérifier le succès**

Run: `cd rust && cargo test -p atelier-gallery reflow 2>&1 | grep -E 'test result|FAILED|panicked'`
Expected : `test result: ok. 6 passed`. Ajuster les seuils UNIQUEMENT si la fixture le justifie (documenter dans le commentaire du test).

- [ ] **Step 7 : Commit**

```bash
git add rust/crates/atelier-gallery/Cargo.toml rust/Cargo.lock rust/crates/atelier-gallery/src/main.rs rust/crates/atelier-gallery/src/reflow.rs rust/crates/atelier-gallery/tests/fixtures/reflow
git commit -m "reflow: parse pdftohtml -xml, gouttière, blocs, dé-césure (plan 078 T1)"
```

---

### Task 2 : Classification, en-têtes répétés, figures synthétiques, `ReflowDoc`

**Files:**
- Modify: `rust/crates/atelier-gallery/src/reflow.rs`

**Interfaces:**
- Produces : `pub(crate) fn analyze(parsed: &Parsed) -> ReflowDoc` ; `#[derive(Serialize)] ReflowDoc { version: u32 (=1), source: Source{mtime:u64,size:u64}, pages: Vec<PageDim>, blocks: Vec<Block> }` ; `Block { id: u32, page: u16, kind: Kind, bbox: [f32;4], text: String, level: Option<u8>, lines: Vec<BlockLine{bbox:[f32;4], text:String}> }` ; `Kind` sérialisé en minuscules : `heading|paragraph|caption|footnote|math|figure|table|list`. `analyze` laisse `source` à zéro (rempli par la tâche 3).

- [ ] **Step 1 : Tests de classification (échouent)**

Ajouter dans `mod tests` :

```rust
    #[test]
    fn classification_titre_paragraphe_legende_equation() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let doc = analyze(&p);
        assert_eq!(doc.version, 1);
        let kinds = |k: Kind| doc.blocks.iter().filter(|b| b.kind == k).count();
        assert!(kinds(Kind::Heading) >= 3, "Introduction, Methods, Data + titre");
        let intro = doc.blocks.iter().find(|b| b.text == "1 Introduction" || b.text == "Introduction").expect("heading Introduction");
        assert_eq!(intro.kind, Kind::Heading);
        assert_eq!(intro.level, Some(1));
        let data = doc.blocks.iter().find(|b| b.text.ends_with("Data")).unwrap();
        assert_eq!(data.level, Some(2));
        let cap = doc.blocks.iter().find(|b| b.kind == Kind::Caption).expect("caption");
        assert!(cap.text.starts_with("Figure 1"));
        assert!(kinds(Kind::Paragraph) >= 5);
        // dé-césure appliquée dans le texte des paragraphes
        assert!(doc.blocks.iter().any(|b| b.text.contains("energy balance of glaciers")));
        // l'équation numérotée est un bloc math sans texte, avec bbox
        let math = doc.blocks.iter().find(|b| b.kind == Kind::Math).expect("math block");
        assert!(math.text.is_empty() && math.bbox[3] > math.bbox[1]);
    }

    #[test]
    fn en_tete_et_pied_repetes_sont_supprimes() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let doc = analyze(&p);
        assert!(!doc.blocks.iter().any(|b| b.text.contains("running head")), "running head kept");
        assert!(!doc.blocks.iter().any(|b| b.text.trim() == "1" || b.text.trim() == "2"), "page number kept");
    }

    #[test]
    fn figure_vectorielle_synthetisee_avant_sa_legende() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let doc = analyze(&p);
        let cap_i = doc.blocks.iter().position(|b| b.kind == Kind::Caption).unwrap();
        let fig = &doc.blocks[cap_i - 1];
        assert_eq!(fig.kind, Kind::Figure);
        assert_eq!(fig.page, doc.blocks[cap_i].page);
        assert!(fig.bbox[3] <= doc.blocks[cap_i].bbox[1] + 1.0, "figure sits above caption");
        assert!(fig.bbox[3] - fig.bbox[1] > 40.0);
    }

    #[test]
    fn images_bitmap_deviennent_des_figures_et_les_logos_sont_ignores() {
        let mut p = parse_pdftohtml_xml(FIXTURE).unwrap();
        p.images.push(ImageBox { page: 2, bbox: [60.0, 100.0, 300.0, 280.0] });
        p.images.push(ImageBox { page: 2, bbox: [300.0, 100.0, 320.0, 280.0] }); // touche la précédente → fusion
        p.images.push(ImageBox { page: 2, bbox: [500.0, 20.0, 540.0, 35.0] });  // logo 40×15 → ignoré
        let doc = analyze(&p);
        let figs: Vec<&Block> = doc.blocks.iter().filter(|b| b.kind == Kind::Figure && b.page == 2).collect();
        assert!(figs.iter().any(|f| f.bbox == [60.0, 100.0, 320.0, 280.0]), "merged figure missing: {figs:?}");
        assert!(!figs.iter().any(|f| f.bbox[1] < 40.0), "logo classified as figure");
    }

    #[test]
    fn json_du_document_est_stable() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let doc = analyze(&p);
        let v = serde_json::to_value(&doc).unwrap();
        assert_eq!(v["version"], 1);
        assert!(v["blocks"][0]["kind"].is_string());
        assert!(v["blocks"][0]["lines"].is_array());
        assert_eq!(v["blocks"][0]["kind"].as_str().unwrap(), v["blocks"][0]["kind"].as_str().unwrap().to_lowercase());
    }
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd rust && cargo test -p atelier-gallery reflow 2>&1 | tail -3`
Expected : `cannot find function analyze` / `Kind`.

- [ ] **Step 3 : Implémenter**

Ajouter dans `reflow.rs` :

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Kind { Heading, Paragraph, Caption, Footnote, Math, Figure, Table, List }

#[derive(Debug, Clone, Serialize)]
pub(crate) struct BlockLine { pub bbox: [f32; 4], pub text: String }

#[derive(Debug, Clone, Serialize)]
pub(crate) struct Block {
    pub id: u32,
    pub page: u16,
    pub kind: Kind,
    pub bbox: [f32; 4],
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
    pub lines: Vec<BlockLine>,
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub(crate) struct Source { pub mtime: u64, pub size: u64 }

#[derive(Debug, Serialize)]
pub(crate) struct ReflowDoc {
    pub version: u32,
    pub source: Source,
    pub pages: Vec<PageDim>,
    pub blocks: Vec<Block>,
}

pub(crate) const REFLOW_VERSION: u32 = 1;

fn norm_text(t: &str) -> String {
    t.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase()
}

fn is_math_family(f: &str) -> bool {
    let u = f.to_uppercase();
    ["CMMI", "CMSY", "CMEX", "MTMI", "MTSY", "MSAM", "MSBM", "MATH"].iter().any(|k| u.contains(k))
}

/// Taille du corps : médiane des tailles de ligne pondérée par le nombre de caractères.
fn body_size(blocks: &[RawBlock]) -> f32 {
    let mut samples: Vec<(f32, usize)> = blocks.iter().flat_map(|b| b.lines.iter().map(|l| (l.size, l.text.chars().count()))).collect();
    if samples.is_empty() { return 10.0; }
    samples.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let total: usize = samples.iter().map(|s| s.1).sum();
    let mut acc = 0usize;
    for (size, n) in &samples { acc += n; if acc * 2 >= total { return *size; } }
    samples.last().map(|s| s.0).unwrap_or(10.0)
}

pub(crate) fn analyze(parsed: &Parsed) -> ReflowDoc {
    let raw = group_blocks(parsed);
    let body = body_size(&raw);
    let caption_re = |t: &str| {
        let t = t.trim_start();
        let lower = t.to_lowercase();
        let prefix = ["fig.", "fig ", "figure", "table", "tableau"].iter().find(|p| lower.starts_with(*p));
        prefix.is_some_and(|p| lower[p.len()..].trim_start().chars().next().is_some_and(|c| c.is_ascii_digit()))
    };
    let list_re = |t: &str| {
        let mut it = t.trim_start().chars();
        match it.next() {
            Some('•') | Some('-') | Some('–') => it.next() == Some(' '),
            Some(c) if c.is_ascii_digit() => {
                let rest: String = it.collect();
                let rest = rest.trim_start_matches(|c: char| c.is_ascii_digit());
                (rest.starts_with(". ") || rest.starts_with(") "))
            }
            _ => false,
        }
    };

    // 1) en-têtes / pieds : bande de 6 % dont le texte normalisé se répète sur ≥ 2 pages
    let mut band_counts: std::collections::HashMap<String, std::collections::BTreeSet<u16>> = Default::default();
    for b in &raw {
        let ph = parsed.pages[(b.page - 1) as usize].h;
        if b.bbox[1] < ph * 0.06 || b.bbox[3] > ph * 0.94 {
            let key = norm_text(&join_lines(&b.lines));
            let key = if key.chars().all(|c| c.is_ascii_digit()) { "#pagenum".to_string() } else { key };
            band_counts.entry(key).or_default().insert(b.page);
        }
    }
    let is_running = |b: &RawBlock| {
        let ph = parsed.pages[(b.page - 1) as usize].h;
        if !(b.bbox[1] < ph * 0.06 || b.bbox[3] > ph * 0.94) { return false; }
        let key = norm_text(&join_lines(&b.lines));
        let key = if key.chars().all(|c| c.is_ascii_digit()) { "#pagenum".to_string() } else { key };
        band_counts.get(&key).is_some_and(|pages| pages.len() >= 2)
    };

    // 2) niveaux de titre : rang décroissant des tailles > 1,15 × corps
    let mut heading_sizes: Vec<i32> = raw.iter().filter(|b| b.size > body * 1.15 && b.lines.len() <= 3).map(|b| (b.size * 2.0).round() as i32).collect();
    heading_sizes.sort_unstable_by(|a, b| b.cmp(a));
    heading_sizes.dedup();
    let level_of = |size: f32| -> u8 {
        let key = (size * 2.0).round() as i32;
        let rank = heading_sizes.iter().position(|s| *s == key).unwrap_or(2);
        (rank.min(2) + 1) as u8
    };

    let mut blocks: Vec<Block> = Vec::new();
    let mut next_id = 0u32;
    let mut push = |blocks: &mut Vec<Block>, page: u16, kind: Kind, bbox: [f32; 4], text: String, level: Option<u8>, lines: Vec<BlockLine>| {
        blocks.push(Block { id: next_id, page, kind, bbox, text, level, lines });
        next_id += 1;
    };

    for b in &raw {
        if is_running(b) { continue; }
        let text = join_lines(&b.lines);
        let lines: Vec<BlockLine> = b.lines.iter().map(|l| BlockLine { bbox: l.bbox, text: l.text.clone() }).collect();
        let ph = parsed.pages[(b.page - 1) as usize].h;
        let chars: usize = b.lines.iter().map(|l| l.text.chars().count()).sum::<usize>().max(1);
        let math_chars: usize = b.lines.iter().filter(|l| is_math_family(&l.family)).map(|l| l.text.chars().count()).sum();
        let ends_with_eq_number = b.lines.len() <= 2 && text.trim_end().ends_with(')') && text.rsplit('(').next().is_some_and(|t| t.trim_end_matches(')').chars().all(|c| c.is_ascii_digit()) && !t.trim_end_matches(')').is_empty());
        let kind = if caption_re(&text) {
            Kind::Caption
        } else if math_chars * 10 >= chars * 6 || ends_with_eq_number {
            Kind::Math
        } else if b.size > body * 1.15 && b.lines.len() <= 3 {
            Kind::Heading
        } else if b.size < body * 0.9 && b.bbox[1] > ph * 0.66 {
            Kind::Footnote
        } else if list_re(&text) {
            Kind::List
        } else {
            Kind::Paragraph
        };
        match kind {
            Kind::Math => push(&mut blocks, b.page, kind, b.bbox, String::new(), None, lines),
            Kind::Heading => { let lv = level_of(b.size); push(&mut blocks, b.page, kind, b.bbox, text, Some(lv), lines) }
            _ => push(&mut blocks, b.page, kind, b.bbox, text, None, lines),
        }
    }

    // 3) fusion des paragraphes coupés (colonne / page) : pas de ponctuation finale + suite en minuscule
    let mut merged: Vec<Block> = Vec::with_capacity(blocks.len());
    for b in blocks {
        let joinable = merged.last().is_some_and(|p: &Block| {
            p.kind == Kind::Paragraph && b.kind == Kind::Paragraph
                && !p.text.trim_end().ends_with(['.', '?', '!', ':'])
                && b.text.chars().next().is_some_and(|c| c.is_lowercase())
        });
        if joinable {
            let p = merged.last_mut().unwrap();
            let glue = if p.text.ends_with('-') && b.text.chars().next().is_some_and(|c| c.is_lowercase()) { p.text.pop(); "" } else { " " };
            p.text.push_str(glue);
            p.text.push_str(&b.text);
            p.lines.extend(b.lines);
            // bbox reste celle du premier fragment (page du début) — les lignes portent leurs propres bbox
        } else {
            merged.push(b);
        }
    }
    let mut blocks = merged;

    // 4) figures : images ≥ 40×40 fusionnées ; légende orpheline → figure synthétique
    let mut images: Vec<ImageBox> = parsed.images.iter().copied().filter(|i| i.bbox[2] - i.bbox[0] >= 40.0 && i.bbox[3] - i.bbox[1] >= 40.0).collect();
    let mut fused: Vec<ImageBox> = Vec::new();
    while let Some(mut cur) = images.pop() {
        let mut changed = true;
        while changed {
            changed = false;
            let mut i = 0;
            while i < images.len() {
                let o = images[i];
                let touch = o.page == cur.page && o.bbox[0] <= cur.bbox[2] + 2.0 && o.bbox[2] >= cur.bbox[0] - 2.0 && o.bbox[1] <= cur.bbox[3] + 2.0 && o.bbox[3] >= cur.bbox[1] - 2.0;
                if touch { cur.bbox = union(cur.bbox, o.bbox); images.swap_remove(i); changed = true; } else { i += 1; }
            }
        }
        fused.push(cur);
    }
    let mut extra: Vec<(usize, Block)> = Vec::new(); // (insérer avant l'index, bloc)
    for (i, cap) in blocks.iter().enumerate().filter(|(_, b)| b.kind == Kind::Caption) {
        let is_table = cap.text.to_lowercase().starts_with("tab");
        let kind = if is_table { Kind::Table } else { Kind::Figure };
        // image bitmap au-dessus de la légende, même page, chevauchement horizontal
        let above = fused.iter().position(|img| img.page == cap.page && img.bbox[3] <= cap.bbox[1] + 4.0 && img.bbox[2] > cap.bbox[0] && img.bbox[0] < cap.bbox[2]);
        let bbox = if let Some(k) = above {
            fused.remove(k).bbox
        } else {
            // zone entre le bloc texte précédent (même page, même colonne approx.) et la légende
            let prev_bottom = blocks[..i].iter().rev()
                .find(|b| b.page == cap.page && b.kind != Kind::Caption && b.bbox[2] > cap.bbox[0] && b.bbox[0] < cap.bbox[2])
                .map(|b| b.bbox[3]).unwrap_or(parsed.pages[(cap.page - 1) as usize].h * 0.06);
            if cap.bbox[1] - prev_bottom < 40.0 { continue; }
            [cap.bbox[0].min(prev_bottom.min(cap.bbox[0])), prev_bottom + 2.0, cap.bbox[2], cap.bbox[1] - 2.0]
        };
        extra.push((i, Block { id: 0, page: cap.page, kind, bbox, text: String::new(), level: None, lines: Vec::new() }));
    }
    for (offset, (i, b)) in extra.into_iter().enumerate() { blocks.insert(i + offset, b); }
    // images restantes sans légende → figures placées avant le premier bloc qui les suit sur la page
    for img in fused {
        let pos = blocks.iter().position(|b| b.page == img.page && b.bbox[1] >= img.bbox[3]).unwrap_or(blocks.len());
        blocks.insert(pos, Block { id: 0, page: img.page, kind: Kind::Figure, bbox: img.bbox, text: String::new(), level: None, lines: Vec::new() });
    }
    for (i, b) in blocks.iter_mut().enumerate() { b.id = i as u32; }

    ReflowDoc { version: REFLOW_VERSION, source: Source::default(), pages: parsed.pages.clone(), blocks }
}
```

Note : la bbox de figure synthétique doit couvrir la largeur de la légende : corriger la ligne `[cap.bbox[0].min(…), …]` en `[cap.bbox[0], prev_bottom + 2.0, cap.bbox[2], cap.bbox[1] - 2.0]` (l'expression `min` ci-dessus est un garde-fou inutile ; le test `figure_vectorielle_synthetisee_avant_sa_legende` vérifie la hauteur, pas la largeur).

- [ ] **Step 4 : Vérifier**

Run: `cd rust && cargo test -p atelier-gallery reflow 2>&1 | grep -E 'test result|FAILED|panicked'`
Expected : `11 passed`. Si `classification_titre…` échoue sur `"1 Introduction"`, imprimer les blocs (`dbg!`) et adapter l'assertion au texte réel produit par pdflatex (« 1 Introduction » attendu), sans changer les seuils.

- [ ] **Step 5 : Clippy + commit**

Run: `cd rust && cargo clippy -p atelier-gallery --all-targets 2>&1 | grep -E '^(warning|error)' | head` — Expected : rien.

```bash
git add rust/crates/atelier-gallery/src/reflow.rs
git commit -m "reflow: classification, en-têtes répétés, figures, ReflowDoc (plan 078 T2)"
```

---

### Task 3 : Spawn `pdftohtml`, cache par PDF, route `GET/HEAD /reflow`

**Files:**
- Modify: `rust/crates/atelier-gallery/src/reflow.rs`
- Modify: `rust/crates/atelier-gallery/src/main.rs:2465-2470` (route) 
- Modify: `rust/crates/atelier-gallery/src/zotero.rs:83` (rendre `zotero_cache_dir` `pub(crate)`)
- Test: `rust/crates/atelier-gallery/tests/http_smoke.rs`

**Interfaces:**
- Consumes : `zotero::zotero_pdf_path(rel) -> Option<PathBuf>`, `zotero::zotero_cache_dir() -> PathBuf`, `atelier_core::safe_project_path(&root, rel)`, `request_allowed(&headers, &state)` ; `json_error` local (copie de `files.rs:73`).
- Produces : `pub async fn reflow(State(state), method: Method, headers: HeaderMap, Query(query): Query<ReflowQuery{path:String}>) -> Response` ; `pub(crate) fn cache_path_for(pdf: &Path, project_root: &Path, is_zotero: bool) -> PathBuf` ; `pub(crate) fn run_pdftohtml(pdf: &Path) -> Result<String, String>` ; env `ATELIER_PDFTOHTML` = chemin du binaire (défaut `pdftohtml`).

- [ ] **Step 1 : Tests unitaires du cache et test d'intégration (échouent)**

Dans `mod tests` de `reflow.rs` :

```rust
    #[test]
    fn cache_valide_seulement_si_version_mtime_taille_correspondent() {
        let dir = tempfile::tempdir().unwrap();
        let pdf = dir.path().join("a.pdf");
        std::fs::write(&pdf, b"%PDF-1.4 fixture").unwrap();
        let cache = cache_path_for(&pdf, dir.path(), false);
        assert!(cache.starts_with(dir.path().join(".fig_thumbs/reflow")));
        assert!(cache.extension().is_some_and(|e| e == "json"));
        let src = source_of(&pdf).unwrap();
        let doc = ReflowDoc { version: REFLOW_VERSION, source: src, pages: vec![], blocks: vec![] };
        write_cache(&cache, &doc).unwrap();
        assert!(read_cache(&cache, src).is_some());
        assert!(read_cache(&cache, Source { mtime: src.mtime + 1, ..src }).is_none());
        let mut stale = serde_json::to_value(&doc).unwrap();
        stale["version"] = serde_json::json!(0);
        std::fs::write(&cache, stale.to_string()).unwrap();
        assert!(read_cache(&cache, src).is_none());
    }

    #[test]
    fn cache_zotero_va_dans_application_support() {
        let pdf = std::path::Path::new("/tmp/x/storage/ABCD1234/a.pdf");
        let cache = cache_path_for(pdf, std::path::Path::new("/tmp/proj"), true);
        assert!(cache.starts_with(crate::zotero::zotero_cache_dir().join("reflow")));
    }
```

Dans `tests/http_smoke.rs`, ajouter (à côté des tests existants ; le fixture PDF est déjà commité) :

```rust
fn reflow_fixture_pdf() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/reflow/twocol.pdf")
}

#[test]
fn reflow_analyse_un_pdf_du_projet_et_le_met_en_cache() {
    let server = start_server();
    fs::copy(reflow_fixture_pdf(), server.root.join("twocol.pdf")).unwrap();
    let (status, body) = http(server.port, "HEAD", "/reflow?path=twocol.pdf", None);
    assert_eq!(status, 404, "pas de cache avant la première analyse: {body}");
    let (status, body) = http(server.port, "GET", "/reflow?path=twocol.pdf", None);
    assert_eq!(status, 200, "{body}");
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["version"], 1);
    assert!(v["blocks"].as_array().unwrap().len() >= 8);
    assert!(v["blocks"].as_array().unwrap().iter().any(|b| b["kind"] == "heading"));
    let cache_dir = server.root.join(".fig_thumbs/reflow");
    let cached: Vec<_> = fs::read_dir(&cache_dir).unwrap().flatten().collect();
    assert_eq!(cached.len(), 1);
    let mtime1 = cached[0].metadata().unwrap().modified().unwrap();
    thread::sleep(Duration::from_millis(1100));
    let (status, _) = http(server.port, "HEAD", "/reflow?path=twocol.pdf", None);
    assert_eq!(status, 200);
    let (status, body2) = http(server.port, "GET", "/reflow?path=twocol.pdf", None);
    assert_eq!(status, 200);
    assert_eq!(body, body2, "2e réponse identique (cache)");
    let mtime2 = fs::metadata(cached[0].path()).unwrap().modified().unwrap();
    assert_eq!(mtime1, mtime2, "le cache n'a pas été réécrit");
}

#[test]
fn reflow_refuse_hors_projet_et_signale_pdftohtml_absent() {
    let server = start_server_with(&[("ATELIER_PDFTOHTML", "/nonexistent/pdftohtml".to_string())]);
    fs::copy(reflow_fixture_pdf(), server.root.join("twocol.pdf")).unwrap();
    let (status, _) = http(server.port, "GET", "/reflow?path=../etc/passwd", None);
    assert_eq!(status, 403);
    let (status, _) = http(server.port, "GET", "/reflow?path=missing.pdf", None);
    assert_eq!(status, 404);
    let (status, body) = http(server.port, "GET", "/reflow?path=twocol.pdf", None);
    assert_eq!(status, 502, "{body}");
    assert!(body.contains("pdftohtml"));
}

#[test]
fn reflow_sert_un_pdf_zotero() {
    let zotero = std::env::temp_dir().join(format!("atelier-reflow-zotero-{}", std::process::id()));
    let storage = zotero.join("storage/ABCD1234");
    fs::create_dir_all(&storage).unwrap();
    fs::copy(reflow_fixture_pdf(), storage.join("paper.pdf")).unwrap();
    let server = start_server_with(&[("ATELIER_ZOTERO_DIR", zotero.to_string_lossy().to_string())]);
    let (status, body) = http(server.port, "GET", "/reflow?path=zotero/ABCD1234/paper.pdf", None);
    assert_eq!(status, 200, "{body}");
    assert!(body.contains("\"blocks\""));
    let _ = fs::remove_dir_all(&zotero);
}
```

(`Server` expose `root` et `port` — vérifier les noms de champs dans `http_smoke.rs` l.~60-95 et adapter.)

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd rust && cargo test -p atelier-gallery reflow 2>&1 | tail -3` — Expected : erreurs `cache_path_for` non défini ; le test d'intégration ne compile pas encore non plus (`--test http_smoke`), c'est attendu.

- [ ] **Step 3 : Implémenter cache, spawn et handler**

Ajouter dans `reflow.rs` :

```rust
use axum::{extract::{Query, State}, http::{HeaderMap, Method, StatusCode}, response::{IntoResponse, Response}, Json};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub(crate) fn source_of(pdf: &Path) -> Option<Source> {
    let md = std::fs::metadata(pdf).ok()?;
    let mtime = md.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs();
    Some(Source { mtime, size: md.len() })
}

pub(crate) fn cache_path_for(pdf: &Path, project_root: &Path, is_zotero: bool) -> PathBuf {
    use sha2::{Digest, Sha256};
    let key = hex::encode(Sha256::digest(pdf.to_string_lossy().as_bytes()));
    let dir = if is_zotero {
        crate::zotero::zotero_cache_dir().join("reflow")
    } else {
        project_root.join(".fig_thumbs").join("reflow")
    };
    dir.join(format!("{key}.json"))
}

pub(crate) fn read_cache(path: &Path, expected: Source) -> Option<String> {
    let raw = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let ok = v["version"].as_u64() == Some(REFLOW_VERSION as u64)
        && v["source"]["mtime"].as_u64() == Some(expected.mtime)
        && v["source"]["size"].as_u64() == Some(expected.size);
    ok.then_some(raw)
}

pub(crate) fn write_cache(path: &Path, doc: &ReflowDoc) -> Result<(), String> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(doc).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Spawn `pdftohtml -xml -stdout` (motif « spawns inchangés » d'atelier-kb).
/// Le binaire vient de `ATELIER_PDFTOHTML` (tests) ou du PATH.
pub(crate) fn run_pdftohtml(pdf: &Path) -> Result<String, String> {
    let bin = std::env::var("ATELIER_PDFTOHTML").unwrap_or_else(|_| "pdftohtml".to_string());
    let out = std::process::Command::new(&bin)
        .args(["-xml", "-stdout", "-q"])   // ajouter "-i" ici si la tâche 1 l'a retenu
        .arg(pdf)
        .output()
        .map_err(|e| format!("pdftohtml introuvable ({bin}): {e}"))?;
    if !out.status.success() {
        return Err(format!("pdftohtml a échoué: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    String::from_utf8(out.stdout).map_err(|e| format!("pdftohtml: sortie non UTF-8: {e}"))
}

#[derive(Deserialize)]
pub(crate) struct ReflowQuery { pub path: String }

/// `GET /reflow?path=<rel>` → JSON des blocs ; `HEAD` → 200 si le cache existe, 404 sinon.
pub async fn reflow(
    State(state): State<crate::AppState>,
    method: Method,
    headers: HeaderMap,
    Query(query): Query<ReflowQuery>,
) -> Response {
    if !crate::request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "forbidden");
    }
    let rel = query.path.trim();
    let (pdf, is_zotero) = match crate::zotero::zotero_pdf_path(rel) {
        Some(p) => (p, true),
        None => match atelier_core::safe_project_path(&state.root, rel) {
            Ok(p) => (p, false),
            Err(_) => return json_error(StatusCode::FORBIDDEN, "outside the project"),
        },
    };
    let Some(source) = source_of(&pdf) else { return json_error(StatusCode::NOT_FOUND, "not found"); };
    if !pdf.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
        return json_error(StatusCode::BAD_REQUEST, "not a pdf");
    }
    let cache = cache_path_for(&pdf, &state.root, is_zotero);
    if let Some(raw) = read_cache(&cache, source) {
        if method == Method::HEAD { return StatusCode::OK.into_response(); }
        return ([(axum::http::header::CONTENT_TYPE, "application/json")], raw).into_response();
    }
    if method == Method::HEAD { return StatusCode::NOT_FOUND.into_response(); }
    let analysed = tokio::task::spawn_blocking(move || -> Result<ReflowDoc, String> {
        let xml = run_pdftohtml(&pdf)?;
        let parsed = parse_pdftohtml_xml(&xml)?;
        let mut doc = analyze(&parsed);
        doc.source = source;
        Ok(doc)
    }).await.map_err(|e| e.to_string()).and_then(|r| r);
    match analysed {
        Ok(doc) => {
            let _ = write_cache(&cache, &doc); // un cache non écrit n'empêche pas la réponse
            Json(doc).into_response()
        }
        Err(msg) => (StatusCode::BAD_GATEWAY, Json(serde_json::json!({"error": msg}))).into_response(),
    }
}
```

Dans `zotero.rs:83` : `fn zotero_cache_dir()` → `pub(crate) fn zotero_cache_dir()`. Dans `main.rs` (routes, à côté de `/zotero/{key}/{fname}`) :

```rust
        .route("/reflow", get(reflow::reflow).head(reflow::reflow))
```

`request_allowed` est `pub(crate)` dans `main.rs` (l.907) ; `json_error` est privé par module (`files.rs:73`, `documents.rs:61`) — en copier la définition dans `reflow.rs` :

```rust
fn json_error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(serde_json::json!({"error": message.into()}))).into_response()
}
``` Pour le 404 sur un PDF absent : `source_of` renvoie `None` → 404, avant le test d'extension.

- [ ] **Step 4 : Vérifier**

```bash
cd rust && cargo build -p atelier-gallery && cargo test -p atelier-gallery 2>&1 | grep -E 'test result|FAILED|panicked'
```
Expected : trois `test result: ok`, dont `13 passed` pour les unitaires reflow et `26 passed` pour http_smoke (23 + 3).

- [ ] **Step 5 : Clippy, fmt, commit**

```bash
cd rust && cargo clippy -p atelier-gallery --all-targets 2>&1 | grep -E '^(warning|error)' | head; cargo fmt -p atelier-gallery
cd .. && git add rust/crates/atelier-gallery && git commit -m "reflow: spawn pdftohtml, cache par PDF, route GET/HEAD /reflow (plan 078 T3)"
```

---

### Task 4 : `pdf_reading.js` — fonctions pures (DOM, découpes, sélection→rects, ancrage, position)

**Files:**
- Create: `gallery/assets/pdf_reading.js`
- Test: `gallery/server/tests/pdf_reading.test.mjs`

**Interfaces:**
- Consumes : `window.AtelierPdfPassage.findAllSpanRanges(texts, query)` et `.normalize`.
- Produces : `window.AtelierPdfReading = { buildReadingDom(doc, hooks), cropViewport(pdfPage, block, cssScale, dpr), selectionToAnnotation(block, start, end, pageDim), anchorAnnotations(doc, annots), blockAtScrollTop(entries, top), pageForBlock(doc, id), readingText(block) }`.
  - `buildReadingDom(doc, {document, makeFigure(block) -> Element})` → `DocumentFragment` ; éléments : `h1|h2|h3` (level), `p` (paragraph), `p.caption`, `p.footnote`, `li` regroupés dans `ul` (list), `figure` (figure|table|math : contient `makeFigure(block)`), tous avec `data-block=id`, `data-page`.
  - `cropViewport(pdfPage, block, cssScale, dpr)` → `{viewport, width, height}` : `pdfPage.getViewport({scale: cssScale, offsetX: -x1*cssScale, offsetY: -y1*cssScale})` ; `width = (x2-x1)*cssScale`, `height = (y2-y1)*cssScale` (px CSS) ; le canvas fait `width*dpr × height*dpr`.
  - `selectionToAnnotation(block, start, end, {w,h})` → `{page, text, rects:[[x/w, y/h, wd/w, ht/h]…]}` ; offsets = index de caractères dans `readingText(block)` (= `lines.map(text).join(" ")` — attention, PAS `block.text` dé-césuré : la sélection se fait sur le DOM qui doit donc afficher `readingText(block)` pour les paragraphes ; voir buildReadingDom).
  - `anchorAnnotations(doc, annots)` → `[{annotId, blockId, start, end}]` pour les annotations `kind ∈ {comment, hl}` avec `text` non vide : cherche `findAllSpanRanges` sur les lignes des blocs de la page ± 1, prend le premier bloc trouvé, calcule `start/end` en caractères de `readingText`.

- [ ] **Step 1 : Tests (échouent)**

Créer `gallery/server/tests/pdf_reading.test.mjs` :

```js
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
```

`jsdom` n'est pas dans `gallery/package.json` (vérifié 2026-09-06) : l'ajouter en devDependency (`cd gallery && npm i -D jsdom`) — commiter `package.json` et `package-lock.json` avec la tâche.

- [ ] **Step 2 : Vérifier l'échec**

Run: `node gallery/server/tests/pdf_reading.test.mjs 2>&1 | tail -3` — Expected : échec `Cannot find module …/pdf_reading.js`.

- [ ] **Step 3 : Implémenter `pdf_reading.js`**

```js
// Mode lecture : fonctions pures (DOM de la colonne, découpes de figures,
// sélection → rectangles d'annotation, ancrage des annotations, position).
// UMD classique comme pdf_passage.js : chargé par <script>, testé sous node.
(function(root, factory){
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AtelierPdfReading = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(root){
  /** Texte tel qu'affiché : lignes jointes par un espace. Les offsets de la
   *  sélection et de l'ancrage se calculent sur CETTE chaîne. */
  function readingText(block){
    return (block.lines || []).map(function(l){ return l.text; }).join(" ");
  }

  function buildReadingDom(doc, hooks){
    var d = hooks.document, frag = d.createDocumentFragment(), list = null;
    (doc.blocks || []).forEach(function(b){
      var el;
      if (b.kind === "list") {
        if (!list) { list = d.createElement("ul"); frag.appendChild(list); }
        el = d.createElement("li");
        el.textContent = readingText(b).replace(/^\s*(?:[•\-–]|\d+[.)])\s+/, "");
        list.appendChild(el);
      } else {
        list = null;
        if (b.kind === "heading") { el = d.createElement("h" + Math.min(3, Math.max(1, b.level || 1))); el.textContent = readingText(b); }
        else if (b.kind === "figure" || b.kind === "table" || b.kind === "math") { el = d.createElement("figure"); el.className = b.kind; el.appendChild(hooks.makeFigure(b)); }
        else { el = d.createElement("p"); if (b.kind !== "paragraph") el.className = b.kind; el.textContent = readingText(b); }
        frag.appendChild(el);
      }
      el.dataset.block = String(b.id); el.dataset.page = String(b.page);
    });
    return frag;
  }

  function cropViewport(pdfPage, block, cssScale, dpr){
    var x1 = block.bbox[0], y1 = block.bbox[1], x2 = block.bbox[2], y2 = block.bbox[3];
    var viewport = pdfPage.getViewport({scale: cssScale, offsetX: -x1 * cssScale, offsetY: -y1 * cssScale});
    var width = (x2 - x1) * cssScale, height = (y2 - y1) * cssScale;
    return {viewport: viewport, width: width, height: height, canvasWidth: Math.round(width * dpr), canvasHeight: Math.round(height * dpr)};
  }

  /** Offsets [start,end) dans readingText(block) → {page, text, rects normalisés}. */
  function selectionToAnnotation(block, start, end, pageDim){
    var lines = block.lines || [], rects = [], pos = 0, text = readingText(block).slice(start, end);
    lines.forEach(function(l){
      var len = l.text.length, ls = pos, le = pos + len;
      pos = le + 1; // + espace de jointure
      if (le <= start || ls >= end) return;
      var a = Math.max(start, ls) - ls, b = Math.min(end, le) - ls;
      var w = l.bbox[2] - l.bbox[0], h = l.bbox[3] - l.bbox[1];
      var x = l.bbox[0] + w * (len ? a / len : 0), xe = l.bbox[0] + w * (len ? b / len : 1);
      rects.push([x / pageDim.w, l.bbox[1] / pageDim.h, (xe - x) / pageDim.w, h / pageDim.h]);
    });
    return {page: block.page, text: text, rects: rects};
  }

  function anchorAnnotations(doc, annots){
    var passage = root.AtelierPdfPassage, out = [];
    if (!passage) return out;
    (annots || []).forEach(function(a){
      if (!(a.kind === "comment" || a.kind === "hl") || !a.text) return;
      var page = Number(a.page) || 1;
      var candidates = (doc.blocks || []).filter(function(b){ return b.lines && b.lines.length && Math.abs(b.page - page) <= 1; });
      candidates.sort(function(x, y){ return Math.abs(x.page - page) - Math.abs(y.page - page); });
      for (var i = 0; i < candidates.length; i++) {
        var b = candidates[i], texts = b.lines.map(function(l){ return l.text; });
        var m = passage.findAllSpanRanges(texts, a.text);
        if (!m || !m.length) continue;
        var r = m[0], offs = [], p = 0;
        texts.forEach(function(t){ offs.push(p); p += t.length + 1; });
        // findAllSpanRanges renvoie {start, end} en index de spans ; on
        // affine aux caractères en cherchant la citation normalisée dans la
        // tranche de texte couverte.
        var slice = texts.slice(r.start, r.end + 1).join(" ");
        var norm = passage.normalize, target = norm(a.text), lo = 0, hi = slice.length;
        for (var s = 0; s < slice.length; s++) { if (norm(slice.slice(s)).indexOf(target) === 0) { lo = s; break; } }
        for (var e = slice.length; e > lo; e--) { if (norm(slice.slice(lo, e)) === target) { hi = e; break; } }
        out.push({annotId: a.id, blockId: b.id, start: offs[r.start] + lo, end: offs[r.start] + hi});
        return;
      }
    });
    return out;
  }

  function blockAtScrollTop(entries, top){
    var best = entries.length ? entries[0].id : null;
    for (var i = 0; i < entries.length; i++) { if (entries[i].top <= top + 1) best = entries[i].id; else break; }
    return best;
  }
  function pageForBlock(doc, id){
    var b = (doc.blocks || []).find(function(x){ return x.id === id; });
    return b ? b.page : 1;
  }

  return {readingText: readingText, buildReadingDom: buildReadingDom, cropViewport: cropViewport,
    selectionToAnnotation: selectionToAnnotation, anchorAnnotations: anchorAnnotations,
    blockAtScrollTop: blockAtScrollTop, pageForBlock: pageForBlock};
});
```

Vérifier la forme exacte de retour de `findAllSpanRanges` dans `pdf_passage.js` (l.38-64) : si c'est un tableau de `{start, end}` en index de spans, le code ci-dessus est bon ; si c'est autre chose, adapter `r.start`/`r.end` (STOP si la fonction ne donne pas d'index de spans).

- [ ] **Step 4 : Vérifier**

Run: `node gallery/server/tests/pdf_reading.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'` — Expected : `pass 6`, `fail 0`. Ajuster l'affinage caractère dans `anchorAnnotations` si le test « energy bal- ance » échoue (la normalisation retire tirets et espaces : le `lo/hi` doit encadrer `energy bal- ance of glaciers`).

- [ ] **Step 5 : Commit**

```bash
git add gallery/assets/pdf_reading.js gallery/server/tests/pdf_reading.test.mjs gallery/package.json gallery/package-lock.json
git commit -m "reflow: pdf_reading.js, fonctions pures du mode lecture + tests (plan 078 T4)"
```

---

### Task 5 : Intégration dans le lecteur — bouton, colonne, découpes, typographie, position

**Files:**
- Create: `gallery/assets/pdf_reading.css`
- Modify: `gallery/assets/pdf_viewer.html` (tête : `<link>` + `<script src="pdf_reading.js">` après l.36 ; barre d'outils l.284-292 ; `#pages` l.293 ; bas du script inline)
- Test: `gallery/server/tests/pdf_reading.test.mjs` (section « contrat du lecteur »)

**Interfaces:**
- Consumes : `AtelierPdfReading.*` (T4), `GET /reflow?path=<rel>` (T3), globales du lecteur : `rel`, `pdf` (document pdf.js, dans `main()`), `DPR`, `renderAll`, `_slots` (skeletons), `document.scrollingElement`.
- Produces : globales `window.__readingMode = {enter(), leave(), isOn(), doc()}` (utilisées par T6), `body.read-mode`, `#reading`, `#readBtn`, `#readBar`, clés `localStorage` `pdfRead.fs|width|lh|font`.

- [ ] **Step 1 : Tests de contrat (échouent)**

Ajouter à `pdf_reading.test.mjs` :

```js
import fs from "node:fs";
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

test("contrat css : tailles du système, transitions ≤ 200 ms, aucune couleur en dur", () => {
  assert.match(css, /body\.read-mode #pages\{display:none\}/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, "hex en dur interdit — variables CSS seulement");
  for (const m of css.matchAll(/transition:[^;]*?(\d+)ms/g)) assert.ok(Number(m[1]) <= 200, m[0]);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /--read-fs/); assert.match(css, /--read-width/); assert.match(css, /--read-lh/);
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `node gallery/server/tests/pdf_reading.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'` — Expected : `fail 2`.

- [ ] **Step 3 : CSS**

Créer `gallery/assets/pdf_reading.css` :

```css
/* Mode lecture — colonne unique. Toute couleur vient des variables du thème
   (atelier_theme.js) ; corps 13–24 px réglable ; transitions 120–150 ms. */
body.read-mode #pages{display:none}
#reading{display:none}
body.read-mode #reading{display:block}
#reading{
  --read-fs:15px; --read-width:80ch; --read-lh:1.6; --read-font:-apple-system,"Helvetica Neue",sans-serif;
  margin:0 auto; padding:24px 20px 80px; max-width:var(--read-width);
  font:400 var(--read-fs)/var(--read-lh) var(--read-font); color:var(--txt);
  transition:max-width 150ms ease, font-size 150ms ease;
}
#reading.serif{--read-font:"Iowan Old Style","Palatino","Georgia",serif}
#reading h1,#reading h2,#reading h3{font-weight:600;letter-spacing:-0.01em;line-height:1.3;margin:1.6em 0 .6em}
#reading h1{font-size:1.5em}#reading h2{font-size:1.25em}#reading h3{font-size:1.1em}
#reading p{margin:0 0 1em}
#reading p.caption{font-size:.9em;color:var(--fg);margin:.4em 0 1.4em}
#reading p.footnote{font-size:.85em;color:var(--muted)}
#reading ul{padding-left:1.4em;margin:0 0 1em}
#reading figure{margin:1.2em 0 .4em;text-align:center}
#reading figure canvas{max-width:100%;height:auto;border-radius:6px;background:var(--card)}
#reading figure.math{margin:.6em 0}
#reading figure.math canvas{border-radius:0;background:transparent}
body.pdf-invert #reading figure canvas{filter:invert(1) hue-rotate(180deg)}
#reading .skeleton{height:12px;margin:0 0 12px;border-radius:6px;background:var(--card2);opacity:.6}
#reading .skeleton.w60{width:60%}
#reading .err{color:var(--destructive, var(--fg));padding:20px 0}
#reading mark.pdfhl{background:rgba(255,213,74,.4);color:inherit;border-radius:2px;cursor:pointer}
#reading .find-hit{background:rgba(120,170,255,.42);border-radius:2px}
#reading .find-cur{outline:1px solid var(--ring);outline-offset:2px;border-radius:6px}
#readBar{
  display:none;position:sticky;top:0;z-index:2;gap:8px;align-items:center;
  padding:8px 12px;margin:0 0 16px;border-radius:10px;background:var(--popover,var(--card));box-shadow:0 4px 16px rgba(0,0,0,.25);
  font:400 12px/1.5 var(--ui-font);color:var(--fg);
}
body.read-mode #readBar{display:flex}
#readBar .grp{display:flex;align-items:center;gap:4px}
#readBar .grp span{font-variant-numeric:tabular-nums;min-width:24px;text-align:center}
#readBar button{min-width:24px;height:24px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--fg);font:500 12px/1 var(--ui-font);cursor:pointer;transition:background 120ms ease}
#readBar button:hover{background:var(--card2)}
#readBar button[aria-pressed="true"]{background:var(--card2);color:var(--txt)}
@media (prefers-reduced-motion:reduce){#reading,#readBar button{transition:none}}
```

Variables vérifiées le 2026-09-06 dans `atelier_theme.js` : `--txt`, `--fg`, `--muted`, `--card`, `--card2`, `--popover`, `--ring`, `--destructive` existent ; `--ui-font` est déjà utilisée par le lecteur. Ne jamais introduire de hex ; les `rgba` reprennent les couleurs de surlignage existantes (`HL_COLORS`, `.find-hit`).

- [ ] **Step 4 : Markup et script dans `pdf_viewer.html`**

En tête (après `<script src="pdf_selection.js"></script>`, l.36) :

```html
<script src="pdf_reading.js"></script>
<link rel="stylesheet" href="pdf_reading.css">
```

Dans `<header>`, après le bouton `#invBtn` (l.284-292) :

```html
  <button id="readBtn" type="button" aria-pressed="false" title="Mode lecture — texte en une colonne (R)" aria-label="Mode lecture">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.5h10M3 6.5h10M3 9.5h7M3 12.5h5"/></svg>
  </button>
```

Après `<div id="pages"></div>` (l.293) :

```html
<section id="reading" hidden>
  <div id="readBar">
    <div class="grp"><button class="fsm" title="Texte plus petit (⌘−)">−</button><span class="fsv">15</span><button class="fsp" title="Texte plus grand (⌘+)">+</button></div>
    <div class="grp" data-set="width"><button data-v="65ch">65</button><button data-v="80ch">80</button><button data-v="100ch">100</button></div>
    <div class="grp" data-set="lh"><button data-v="1.4">1,4</button><button data-v="1.6">1,6</button><button data-v="1.8">1,8</button></div>
    <div class="grp" data-set="font"><button data-v="sans">Sans</button><button data-v="serif">Serif</button></div>
  </div>
  <div id="readBody"></div>
</section>
```

Retirer l'attribut `hidden` par script à l'entrée (le CSS gère l'affichage ; `hidden` évite un flash avant chargement du CSS). Dans le script inline, après la définition de `pdfRenderOrder` (l.~324) et AVANT `main()`, ajouter le contrôleur (il capture `pdf` via une fonction d'accès posée par `main()`) :

```js
// ---- mode lecture ---------------------------------------------------------
// Un seul document analysé par `rel` (GET /reflow, cache serveur). La colonne
// vit dans #reading ; #pages reste dans le DOM (annotations, synctex).
let __readingPdf = null;           // posé par main() : le document pdf.js
window.__readingMode = (function(){
  const R = window.AtelierPdfReading;
  const body = document.body, section = document.getElementById("reading");
  const host = document.getElementById("readBody"), btn = document.getElementById("readBtn");
  const bar = document.getElementById("readBar");
  const KEYS = {fs: "pdfRead.fs", width: "pdfRead.width", lh: "pdfRead.lh", font: "pdfRead.font"};
  const FS_MIN = 13, FS_MAX = 24;
  let doc = null, loading = null, on = false, cropObserver = null;
  const crops = new Map();       // blockId → {canvas, task}

  function pref(k, d){ try { return localStorage.getItem(KEYS[k]) || d; } catch(e){ return d; } }
  function setPref(k, v){ try { localStorage.setItem(KEYS[k], String(v)); } catch(e){} applyPrefs(); }
  function applyPrefs(){
    const fs = Math.max(FS_MIN, Math.min(FS_MAX, parseInt(pref("fs", "15"), 10) || 15));
    section.style.setProperty("--read-fs", fs + "px");
    section.style.setProperty("--read-width", pref("width", "80ch"));
    section.style.setProperty("--read-lh", pref("lh", "1.6"));
    section.classList.toggle("serif", pref("font", "sans") === "serif");
    bar.querySelector(".fsv").textContent = String(fs);
    bar.querySelector(".fsm").disabled = fs <= FS_MIN; bar.querySelector(".fsp").disabled = fs >= FS_MAX;
    for (const g of bar.querySelectorAll(".grp[data-set]")) {
      const cur = pref(g.dataset.set, {width: "80ch", lh: "1.6", font: "sans"}[g.dataset.set]);
      for (const b of g.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === cur));
    }
  }
  bar.querySelector(".fsm").onclick = () => setPref("fs", parseInt(pref("fs", "15"), 10) - 1);
  bar.querySelector(".fsp").onclick = () => setPref("fs", parseInt(pref("fs", "15"), 10) + 1);
  for (const g of bar.querySelectorAll(".grp[data-set]")) for (const b of g.querySelectorAll("button")) b.onclick = () => setPref(g.dataset.set, b.dataset.v);

  function skeleton(){
    host.innerHTML = "";
    for (let i = 0; i < 12; i++) { const s = document.createElement("div"); s.className = "skeleton" + (i % 4 === 3 ? " w60" : ""); host.appendChild(s); }
  }
  async function load(){
    if (doc) return doc;
    if (!loading) loading = fetch("/reflow?path=" + encodeURIComponent(rel)).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
      doc = j; return doc;
    }).finally(() => { loading = null; });
    return loading;
  }
  function makeFigure(block){
    const c = document.createElement("canvas");
    c.dataset.crop = String(block.id);
    const w = block.bbox[2] - block.bbox[0], h = block.bbox[3] - block.bbox[1];
    c.style.aspectRatio = w + " / " + h; c.style.width = "min(100%, " + Math.round(w * 1.5) + "px)";
    crops.set(block.id, {canvas: c, task: null, block});
    return c;
  }
  async function paintCrop(entry){
    if (!__readingPdf || entry.task || entry.canvas.dataset.done) return;
    const page = await __readingPdf.getPage(entry.block.page);
    const cssScale = 1.5;
    const cv = R.cropViewport(page, entry.block, cssScale, DPR);
    entry.canvas.width = cv.canvasWidth; entry.canvas.height = cv.canvasHeight;
    const ctx = entry.canvas.getContext("2d"); ctx.scale(DPR, DPR);
    entry.task = page.render({canvas: entry.canvas, canvasContext: ctx, viewport: cv.viewport, intent: "display"});
    try { await entry.task.promise; entry.canvas.dataset.done = "1"; }
    catch(e){ if (!isRenderCancel(e)) console.warn("reading crop", entry.block.id, e); }
    finally { entry.task = null; }
  }
  function observeCrops(){
    if (cropObserver) cropObserver.disconnect();
    cropObserver = new IntersectionObserver(entries => {
      for (const e of entries) {
        const entry = crops.get(Number(e.target.dataset.crop)); if (!entry) continue;
        if (e.isIntersecting) void paintCrop(entry);
        else if (entry.task) { try { entry.task.cancel(); } catch(_){} entry.task = null; entry.canvas.width = entry.canvas.height = 0; delete entry.canvas.dataset.done; }
      }
    }, {rootMargin: "100% 0px"});
    for (const {canvas} of crops.values()) cropObserver.observe(canvas);
  }
  function render(){
    host.innerHTML = ""; crops.clear();
    if (!doc.blocks.length) { const p = document.createElement("p"); p.className = "err"; p.textContent = "Ce PDF n'a pas de couche texte : rien à recomposer."; host.appendChild(p); return; }
    host.appendChild(R.buildReadingDom(doc, {document, makeFigure}));
    observeCrops();
    document.dispatchEvent(new CustomEvent("atelier-reading-rendered"));
  }
  function topPage(){
    const sc = document.scrollingElement || document.documentElement;
    const y = sc.scrollTop + 8;
    let best = 1;
    for (const pg of document.querySelectorAll("#pages .pg")) { if (pg.offsetTop <= y) best = +pg.dataset.page; else break; }
    return best;
  }
  function scrollToBlockOfPage(page){
    const el = host.querySelector('[data-page="' + page + '"]');
    if (el) el.scrollIntoView({block: "start"});
  }
  function currentBlockId(){
    const sc = document.scrollingElement || document.documentElement;
    const entries = [...host.querySelectorAll("[data-block]")].map(el => ({id: +el.dataset.block, top: el.offsetTop}));
    return R.blockAtScrollTop(entries, sc.scrollTop + 8);
  }
  async function enter(){
    if (on) return;
    const page = topPage();
    on = true; btn.setAttribute("aria-pressed", "true"); section.hidden = false; body.classList.add("read-mode");
    applyPrefs(); skeleton();
    try { await load(); render(); scrollToBlockOfPage(page); }
    catch(e){ host.innerHTML = ""; const p = document.createElement("p"); p.className = "err"; p.textContent = "Mode lecture indisponible — " + (e.message || e); host.appendChild(p); }
  }
  function leave(){
    if (!on) return;
    const page = doc ? R.pageForBlock(doc, currentBlockId()) : 1;
    on = false; btn.setAttribute("aria-pressed", "false"); body.classList.remove("read-mode"); section.hidden = true;
    const pg = document.querySelector('#pages .pg[data-page="' + page + '"]');
    if (pg) (document.scrollingElement || document.documentElement).scrollTop = pg.offsetTop;
  }
  btn.onclick = () => on ? leave() : enter();
  window.addEventListener("keydown", e => {
    if (e.key === "r" && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) { e.preventDefault(); on ? leave() : enter(); }
    if (!on || !(e.metaKey || e.ctrlKey)) return;
    if (e.key === "=" || e.key === "+") { e.preventDefault(); e.stopImmediatePropagation(); bar.querySelector(".fsp").click(); }
    if (e.key === "-") { e.preventDefault(); e.stopImmediatePropagation(); bar.querySelector(".fsm").click(); }
  }, true);   // capture : passe avant le raccourci de zoom du lecteur
  return {enter, leave, isOn: () => on, doc: () => doc, host, crops};
})();
```

Dans `main()`, juste après `pdf = await pdfjsLib.getDocument(...)` (et dans `__reloadPdf` après `pdf = doc;`) : `__readingPdf = pdf;`. Dans `__reloadPdf`, invalider le document de lecture : `if (window.__readingMode.isOn()) window.__readingMode.leave();` et remettre `doc = null` — exposer pour cela `reset()` dans l'objet retourné (`reset: () => { doc = null; }`) et l'appeler dans `__reloadPdf`.

`isRenderCancel` est déjà défini au niveau supérieur (l.~326) ; `DPR` aussi.

- [ ] **Step 5 : Vérifier**

```bash
node gallery/server/tests/pdf_reading.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'
node gallery/server/tests/pdf_render_pipeline.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'
node gallery/server/tests/pdf_annotations.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'
node gallery/server/tests/theme_contract.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'
node gallery/server/tests/studio_editor_contract.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)'
node gallery/server/tests/diff_suite.mjs 2>&1 | tail -2
node -e 'const s=require("fs").readFileSync("gallery/assets/pdf_viewer.html","utf8");const m=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);for(const c of m){new Function(c)}console.log("syntax ok")'
```
Expected : tout `fail 0`, `diff suite: ok`, `syntax ok`. Si `theme_contract` refuse une valeur du CSS (motifs `*pop*`, `*menu*` : `#readBar` n'en fait pas partie, mais `--bg-pop` peut être scanné), suivre son message.

- [ ] **Step 6 : Vérification manuelle rapide en navigateur (WebKit)**

```bash
cd rust && cargo build -p atelier-gallery && cd ..
mkdir -p /tmp/reading-proj && cp rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf /tmp/reading-proj/ && printf '{"files":[]}' > /tmp/reading-proj/figures_data.json && echo '<html></html>' > /tmp/reading-proj/figures_index.html
ATELIER_ASSETS_DIR=$PWD/gallery/assets ATELIER_STUDIO=1 rust/target/debug/atelier-gallery-server --root /tmp/reading-proj --port 8799 --no-watch &
sleep 1; curl -s "http://127.0.0.1:8799/reflow?path=twocol.pdf" | head -c 300; echo
```

Puis ouvrir `http://127.0.0.1:8799/.fig_thumbs/pdf_viewer.html?file=twocol.pdf` dans le navigateur de l'outil (Browser pane), cliquer le bouton lecture, vérifier : colonne affichée, titres, figure peinte, boutons de taille actifs, retour en vue pages sur la bonne page. Tuer le serveur (`kill %1`).

- [ ] **Step 7 : Commit**

```bash
git add gallery/assets/pdf_reading.css gallery/assets/pdf_viewer.html gallery/server/tests/pdf_reading.test.mjs
git commit -m "lecteur: mode lecture — bouton, colonne, découpes, typographie, position (plan 078 T5)"
```

---

### Task 6 : Recherche, lien de passage et annotations en mode lecture

**Files:**
- Modify: `gallery/assets/pdf_viewer.html` (recherche ~l.1330-1410 ; `revealLinkedPassage` ~l.640 ; pilule `onAnnotate` l.994 ; `addHighlightFromSel` l.1576 ; `drawAnnots`/`annotMenu` ; contrôleur de lecture de T5)
- Test: `gallery/server/tests/pdf_reading.test.mjs`

**Interfaces:**
- Consumes : `window.__readingMode` (T5), `AtelierPdfReading.anchorAnnotations / selectionToAnnotation / readingText`, `PDF_ANNOTS`, `saveAnnots()`, `drawAnnots(pg, n)`, `annotMenu(a, x, y)`, `LAST_COLOR`, `ANNOTS_LOADED`.
- Produces : `function drawReadingAnnots()` ; `function addHighlightFromReadingSel(kind, color)` ; la recherche accepte une cible `#reading`.

- [ ] **Step 1 : Tests de contrat (échouent)**

```js
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
```

- [ ] **Step 2 : Vérifier l'échec** — `node gallery/server/tests/pdf_reading.test.mjs 2>&1 | grep -E '^ℹ fail'` → `fail 1`.

- [ ] **Step 3 : Recherche**

Dans la fonction de recherche (l.~1373, là où `spans` est construit à partir de `.textLayer span`), remplacer la source des spans par :

```js
      const spans = window.__readingMode.isOn()
        ? [...document.querySelectorAll("#readBody [data-block]:not(figure)")]
        : [...document.querySelectorAll(".textLayer span")];
```

En mode lecture, un « span » est un bloc entier ; `findAllSpanRanges` renvoie des index de blocs. Le surlignage de résultat pose `.find-hit` / `.find-cur` sur les spans (l.1363-1376) ; les mêmes classes sur `p`/`h2` fonctionnent, le CSS de T5 les définit déjà pour `#reading`. Le nettoyage l.1363 (`querySelectorAll(".textLayer span.find-hit, …")`) doit aussi couvrir `#readBody .find-hit, #readBody .find-cur`. Le `scrollIntoView` du résultat courant reste valable. À la sortie/entrée du mode lecture, relancer la recherche si la barre est ouverte (appeler la fonction de recherche existante depuis `enter()`/`leave()` après rendu ; brancher sur l'événement `atelier-reading-rendered`).

- [ ] **Step 4 : Passage `?quote`**

Après `revealLinkedPassage` (l.~640), ajouter :

```js
function revealReadingPassage(){
  if(!targetQuote || !window.__readingMode.isOn()) return false;
  const doc = window.__readingMode.doc(); if(!doc) return false;
  const hit = window.AtelierPdfReading.anchorAnnotations(doc, [{id:"__q", kind:"comment", page:targetPage, text:targetQuote}])[0];
  if(!hit) return false;
  const el = document.querySelector('#readBody [data-block="' + hit.blockId + '"]');
  if(!el) return false;
  el.scrollIntoView({block:"center"});
  el.classList.add("find-cur"); setTimeout(() => el.classList.remove("find-cur"), 2000);
  document.getElementById("status").textContent = "Passage retrouvé — p. " + doc.blocks.find(b => b.id === hit.blockId).page;
  return true;
}
document.addEventListener("atelier-reading-rendered", () => { revealReadingPassage(); });
```

- [ ] **Step 5 : Annotations — affichage**

Ajouter (près de `drawAnnots`) :

```js
/** Surlignages texte (comment/hl) reportés dans la colonne de lecture. */
function drawReadingAnnots(){
  const doc = window.__readingMode.doc(); if(!doc) return;
  const host = window.__readingMode.host;
  for (const m of host.querySelectorAll("mark.pdfhl")) m.replaceWith(...m.childNodes);
  host.normalize();
  const anchored = window.AtelierPdfReading.anchorAnnotations(doc, PDF_ANNOTS);
  // du dernier au premier dans chaque bloc pour garder les offsets valides
  anchored.sort((a, b) => a.blockId - b.blockId || b.start - a.start);
  for (const h of anchored) {
    const el = host.querySelector('[data-block="' + h.blockId + '"]'); if(!el || el.tagName === "FIGURE") continue;
    const a = PDF_ANNOTS.find(x => String(x.id) === String(h.annotId)); if(!a) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let pos = 0, range = document.createRange(), s = null, e = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const len = n.textContent.length;
      if (s === null && h.start < pos + len) { s = [n, h.start - pos]; }
      if (h.end <= pos + len) { e = [n, h.end - pos]; break; }
      pos += len;
    }
    if (!s || !e) continue;
    range.setStart(s[0], s[1]); range.setEnd(e[0], e[1]);
    const mark = document.createElement("mark"); mark.className = "pdfhl"; mark.dataset.annot = String(a.id);
    if (a.color) mark.style.background = a.color;
    try { range.surroundContents(mark); } catch(_) { /* plage à cheval sur des nœuds : ignorée, l'annotation reste visible en vue pages */ }
    mark.onclick = (ev) => { ev.stopPropagation(); annotMenu(a, ev.clientX, ev.clientY); };
  }
}
document.addEventListener("atelier-reading-rendered", drawReadingAnnots);
```

Appeler `drawReadingAnnots()` là où `drawAnnots` est rappelé pour toutes les pages après une modification (`saveAnnots` puis boucle `document.querySelectorAll(".pg")…` — l.~1590 et l.~1600 du handler `message`) : ajouter `if (window.__readingMode.isOn()) drawReadingAnnots();`.

- [ ] **Step 6 : Annotations — création depuis la colonne**

Ajouter près de `addHighlightFromSel` :

```js
/** Sélection dans #readBody → annotation `comment` ordinaire (rects reconstitués par ligne). */
function addHighlightFromReadingSel(kind, color){
  if(!ANNOTS_LOADED){ document.getElementById("status").textContent = "Les annotations chargent encore. Réessaie dans un instant."; return; }
  const doc = window.__readingMode.doc(); const sel = window.getSelection();
  if(!doc || !sel || sel.isCollapsed) return;
  const rng = sel.getRangeAt(0);
  const el = rng.startContainer.parentElement?.closest("#readBody [data-block]");
  if(!el || el !== (rng.endContainer.parentElement?.closest("#readBody [data-block]"))) { document.getElementById("status").textContent = "Sélectionne à l'intérieur d'un seul paragraphe."; return; }
  const block = doc.blocks.find(b => b.id === +el.dataset.block); if(!block || !block.lines.length) return;
  const pre = document.createRange(); pre.selectNodeContents(el); pre.setEnd(rng.startContainer, rng.startOffset);
  const start = pre.toString().length, end = start + rng.toString().length;
  const dim = doc.pages[block.page - 1];
  const built = window.AtelierPdfReading.selectionToAnnotation(block, start, end, dim);
  if(!built.rects.length) return;
  const a = {id: Date.now() + "-r" + block.page, page: built.page, rects: built.rects, text: built.text, kind: kind || "comment", color: color || LAST_COLOR, note: ""};
  if(a.kind === "comment") { a.number = 1 + Math.max(0, ...PDF_ANNOTS.filter(item => item.kind === "comment").map(item => Number(item.number) || 0)); a.fresh = true; }
  PDF_ANNOTS.push(a); saveAnnots();
  const pg = document.querySelector('.pg[data-page="' + a.page + '"]'); if(pg) drawAnnots(pg, a.page);
  drawReadingAnnots(); sel.removeAllRanges();
  const r = rng.getBoundingClientRect(); if(a.kind === "comment") annotMenu(a, r.left, r.bottom);
}
```

Brancher la pilule de sélection : à l.994, `onAnnotate: () => (window.__readingMode.isOn() ? addHighlightFromReadingSel("comment", LAST_COLOR) : addHighlightFromSel("comment", LAST_COLOR))`. Vérifier comment la pilule est affichée sur une sélection (`selectionchange` / `mouseup` sur `.textLayer`) et étendre la condition d'affichage à une sélection dans `#readBody` (chercher l'écouteur qui appelle `selPill.show`/équivalent ; ajouter `|| e.target.closest("#readBody")`). Les zones (`area`) et notes (`note`) : l'outil correspondant est désactivé en mode lecture (`body.read-mode #annPane .tool-area, body.read-mode #annPane .tool-note{opacity:.4;pointer-events:none}` — adapter aux classes réelles des outils du panneau).

- [ ] **Step 7 : Vérifier**

Mêmes commandes que T5 étape 5 (toutes `fail 0`, `diff suite: ok`, `syntax ok`) puis vérification navigateur : sélectionner une phrase dans la colonne → Annoter → revenir en vue pages → le surlignage est sur la bonne ligne de la page ; Cmd+F « albedo » compte des résultats en mode lecture ; ouvrir `…pdf_viewer.html?file=twocol.pdf&page=1&quote=energy%20balance%20of%20glaciers` puis appuyer sur `r` : le paragraphe est mis en évidence.

- [ ] **Step 8 : Commit**

```bash
git add gallery/assets/pdf_viewer.html gallery/assets/pdf_reading.css gallery/server/tests/pdf_reading.test.mjs
git commit -m "lecteur: recherche, passage et annotations en mode lecture (plan 078 T6)"
```

---

### Task 7 : E2E WebKit, staging, documentation

**Files:**
- Create: `gallery/tests/e2e/pdf_reading.spec.js`
- Modify: `gallery/playwright.config.js` (projet `webkit-reading`)
- Modify: `docs/PIEGES_CONNUS.md` (section « Mode lecture »), `plans/README.md` (ligne 078)

- [ ] **Step 1 : Spec Playwright**

Ajouter au tableau `projects` de `gallery/playwright.config.js` :

```js
    {
      name: 'webkit-reading',
      testMatch: /pdf_reading\.spec\.js/,
      use: {browserName: 'webkit'},
    },
```

Créer `gallery/tests/e2e/pdf_reading.spec.js` (reprendre `freePort`, `stop`, le spawn du binaire Rust et `removeTempRoot` de `latex_lezer.spec.js`, l.1-80) :

```js
// Mode lecture du lecteur PDF : colonne, découpe, typographie, recherche,
// annotation aller-retour. Rejoué en WebKit (moteur du WKWebView).
import {test, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {removeTempRoot} from './temp-root.js';

const GALLERY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(GALLERY, '..');
const FIXTURE = path.join(REPO, 'rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf');

function freePort(){ return new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const {port} = s.address(); s.close(() => res(port)); }); }); }
async function stop(server){ if (!server || server.exitCode !== null) return; server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }

let root, server, port;
test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'atelier-reading-'));
  copyFileSync(FIXTURE, path.join(root, 'twocol.pdf'));
  writeFileSync(path.join(root, 'figures_data.json'), '{"files":[]}');
  writeFileSync(path.join(root, 'figures_index.html'), '<html></html>');
  port = await freePort();
  server = spawn(path.join(REPO, 'rust/target/debug/atelier-gallery-server'), ['--root', root, '--port', String(port), '--no-watch'],
    {env: {...process.env, ATELIER_ASSETS_DIR: path.join(GALLERY, 'assets'), ATELIER_STUDIO: '1'}, stdio: 'ignore'});
  await new Promise(r => setTimeout(r, 800));
});
test.afterAll(async () => { await stop(server); removeTempRoot(root); });

test('mode lecture : colonne, découpe, taille, recherche, annotation aller-retour', async ({page}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/statfile/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=twocol.pdf`);
  await expect(page.locator('.pg canvas').first()).toHaveJSProperty('width', expect.any(Number));
  await page.click('#readBtn');
  await expect(page.locator('body')).toHaveClass(/read-mode/);
  await expect(page.locator('#readBody h1, #readBody h2').first()).toBeVisible();
  await expect(page.locator('#readBody p').first()).toContainText(/albedo/i);
  const fig = page.locator('#readBody figure canvas').first();
  await fig.scrollIntoViewIfNeeded();
  await expect.poll(() => fig.evaluate(c => c.width)).toBeGreaterThan(0);
  // taille de texte persistée
  await page.click('#readBar .fsp');
  expect(await page.evaluate(() => localStorage.getItem('pdfRead.fs'))).toBe('16');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('reading')).fontSize)).toBe('16px');
  // recherche
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
  await page.fill('#findBar input', 'glaciers');
  await expect(page.locator('#findBar .cnt')).toHaveText(/\d+\/\d+/);
  await page.keyboard.press('Escape');
  // annotation depuis la colonne
  const p = page.locator('#readBody p').first();
  await p.evaluate(el => { const r = document.createRange(); const t = el.firstChild; r.setStart(t, 0); r.setEnd(t, Math.min(30, t.textContent.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); });
  await page.evaluate(() => window.addHighlightFromReadingSel('comment'));
  await expect(page.locator('#readBody mark.pdfhl')).toHaveCount(1);
  await page.click('#readBtn');
  await expect(page.locator('body')).not.toHaveClass(/read-mode/);
  await expect(page.locator('.pg[data-page="1"] .pdfhl')).toHaveCount(1);
  expect(errors).toEqual([]);
});
```

`window.addHighlightFromReadingSel` doit être une fonction globale du script classique (déclarée avec `function`, elle l'est). Si le lecteur appelle `annotMenu` (popover) après création, fermer avec `Escape` avant de re-cliquer `#readBtn`.

- [ ] **Step 2 : Lancer**

```bash
cd rust && cargo build -p atelier-gallery && cd ../gallery && npx playwright test --project=webkit-reading
```
Expected : `1 passed`. STOP si une erreur console persiste après une correction.

- [ ] **Step 3 : Staging et suites complètes**

```bash
bash scripts/stage-gallery.sh | tail -2
ls src-tauri/gallery-dist/assets | grep pdf_reading
cd rust && cargo test -p atelier-gallery 2>&1 | grep -E 'test result|FAILED' ; cd ..
for t in pdf_reading pdf_render_pipeline pdf_selection pdf_annotations pdf_passage theme_contract studio_editor_contract; do printf "%s: " $t; node gallery/server/tests/$t.test.mjs 2>&1 | grep -E '^ℹ (pass|fail)' | tr '\n' ' '; echo; done
node gallery/server/tests/diff_suite.mjs | tail -2
```
Expected : `pdf_reading.js` et `pdf_reading.css` présents dans dist ; tout vert.

- [ ] **Step 4 : Documentation**

Dans `docs/PIEGES_CONNUS.md`, ajouter une entrée :

```markdown
## Mode lecture PDF (plan 078)
- Les offsets de sélection et d'ancrage se calculent sur `readingText(block)` (lignes jointes par un espace, césures conservées), jamais sur `block.text` dé-césuré : le DOM affiche `readingText`. Changer l'un sans l'autre décale tous les surlignages.
- `pdftohtml -xml` : ordre du flux = ordre de lecture sur les PDF LaTeX ; le regroupement retrie par colonne puis y. Un PDF où l'ordre est faux se corrige dans `group_blocks`, pas dans le JS.
- Le cache `/reflow` est invalidé par `REFLOW_VERSION` : l'incrémenter à tout changement d'heuristique, sinon les anciens JSON restent servis.
- Cmd+/− en mode lecture changent la taille du texte (écouteur en capture) ; en vue pages ils zooment.
```

Dans `plans/README.md`, ajouter la ligne `| 078 | Mode lecture PDF (reflow une colonne, annotations) | P2 | L | lot 1 | DONE (…) |` avec les commits.

- [ ] **Step 5 : Commit final**

```bash
git add gallery/tests/e2e/pdf_reading.spec.js gallery/playwright.config.js docs/PIEGES_CONNUS.md plans/README.md
git commit -m "lecteur: e2e WebKit du mode lecture, staging, pièges (plan 078 T7)"
```

---

## Self-review (fait à l'écriture)

- Couverture du spec : analyse Rust (T1-T2), cache + route + 502/404 + HEAD (T3), fonctions pures (T4), bouton/colonne/découpes/typo/position (T5), recherche/quote/annotations affichage+création/outils désactivés (T6), e2e/staging/docs (T7). PDF sans texte → `blocks:[]` géré dans `render()` (T5). `pdftohtml` absent → 502 + message (T3, T5 affiche l'erreur ; le bouton n'est pas désactivé a priori mais le message le remplace — déviation acceptée).
- Cohérence des noms : `readingText`, `buildReadingDom`, `cropViewport`, `selectionToAnnotation`, `anchorAnnotations`, `blockAtScrollTop`, `pageForBlock` identiques T4/T5/T6 ; `window.__readingMode.{enter,leave,isOn,doc,host,crops,reset}` ; `REFLOW_VERSION`, `Source`, `ReflowDoc`, `Kind` identiques T2/T3.
- Vérifié le 2026-09-06 : `findAllSpanRanges` renvoie `[{start,end}]` en index de spans ; `Server` expose `port` et `root` ; classes de recherche `.find-hit`/`.find-cur` ; variables du thème listées en T5.
