# Plan 049 : Base de connaissances globale (KB) — sources épinglées, attache par conversation, étage gbrain

> **Instructions d'exécution** : lire ce plan en entier avant toute
> modification. Exécuter les tranches dans l'ordre T1 → T8 ; chaque tranche est
> livrable et testable seule. Committer tôt et petit (les auto-commits galerie
> balaient le worktree — untracked ≠ protégé). Ne pas pusher sans demande.
>
> **Design de référence** : artefact « Atelier — Base de connaissances (design) »
> v2 (validé par Thierry le 2026-07-17). Le présent plan est le contrat
> d'ingénierie ; l'artefact porte la narration et les maquettes.
>
> **Drift check initial** :
>
> ```bash
> git diff --stat HEAD -- \
>   rust/crates/atelier-runtime/src/send.rs \
>   rust/crates/atelier-store/src \
>   sidecar/router.mjs sidecar/store.mjs sidecar/sessions.mjs \
>   sidecar/zotero_passages.mjs sidecar/zotero_passage_prompt.mjs \
>   src/App.tsx src/components/chat/ContextShelf.tsx \
>   src/components/chat/ChatComposer.tsx \
>   src-tauri/src/browser.rs scripts/stage-rust-server.sh
> ```
>
> Si `send.rs` (composition du prompt), `sessions.mjs` (strip) ou
> `zotero_passages.mjs` (moteur de passages) ont divergé de ce que ce plan
> décrit, STOP et mettre le plan à jour avant de continuer.

## Statut

- **Priority** : P1 (feature demandée par Thierry, design validé)
- **Effort** : XL — 8 tranches ; T1-T5 = cœur, T6-T8 = extensions
- **Risk** : MEDIUM (double backend mjs+rs pour l'injection ; le reste est
  additif et isolé)
- **Depends on** : rien — s'appuie sur des mécanismes stables (passages
  Zotero, store threads, browser embarqué)
- **Category** : feature / chat / harness
- **Planned at** : 2026-07-17, worktree `atelier-knowledge-base`

## Objectif

Une bibliothèque **globale** de sources — fichiers texte, PDF, réfs Zotero,
pages web, dossiers/vaults Obsidian, transcripts YouTube, notes — épinglées
une fois (extraction immédiate, cache), puis **attachées à la demande** à une
conversation depuis le composer. Injection **hybride** : petites sources en
texte intégral, grosses en fiche fouillable via l'outil terminal
`atelier-kb search`, citations obligatoires. gbrain est **lié, pas fusionné** :
source spéciale « Corpus thèse » (consigne `gbrain query`) + bouton
« Promouvoir vers gbrain » (`gbrain capture`).

## Décisions actées (design v2)

- Portée **globale** (indépendante des projets), attache **par conversation**
  (persistée par thread), portée « ce message » en option.
- Seuil texte intégral : **8 000 caractères** (`KB_INLINE_MAX`) ; au-delà,
  fiche + outil. « Injecter tout le contenu » outrepasse par source et par
  conversation (`kbFullContent`).
- **Citations obligatoires** : `[kb:id · page/fichier/mm:ss]`, quote exacte,
  markdownLink ouvrable (pattern passages Zotero).
- **Pas d'embeddings, pas de base vectorielle** : scoring lexical du moteur
  de passages existant. Le sémantique est le rôle de gbrain.
- Mécanisme d'injection : bloc `<atelier-kb>` **appendu au send dans les deux
  backends** (sidecar Node + runtime Rust), strip symétrique — même gabarit
  que `<atelier-zotero-passages>`. Outils = CLI terminal (pas de MCP), donc
  uniforme Claude/Codex/grok/kimi/opencode.

## Architecture

### Stockage

```
${ATELIER_APP_DIR:-~/Library/Application Support/atelier-studio}/knowledge/
  knowledge.json        registre { version: 1, sources: [...] }
  cache/<id>.json       pages extraites { version, pages: [{ page, text }] }
  cache/<id>/<rel>.json (T6, sources composées : un cache par fichier)
  pdf-cache/            cache pdftotext (format extractPdfPages existant)
```

