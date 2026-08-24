# Réglages — Lot B2 : le routeur opencode (plan d'implémentation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** opencode cesse d'être un fournisseur à cinq mille modèles indifférenciés et devient ce qu'il est réellement — un routeur : une entrée par modèle, ses routes repliées dessous, filtrables par passerelle, dont on épingle celles qu'on veut voir dans le sélecteur du chat.

**Architecture:** Le découpage de l'identifiant routé se fait **en Rust**, dans `parse_model_catalog`, et voyage jusqu'au frontend **à côté** du tableau `models` existant — jamais à sa place. Une dérivation pure regroupe les routes par modèle. Un composant présentationnel rend le catalogue. L'épinglage réutilise `favoriteModels` sans changer sa forme.

**Tech Stack:** Rust (`atelier-providers`, `atelier-runtime`), React 18, TypeScript, Vitest + Testing Library, `cargo test`.

**Spec:** `docs/superpowers/specs/2026-08-23-refonte-reglages-design.md` §7, et la direction « Routeur » de l'artefact des cinq directions.

## Le problème, mesuré dans le code

`parse_model_catalog` (`rust/crates/atelier-providers/src/opencode.rs:40`) accepte jusqu'à `MAX_CATALOG_MODELS = 5_000` identifiants, filtrés sur la seule présence d'un `/`. Ces identifiants sont **routés** :

```
opencode/glm-5.2              passerelle « opencode »
openrouter/z-ai/glm-5.2       passerelle « openrouter », éditeur « z-ai », MÊME modèle
kimi-for-coding/k3            passerelle « kimi-for-coding »
```

`modelDisplayLabel` (`src/lib/modelCatalog.ts:63-68`) **jette le préfixe** et n'affiche que la feuille. Deux routes du même modèle deviennent donc deux entrées homonymes sans lien, noyées dans une liste plate de plusieurs milliers de lignes. C'est la moitié non résolue du grief « la sélection des modèles n'est pas top » : le lot B1 a rendu les modèles comparables, mais opencode reste illisible.

## Le parti pris qui structure tout le lot

**Additif, jamais substitutif.** `dynamic_models()` (`opencode.rs:447-478`) renvoie aujourd'hui :

```rust
json!({ "models": models, "defaultModel": …, "modelReasoning": {} })
```

Le tableau `models` est consommé par le sélecteur du chat, `buildModelRows`, `Chat.tsx`. **On n'y touche pas.** Les routes s'ajoutent dans un champ voisin. Un frontend qui ignore ce champ continue de fonctionner exactement comme avant — c'est la condition pour que ce lot ne casse rien.

## Global Constraints

Copiées verbatim de CLAUDE.md. Elles s'appliquent à **chaque** tâche.

- **Règle Rust-first, contraignante** : toute nouvelle implémentation backend s'écrit en Rust. Le découpage des routes est du parsing — il va en Rust, avec ses tests, pas dans une regex TypeScript.
- **Aucun `<button>` nu** hors `src/components/ui/` et `src/components/shadcn/`. Verrouillé par `src/components/ui/css-contract.test.ts`.
- **Tailles de texte** : 10 / 11 / 12 / 13 / 15 px uniquement, via les jetons. **Poids** 400/500/600. **Rayons** 6/10/999. **Espacements multiples de 4.**
- **`font-variant-numeric: tabular-nums`** sur tout chiffre aligné (compteurs de passerelles, de routes).
- **Couleurs via variable CSS** uniquement. **Aucun emoji** ; icônes SVG monochromes, stroke 1.3–1.5.
- **Motion** 120–150 ms ; `prefers-reduced-motion` respecté.
- **Français** pour les commentaires de code et les messages de commit.
- `npx tsc --noEmit`, `npx vite build` et `cargo test -p atelier-providers` doivent passer.
- **Ne pas pusher** sans demande explicite.

## Leçons des lots précédents, à appliquer d'emblée

Ce chantier a produit quinze constats de revue. Trois motifs reviennent — traitez-les comme des règles :

1. **Une fixture qui ne ressemble pas au réel masque le défaut qu'elle prétend couvrir.** Au lot B1, les tests d'effort écrivaient `efforts: ["", "low"]`, forme qu'aucun backend ne produit — le sélecteur rendait un menu vide et aucun test ne le voyait. **Les fixtures de ce lot doivent utiliser de vrais identifiants routés**, y compris les cas tordus.
2. **Un test qu'on n'a pas vu échouer ne protège rien.** Cinq tests incapables d'échouer ont été débusqués. Chaque tâche fait au moins une contre-preuve : casser le code protégé, observer le rouge, restaurer, rapporter.
3. **Vérifier plutôt que supposer.** Six affirmations de mes briefs se sont révélées fausses. Si ce plan affirme quelque chose sur le code que vous ne retrouvez pas, **c'est le plan qui a tort** — signalez-le et corrigez.

