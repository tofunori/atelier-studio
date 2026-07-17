# Plan 044 : Fidélité du listing fichiers — formats scientifiques visibles, troncature annoncée, grille non limitée au PNG, filtres complets

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 12e1a04..HEAD -- rust/crates/atelier-remote/src/path_policy.rs rust/crates/atelier-remote/src/routes.rs mobile/src/files mobile/src/transport/filesClient.ts mobile/src/gallery/GalleryScreen.tsx docs/mobile/RUNBOOK.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (change de contrat listing gateway↔mobile, des deux côtés)
- **Depends on**: none (039 recommandé d'abord : il met `test:remote` + `mobile:test` en CI)
- **Category**: bug
- **Planned at**: commit `12e1a04`, 2026-07-16

## Why this matters

Les fichiers présents dans les projets de l'utilisateur (MSc glaciologie — données `.nc` NetCDF, `.tif` GeoTIFF, `.parquet`, `.gpkg`, classeurs, notebooks) **n'apparaissent pas dans l'app iOS**, sans aucun indice. Quatre filtres silencieux s'empilent : (1) une allowlist de 26 extensions qui exclut tous les formats de données scientifiques ; (2) la vue grille de la galerie qui ne montre que les `.png` (filtre codé en dur) ; (3) un plafond de 1 000 items appliqué **avant** le tri par date, donc des sous-arbres entiers disparaissent arbitrairement sans indicateur ; (4) une liste de projets limitée aux racines des threads existants + un `projects.json` optionnel non documenté. Ce plan rend le listing fidèle ou, quand une limite s'applique, **annoncée**. (Les exclusions sécurité — symlinks, dossiers cachés, `.git`/`node_modules` — sont conformes au threat model T3 et restent inchangées.)

Demande utilisateur explicite (2026-07-16) : **pouvoir filtrer les types de fichiers**. L'UI a déjà des puces de filtre par kind en vue liste (`Tous/PDF/Figures/LaTeX/Données/Code`), mais (a) le kind `other` — où atterrissent tous les nouveaux formats scientifiques binaires — n'a **pas de puce**, donc ces fichiers ne seraient visibles que sous « Tous » ; (b) aucun filtrage par extension n'existe (seule la recherche texte matche l'extension). Le Step 4b comble les deux. Bonus structurel : l'onglet Fichiers est le même composant (`FilesScreen.tsx` = wrapper de `GalleryScreen` en `layout="list"`), donc les filtres améliorés servent les deux onglets sans travail supplémentaire.

## Current state

### Gateway (Rust)

- `rust/crates/atelier-remote/src/path_policy.rs:10-14` — l'allowlist actuelle :

```rust
const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024; // 50 MiB default
const ALLOWED_EXTS: &[&str] = &[
    "pdf", "png", "jpg", "jpeg", "svg", "gif", "webp", "md", "tex", "bib", "txt", "csv", "json",
    "html", "css", "rs", "py", "r", "jl", "ts", "tsx", "js", "jsx", "toml", "yaml", "yml",
];
```

  `is_allowed_ext` (`:247-249`) est appelé par le scan du listing (`routes.rs:771`) ET par la validation d'accès fichier (`path_policy.rs:230` — rejet `mime_not_allowed`). Étendre la liste ouvre donc listing **et** téléchargement (le cap 50 MiB reste).

- `rust/crates/atelier-remote/src/routes.rs:703-812` — `gallery_index` : scan DFS borné du root projet. Les lignes clés :

```rust
    let mut pending = vec![(proj.root.clone(), 0usize)];
    while let Some((dir, depth)) = pending.pop() {
        if depth > 10 || items.len() >= 1_000 {
            continue;
        }
```

  puis filtre extension (`:771`), et le tri par `modifiedAt` **après** la collecte (`:797-806`), donc le plafond tronque avant le tri. Réponse actuelle (`:807-811`) : `{ "projectId", "items", "count" }` — pas de flag de troncature.