- Une **source** : `{ id, kind, title, origin, chars, addedAt, updatedAt,
  meta }` avec `kind ∈ file|pdf|web|note|folder|youtube|zotero`.
- `id = sha256(kind + "\n" + origin|titre).hex[:8]` — déterministe :
  ré-épingler la même origine **met à jour** (pas de doublon).
- Format de cache **uniforme en pages** `[{ page, text }]` : les PDF gardent
  leurs vraies pages (citations), les kinds texte ont une page unique — le
  moteur `searchPassages` fonctionne tel quel sur tout.
- Écritures via `writeFileAtomic` (pattern `store.mjs`). Miroir Rust
  **lecture seule** (T4) : le runtime lit registre + caches au send.
- **Robustesse (vérifiée par tests)** : toute mutation prend un verrou
  inter-processus (`.lock/` par mkdir atomique, vol si > 10 s) et relit le
  registre avant d'écrire — deux processus concurrents ne se perdent plus
  d'entrées. Un registre illisible est sauvegardé en
  `knowledge.json.corrupt-<ts>` (jamais écrasé en silence) et signalé.
  Fraîcheur mtime/size revérifiée avant usage pour les fichiers **et** les
  PDF (un PDF remplacé au même chemin est ré-extrait).

### Contrat CLI `atelier-kb` (JSON sur stdout, erreurs stderr + exit 1)

```
atelier-kb add --kind file|pdf|web|note [--origin <chemin|url>]
               [--title <t>] [--text <t>]      → { ok, source, refreshed }
atelier-kb list                                → { ok, count, sources }
atelier-kb remove --id <id>                    → { ok, removed }
atelier-kb search --id <id> --query <q> [--limit 5]
               → { ok, source:{id,title,kind}, query, count,
                   passages:[{ page, quote, context, score }] }
```