## Structure de fichiers

```
rust/crates/atelier-providers/src/opencode.rs   MODIFIÉ — RoutedModel + parse, tests
rust/crates/atelier-runtime/src/send.rs         MODIFIÉ — propage `routes`
src/components/settings/shared.ts               MODIFIÉ — déclare `routes`
src/components/settings/models/
  groupRoutes.ts                                NOUVEAU — dérivation pure
  groupRoutes.test.ts                           NOUVEAU
  OpenCodeRouter.tsx                            NOUVEAU — présentationnel
  OpenCodeRouter.test.tsx                       NOUVEAU
src/components/settings/sections/Models.tsx     MODIFIÉ — rend le routeur
src/App.css                                     MODIFIÉ — styles du catalogue
```

---

### Task 1 : `RoutedModel` — le découpage, en Rust

**Files:**
- Modify: `rust/crates/atelier-providers/src/opencode.rs`

**Interfaces:**
- Produces:

```rust
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutedModel {
    pub id: String,             // identifiant exact, tel qu'envoyé au CLI
    pub gateway: String,        // premier segment
    pub vendor: Option<String>, // segment intermédiaire s'il existe
    pub leaf: String,           // nom du modèle
    pub free: bool,             // suffixe `:free` ou `-free`
}

pub fn parse_routed_models(output: &str) -> Vec<RoutedModel>;
```

- [ ] **Step 1: Écrire les tests qui échouent**

Dans le module de tests de `opencode.rs`, à côté des tests existants de `parse_model_catalog` :

```rust
#[test]
fn decoupe_une_route_a_deux_segments() {
    let r = parse_routed_models("opencode/glm-5.2\n");
    assert_eq!(r.len(), 1);
    assert_eq!(r[0].id, "opencode/glm-5.2");
    assert_eq!(r[0].gateway, "opencode");
    assert_eq!(r[0].vendor, None);
    assert_eq!(r[0].leaf, "glm-5.2");
    assert!(!r[0].free);
}

#[test]
fn decoupe_une_route_a_trois_segments() {
    let r = parse_routed_models("openrouter/z-ai/glm-5.2\n");
    assert_eq!(r[0].gateway, "openrouter");
    assert_eq!(r[0].vendor, Some("z-ai".to_string()));
    assert_eq!(r[0].leaf, "glm-5.2");
}

#[test]
fn detecte_le_suffixe_gratuit() {
    let r = parse_routed_models("openrouter/deepseek/deepseek-v4:free\n");
    assert!(r[0].free);
    assert_eq!(r[0].leaf, "deepseek-v4", "le suffixe ne fait pas partie du nom");
    assert_eq!(r[0].id, "openrouter/deepseek/deepseek-v4:free", "l'id reste EXACT");
}

#[test]
fn plus_de_trois_segments_le_reste_va_dans_la_feuille() {
    // Rien n'interdit à une passerelle d'ajouter des niveaux. On ne perd rien.
    let r = parse_routed_models("openrouter/a/b/c-1.0\n");
    assert_eq!(r[0].gateway, "openrouter");
    assert_eq!(r[0].vendor, Some("a".to_string()));
    assert_eq!(r[0].leaf, "b/c-1.0");
}

#[test]
fn applique_les_memes_filtres_que_le_catalogue_existant() {
    // Mêmes rejets que parse_model_catalog : vide, sans slash, avec espace,
    // avec ://, trop long, et dédoublonnage.
    let entree = "\n\
        sans-slash\n\
        avec espace/modele\n\
        https://exemple.dev/modele\n\
        opencode/glm-5.2\n\
        opencode/glm-5.2\n";
    let r = parse_routed_models(entree);
    assert_eq!(r.len(), 1, "un seul survivant, dédoublonné");
    assert_eq!(r[0].id, "opencode/glm-5.2");
}

#[test]
fn respecte_le_plafond_du_catalogue() {
    let entree: String = (0..6_000).map(|i| format!("openrouter/v/m{i}\n")).collect();
    assert_eq!(parse_routed_models(&entree).len(), MAX_CATALOG_MODELS);
}

#[test]
fn accord_avec_parse_model_catalog() {
    // Les deux fonctions doivent voir exactement les mêmes lignes : si elles
    // divergent, le tableau `models` et les routes décrivent deux mondes.
    let entree = "opencode/glm-5.2\nopenrouter/z-ai/glm-5.2\nsans-slash\n";
    let plats = parse_model_catalog(entree);
    let routes = parse_routed_models(entree);
    assert_eq!(plats.len(), routes.len());
    for (plat, route) in plats.iter().zip(routes.iter()) {
        assert_eq!(plat, &route.id);
    }
}
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
cargo test -p atelier-providers opencode
```

