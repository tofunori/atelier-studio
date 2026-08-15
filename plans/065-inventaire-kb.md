# Plan 065 — C1 : inventaire de la chaîne KB Node

> Spike d'inventaire (065-C1), exécuté depuis le code vivant le 2026-08-15.
> Portée : `sidecar/kb_cli.mjs`, `sidecar/kb_prompt.mjs`, et les modules
> tirés `knowledge.mjs`, `article.mjs`, `article_meta.mjs`,
> `zotero_passages.mjs`, `csv_digest.mjs`. Objectif : cartographier chaque
> commande (entrées/sorties JSON, stockage disque, réseau, spawns) avant tout
> code Rust (C3).

## 0. Ce qui est DÉJÀ Rust — ne pas re-porter

Avant de lister ce qu'il reste à porter, un fait qui change la taille réelle
du chantier C3 : une partie de la lecture est déjà native côté Rust, dans
`rust/crates/atelier-runtime/src/kb_block.rs`. Elle lit directement
`knowledge.json` + `cache/<id>.json` (lecture seule, jamais d'extraction, pas
de refresh mtime) :

| Fonction Rust (`kb_block.rs`) | Rôle | Appelée depuis |
|---|---|---|
| `kb_list_payload(dir)` | reconstruit exactement la forme de `kb list` (sources triées, collections, archivedCount, archivedSources) | `ws_router::handle_kb_list` — **remplace déjà `kb_cli.mjs list` en production** |
| `kb_block_entries(dir, ids, full)` | miroir de `knowledge.mjs::kbBlockEntries` | `send.rs` pour composer le bloc `<atelier-kb>` |
| `with_kb_block` / `strip_kb_block` | miroir OCTET-POUR-OCTET de `kb_prompt.mjs` | `send.rs` — **`kb_prompt.mjs` n'est PLUS invoqué en production**, seulement par le test `kb_block_parity_node` (spawn Node délibéré, `#[cfg(test)]`) |
| `source_meta` / `cache_excerpt` | titre/origin/kind + extrait borné d'une source | `handle_kb_promote` (`kbPromote`, capture rapide vers gbrain) — **réimplémentation Rust complète, n'appelle jamais `kb_cli.mjs`** |

Conséquence pour C3 : `kb_prompt.mjs` a donc déjà son port Rust vérifié par
test de parité (`kb_block_parity_node`, `kb_list_payload_parity_node` dans
`kb_block.rs`) ; il ne reste que comme référence/fixture de test, plus comme
dépendance runtime. Le vrai porc porte sur **kb_cli.mjs seul** (le store en
écriture + les commandes qui ne sont pas déjà lues nativement).

Deux commandes de `kb_cli.mjs` ne sont **jamais invoquées par
`rust/crates`** : elles ne passent pas par le routeur WS mais par l'agent
LLM lui-même, qui exécute le binaire `atelier-kb` (wrapper de `kb_cli.mjs`,
`sidecar/atelier-kb`) comme un outil shell, avec le chemin injecté dans le
prompt :

- **`search`** — injecté par `kb_prompt.mjs::withKbBlock` (fiches non
  inline) : `"<toolPath>" search --id <id> --query "<question>" --limit 5`.
  Chemin réel : `kb_block.rs:280` (constante du toolPath passé à
  `with_kb_block`).
- Le pendant Zotero (**hors périmètre kb_cli.mjs**, module frère) :
  `atelier-zotero-passages` (wrapper de `zotero_passage_cli.mjs`, qui réutilise
  `zotero_passages.mjs`) est injecté par `send.rs:47-49` pour
  `search --pdf … --query …`. Ce binaire est un CLI sœur de `kb_cli.mjs`, pas
  invoqué par kb_cli.mjs, mais partage `zotero_passages.mjs` — à garder en
  tête pour C3 puisque `search` de kb_cli.mjs route aussi vers
  `zotero_passages.searchPassages` en interne (voir §2.4).

Implication concrète pour C3 : `search` doit rester exécutable comme
**binaire autonome** (le port Rust doit produire un petit exécutable, pas
seulement une fonction in-process derrière le routeur WS) — exactement ce que
prévoit déjà l'étape 4 du plan (« wrappers agents … deviennent de petits
binaires Rust »).