Toute réponse peut porter `warning` (ex. registre récupéré d'une corruption).

T5 ajoute `markdownLink` par passage ; T6 ajoute `file` (chemin relatif) aux
passages des dossiers ; T8 remplace `page` par `timestamp` pour YouTube.

### Bloc injecté (contrat T4)

Appendu au prompt provider au send, strippé de l'historique affiché :

```
<atelier-kb>
Sources attachées par l'utilisateur (base de connaissances Atelier).

[kb:<id>] <titre> — <kind>, <n>k car. — texte intégral :
<texte>                                   ← sources ≤ 8k ou kbFullContent

[kb:<id>] <titre> — <kind>, <n>k car. — fiche.        ← sources > 8k
Pour un passage précis : <toolPath> search --id <id> --query "…" --limit 5
Lis le JSON ; reproduis la quote exactement et cite le markdownLink tel quel.

[kb:gbrain] Corpus thèse (gbrain) — outil NAS.        ← si attaché (T7)
Pour la littérature glaciologie/albédo : gbrain query "…". NAS injoignable
= le dire et continuer.

Règle : toute affirmation tirée d'une source est citée [kb:id · page/fichier].
N'invente jamais un passage.
</atelier-kb>
```

Strip : `/\n*<atelier-kb\b[^>]*>[\s\S]*?<\/atelier-kb>\s*/gi` (miroir exact
mjs + rs, comme `zotero_passage_prompt.mjs` / `send.rs`).

### Threads

`threads.json` (les deux stores) : `kbSourceIds: string[]` (id réservé
`"gbrain"` accepté), `kbFullContent: string[]`. Champs absents = `[]`.

## Tranches

### T1 — Store + extraction simple + CLI *(la présente tranche)*

- **Fichiers** : `sidecar/knowledge.mjs` (store, extracteurs file/note/pdf/web,
  `htmlToText`, recherche), `sidecar/kb_cli.mjs`, wrapper `sidecar/atelier-kb`,
  `sidecar/knowledge.test.mjs`.
- Extracteurs v1 : `.md/.tex/.txt` (extension refusée sinon, message clair) ;
  PDF via `extractPdfPages` (pdftotext + cache mtime existants) ; web via
  `fetch` (timeout 20 s, http/https seulement, HTML → texte sans dépendance) ;
  note = titre + texte fournis. Fichiers : re-lecture si mtime/size changent
  (`ensureFresh` avant recherche).
- **Acceptation** : `cd sidecar && npx vitest run knowledge` vert ;
  `./atelier-kb add/list/search/remove` fonctionnels en terminal sur un vrai
  .md et un vrai PDF ; ré-épingler une origine ne crée pas de doublon.

### T2 — Capture pleine page du browser

- `browser.rs` : commande `browser_capture_page` (innerText + titre + URL,
  plafond 300k car.) sur le canal d'éval existant ; bouton « Ajouter à la
  base » dans `BrowserTab.tsx` → `atelier-kb add --kind web` (texte passé
  directement, pas de re-fetch — la page peut être derrière un login).
- **Acceptation** : épingler une page JS-lourde donne un texte non vide ;
  binaire `npx tsc --noEmit` + `cargo test -p atelier-app` verts.

### T3 — Picker composer + pilules + persistance

- Icône livre (SVG stroke 1.5, compteur) dans `ChatComposer.tsx` ; popover
  groupé par type (recherche, cases, portée, création de note, actions
  survol : supprimer/renommer/« Injecter tout le contenu ») — composants ui/
  existants (RowButton, Popover), tokens du design system uniquement.
- Chips `kind:"kb"` dans `ContextShelf` ; `kbSourceIds`/`kbFullContent`
  persistés par thread : `store.mjs` (normalizeThread) + miroir
  `atelier-store` (threads.rs) + WS.
- Épinglage depuis le picker : fichier/PDF (dialogue), réf Zotero (résolution
  PDF via `zotero.mjs`/`atelier-workspace`), URL collée.
- **Acceptation** : attacher/retirer survit à un reload ; `css-contract.test.ts`
  vert ; parité stores mjs/rs sur les nouveaux champs.
- **Écarts v1 livrés (2026-07-17)** : portée « ce message » différée (la
  portée conversation couvre le besoin « garde en contexte ») ; renommage
  différé (l'id des notes dérive du titre) ; entrée Zotero du picker différée
  — le PDF d'une réf s'épingle déjà par le dialogue fichier. Ajouts non
  prévus : une source épinglée depuis le picker ouvert est attachée
  automatiquement à la conversation (corrélée au thread d'origine — on peut
  changer de conversation avant la réponse) ; `kbRemove` purge les références
  de la source dans TOUS les threads (deux backends) et broadcast la liste.
  Les pilules sont un composant `KbChips` dédié à côté du ContextShelf (pas
  un kind du shelf). Routes ajoutées : `kbList`, `kbRemove`, `upsertThread`
  (Node, parité Rust existante).

### T4 — Injection double backend

- `sidecar/kb_prompt.mjs` : `withKbBlock(prompt, sources, opts)` +
  `stripKbBlock(prompt)` (pures, testées) ; câblage au send Node
  (`router.mjs`, même point que zotero/gallery) et Rust (`send.rs`,
  `with_kb_block`) ; strip dans `sessions.mjs` et côté Rust.
- Le runtime Rust lit `knowledge.json` + caches (lecture seule, crate
  `atelier-store` ou runtime) pour composer le bloc.
- **Acceptation** : test de parité — même thread, mêmes sources → bloc
  octet-pour-octet identique mjs vs rs ; l'historique affiché ne contient
  jamais `<atelier-kb>` ; vitest sidecar + `cargo test` verts.

### T5 — kb-search citations bout en bout

- `markdownLink` par type : PDF → lien viewer galerie page + surlignage
  (pattern `passageLink`), fichier → chemin cliquable, web → URL.
- Staging : ajouter `knowledge.mjs`, `kb_cli.mjs`, `atelier-kb` à
  `scripts/stage-rust-server.sh` (sinon le binaire Rust référence un outil
  absent du bundle — STOP si le script a changé de forme).
- **Acceptation** : conversation réelle avec un PDF 100+ pages attaché :
  le provider appelle l'outil, cite page + quote exacte ; vérifié sur les
  familles claude / codex / ACP.
- **Écarts v1 livrés (2026-07-17)** : chaque passage porte `location`,
  `cite` (forme exacte exigée par le bloc) et `markdownLink` quand ouvrable
  (web → URL, fichier → chemin, YouTube → `&t=`) ; le lien profond vers le
  viewer PDF galerie (page + surlignage) est différé — il demande un handler
  d'ancre côté front, les PDF Zotero gardent le flux passages Zotero
  existant. La validation « conversation réelle par famille de providers »
  est l'étape de test utilisateur (l'app ne se lance pas depuis le harness).

### T6 — Sources composées : dossiers & vaults

- Balayage récursif filtré (`.md/.tex/.txt` + PDF, exclusions `.git`,
  `node_modules`, dotfiles), `meta.files`, cache par fichier, re-scan mtime à
  l'attache et à la reprise ; `search` agrège multi-fichiers, passages avec
  `file` relatif ; citations `[kb:id · fichier]`.
- **Acceptation** : vault Obsidian réel (200+ fichiers) épinglé, recherche
  < 2 s à cache chaud, modification d'un fichier visible sans ré-épingler.

### T7 — Étage gbrain

- Entrée picker « Corpus thèse (gbrain) » (id réservé, pas dans le registre) ;
  consigne `gbrain query` dans le bloc si attachée ; action « Promouvoir vers
  gbrain » (spawn `gbrain capture` avec titre + origine + extrait) ; échec
  NAS → message d'erreur propre dans le JSON, jamais de blocage du send.
- **Acceptation** : NAS coupé → l'attache reste fonctionnelle, l'agent
  annonce l'indisponibilité et continue.

### T8 — YouTube transcripts

- `--kind youtube` : URL → `yt-dlp` (détection runtime via `bin_resolver`,
  erreur explicite sinon), transcript horodaté → pages par tranche de temps,
  citations `mm:ss` + lien `&t=<s>s`.
- **Acceptation** : vidéo sous-titrée réelle épinglée, passage cité avec
  timestamp cliquable.

## Gates globales (chaque tranche)

- `cd sidecar && npx vitest run` — 0 échec.
- `npx tsc --noEmit` et `npx vite build` (ignorer `src/test_auto_review*.ts`)
  dès qu'une tranche touche `src/`.
- `cargo test` (workspace rust) dès qu'une tranche touche `rust/` ou
  `src-tauri/`.
- `node gallery/server/tests/diff_suite.mjs` seulement si `gallery/` change
  (aucune tranche ne le prévoit).
- Design system : aucune valeur hors tokens, pas de `<button>` nu, icônes
  SVG monochromes — verrouillé par `css-contract.test.ts`.

## STOP conditions

- `pdftotext` absent au runtime : l'outil doit répondre par une erreur JSON
  claire — ne jamais dégrader silencieusement vers « aucun passage ».
- Divergence de `send.rs`/`sessions.mjs` avec le gabarit append/strip décrit
  ici : arrêter, mettre à jour le plan.
- `scripts/stage-rust-server.sh` introuvable ou restructuré au moment de T5.
- Toute nécessité d'une dépendance npm/cargo nouvelle : hors contrat v1,
  demander avant.

## Hors périmètre v1

Notes libres hors picker, glisser-déposer OS, collections/tags, digests LLM,
watcher FSEvents temps réel, embeddings/vectoriel, téléchargement d'URL PDF
(épingler le fichier local à la place), pont d'indexation vers ragdoc/gbrain
(seul l'étage T7 est prévu).