Attendu : ÉCHEC — `parse_routed_models` n'existe pas.

- [ ] **Step 3: Implémenter**

Écrire `parse_routed_models`. **Factorise le filtrage** avec `parse_model_catalog` plutôt que de le copier — le test `accord_avec_parse_model_catalog` existe précisément pour interdire la divergence. Si tu extrais un itérateur commun, `parse_model_catalog` doit rester inchangé de l'extérieur.

- [ ] **Step 4: Vérifier**

```bash
cargo test -p atelier-providers
```

- [ ] **Step 5: Contre-preuve**

Casse le découpage (par exemple `vendor` toujours `None`), observe quels tests rougissent, restaure. Rapporte lesquels.

- [ ] **Step 6: Commit**

```bash
git add rust/crates/atelier-providers/src/opencode.rs
git commit -m "feat(opencode): découpe les identifiants routés en Rust

Un identifiant opencode porte sa provenance — passerelle, éditeur, modèle.
Le découpage quitte la regex de modelDisplayLabel pour devenir testable, et
un test verrouille l'accord avec parse_model_catalog.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2 : Faire voyager les routes, sans toucher à `models`

**Files:**
- Modify: `rust/crates/atelier-providers/src/opencode.rs` (`dynamic_models`)
- Modify: `rust/crates/atelier-runtime/src/send.rs` (propagation)
- Modify: `src/components/settings/shared.ts` (déclaration du champ)

- [ ] **Step 1: Écrire le test Rust qui échoue**

Un test sur `dynamic_models` (ou sur la construction de sa valeur si la fonction fait des entrées/sorties) vérifiant que la charge utile contient **à la fois** `models` (inchangé, tableau de chaînes) **et** `routes` (tableau d'objets), et que les deux décrivent les mêmes identifiants dans le même ordre.

- [ ] **Step 2: Implémenter côté Rust**

```rust
let value = json!({
    "models": models,          // INCHANGÉ — le picker et Chat.tsx en dépendent
    "routes": routes,          // nouveau, additif
    "defaultModel": self.default_model(),
    "modelReasoning": {}
});
```

Puis propager dans `send.rs`, sur le modèle de ce qui est déjà fait pour `modelLabels` (`send.rs:1579`) — **va lire ce bloc avant d'écrire le tien**, c'est le motif de référence.

- [ ] **Step 3: Déclarer le champ côté TypeScript**

Ajouter à `ProviderCatalogRow` (`src/components/settings/shared.ts`) :

```ts
/** Routes opencode découpées en Rust (lot B2). Absent des autres fournisseurs. */
routes?: { id: string; gateway: string; vendor?: string | null; leaf: string; free: boolean }[];
```

**Attention au piège du lot B1** : `modelLabels` transitait déjà par le spread du handler sans être déclaré, donc invisible pour TypeScript et silencieusement perdu. Vérifie que le handler de `Models.tsx` propage bien le nouveau champ.

- [ ] **Step 4: Vérifier la non-régression**

```bash
cargo test -p atelier-providers
cargo test -p atelier-runtime
npx vitest run src/components/settings/
npx tsc --noEmit
```

Aucun consommateur existant de `models` ne doit changer de comportement.

- [ ] **Step 5: Commit**

---

### Task 3 : `groupRoutes`, la dérivation pure

C'est ce regroupement — plus que n'importe quel filtre — qui rend le catalogue lisible.

**Files:**
- Create: `src/components/settings/models/groupRoutes.ts`
- Test: `src/components/settings/models/groupRoutes.test.ts`

**Interfaces:**

```ts
export type Route = { id: string; gateway: string; vendor?: string | null; leaf: string; free: boolean };
export type ModelGroup = {
  key: string;          // clé stable du groupe
  label: string;        // nom humain du modèle
  vendor: string | null;
  routes: Route[];
  pinnedCount: number;
};
export function groupRoutes(routes: Route[], pinned: string[]): ModelGroup[];
export function filterGroups(groups: ModelGroup[], gateway: string | null, query: string): ModelGroup[];
```

- [ ] **Step 1: Écrire les tests qui échouent**

Couvre au minimum : deux routes du même modèle fusionnent en un groupe de deux routes ; un modèle à route unique reste un groupe d'une route ; le compte d'épinglées est juste ; le filtre par passerelle ne garde que les routes de cette passerelle **et retire les groupes devenus vides** ; la recherche porte sur le nom **et** sur l'identifiant complet ; les clés de groupe sont uniques et stables ; 5 000 routes se regroupent en moins d'une seconde.

**Fixtures réalistes obligatoires** — utilise de vrais identifiants (`opencode/glm-5.2`, `openrouter/z-ai/glm-5.2`, `kimi-for-coding/k3`, `openrouter/deepseek/deepseek-v4:free`), pas des chaînes inventées. C'est la leçon la plus coûteuse de ce chantier.

**Une question à trancher et à documenter :** deux routes ont le même `leaf` mais des `vendor` différents (`openrouter/a/mixtral` et `openrouter/b/mixtral`). Même modèle ou deux modèles ? Décide, teste ta décision, et explique-la dans ton rapport.

- [ ] **Step 2 → 5 : échec, implémentation, vérification, contre-preuve, commit**

---

### Task 4 : `OpenCodeRouter`, le catalogue

**Files:**
- Create: `src/components/settings/models/OpenCodeRouter.tsx`
- Test: `src/components/settings/models/OpenCodeRouter.test.tsx`
- Modify: `src/App.css`

**Interfaces:**

```ts
export function OpenCodeRouter(props: {
  groups: ModelGroup[];
  gateways: { id: string; count: number }[];
  activeGateway: string | null;
  query: string;
  onGatewayChange: (id: string | null) => void;
  onQueryChange: (value: string) => void;
  onTogglePin: (route: Route) => void;
  pinned: string[];
}): JSX.Element;
```

Quatre règles de dessin, tirées de la spec §7.2 :

1. **Ne rien afficher tant qu'on n'a pas filtré.** Sans passerelle choisie ni recherche, la zone reste vide avec son compte — « N modèles répartis sur M passerelles ». Afficher mille rangées au hasard serait pire que rien.
2. **Un groupe se déplie**, montrant ses routes avec leur passerelle. Un groupe portant une route épinglée s'ouvre d'office.
3. **On épingle une route, pas un modèle** — le prix et la latence en dépendent.
4. **Les épinglés sont visibles en tête**, hors du catalogue, avec le rappel de ce qu'ils font : ce sont eux, et eux seuls, que le sélecteur du chat affiche.

Accessibilité, non négociable après les leçons du lot B1 : le déclencheur de dépliage porte `aria-expanded` ; les puces de passerelle sont un groupe de contrôles nommés ; l'épinglage expose son état (`aria-pressed`).

- [ ] **Steps : tests d'abord, contre-preuve, commit**

---

### Task 5 : Câbler dans la section, et l'épinglage

**Files:**
- Modify: `src/components/settings/sections/Models.tsx`
- Modify: `src/components/settings/sections/Models.test.tsx`

**L'épinglage réutilise `favoriteModels`** (`Record<provider, string[]>`), sans changer sa forme : les identifiants routés **sont** les identifiants. `Chat.tsx:496` construit déjà ses favoris par `${providerId}:${modelId}` — vérifie que rien ne casse avec des identifiants contenant des `/`.

**Un point à vérifier avant de coder, pas après :** que fait le sélecteur du chat quand la liste d'épinglés d'opencode est **vide** ? `Chat.tsx:495` a un `fallbackFavoriteModels`. Si le sélecteur retombe sur les cinq mille modèles, la promesse « seuls les épinglés apparaissent » est fausse. Lis le code, dis ce qu'il fait, et signale si la spec surpromet.

Le routeur ne s'affiche que si opencode est présent dans le catalogue, et vit **sous le repli « Avancé »** de la section Modèles : c'est un outil de curation, pas la vue quotidienne.

---

### Task 6 : Point de contrôle visuel

Aucun test ne prouve qu'un catalogue de cinq mille entrées reste navigable.

- [ ] Reconstruire et relancer selon `docs/PROTOCOLE_RELANCE.md` **à la lettre**.
- [ ] Demander à Thierry de vérifier : la zone vide dit-elle clairement quoi faire ; choisir une passerelle donne-t-il un résultat immédiat ; les groupes à plusieurs routes se comprennent-ils ; épingler puis ouvrir le sélecteur du chat montre-t-il bien la route épinglée ; le catalogue reste-t-il fluide avec le vrai `opencode models`.
- [ ] Rapporter ce qu'il a observé, pas ce qui devrait se produire.

## Vérification de fin de lot

- [ ] `cargo test -p atelier-providers` et `-p atelier-runtime` verts.
- [ ] `npx vitest run` — pas de nouvel échec.
- [ ] `npx tsc --noEmit` et `npx vite build` propres.
- [ ] `App.settingsMirror` et `App.settings-crash` passent **sans modification**.
- [ ] Le tableau `models` de la charge utile est **inchangé** — le sélecteur du chat et `buildModelRows` se comportent exactement comme avant.
- [ ] Contrôle visuel fait, constats reportés.

## Ce que ce lot ne fait PAS

- Pas de métadonnée par route (latence mesurée, prix) : rien dans le catalogue ne les fournit. Les valeurs de l'artefact étaient illustratives.
- Pas de recherche globale (B3), pas d'Extensions (B4), pas d'Apparence (B5).
- Pas de changement de forme de `favoriteModels` — la compatibilité est le prix à payer pour ne pas casser le sélecteur du chat.