`promoteToGbrain` (dans `knowledge.mjs`) n'est utilisé que par
`sidecar/router.mjs` (l'ancien sidecar chat Node, retiré en Phase A) — code
mort du point de vue de `kb_cli.mjs`. `handle_kb_promote` côté Rust
réimplémente directement l'équivalent (spawn `gbrain capture` en Rust), donc
ce chemin est déjà porté et n'a pas besoin d'entrer dans le périmètre C3.

## 1. Point d'entrée process — `kb_cli_run` / `kb_cli_stream`

Défini dans `rust/crates/atelier-runtime/src/ws_router.rs:1646-1745`.

- Binaire : `which node` puis repli `/opt/homebrew/bin/node`,
  `/usr/local/bin/node` (override test : `ATELIER_TEST_NODE`).
- Commande : `node <server_dir>/kb_cli.mjs <args...>`.
- Env propagée : `ATELIER_APP_DIR=<app_dir>` (répertoire support de l'app ;
  `kb_cli.mjs` calcule lui-même `<ATELIER_APP_DIR>/knowledge` via
  `defaultKnowledgeDir()`). Aucune autre variable n'est transmise
  explicitement — `gbrain`/MinerU/Crossref se résolvent depuis
  l'environnement hérité du process Rust (donc du process Tauri).
- Stdin : uniquement pour `add` avec `--text -` (le texte du corps passe par
  stdin pour éviter `ARG_MAX`) ; sinon `Stdio::null()`.
- Sortie : `kb_cli_run` attend la fin du process et parse **une seule ligne
  JSON** sur stdout. `kb_cli_stream` lit ligne par ligne, traite les lignes
  `{"progress":…}` comme évènements (relayés en `articleProgress` sur le
  bus WS) et garde la **dernière ligne non-progress** comme résultat —
  utilisé uniquement pour `article-import --progress`.
- Échec : exit ≠ 0 → `Err(stderr.trim())` (ou `"atelier-kb: échec"` si stderr
  vide). Correspond exactement au contrat `kb_cli.mjs::main()` : erreurs sur
  stderr, `process.exitCode = 1`, stdout resté vide.

## 2. Commandes de `kb_cli.mjs` — détail par commande

`kb_cli.mjs` définit un ensemble fermé de 16 commandes
(`COMMANDS` = add, list, remove, search, gbrain-search, gbrain-page, kb-text,
promote-page, collection, tag, archive, article-import, article-write,
article-draft, article-list, article-doi). Toute commande hors de cette
liste → `throw new Error(USAGE)` (exit 1, message = l'aide complète).

Option commune à toutes : `--dir <répertoire>` (défaut
`defaultKnowledgeDir()` = `$ATELIER_APP_DIR/Library/.../knowledge` en
pratique `$ATELIER_APP_DIR/knowledge`).

### 2.1 `add --kind <kind> [--origin] [--title] [--text]`

Appelée depuis Rust par `handle_kb_add` (WS `kbAdd`), et directement par
l'utilisateur du CLI. `--text -` bascule sur stdin.

Kinds (`KB_KINDS` dans `knowledge.mjs`) : `file, pdf, web, note, folder,
youtube, gbrain, zotero`.

| kind | entrée | traitement | réseau/spawn | sortie source.meta |
|---|---|---|---|---|
| `note` | `--title`, `--text` (les deux requis) | `pagesFromText` (1 page) | — | `{}` |
| `file` | `--origin` = chemin absolu résolu (`resolve()`) | `.md/.tex/.txt` → texte brut ; `.csv/.tsv` → `csvDigest()` (voir §2.6). Extension hors liste → erreur | — | `{mtimeMs, size, table?:true}` |
| `folder` | `--origin` = dossier | parcours récursif déterministe (trié), filtre `.md/.tex/.txt`, ignore dotfiles + `node_modules/target/dist/build/__pycache__`, plafond 2000 fichiers / 2 Mo par fichier ; réutilise le cache si `mtime+size` inchangés | — | `{files:N, skipped?:N}` |
| `pdf` | `--origin` = chemin `.pdf` | `extractPdfPages` (`zotero_passages.mjs`, §2.4) | spawn `pdftotext` | `{pages, mtimeMs, size}` |
| `zotero` | `--origin` = `zotero://<pdfKey>/<pdfFile>[#itemKey]` | résout dans `~/Zotero/storage/<pdfKey>/<pdfFile>` avec garde anti-traversée (`resolveZoteroPdf`), puis `extractPdfPages` | spawn `pdftotext` | `{pages, mtimeMs, size, pdfKey, pdfFile, zoteroKey?}` |
| `web` | `--origin` = URL http(s) ; `--text` optionnel (capture navigateur, bypass fetch) | sans `--text` : `fetch()` avec UA navigateur, 20 s timeout, refus si `content-type: application/pdf`, HTML→texte (`htmlToText`, regex maison, pas de parseur DOM) ; tronqué à 300 000 car. | **réseau réel** (`fetch`) si pas de `--text` | `{contentType?}` |
| `youtube` | `--origin` = URL YouTube (`youtu.be`, `youtube.com/watch\|shorts\|live\|embed`) | `yt-dlp` (métadonnées puis sous-titres fr>en>autre, format vtt) → `vttToPages` découpe en pages de 60 s (`YT_BUCKET_SECONDS`) | **spawn `yt-dlp`** (2 appels, timeouts 45 s + 90 s) + réseau (yt-dlp télécharge) | `{segmentSeconds:60, segments, duration?, channel?}` |
| `gbrain` | `--origin` = slug NAS | `gbrain get <slug>` ; erreur si `GBRAIN_NOT_FOUND` | **spawn `gbrain`** (résolu via `which`/PATH, `~/.bun/bin` en priorité pratique, sinon `/opt/homebrew/bin`, `/usr/local/bin`, `~/bin`, `~/.local/bin` ; override test `ATELIER_TEST_GBRAIN`) | `{slug, syncedAt}` |

`id` déterministe : `sha256("<kind>\n<key>").slice(0,8)` (`sourceId`), la
clé étant le chemin résolu (file/pdf/folder), l'URL canonique (web/youtube),
le slug (gbrain) ou `pdfKey/pdfFile` (zotero) — **ré-épingler la même
origine met à jour, ne duplique jamais**. Vérifié fixture (le même fichier
donne le même id à chaque exécution).

Sortie : `{ok:true, source:{...}, refreshed:bool}` (+ `warning` si le
registre a été récupéré d'une corruption).

### 2.2 `list [--collection <slug>] [--archived]`

**Déjà porté en Rust** (`kb_list_payload`, voir §0) — plus jamais spawné en
production, seulement via le CLI direct/tests. Sortie :
`{ok, count, sources:[...], collections:[...], archivedCount, archivedSources:[...]}`.
Tri : `updatedAt` décroissant (`localeCompare`, donc tri lexicographique
d'ISO-8601 = tri chronologique correct).

### 2.3 `remove --id <id>`

Supprime l'entrée + `cache/<id>.json`. Erreur si id inconnu. Appelé depuis
`handle_kb_remove`, qui enchaîne ensuite un `kb_list_payload` natif et purge
les références de l'id dans `threads.json` (`kbSourceIds`/`kbFullContent`) —
cette purge est **déjà en Rust**, ne fait pas partie de `kb_cli.mjs`.

### 2.4 `search --id <id> --query <q> [--limit 5]`

**Jamais appelée par `rust/crates`** — outil shell exécuté par l'agent lui-
même (voir §0). Délègue à `store.search(id, query, {limit})` :

- Pour un `folder` : recherche par fichier (`zotero_passages.searchPassages`
  sur les pages de chaque fichier), fusion + tri par score, plafond limit.
- Sinon : pages de la source (`pagesFor`, rafraîchies si mtime/size ont
  changé — **seul chemin qui ré-extrait à la volée**) → `searchPassages`.
  Pour `youtube`, ajoute `timestamp = (page-1) * segmentSeconds`.

`searchPassages` (`zotero_passages.mjs`, §2.4bis) : découpe en chunks de
~760 car. (chevauchement 150), tokenise (accents retirés, mots < 2 lettres et
stopwords FR/EN exclus, extension de requête pour quelques synonymes
FR→EN : résultat/limite/méthode/conclusion), score = présence/occurrences de
tokens + bonus (motif de section abstract/conclusion/résultats, chiffres avec
unité, phrase de type « we find/show »), déduplication par page (max 2/page)
et par préfixe de texte normalisé. Sortie décorée par `kb_cli.mjs`
(`decoratePassage`) : `location`/`cite`/`markdownLink` selon le kind
(page pour pdf/zotero, mm:ss pour youtube, fichier pour folder, lien direct
pour web/file). C'est un **algorithme pur, déterministe, sans réseau ni
spawn** (à part le refresh mtime qui peut relancer `pdftotext`).

### 2.5 `gbrain-search --query <q> [--limit 12]`

`handle_gbrain_search` (WS `gbrainSearch`). Spawn `gbrain search <query>`,
parse la sortie ligne à ligne (`parseGbrainSearch` : motif
`[score] slug -- snippet`, les lignes de continuation sans motif rallongent
le snippet précédent tant qu'il fait < 180 car.). `"No results."` → liste
vide. Échec = **NAS externe**, jamais un throw dur côté Rust (mappé sur
`gbrainResults.error`).

### 2.6 `gbrain-page --slug <slug>`

Lecture seule (`gbrain get <slug>`), erreur si `GBRAIN_NOT_FOUND`. Sortie
`{ok, slug, chars, markdown}`.

### 2.7 `kb-text --id <id>`

Texte stocké tel quel (pas le fichier disque). Dossier → liste `{rel,
chars}` par fichier, `text:""`. Autre kind → `store.fullText(id)` (concat
des pages). Utilisé par l'agent pour lire une source (`handle_kb_source_text`,
WS `kbSourceText`).

### 2.8 `promote-page --id <id> [--slug atelier/…] [--write]`

Compose une page markdown front-matter (`buildGbrainPage` : title/origin/
captured/from) depuis le texte stocké (plafond `GBRAIN_PAGE_MAX=100 000`
scalaires). Sans `--write` : sonde `gbrain get <slug-cible>` (existence) et
rend un **aperçu** tronqué à `GBRAIN_PREVIEW_MAX=4000`. Avec `--write` :
`gbrain put <slug>` avec le markdown complet en stdin — **mutation réelle du
corpus NAS**. Slug par défaut : `atelier/<slugifyTitle(title)>`, validé par
`GBRAIN_SLUG_RE = /^[a-z0-9][a-z0-9/_.-]*$/i` sans espace.

### 2.9 `collection --add <titre> | --rename <slug> --title <t> | --remove <slug>`

Mutations pures du registre (pas de réseau/spawn). `add` : slug via
`collectionSlug` (translittération NFKD, minuscule, `[^a-z0-9]+`→`-`, 40
car. max), idempotent si le slug existe déjà. `remove` retire aussi
l'étiquette de toutes les sources qui la portaient.

### 2.10 `tag (--id <id> | --ids a,b,c) --collection <slug> [--off]`

Ajoute/retire une étiquette. `updatedAt` **volontairement inchangé** (sinon
étiqueter ferait remonter la source dans « Récents »). `--ids` = lot,
silencieusement ignore les ids inconnus, retourne `applied:N`.

### 2.11 `archive (--id <id> | --ids a,b,c) [--off]`

Bascule `archived`. Même mécanique de lot que `tag`.

### 2.12 `article-import --path <pdf> [--progress]`

`handle_article_import` (WS `articleImport`, tourne sur
`spawn_blocking` car MinerU peut durer des minutes). Pipeline :

1. `convertPdf(path)` — voir §3.1 (spawn conditionnel MinerU, repli local).
2. `parseArticleMeta(markdown)` — heuristiques regex sur les 6000 premiers
   caractères (titre via 1er `#` ou bloc de lignes, auteurs via motif
   `Nom, Prénom; …`/`et`/`and`, DOI via `10\.\d{4,9}/…`, année via
   `Published:`/années trouvées).
3. `resolveArticleMeta` — **Zotero (sqlite local) → Crossref (par DOI) →
   Crossref (par titre) → à défaut le texte deviné** (voir §3.2).
4. `articleSlug(meta)` = `articles/<auteur>-<année>-<mots-clés-titre>`.
5. `saveDraft` — écrit le markdown dans
   `<dir>/article-drafts/<sha1(markdown).slice(0,12)>.md` (id déterministe :
   même contenu ⇒ même draftId) ; purge au passage les brouillons > 7 j
   (`pruneDrafts`).
6. Sonde d'existence du slug (`gbrain get`) + **`findDuplicates`** :
   recherche gbrain par DOI puis par mots du titre (recouvrement ≥ 60 %
   `DUPLICATE_OVERLAP`) — **appel réseau/spawn gbrain implicite**, même en
   `article-import` "sans écriture".

`--progress` fait précéder le JSON final de lignes `{"progress":{"stage":…}}`
aux étapes `meta`, `duplicates` (et celles émises depuis `convertPdf` si
MinerU tourne : `upload/converting/download/figures/ocr`, voir
`mineruStage`/`MINERU_STAGES`). **Rien n'est écrit dans le corpus** — c'est
uniquement un brouillon + une fiche.

### 2.13 `article-doi --doi 10.xxxx/yyy`

Sans PDF : `crossrefMeta(doi)` (réseau, §3.2), résumé JATS nettoyé
(`abstractText`), corps = résumé ou message d'absence. Même pipeline slug +
brouillon + sonde + doublons que l'import PDF. `converter:"crossref"`,
`metaSource:"crossref"`.

### 2.14 `article-draft --draft <id>`

Lit `<dir>/article-drafts/<id>.md`. Id validé par `/^[a-f0-9]{12}$/`, sinon
`Brouillon invalide`. Fichier absent → `Brouillon expiré — relancer la
conversion du PDF` (le TTL de 7 j ou une purge manuelle explique l'absence).

### 2.15 `article-list [--limit 20]`

`gbrain list --type article -n <limit>` → parse lignes tab-séparées (au
moins 4 colonnes, 1re contient `/`), tri par date décroissante (motif texte,
pas une vraie date). Bruit connu : les bannières d'auto-update du CLI gbrain
peuvent apparaître sur stdout ; filtrées car elles n'ont pas 4 colonnes.

### 2.16 `article-write --draft <id> --slug <articles/…> [--title/--authors/--year/--journal/--doi] [--origin] [--converter] [--ragdoc]`

Lit le brouillon, compose la page finale (`buildArticlePage`, plafond
`ARTICLE_PAGE_MAX=400 000`), sonde l'existence, **`gbrain put <slug>`** —
mutation réelle du corpus. Si `--ragdoc` : `copyToRagdoc` — **spawn `ssh nas
'cat > .../articles_markdown/<nom>.md'`** (transfert synchrone) puis
`ssh nas 'nohup <python ragdoc> scripts/index_incremental.py &'`
(indexation détachée, non bloquante, échec silencieux mais rapporté dans
`ragdoc.ok`). `dropDraft` supprime le brouillon après écriture réussie.

## 3. Appels réseau et spawns externes — vue d'ensemble

| Ressource | Où | Condition de déclenchement | Comportement si absente |
|---|---|---|---|
| `fetch()` (page web) | `knowledge.mjs::defaultFetchPage` | `add --kind web` sans `--text` | erreur HTTP explicite, message orienté capture navigateur pour 401/403/406/429/451/503 |
| `fetch()` (Crossref) | `article_meta.mjs::crossrefMeta`/`crossrefByTitle` | `article-doi`, et dans `resolveArticleMeta` pour tout `article-import` sans notice Zotero | dégrade en silence vers l'étape suivante (titre) ou `metaSource:"texte"` ; timeout 8 s |
| `pdftotext` (spawn) | `zotero_passages.mjs::extractPdfPages` | `add --kind pdf\|zotero`, refresh d'une source pdf périmée, `search` sur pdf/zotero | throw dur (`pdftotext indisponible`) — dépendance dure, pas de repli |
| `sqlite3` (spawn) | `article_meta.mjs::sqliteJson` | `resolveArticleMeta` (Zotero, avant Crossref), ouverture `immutable=1` en lecture seule | tableau vide (silencieux), on tombe au palier Crossref |
| `yt-dlp` (spawn ×2) | `knowledge.mjs::defaultFetchYoutube` | `add --kind youtube` | throw dur avec message `brew install yt-dlp` |
| `gbrain` (spawn) | `knowledge.mjs::runGbrain` (+ `resolveGbrainBin`) | `add --kind gbrain`, `gbrain-search`, `gbrain-page`, `promote-page`, `article-import`/`article-doi` (sonde + doublons), `article-write` | throw dur `gbrain introuvable (PATH, ~/.bun/bin) — corpus NAS indisponible` ; timeout 20 s → `délai dépassé (NAS injoignable ?)` |
| MinerU (spawn `python3 mineru_convert.py`, réseau cloud) | `article.mjs::convertPdf`/`resolveMineru` | `article-import` (et `article-doi` non — DOI n'a pas de PDF) | **jamais bloquant** : script/jeton absent ⇒ repli silencieux sur `pdftotext` local, `warning` renseigné ; timeout 900 s |
| `ssh nas` (spawn ×2) | `article.mjs::copyToRagdoc` | `article-write --ragdoc` | échec non bloquant, `ragdoc:{ok:false, message}` dans la réponse |

Aucune de ces ressources externes n'est appelée par `list`/`collection`/
`tag`/`archive`/`remove`/`kb-text`/`article-draft` (hors sonde
`gbrain get` pour `remove`? non — `remove` ne touche pas gbrain).
`search` (per-source) n'appelle jamais de réseau à part un refresh
`pdftotext` si le fichier source a changé depuis l'épinglage.

## 4. Format de stockage sur disque

Racine : `defaultKnowledgeDir()` = `$ATELIER_APP_DIR/knowledge`
(`ATELIER_APP_DIR` par défaut `~/Library/Application Support/atelier-studio`
côté app réelle).

```
knowledge/
├── knowledge.json                  registre (JSON, indenté 2 espaces)
├── knowledge.json.corrupt-<ts>     sauvegarde si JSON illisible au boot
├── .lock/                          verrou mkdir (inter-process, réentrant par instance)
├── cache/
│   └── <id>.json                   {"version":1, "pages":[{page,text}]}  (ou {"files":[...]} pour folder)
├── pdf-cache/                      cache d'extraction PDF, clé sha256(pdfPath).slice(0,24)
│                                    (voir zotero_passages.mjs — chemin par défaut
│                                    différent : ~/Library/.../zotero-passages, mais
│                                    surchargé en pdf-cache par KnowledgeStore)
└── article-drafts/
    └── <sha1(markdown).slice(0,12)>.md   brouillon, purge TTL 7 j au prochain accès
```

`knowledge.json` (`REGISTRY_VERSION = 2`) :

```json
{
  "version": 2,
  "collections": [{"slug": "glaciologie", "title": "Glaciologie"}],
  "sources": [
    {
      "id": "6746246a",
      "kind": "note",
      "title": "Note fixture",
      "origin": null,
      "chars": 57,
      "addedAt": "2026-08-15T21:13:05.431Z",
      "updatedAt": "2026-08-15T21:13:05.431Z",
      "meta": {},
      "collections": ["glaciologie"],
      "archived": false
    }
  ]
}
```

Champs `meta` variables selon `kind` (table du §2.1). Écriture toujours
**atomique** (`writeFileAtomic` : fichier temp `<path>.<pid>.<ts>.tmp` puis
`renameSync`) — répliqué par `store.mjs` ailleurs dans le sidecar mais
**réimplémenté localement** dans `knowledge.mjs` pour que le sous-ensemble
stagé (`knowledge.mjs` + `zotero_passages.mjs`) reste autonome sans tirer
`store.mjs`. Verrou : `mkdirSync(.lock)` avec ré-essai 25 ms jusqu'à 3 s
(`LOCK_TIMEOUT_MS`), vole le verrou si `mtime` du dossier > 10 s
(`LOCK_STALE_MS`, verrou probablement abandonné par un process mort).

Registre illisible (JSON cassé) : renommé en `knowledge.json.corrupt-<ts>`,
`warning` renvoyé dans **toutes** les réponses (`flag()` dans `kb_cli.mjs`)
tant que le process n'est pas relancé avec un registre propre — jamais
d'écrasement silencieux.

## 5. Constantes/limites à reproduire à l'identique

| Constante | Valeur | Rôle |
|---|---|---|
| `KB_INLINE_MAX` (`kb_prompt.mjs`) | 8000 | seuil texte intégral vs fiche dans le bloc prompt |
| `KB_FORCED_MAX` | 100 000 | plafond dur même en “texte intégral forcé” |
| `WEB_TEXT_MAX` | 300 000 | troncature du texte web récupéré |
| `FOLDER_MAX_FILES` / `FOLDER_MAX_FILE_BYTES` | 2000 / 2 Mo | limites de scan dossier |
| `YT_BUCKET_SECONDS` | 60 | granularité des pages YouTube |
| `GBRAIN_TIMEOUT_MS` | 20 000 | timeout spawn gbrain (hors write) |
| `MINERU_TIMEOUT_MS` | 900 000 | timeout conversion MinerU |
| `RAGDOC_TIMEOUT_MS` | 120 000 | timeout indexation détachée (mais `ssh … nohup &` revient bien avant) |
| `GBRAIN_PAGE_MAX` / `GBRAIN_PREVIEW_MAX` | 100 000 / 4000 | plafonds page directe |
| `ARTICLE_PAGE_MAX` / `ARTICLE_PREVIEW_MAX` | 400 000 / 4000 | plafonds page article |
| `DRAFT_TTL_MS` | 7 j | purge brouillons |
| `DUPLICATE_OVERLAP` | 0.6 | seuil de recouvrement mots-clés pour doublons |
| `TITLE_MATCH_MIN` | 0.75 | seuil Crossref-par-titre |
| `CSV_FULL_MAX` | 40 000 | seuil profilage CSV (voir §2.1bis) |
| `CSV_HEAD_ROWS` / `CSV_TAIL_ROWS` | 15 / 5 | lignes montrées en aperçu |

## 6. `csv_digest.mjs` — profilage des tableaux (plan récent, 2026-08)

Pas invoqué en CLI directement — utilisé par `knowledge.mjs::add` (kind
`file`, extensions `.csv`/`.tsv`). Aucun réseau/spawn, pur.

- `sniffDelimiter` : régularité du nombre de champs sur les 20 premières
  lignes non vides, teste `,`/`;`/tab/`|`, garde le séparateur qui donne un
  compte de champs **constant** sur toutes les lignes testées (score
  `1000+n` vs `n`), défaut `,`.
- `splitLine`/`parseRows` : CSV conforme RFC4180 (guillemets doublés
  échappent `"`, un champ entre guillemets peut contenir des retours
  ligne — `parseRows` recolle les lignes tant que le compte de `"` est
  impair).
- Fichier ≤ `CSV_FULL_MAX` (40 000 car.) : passthrough intégral en bloc
  ```` ```csv ```` .
- Sinon : profilage par colonne (`classify` : nombre / date `YYYY-MM[-DD…]`
  / booléen fr+en / texte avec échantillon de 3 valeurs distinctes), tables
  markdown (en-tête + 15 premières lignes + 5 dernières), mention explicite
  de ce qui n'est pas montré.

Deux fixtures capturées (065-C2) : un CSV sous le seuil (passthrough) et un
CSV de ~70 Ko (profilage), avec RNG **seedé** pour reproductibilité exacte.

## 7. Erreurs — contrat observé

`kb_cli.mjs::main()` : succès → une ligne JSON sur stdout, exit 0. Échec →
`error.message` (ou `String(error)`) sur **stderr**, stdout **vide**, exit 1.
Chaque commande valide ses arguments tôt (`Argument requis: --xxx`) avant
tout accès disque/réseau. Le message d'erreur de commande inconnue est
`USAGE` en entier (utile pour les tests de contrat CLI, pas pour le parsing
programmatique — le Rust ne dépend que de `exitCode ≠ 0` + `stderr`).

## 8. Ce que C3 doit répliquer, priorisé

1. **Store** (`KnowledgeStore` : registre + cache + verrou + `add`/
   `remove`/`tag`/`archive`/`collection`) — cœur incontournable, déjà
   partiellement contourné côté lecture (`kb_list_payload`), mais toute
   écriture passe encore par `kb_cli.mjs`.
2. **`search`** (per-source, lexical) — doit rester un binaire shell
   autonome pour l'agent, algorithme pur donc portable sans risque réseau.
3. **`article-import`/`article-write`/`article-draft`/`article-list`/
   `article-doi`** — la pipeline la plus riche en dépendances externes
   (Zotero sqlite, Crossref, MinerU, gbrain, ragdoc/ssh) ; MinerU/ssh restent
   des spawns externes même après le port (le plan le dit : « spawns
   inchangés »).
4. **`gbrain-search`/`gbrain-page`/`promote-page`** — wrappers fins autour
   de `runGbrain`, faible risque, mais partagent le format d'erreur
   `GBRAIN_NOT_FOUND` à reproduire exactement (sonde d'existence utilisée
   partout).
5. `csv_digest` — fonction pure, portage direct, aucun risque de parité
   caché à part l'arrondi flottant (`round()` : 4 décimales, `Number()`
   sans notation scientifique forcée) et la locale de tri (`sort()` sur
   chaînes = ordre lexicographique UTF-16, à reproduire tel quel en Rust
   plutôt que via un tri "naturel").

## 9. Fixtures de parité (C2)

Voir `gallery/server/tests/kb_parity/` (fixtures JSON, exécution réelle du
CLI) et `gallery/server/tests/kb_parity.test.mjs` (harnais de rejeu). Détail
des choix de fixturation (gbrain simulé, MinerU forcé en repli local,
YouTube exclu) dans le README de ce dossier.
