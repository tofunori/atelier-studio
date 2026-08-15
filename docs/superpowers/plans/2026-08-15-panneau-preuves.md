# Panneau Preuves — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une demande de référence au chat produit une carte passage (citation exacte, source, page) épinglable dans un panneau Preuves par projet, ancré à la phrase de manuscrit appuyée.

**Architecture:** Convention markdown (lien `#atelier-zotero-passage` seul dans son paragraphe → carte) rendue par le pipeline md.tsx existant ; épingles stockées côté backend **Rust seulement** (Application Support, écriture atomique) via trois messages WS ; nouvelle surface « Preuves » dans le registre `surfaces.tsx` ; l'outil CLI partagé `atelier-zotero-passages` gagne un mode corpus.

**Tech Stack:** Rust (atelier-runtime), React/TS (Vite), vitest, cargo test. AUCUN portage Node du contrat WS (décision Thierry — le soak `ATELIER_BACKEND=node` n'a pas les Preuves).

**Spec:** `docs/superpowers/specs/2026-08-15-panneau-preuves-design.md`

## Global Constraints

- Système de design CONTRAIGNANT (CLAUDE.md) : tailles 10/11/12/13/15 px, poids 400/500/600, rayons 6/10/999, espacement multiples de 4, gris via `--fg/--fg2/--muted/--muted2`, couleurs via variables CSS, SVG trait fin 1.3–1.5, jamais de `<button>` nu (Button/IconButton/RowButton), motion 120–150 ms opacity/transform + `prefers-reduced-motion`.
- Toute chaîne visible passe par `t()` (`src/lib/i18n.ts`, dictionnaires fr + en).
- `npx tsc --noEmit`, `npx vite build`, `npx vitest run src/components`, `cargo test -p atelier-runtime` doivent passer à CHAQUE tâche.
- Committer petit et tôt (démon d'auto-commit : untracked ≠ protégé).
- Ne jamais écrire les épingles dans le repo projet — Application Support uniquement.
- Ne pas lancer l'app (`npm run tauri dev` interdit aux agents) ; la relance finale suit `docs/PROTOCOLE_RELANCE.md`.

---

### Task 1: Store d'épingles Rust (`evidence.rs`)

**Files:**
- Create: `rust/crates/atelier-runtime/src/evidence.rs`
- Modify: `rust/crates/atelier-runtime/src/lib.rs` (ajouter `pub mod evidence;` à côté des autres `pub mod`)

**Interfaces:**
- Consumes: `crate::atomic::write_file_atomic(path, data)` (existe, `atomic.rs:9`).
- Produces (Task 2 en dépend) :
  - `pub struct EvidencePin { pub id: String, pub ts: u64, pub quote: String, pub zotero_key: String, pub pdf_key: String, pub pdf_file: String, pub page: u32, pub cite_label: String, pub supports: Option<EvidenceSupports>, pub thread_id: Option<String>, pub provider: Option<String> }` (serde `rename_all = "camelCase"`)
  - `pub struct EvidenceSupports { pub text: String, pub file: Option<String>, pub lines: Option<String> }`
  - `pub fn list_pins(app_dir: &Path, project_root: &str) -> Vec<EvidencePin>`
  - `pub fn add_pin(app_dir: &Path, project_root: &str, pin: EvidencePin) -> std::io::Result<Vec<EvidencePin>>` (id vide → uuid ; ts 0 → maintenant ; dédup sur `(pdf_key, page, quote)` : ré-épingler le même passage ne duplique pas, il remonte en tête)
  - `pub fn remove_pin(app_dir: &Path, project_root: &str, pin_id: &str) -> std::io::Result<Vec<EvidencePin>>`
  - `pub fn fig_selection_supports(max_age_secs: u64) -> Option<EvidenceSupports>` — lit `~/.claude/fig-selection.json` `{ text, rel, lines, ts }` ; retourne None si absent, text vide, ou `ts` plus vieux que `max_age_secs` (appelant : 900).
- Stockage : `app_dir/evidence/<sha256(project_root)>.json`, contenu `{ "version": 1, "pins": [...] }`, tri ts desc à l'écriture.

- [ ] **Step 1 : test qui échoue** — dans `evidence.rs`, module `#[cfg(test)]` :

```rust
#[test]
fn add_list_remove_roundtrip() {
    let dir = std::env::temp_dir().join(format!("evidence-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let pin = EvidencePin {
        id: String::new(), ts: 0,
        quote: "reducing summer albedo by 0.05".into(),
        zotero_key: "ABC123".into(), pdf_key: "PDF456".into(),
        pdf_file: "Williamson 2021.pdf".into(), page: 7,
        cite_label: "Williamson 2021".into(),
        supports: Some(EvidenceSupports { text: "Les aérosols abaissent l'albédo.".into(), file: Some("intro.tex".into()), lines: Some("L42".into()) }),
        thread_id: None, provider: Some("claude".into()),
    };
    let pins = add_pin(&dir, "/proj/a", pin.clone()).unwrap();
    assert_eq!(pins.len(), 1);
    assert!(!pins[0].id.is_empty() && pins[0].ts > 0);
    // dédup : même (pdf_key, page, quote) → toujours 1
    assert_eq!(add_pin(&dir, "/proj/a", pin).unwrap().len(), 1);
    // isolation par projet
    assert!(list_pins(&dir, "/proj/b").is_empty());
    let id = list_pins(&dir, "/proj/a")[0].id.clone();
    assert!(remove_pin(&dir, "/proj/a", &id).unwrap().is_empty());
}

#[test]
fn fig_selection_stale_returns_none() {
    // pas de fichier / ts périmé → None (on ne peut pas écrire dans ~/.claude
    // depuis le test : couvrir le chemin "absent" suffit ici, le parsing est
    // couvert par un test unitaire de parse_fig_selection sur une chaîne)
    let parsed = parse_fig_selection(r#"{"text":"phrase","rel":"intro.tex","lines":"L42","ts":0}"#, 900, 10_000_000_000);
    assert!(parsed.is_none()); // ts=0 trop vieux vs now=10^10 ms
    let fresh = parse_fig_selection(r#"{"text":"phrase","rel":"intro.tex","lines":"L42","ts":9999999999000}"#, 900, 9_999_999_999_500);
    assert_eq!(fresh.unwrap().text, "phrase");
}
```

- [ ] **Step 2 : vérifier l'échec** — `cargo test -p atelier-runtime evidence` → erreurs de compilation (types absents). C'est l'échec attendu.
- [ ] **Step 3 : implémentation minimale** — structs serde camelCase ; `store_path()` = `app_dir.join("evidence").join(format!("{:x}.json", Sha256::digest(project_root)))` (sha2 déjà dépendance du crate, cf. `journal.rs:5`) ; `load()` tolérant (fichier absent/corrompu → vec vide) ; écriture via `write_file_atomic` après `create_dir_all` ; `parse_fig_selection(json, max_age_secs, now_ms)` pur (testable), `fig_selection_supports` = lecture de `dirs::home_dir()/.claude/fig-selection.json` + appel du pur. `ts` du fig-selection est en millisecondes.
- [ ] **Step 4 : vérifier le vert** — `cargo test -p atelier-runtime evidence` → ok.
- [ ] **Step 5 : commit** — `git add rust/crates/atelier-runtime/src/evidence.rs rust/crates/atelier-runtime/src/lib.rs && git commit -m "feat(preuves): store d'épingles par projet — atomique, dédupliqué, hors repo"`

### Task 2: Messages WS `pinPassage` / `listPins` / `unpinPassage`

**Files:**
- Modify: `rust/crates/atelier-runtime/src/ws_router.rs` (`ALL_MESSAGE_TYPES` ~l.36, match de `route_ws` ~l.620, handlers près de `handle_kb_gbrain_page` ~l.2120, tests près de `route_ws` tests ~l.3900)

**Interfaces:**
- Consumes: Task 1 (`evidence::{add_pin, remove_pin, list_pins, fig_selection_supports, EvidencePin, EvidenceSupports}`), `state.app_dir()`.
- Produces (Tasks 5–6 en dépendent) — réponse UNIQUE aux trois messages :
  `{ "type": "evidencePins", "projectRoot": "...", "pins": [EvidencePin en camelCase] }` (erreur : + `"error": "..."`).
  - `pinPassage { projectRoot, pin: { quote, zoteroKey, pdfKey, pdfFile, page, citeLabel, supports?, threadId?, provider? } }` — si `pin.supports` absent → `fig_selection_supports(900)`.
  - `listPins { projectRoot }` ; `unpinPassage { projectRoot, pinId }`.

- [ ] **Step 1 : test qui échoue** (pattern du test `deleteThread` ws_router.rs:3903 — même harnais `route_ws(&s, ...)`) :

```rust
#[tokio::test]
async fn evidence_pin_roundtrip_over_ws() {
    let s = test_state(); // helper existant des tests route_ws
    let pin = r#"{"type":"pinPassage","projectRoot":"/proj/a","pin":{"quote":"q","zoteroKey":"Z","pdfKey":"P","pdfFile":"a.pdf","page":3,"citeLabel":"Williamson 2021"}}"#;
    let out = route_ws(&s, pin).await;
    let v: serde_json::Value = serde_json::from_str(&out[0]).unwrap();
    assert_eq!(v["type"], "evidencePins");
    assert_eq!(v["pins"][0]["citeLabel"], "Williamson 2021");
    let id = v["pins"][0]["id"].as_str().unwrap().to_string();
    let list = route_ws(&s, r#"{"type":"listPins","projectRoot":"/proj/a"}"#).await;
    let lv: serde_json::Value = serde_json::from_str(&list[0]).unwrap();
    assert_eq!(lv["pins"].as_array().unwrap().len(), 1);
    let unpin = format!(r#"{{"type":"unpinPassage","projectRoot":"/proj/a","pinId":"{id}"}}"#);
    let uv: serde_json::Value = serde_json::from_str(&route_ws(&s, &unpin).await[0]).unwrap();
    assert!(uv["pins"].as_array().unwrap().is_empty());
}
```

- [ ] **Step 2 : vérifier l'échec** — `cargo test -p atelier-runtime evidence_pin_roundtrip` → le message inconnu ne répond pas `evidencePins` (assert échoue).
- [ ] **Step 3 : implémentation** — 3 entrées dans `ALL_MESSAGE_TYPES` + 3 bras dans le match → `handle_pin_passage/handle_list_pins/handle_unpin_passage` : désérialiser, appeler Task 1, répondre `json_msg(...)` (pattern `handle_kb_gbrain_page`). `projectRoot` vide → réponse avec `error`.
- [ ] **Step 4 : vert** — `cargo test -p atelier-runtime` complet (rien d'autre ne casse).
- [ ] **Step 5 : commit** — `git commit -m "feat(preuves): contrat WS pinPassage/listPins/unpinPassage (Rust seulement)"`

### Task 3: Mode corpus de l'outil CLI passages

**Files:**
- Modify: `sidecar/zotero_passages.mjs` (outil PARTAGÉ invoqué par le backend Rust — pas un portage Node du contrat, c'est le CLI que l'agent appelle)
- Modify: `sidecar/atelier-zotero-passages` (parsing des args)
- Test: `sidecar/zotero_passages.test.mjs`

**Interfaces:**
- Consumes: cache existant `~/Library/Application Support/atelier-studio/zotero-passages/*.json` (`{version, pages:[{page,text}]}` + méta zotero du fichier), scoring existant (`tokens`, expansions), `passageLink`.
- Produces: `search --corpus --query "..." --limit 5` → même JSON stdout que le mode mono-PDF (`results: [{quote, page, score, markdownLink, pdfFile, ...}]`), agrégé sur TOUS les index du cache, tri score desc. Sans méta suffisante pour `passageLink`, l'entrée est exclue (jamais de lien approximatif).

- [ ] **Step 1 : test qui échoue** — dans `zotero_passages.test.mjs`, suivre le pattern des tests search existants (fixtures d'index écrites dans un tmpdir passé en override du cache dir — si l'override n'existe pas, l'ajouter : `searchCorpus({ cacheDir, query, limit })` exporté) :

```js
it("corpus : agrège les index du cache et garde les liens exacts", () => {
  const dir = mkdtempSync(join(tmpdir(), "zp-"));
  writeFixtureIndex(dir, "aaa.json", { pdfFile: "Williamson 2021.pdf", zoteroKey: "Z1", pdfKey: "P1",
    pages: [{ page: 7, text: "Fire aerosol deposition reduced summer albedo substantially." }] });
  writeFixtureIndex(dir, "bbb.json", { pdfFile: "Marshall 2022.pdf", zoteroKey: "Z2", pdfKey: "P2",
    pages: [{ page: 3, text: "Black carbon concentrations peaked in late July." }] });
  const out = searchCorpus({ cacheDir: dir, query: "albedo aerosol", limit: 5 });
  expect(out.results[0].pdfFile).toBe("Williamson 2021.pdf");
  expect(out.results[0].markdownLink).toContain("#atelier-zotero-passage?");
  expect(out.results.every((r) => r.quote.length > 0)).toBe(true);
});
```

(Si les index du cache v2 ne portent pas zoteroKey/pdfKey/pdfFile, étendre l'ÉCRITURE du cache pour les inclure à partir de maintenant, et exclure du corpus les index legacy sans méta — le test fixture écrit le format enrichi.)

- [ ] **Step 2 : échec** — `cd sidecar && npx vitest run zotero_passages.test.mjs` → `searchCorpus is not a function`.
- [ ] **Step 3 : implémentation** — lister `*.json` du cacheDir, charger, scorer chaque page avec la fonction de scoring existante, découper la citation comme le mode mono-PDF, construire `markdownLink` via `passageLink`, fusionner + trier + `slice(limit)`. CLI : `--corpus` sans `--pdf` → `searchCorpus` avec le cacheDir réel.
- [ ] **Step 4 : vert** — `cd sidecar && npx vitest run` (suite complète).
- [ ] **Step 5 : commit** — `git commit -m "feat(preuves): recherche corpus dans l'outil atelier-zotero-passages"`

### Task 4: Instruction agent renforcée (Rust)

**Files:**
- Modify: `rust/crates/atelier-runtime/src/send.rs:43-49` (`with_zotero_passage_instruction`)
- Test: chercher `atelier-zotero-passages` dans les tests de `send.rs`/`parity.rs` (`grep -rn "atelier-zotero-passages" rust/crates/*/src`) et mettre à jour l'assert du texte.

**Interfaces:**
- Consumes: Task 3 (`--corpus`).
- Produces: instruction injectée au premier tour contenant EXACTEMENT les ajouts ci-dessous (le `.mjs` reste inchangé — décision Rust seulement).

- [ ] **Step 1 : test qui échoue** — ajouter à côté des tests existants de l'instruction :

```rust
#[test]
fn zotero_instruction_couvre_le_flux_reference() {
    let out = with_zotero_passage_instruction("p".into(), "/srv");
    assert!(out.contains("--corpus"));
    assert!(out.contains("its own paragraph"));
    assert!(out.contains("Never invent a passage"));
}
```

- [ ] **Step 2 : échec** — `cargo test -p atelier-runtime zotero_instruction` → assert `--corpus` échoue.
- [ ] **Step 3 : implémentation** — étendre le texte de l'instruction (anglais, comme l'existant) avec, après la phrase sur `<zotero-reference>` :
  « When the user asks for a reference or supporting evidence for a sentence they are writing (no specific article attached), call the tool once with `search --corpus --query <the-claim> --limit 5` instead. When you present a found passage as the answer, put its markdownLink ALONE in its own paragraph (blank line before and after) so the app renders it as a passage card; keep your explanation in separate paragraphs. » Les invariants existants (quote exacte, jamais inventer) restent.
- [ ] **Step 4 : vert** — `cargo test -p atelier-runtime`.
- [ ] **Step 5 : commit** — `git commit -m "feat(preuves): instruction corpus + carte (lien seul dans son paragraphe)"`

### Task 5: Carte passage dans le chat

**Files:**
- Create: `src/components/chat/PassageCard.tsx`
- Create: `src/lib/evidencePins.ts` (store module : subscribe/snapshot/request, pattern exact de `src/lib/kbSources.ts`)
- Modify: `src/components/chat/md.tsx` (composant `p` dans `MD_COMPONENTS`; export `lonePassageRef(children)`)
- Modify: `src/App.tsx` (dispatch WS : `msg.type === "evidencePins"` → push au store evidencePins, à côté du bloc `msg.type === "highlights"` ~l.1362)
- Modify: `src/lib/i18n.ts` (clés fr+en, voir Step 3)
- Modify: `src/App.css` (styles `.passage-card*`, section chat)
- Test: `src/components/chat/PassageCard.test.tsx`

**Interfaces:**
- Consumes: `parseZoteroPassageRef` + `openZoteroPassage` (md.tsx), `citeLabel` (turnParts.tsx), `wsSend` (`lib/wsBus`), contrat Task 2 (`pinPassage`/`evidencePins`).
- Produces: `MD_COMPONENTS.p` — paragraphe dont l'unique enfant élément est un lien passage → `<PassageCard refData={...} />`; sinon `<p>` normal. `evidencePins.ts` expose `subscribeEvidencePins`, `evidencePinsSnapshot`, `requestEvidencePins(projectRoot)`, `pushEvidencePins(msg)`, `isPinned(pdfKey, page, quote)`.

- [ ] **Step 1 : tests qui échouent** :

```tsx
// PassageCard.test.tsx — RTL, pattern des tests chat existants
it("repliée : une ligne, citation tronquée, cite + page", () => {
  render(<PassageCard refData={REF} />); // REF = ZoteroPassageRef fixture (quote longue)
  expect(screen.getByText(/Williamson/)).toBeTruthy();
  expect(document.querySelector(".passage-card.open")).toBeNull();
});
it("dépliée au clic : citation complète + actions", () => {
  render(<PassageCard refData={REF} />);
  fireEvent.click(screen.getByRole("button", { name: /déplier|expand/i }));
  expect(document.querySelector(".passage-card.open")).toBeTruthy();
});
it("lien passage SEUL dans un paragraphe → carte ; inline → pilule", () => {
  const md = `Avant.\n\n[« q »](#atelier-zotero-passage?key=A1&pdfKey=B2&file=a.pdf&page=7&quote=q)\n\nEt [inline](#atelier-zotero-passage?key=A1&pdfKey=B2&file=a.pdf&page=7&quote=q) ici.`;
  render(<ReactMarkdown components={MD_COMPONENTS as any}>{md}</ReactMarkdown>);
  expect(document.querySelectorAll(".passage-card")).toHaveLength(1);
  expect(document.querySelectorAll(".zotero-passage-ref")).toHaveLength(1);
});
```

- [ ] **Step 2 : échec** — `npx vitest run src/components/chat/PassageCard.test.tsx` → composants absents.
- [ ] **Step 3 : implémentation** —
  - `PassageCard` : état `open` local ; repliée = `RowButton` pleine largeur (max-width 540px) avec `.passage-card-quote` (ellipsis, italique, fs-m 13), `citeLabel(ref.pdfFile)` + ` · p. {page}` en `--muted` tabular-nums, `Tick` + `IconButton` épingle (SVG trait fin 1.4, pas d'emoji) ; dépliée = citation complète + `Button` « {t("passage.open-pdf", {page})} » (→ `openZoteroPassage(ref)`) + `Button` épingler (→ `wsSend({type:"pinPassage", projectRoot, pin})`). Source du `projectRoot` : le store `evidencePins.ts` retient le dernier `projectRoot` passé à `requestEvidencePins` — App.tsx l'appelle à chaque changement de projet actif (Task 6) — et l'expose via `evidencePinsSnapshot().projectRoot`; la carte lit le store, pas de prop à percer dans MD_COMPONENTS. Si la réponse `evidencePins` porte `error`, `pushEvidencePins` déclenche `showError(error)` (toast existant) et l'état de la carte ne change pas. Épinglée (`isPinned`) → icône accent + action retire (`unpinPassage`).
  - i18n : `passage.open-pdf` fr « Ouvrir le PDF p. {page} » / en « Open PDF p. {page} » ; `passage.pin` « Épingler »/« Pin » ; `passage.unpin` « Retirer l'épingle »/« Unpin » ; `passage.expand` « Déplier »/« Expand » ; `passage.collapse` « Replier »/« Collapse ».
  - CSS : `.passage-card { background: var(--bg-card); border: 1px solid var(--border2); border-radius: 10px; padding: 8px 12px; max-width: 540px; }` + quote ellipsis + `.passage-card .is-pinned { color: var(--accent); }` — aucune valeur hors tokens.
  - `md.tsx` : `p: (props) => { const ref = lonePassageRef(props.children); return ref ? <PassageCard refData={ref} /> : <p>{props.children}</p>; }` où `lonePassageRef` retourne le `ZoteroPassageRef` si les enfants se réduisent à UN élément `a` passage (espaces tolérés). Ajouter `p` aussi à `MD_COMPONENTS_STREAMING` (hérité par spread existant — vérifier).
- [ ] **Step 4 : vert** — `npx vitest run src/components/chat` + `npx tsc --noEmit`.
- [ ] **Step 5 : commit** — `git commit -m "feat(preuves): carte passage — une ligne repliée, épingle WS"`

### Task 6: Carte passage gbrain + lecteur surligné

**Files:**
- Modify: `src/components/chat/md.tsx` (nouveau `parseGbrainPassageRef`, détection dans `lonePassageRef` et pilule inline gbrain)
- Modify: `src/components/chat/PassageCard.tsx` (les deux sources)
- Modify: `src/components/chat/SourceReader.tsx` (prop `highlightQuote?: string` — défilement + surlignage)
- Modify: `src/App.tsx` + hôte du SourceReader (`grep -n "SourceReader" src/components/chat/KbSurface.tsx src/App.tsx` et refléter le chemin d'ouverture existant en y ajoutant `highlightQuote`)
- Modify: `rust/crates/atelier-runtime/src/send.rs` (instruction : bloc gbrain, Task 4 déjà en place)
- Modify: `rust/crates/atelier-runtime/src/evidence.rs` + `ws_router.rs` (champ `source: "zotero"|"gbrain"` + `gbrainSlug` optionnel — champs zotero optionnels)
- Test: `src/components/chat/PassageCard.test.tsx`, `src/components/chat/SourceReader.test.tsx`, tests Rust existants étendus

**Interfaces:**
- Consumes: `SourceReader` (`ReaderTarget {kind:"gbrain", slug}` existant, WS `kbGbrainPage`), Custom Highlight API (pattern `::highlight(chat-hl)`, App.css ~l.1606).
- Produces: `parseGbrainPassageRef(href) -> { slug, quote } | null` (préfixe `#atelier-gbrain-passage?`, slug `[A-Za-z0-9_-]{1,120}`, quote ≤ 900 non vide) ; `EvidencePin.source` (défaut `"zotero"` à la désérialisation pour les épingles v1 existantes).

- [ ] **Step 1 : tests qui échouent** :

```tsx
it("lien gbrain seul → carte ; ouverture = lecteur avec citation", () => {
  const md = `[« q »](#atelier-gbrain-passage?slug=williamson-2021-fire-aerosol&quote=Fire%20aerosol)`;
  render(<ReactMarkdown components={MD_COMPONENTS as any}>{md}</ReactMarkdown>);
  expect(document.querySelectorAll(".passage-card")).toHaveLength(1);
});
// SourceReader.test.tsx : highlightQuote pose un CSS highlight + scrolle
it("highlightQuote surligne la première occurrence du texte rendu", async () => {
  render(<SourceReader target={{ kind: "gbrain", slug: "s" }} onClose={() => {}} highlightQuote="aerosol deposition" />);
  dispatchGbrainPage({ slug: "s", markdown: "Le fire aerosol deposition réduit l'albédo." });
  await waitFor(() => expect(CSS.highlights?.has?.("reader-quote") || document.querySelector("mark.reader-quote")).toBeTruthy());
});
```

(jsdom n'a pas la Custom Highlight API : implémentation = Highlight API si `CSS.highlights` existe, sinon repli `<mark class="reader-quote">` — le test couvre le repli.)

- [ ] **Step 2 : échec** — parse absent, prop absente.
- [ ] **Step 3 : implémentation** — `parseGbrainPassageRef` (validation stricte comme `parseZoteroPassageRef`) ; `PassageCard` accepte `refData: ZoteroPassageRef | GbrainPassageRef` (discriminant `kind`), libellé source = slug humanisé (tirets→espaces, capitalisé) sans `p. N`, action ouvrir → événement `CustomEvent("kb-open-gbrain-passage", { detail: { slug, quote } })` → App bascule sur la surface Connaissances et ouvre le SourceReader avec `highlightQuote` ; normalisation du match : NFKD, minuscules, espaces réduits, premiers ~80 caractères de la citation ; `scrollIntoView({ block: "center" })` ; style `::highlight(reader-quote)` + `mark.reader-quote` via `--accent` en fond translucide (mix 32% comme `chat-hl`). Rust : `source` (serde default `"zotero"`), `gbrainSlug: Option<String>`, champs zotero en `Option` ; dédup gbrain sur `(gbrain_slug, quote)`. Instruction : ajout du bloc gbrain (Task 4 test étendu : `assert!(out.contains("atelier-gbrain-passage"))`).
- [ ] **Step 4 : vert** — `npx vitest run src/components/chat` + `cargo test -p atelier-runtime` + `npx tsc --noEmit`.
- [ ] **Step 5 : commit** — `git commit -m "feat(preuves): passages gbrain — carte, lecteur défilé/surligné, épingle typée"`

### Task 7: Surface Preuves

**Files:**
- Create: `src/components/EvidenceSurface.tsx`
- Modify: `src/components/surfaces.tsx` (id `"preuves"` + labelKey `"atelier.preuves"` + icône SVG épingle trait fin 19px viewBox 16)
- Modify: `src/App.tsx` (brancher le rendu là où `KnowledgeSurface` est rendu — `grep -n "KnowledgeSurface" src/App.tsx` et refléter exactement ; `requestEvidencePins(projectRoot)` au changement de projet actif)
- Modify: `src/lib/i18n.ts`, `src/App.css`
- Test: `src/components/EvidenceSurface.test.tsx`

**Interfaces:**
- Consumes: store Task 5 (`subscribeEvidencePins`, `evidencePinsSnapshot`, `requestEvidencePins`), `openZoteroPassage`, contrat `unpinPassage`.
- Produces: `<EvidenceSurface projectRoot={string|null} />`.

- [ ] **Step 1 : tests qui échouent** :

```tsx
it("groupe par phrase appuyée, « Sans ancrage » en dernier", () => {
  seedEvidencePins([pinWithSupports("Phrase A"), pinWithSupports("Phrase A"), pinSansSupports()]);
  render(<EvidenceSurface projectRoot="/proj" />);
  const groups = screen.getAllByTestId("evidence-group");
  expect(groups).toHaveLength(2);
  expect(groups[1].textContent).toContain("Sans ancrage");
});
it("rangée : clic ouvre le PDF, action retire l'épingle", () => {
  seedEvidencePins([pinWithSupports("Phrase A")]);
  render(<EvidenceSurface projectRoot="/proj" />);
  fireEvent.click(screen.getByText(/p\. 7/));
  // openZoteroPassage dispatch un CustomEvent chat-open-zotero-passage
  // (espionner window.dispatchEvent)
});
```

- [ ] **Step 2 : échec** — composant absent.
- [ ] **Step 3 : implémentation** — en-tête `SurfaceHeader` existant (titre `t("atelier.preuves")`), groupes triés par ajout desc (`Map` sur `supports?.text ?? null`), rangée = `RowButton` (citation italique ellipsée + `citeLabel · p. N` pour zotero, slug humanisé pour gbrain) → `openZoteroPassage` si `pin.source === "zotero"`, sinon `CustomEvent("kb-open-gbrain-passage", { detail: { slug: pin.gbrainSlug, quote: pin.quote } })` (Task 6) ; `IconButton` retirer → `wsSend({type:"unpinPassage",...})` ; action « copier `\autocite{zoteroKey}` » pour zotero SEULEMENT (`navigator.clipboard`, toast succès existant), « copier la citation » pour gbrain. Vide → `EmptyState` (`t("preuves.empty")` fr « Aucun passage épinglé — demande une référence dans le chat. » / en « No pinned passages yet — ask the chat for a reference. »). i18n : `atelier.preuves` « Preuves »/« Evidence », `preuves.sans-ancrage` « Sans ancrage »/« No anchor », `preuves.copy-cite` « Copier \autocite »/« Copy \autocite », `preuves.empty` ci-dessus. CSS : réutiliser les patterns de panneau existants, tokens seulement.
- [ ] **Step 4 : vert** — `npx vitest run src/components` + `npx tsc --noEmit` + `npx vite build`.
- [ ] **Step 5 : commit** — `git commit -m "feat(preuves): surface Preuves — groupée par phrase appuyée"`

### Task 8: Vérification de bout en bout + relance

**Files:** aucun nouveau — vérification.

- [ ] **Step 1** — suites complètes : `npx tsc --noEmit` ; `npx vite build` ; `npx vitest run src/components` ; `cd sidecar && npx vitest run` ; `cd rust && cargo test -p atelier-runtime -p atelier-providers -p atelier-harness`.
- [ ] **Step 2** — relance : suivre `docs/PROTOCOLE_RELANCE.md` À LA LETTRE (phases 1-4 + vérif d'embed par hachage).
- [ ] **Step 3** — sonde WS (pattern session : script scratchpad, `sidecar.lock` pour port/token) : `pinPassage` → `evidencePins` avec 1 épingle ; `listPins` → 1 ; `unpinPassage` → 0. Nettoyer : l'épingle de sonde est retirée par le test lui-même.
- [ ] **Step 4** — commit final éventuel + rapport à Thierry (ce qui est vérifié, ce qui reste à juger à l'œil : la carte dans un vrai tour, le geste d'épinglage).