- `rust/crates/atelier-remote/src/routes.rs:860-869` — `gallery_kind` (note : `sty`/`cls` y figurent mais sont absents d'`ALLOWED_EXTS` — dérive existante corrigée par ce plan) :

```rust
fn gallery_kind(ext: &str) -> &'static str {
    match ext {
        "pdf" => "pdf",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => "figure",
        "tex" | "bib" | "sty" | "cls" => "latex",
        "md" | "txt" | "csv" | "json" | "yaml" | "yml" | "toml" => "data",
        "rs" | "py" | "r" | "jl" | "ts" | "tsx" | "js" | "jsx" | "css" | "html" => "code",
        _ => "other",
    }
}
```

- Liste des projets : `rust/crates/atelier-remote/src/state.rs:90-117` — racines des threads (`threads.json`) + fichier optionnel `projects.json` dans `config.data_dir` (`[{ "path": "...", "name": "..." }]`). Le data dir vient d'`ATELIER_REMOTE_DIR` (`lib.rs:179`) sinon d'un défaut défini dans `GatewayConfig` (le lire pour documenter la valeur exacte au Step 6).
- Tests Rust existants : `rust/crates/atelier-remote/tests/security.rs` (13 tests tokio, modèles d'intégration — dont un test existant de `GET /remote/v1/gallery/{pid}` vers les lignes 470-490, à étendre au Step 3) et `#[cfg(test)]` dans `path_policy.rs:251+` (4 tests unitaires). Commande : `npm run test:remote` (= `cargo test -p atelier-remote --manifest-path rust/Cargo.toml --locked`).

### Mobile (TypeScript)

- `mobile/src/files/types.ts:3-5` :

```ts
export type FileKind = "pdf" | "figure" | "latex" | "data" | "code" | "other";
export type GalleryFilter = "all" | "pdf" | "figure" | "latex" | "data" | "code";
```

- `mobile/src/files/classify.ts:3-11` — `kindFromExt` duplique la table `gallery_kind` côté client (fallback si le serveur n'envoie pas `kind`). Toute extension ajoutée au gateway doit être ajoutée ici à l'identique.
- `mobile/src/gallery/GalleryScreen.tsx:82-89` — les puces de filtre existantes (rendues seulement en `layout === "list"`, `GalleryScreen.tsx:378-403`, via `ToggleGroup`) :

```ts
const FILTERS: { id: GalleryFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "pdf", label: "PDF" },
  { id: "figure", label: "Figures" },
  { id: "latex", label: "LaTeX" },
  { id: "data", label: "Données" },
  { id: "code", label: "Code" },
];
```

  `Select/SelectContent/SelectGroup/SelectItem/SelectTrigger/SelectValue` sont déjà importés dans ce fichier (`:40-47`) et utilisés pour le contrôle de tri (`:421-436`, `aria-label="Trier les fichiers"`) — le filtre extension du Step 4b suit ce modèle existant.
- `mobile/src/files/FilesScreen.tsx` (25 lignes) — wrapper qui rend `GalleryScreen` avec `layout="list"` et `title="Fichiers"` : tout changement de filtres profite aux deux onglets. Ne pas le modifier.
- `mobile/src/gallery/GalleryScreen.tsx:179-186` — le filtre grille PNG-only :

```ts
    const source = layout === "grid"
      ? items.filter((item) => item.ext.toLocaleLowerCase("fr") === "png")
      : filterItems(items, filter);
```

  Le chargeur de vignettes (`GalleryScreen.tsx:245`) ne traite que `kind === "figure" && ext !== "svg"` — les figures raster non-PNG (jpg/webp/gif) auront donc déjà leurs vignettes si on élargit le filtre aux figures raster.
- `mobile/src/files/FileViewer.tsx:79-105` — `materialize()` décide du rendu par `kind` : `latex|data|code` → `blob.text()`. **Piège central** : mapper un format binaire (`.nc`, `.parquet`) sur `data` ferait télécharger puis afficher du binaire comme texte. D'où la règle de mapping du Step 2 (binaire → `other`) et la carte « aperçu indisponible » du Step 5 qui court-circuite le fetch.
- Tests mobile existants : `mobile/src/files/classify.test.ts` (modèle pour `kindFromExt`), suite `cd mobile && npm test`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests gateway | `npm run test:remote` | tous verts (16+ tests) |
| Tests mobile | `cd mobile && npm test` | tous verts |
| Typecheck mobile | `cd mobile && npm run typecheck` | exit 0 |
| Build mobile | `cd mobile && npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `rust/crates/atelier-remote/src/path_policy.rs` (+ ses tests intégrés)
- `rust/crates/atelier-remote/src/routes.rs` (uniquement `gallery_index` et `gallery_kind`)
- `rust/crates/atelier-remote/tests/security.rs` (nouveau test d'intégration)
- `mobile/src/files/types.ts`, `mobile/src/files/classify.ts` + `classify.test.ts`
- `mobile/src/files/FileViewer.tsx`
- `mobile/src/transport/filesClient.ts` (faire remonter `truncated`/`totalSeen`)
- `mobile/src/gallery/GalleryScreen.tsx`
- `docs/mobile/RUNBOOK.md` (section `projects.json`)

**Out of scope** (do NOT touch, even though they look related):
- Les exclusions sécurité du scan : symlinks, dossiers `.`-préfixés, `.git`/`node_modules`/`target`/`.atelier-trash`/`.venv`/`venv`/`__pycache__`, profondeur 10 — décisions threat model T3, **ne pas les assouplir**.
- `MAX_FILE_BYTES` (50 MiB) et `normalize_relative` — inchangés.
- `get_file_by_path` / `get_file_by_id` / `trash_file_by_id` — le contrôle d'accès ne change pas.
- Le viewer desktop et la galerie desktop (`gallery/`).

## Git workflow

- Branche : `advisor/044-files-listing-fidelity`
- Un commit par volet (gateway / mobile / docs) ; messages style repo.
- Ne pas pusher ni ouvrir de PR sans instruction de l'opérateur.

## Steps

### Step 1 : Étendre l'allowlist d'extensions (gateway)

Dans `path_policy.rs`, remplacer `ALLOWED_EXTS` par :

```rust
const ALLOWED_EXTS: &[&str] = &[
    // documents / figures
    "pdf", "png", "jpg", "jpeg", "svg", "gif", "webp",
    // texte / config / code (existant)
    "md", "tex", "bib", "sty", "cls", "txt", "csv", "json", "html", "css",
    "rs", "py", "r", "jl", "ts", "tsx", "js", "jsx", "mjs", "cjs", "sh",
    "toml", "yaml", "yml", "log", "ipynb", "geojson",
    // données scientifiques binaires (listing + téléchargement ≤ 50 MiB ; pas d'aperçu iOS)
    "nc", "tif", "tiff", "parquet", "gpkg", "duckdb",
    "shp", "shx", "dbf", "prj",
    // bureautique
    "xlsx", "docx", "pptx",
];
```

Ajouter dans le `mod tests` du même fichier (modèle : tests existants `:256+`) :

```rust
    #[test]
    fn allows_scientific_exts() {
        for e in ["nc", "tif", "tiff", "parquet", "gpkg", "ipynb", "xlsx", "log"] {
            assert!(is_allowed_ext(e), "{e} doit être autorisé");
        }
        assert!(!is_allowed_ext("exe"));
        assert!(!is_allowed_ext("dylib"));
    }
```

**Verify**: `npm run test:remote` → verts, dont `allows_scientific_exts`.

### Step 2 : Mettre à jour `gallery_kind` (gateway)

Dans `routes.rs:860-869`, étendre le match — règle : **un format binaire sans aperçu iOS reste `other`** (le viewer mobile s'appuie sur `kind` pour décider de lire le blob comme texte) :

```rust
fn gallery_kind(ext: &str) -> &'static str {
    match ext {
        "pdf" => "pdf",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => "figure",
        "tex" | "bib" | "sty" | "cls" => "latex",
        "md" | "txt" | "csv" | "json" | "yaml" | "yml" | "toml" | "log" | "geojson" | "ipynb" => "data",
        "rs" | "py" | "r" | "jl" | "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "sh" | "css" | "html" => "code",
        // nc, tif, tiff, parquet, gpkg, duckdb, shp/shx/dbf/prj, xlsx, docx, pptx → other
        _ => "other",
    }
}
```

**Verify**: `npm run test:remote` → verts.

### Step 3 : Trier avant de tronquer + annoncer la troncature (gateway)

Dans `gallery_index` (`routes.rs:703-812`) :

1. Remplacer la constante en dur par deux constantes nommées en tête de fonction (ou du module) : `const COLLECT_MAX: usize = 5_000;` (borne mémoire de collecte) et `const RETURN_MAX: usize = 1_000;` (taille de réponse).
2. Le scan collecte jusqu'à `COLLECT_MAX` (remplacer les deux comparaisons `items.len() >= 1_000`, `routes.rs:722` et `:729`, par `>= COLLECT_MAX`) et compte séparément `total_seen` (fichiers admis rencontrés, même au-delà de la collecte — incrémenter avant le test de capacité).
3. Après le tri existant (`:797-806`, inchangé), tronquer : `let truncated = items.len() > RETURN_MAX || total_seen > items.len(); items.truncate(RETURN_MAX);`
4. Réponse :

```rust
    Ok(Json(json!({
        "projectId": project_id,
        "items": items,
        "count": items.len(),
        "totalSeen": total_seen,
        "truncated": truncated,
    })))
```

Ajouter un test d'intégration dans `tests/security.rs` (suivre la structure des tests existants du fichier — état gateway + projet temporaire) : créer un projet temporaire avec des fichiers d'horodatages croissants **dont un nombre > RETURN_MAX est irréaliste en test** ; à défaut, tester le contrat sur petit volume : `truncated == false`, `totalSeen == count`, et les items triés par `modifiedAt` décroissant. Si un test existant couvre déjà `gallery_index`, l'étendre plutôt que dupliquer.

**Verify**: `npm run test:remote` → verts, nouveau test inclus.

### Step 4 : Miroir client — types, classify, bannière troncature (mobile)

1. `types.ts` : ajouter à `GalleryIndex` les champs optionnels `totalSeen?: number; truncated?: boolean;` (le type est déclaré à partir de `types.ts:19` — le compléter). `FileKind` ne change pas ; `GalleryFilter` est étendu au Step 4b.
2. `classify.ts` `kindFromExt` : refléter exactement la table du Step 2 (ajouter `log|geojson|ipynb` → data ; `mjs|cjs|sh` → code ; binaires → laisser tomber dans `other`).
3. `classify.test.ts` : cas pour `nc→other`, `tif→other`, `ipynb→data`, `sh→code`, `log→data` (modèle : cas existants du fichier).
4. `filesClient.ts` : **vérifié — `fetchGalleryIndex` (lignes 30-47) reconstruit un objet littéral `{ projectId, items, count }` et JETTE tout champ inconnu.** Ajouter `truncated` et `totalSeen` au type de retour et à l'objet retourné (lecture défensive : `Boolean(body.truncated)`, `Number(body.totalSeen) || undefined`). Puis dans `GalleryScreen.tsx` (appel à `fetchGalleryIndex` ligne ~158) : afficher, au-dessus de la liste quand `truncated === true`, une ligne discrète conforme au design system (texte `--muted`, taille 12) : `Liste tronquée : {count} fichiers les plus récents sur {totalSeen}`. Pas de couleur d'alerte, pas d'emoji.

**Verify**: `cd mobile && npm test` → verts ; `npm run typecheck` → exit 0.

### Step 4b : Filtres complets — puce « Autres » + filtre par extension (mobile)

1. `types.ts` : étendre le type filtre : `export type GalleryFilter = "all" | "pdf" | "figure" | "latex" | "data" | "code" | "other";` (`filterItems` dans `classify.ts:28-31` gère déjà n'importe quel kind par égalité — aucun changement là pour la puce).
2. `GalleryScreen.tsx` : ajouter `{ id: "other", label: "Autres" }` à la fin du tableau `FILTERS` (`:82-89`).
3. Filtre par extension — dans `classify.ts`, ajouter un helper pur :

```ts
export function distinctExts(items: GalleryItem[]): string[] {
  return [...new Set(items.map((i) => i.ext.toLowerCase()).filter(Boolean))].sort();
}
```

   Dans `GalleryScreen.tsx` : un état `const [extFilter, setExtFilter] = useState<string>("all");` ; un `Select` « Extension » (option « Toutes » = `"all"`, puis `distinctExts(items)`) placé dans la rangée `gallery-tools` à côté de la recherche, **rendu seulement en `layout === "list"`** (cohérent avec les puces) et en suivant exactement le modèle du `Select` de tri déjà présent dans le fichier (mêmes composants, mêmes classes — aucune valeur visuelle inventée). Dans le `useMemo` `filtered` (`:179-195`), ajouter la clause `.filter((item) => extFilter === "all" || item.ext.toLowerCase() === extFilter)` et ajouter `extFilter` aux dépendances. Réinitialiser `extFilter` à `"all"` quand `projectId` change (dans l'effet existant `:175-177` ou un effet dédié) et remettre `setPage(0)` au changement d'extension (même motif que le changement de puce `:386-390`).
4. `classify.test.ts` : cas `filterItems` avec `filter: "other"` (un item `kind:"other"` retenu, un `kind:"data"` exclu) et cas `distinctExts` (dédoublonnage, tri, casse).

**Verify**: `cd mobile && npm test` → verts ; `npm run typecheck` → exit 0.

### Step 5 : Carte « aperçu indisponible » pour les binaires (mobile)

Dans `FileViewer.tsx` :

1. Déclarer `const NO_PREVIEW_EXTS = new Set(["nc", "tif", "tiff", "parquet", "gpkg", "duckdb", "shp", "shx", "dbf", "prj", "xlsx", "docx", "pptx"]);`
2. **Avant** le fetch (`:60`), si `NO_PREVIEW_EXTS.has(p.item.ext.toLowerCase())` : ne pas télécharger ; rendre une carte d'information (nom, extension en `Badge`, taille formatée, date) avec le texte « Aperçu indisponible sur iOS — fichier listé pour référence ». Ajouter l'import `import { Badge } from "@/components/ui/badge.tsx";` (il n'est PAS encore importé dans `FileViewer.tsx` — le composant existe et est déjà utilisé dans `GalleryScreen` et les viewers) ; réutiliser les classes `viewer-*` existantes ; aucune valeur visuelle inventée (tailles 12/13, gris `--muted`).
3. Ne pas modifier `materialize()` — le court-circuit se fait en amont.

**Verify**: `cd mobile && npm test` → verts ; `cd mobile && npm run build` → exit 0.

### Step 6 : Documenter `projects.json` (docs)

Dans `docs/mobile/RUNBOOK.md`, ajouter une courte section « Projets visibles dans l'app » :

- Le gateway liste les projets = racines des threads existants (`threads.json`) **+** le fichier `projects.json` dans son data dir.
- Lire la valeur par défaut réelle du data dir dans `GatewayConfig` (`rust/crates/atelier-remote/src/state.rs` / `lib.rs:179` : env `ATELIER_REMOTE_DIR` sinon défaut) et la citer exactement.
- Donner l'exemple :

```json
[
  { "path": "/Users/tofunori/Documents/Thesis", "name": "Thèse" },
  { "path": "/Users/tofunori/Documents/Projets/albedo", "name": "Albédo MODIS" }
]
```

- Préciser : redémarrer le gateway après modification ; un chemin inexistant est ignoré silencieusement (`state.rs:111`).

**Verify**: `npm run mobile:check-secrets` → exit 0 (la doc ne contient aucun secret).

## Test plan

- Rust : `allows_scientific_exts` (Step 1) ; contrat `truncated/totalSeen/tri` dans `tests/security.rs` (Step 3).
- Mobile : cas `kindFromExt` (Step 4.3) ; cas `filterItems("other")` et `distinctExts` (Step 4b.4) ; la suite existante protège le reste (`classify.test.ts`, tests viewers).
- Vérification transverse finale : `npm run verify:mobile` → exit 0 (enchaîne test:protocol, test:remote, typecheck, tests, build, scan secrets).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run test:remote` exit 0 (nouveaux tests inclus)
- [ ] `cd mobile && npm test` exit 0 (nouveaux cas classify inclus)
- [ ] `npm run verify:mobile` exit 0
- [ ] `grep -c '"nc"' rust/crates/atelier-remote/src/path_policy.rs` ≥ 1 et `grep -c '"truncated"' rust/crates/atelier-remote/src/routes.rs` ≥ 1
- [ ] `grep -c 'toLocaleLowerCase("fr") === "png"' mobile/src/gallery/GalleryScreen.tsx` → 0 (le filtre grille PNG-only de la ligne 181-182 est remplacé par le filtre figures raster ; le compteur de favoris ligne ~455 utilise `toLowerCase()` et n'est pas concerné)
- [ ] `grep -c "NO_PREVIEW_EXTS" mobile/src/files/FileViewer.tsx` ≥ 1
- [ ] `grep -c '"other"' mobile/src/files/types.ts` ≥ 2 (FileKind existant + GalleryFilter étendu) et `grep -c 'label: "Autres"' mobile/src/gallery/GalleryScreen.tsx` → 1
- [ ] `grep -c "distinctExts" mobile/src/files/classify.ts` ≥ 1 et `grep -c "extFilter" mobile/src/gallery/GalleryScreen.tsx` ≥ 3
- [ ] `git status` : seuls les fichiers in-scope (et `plans/README.md`) modifiés

## STOP conditions

Stop and report back (do not improvise) if:

- Les extraits « Current state » ne correspondent plus au code (drift).
- Un test existant de `tests/security.rs` échoue après le Step 1 : une extension ajoutée casse une attente de sécurité (ex. un test assertait le rejet d'un format) — reporter le conflit, ne pas supprimer le test.
- **Décision grille (à trancher, pas à improviser)** : ce plan remplace le filtre PNG-only par `kind === "figure" && ext !== "svg"` (toutes les figures raster — les vignettes existent déjà pour elles, `GalleryScreen.tsx:245`). Si en l'implémentant il apparaît que la grille doit montrer TOUS les types (PDF, data…), il faudrait des tuiles placeholder par type — c'est un élargissement de scope : s'arrêter et proposer, ne pas improviser des tuiles.
- Le test d'intégration galerie existant dans `tests/security.rs` (~470-490) asserte une forme de réponse stricte incompatible avec les nouveaux champs `truncated`/`totalSeen` — l'étendre est attendu ; s'il asserte autre chose d'incompatible, reporter.

## Maintenance notes

- Toute extension ajoutée plus tard doit l'être **aux trois endroits** : `ALLOWED_EXTS` (gateway), `gallery_kind` (gateway), `kindFromExt` (mobile) — et dans `NO_PREVIEW_EXTS` si binaire. Un test de parité automatique entre les trois tables serait un bon suivi (non inclus ici : il faudrait un fixture partagé Rust↔TS).
- Le plafond `RETURN_MAX = 1_000` reste ; il est maintenant trié-avant-tronqué et annoncé. Si un projet dépasse `COLLECT_MAX = 5_000` fichiers admis, le `totalSeen` lui-même devient approximatif — documenté dans le code, acceptable pour le MVP.
- Reviewer : vérifier qu'aucun format binaire n'est mappé sur `data`/`code`/`latex` (sinon `FileViewer.materialize()` lira le blob comme texte), et que la bannière de troncature respecte les tokens (pas de hex en dur).
- Suivi différé : aperçu GeoTIFF/NetCDF côté iOS (conversion serveur en PNG à la volée) — hors scope MVP ; sync `projects.json` automatique depuis les project roots du desktop — à décider.
