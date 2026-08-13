# Catalogue Grok piloté par l'ACP

Date : 2026-08-12
Statut : design validé, prêt pour plan d'implémentation

## Problème

Thierry n'a pas accès à Grok 4.6 dans le chat Atelier, alors que le CLI
installé (`grok 1.0.3`) l'a par défaut. Plus largement : la crainte était que
les fonctionnalités de « Grok Build » (skills, sous-agents, plugins, MCP,
hooks) n'existent que dans la TUI et doivent être portées une par une dans le
provider ACP.

## Constat vérifié par sonde

Une sonde ACP directe (`grok agent --no-leader stdio`, `initialize` +
`session/new`, log debug) a établi deux choses.

**1. La config est déjà partagée.** Le mode agent charge exactement ce que
charge la TUI :

```
MCP servers loaded from ~/.claude.json  user_level_count=18
Loaded Cursor MCP servers from ~/.cursor/mcp.json  count=2
Loaded .mcp.json MCP servers  count=1
plugin discovered name=moonshine scope=user … has_hooks=true
593 occurrences de « skills »
```

Skills, plugins, MCP, hooks et agents sont donc **déjà actifs** dans le chat
Atelier. Aucun portage n'est nécessaire pour ces fonctionnalités, ni
maintenant ni pour les prochaines : elles arrivent par la config sur disque,
pas par l'interface.

**2. Atelier jette la moitié de la réponse ACP.** `session/new` renvoie :

```json
{
  "models": {
    "currentModelId": "grok-4.6",
    "availableModels": [
      { "modelId": "grok-4.6", "name": "Grok 4.6",
        "_meta": { "totalContextTokens": 500000,
          "reasoningEfforts": [
            {"id":"xhigh","label":"Extra High Effort","default":true},
            {"id":"high"},{"id":"medium"},{"id":"low"}] } },
      { "modelId": "grok-4.5", "name": "Grok 4.5",
        "_meta": { "reasoningEfforts": [{"id":"high"},{"id":"medium"},{"id":"low"}] } },
      { "modelId": "ocx-gpt-5-6-sol", "name": "OCX gpt-5.6-sol" }
    ]
  }
}
```

`remember_session_result` (`rust/crates/atelier-providers/src/grok.rs:869`) ne
retient que `modelId`, **trie la liste alphabétiquement**, et
`default_model()` prend le premier élément. `grok-4.5` < `grok-4.6` : c'est ce
tri qui bloque Thierry sur 4.5. Le `name` officiel et les
`reasoningEfforts` par modèle sont écartés.

Conséquences observables :

- Grok 4.6 n'est pas le modèle par défaut, alors que le CLI le propose ainsi.
- Les modèles apparaissent en identifiant brut faute de libellé connu
  (`BUILTIN_MODEL_LABELS`, `src/lib/modelCatalog.ts:11`, ne liste que 4.5 et
  Composer 2.5 Fast).
- L'effort `xhigh`, disponible uniquement sur 4.6, est inaccessible :
  `efforts()` renvoie `["low","medium","high"]` en dur
  (`grok.rs:606`), et `dynamic_models()` fabrique le même triplet pour tous
  les modèles (`grok.rs:778`).

## Objectif

Le catalogue Grok d'Atelier reflète ce que le CLI annonce, sans valeur codée
en dur. Critère de succès : quand xAI publie un modèle ou un niveau d'effort,
il apparaît dans Atelier après une relance, sans modification de code.

## Périmètre

### 1. Structure de modèle dans le provider Grok

`GrokProvider.discovered_models: StdMutex<Vec<String>>` devient une liste de
descripteurs :

```rust
struct GrokModelInfo {
    id: String,
    label: Option<String>,        // `name` ACP
    efforts: Vec<String>,         // ids de `_meta.reasoningEfforts`
    default_effort: Option<String>, // premier `default: true`
}
```

`remember_session_result` remplit cette structure depuis
`/models/availableModels` et retient `/models/currentModelId` comme modèle
courant du provider. **Le tri alphabétique disparaît** : l'ordre annoncé par
le CLI est conservé (4.6 en tête).

Le repli `discover_models()` (parsing de `grok models`) reste en place pour
le cas où aucune session ACP n'a encore été ouverte, mais ne produit que des
`id` — `label` et `efforts` restent `None`/vides, et les consommateurs
retombent alors sur leurs valeurs par défaut.

### 2. Défaut, efforts et catalogue dynamique

- `default_model()` retourne `currentModelId` s'il est connu, sinon le
  premier descripteur, sinon le repli statique.
- `efforts()` retourne les efforts du modèle courant, sinon
  `["low","medium","high"]`.
- `dynamic_models()` sert `modelReasoning` construit depuis les descripteurs
  réels (`supported_efforts`, `default_effort` par modèle) au lieu du triplet
  fabriqué, et ajoute un nouveau champ `modelLabels: {modelId: name}`.

Le repli statique de `atelier-protocol` (`lib.rs:342-352`) passe de
`grok-4.5` à `grok-4.6` pour rester cohérent avec le CLI officiellement testé.

### 3. Transport des libellés jusqu'à l'UI

- `ProviderStatus` (`rust/crates/atelier-protocol/src/lib.rs:116`) gagne
  `model_labels: Value` (sérialisé `modelLabels`, `#[serde(default)]`).
- La fusion du catalogue vivant (`rust/crates/atelier-runtime/src/send.rs:1406`)
  recopie `modelLabels` comme elle recopie déjà `modelReasoning`, avec la même
  règle : un objet vide ne remplace pas le statique.
- `ProviderInfo` (`src/lib/providers.ts:40`) gagne
  `modelLabels?: Record<string, string>`.
- `modelDisplayLabel(provider, model)` (`src/lib/modelCatalog.ts`) consulte
  d'abord les libellés dynamiques passés par l'appelant, puis
  `BUILTIN_MODEL_LABELS`, puis retombe sur l'identifiant brut. Les entrées
  Grok codées en dur sont supprimées de `BUILTIN_MODEL_LABELS` — le CLI est
  désormais la source.

La signature de `modelDisplayLabel` prend un troisième paramètre optionnel
`dynamicLabels?: Record<string, string>`. Les appelants qui ne le passent pas
gardent le comportement actuel.

### 4. Efforts par modèle dans le compositeur

Aucune plomberie nouvelle : `modelReasoning.<modelId>.supported_efforts` est
déjà consommé par le compositeur pour les providers CLI (comportement
caractérisé pour Kimi dans
`src/components/chat/Composer.characterization.test.tsx:780`). Remplir
`modelReasoning` avec les vraies valeurs suffit à faire apparaître `xhigh`
sur 4.6 et à le masquer sur 4.5.

## Hors périmètre

- `--agent-profile` / `--plugin-dir` par fil : la config globale couvre déjà
  le besoin, l'ajouter serait de la configuration en double.
- Plan mode natif, worktree intégré, dashboard, navigateur de sessions : ce
  sont des surfaces de la TUI, les porter contredirait l'objectif « zéro
  portage ».
- Contexte maximum par modèle (`totalContextTokens`) : disponible dans la
  charge utile, mais aucun consommateur ne l'attend aujourd'hui.

## Tests

- **Fixture ACP Grok** : charge utile `session/new` réelle (4.6 avec `xhigh`,
  4.5 sans, plusieurs `ocx-*`), stockée à côté des fixtures existantes de
  `atelier-providers`.
- **Unitaires Rust** : le défaut suit `currentModelId` et non l'ordre
  alphabétique ; les efforts de 4.6 contiennent `xhigh` et ceux de 4.5 non ;
  `dynamic_models()` produit `modelLabels` et un `modelReasoning` par modèle ;
  une charge utile sans `_meta.reasoningEfforts` retombe sur le triplet par
  défaut sans paniquer.
- **Unitaires TS** : `modelDisplayLabel` préfère le libellé dynamique, puis
  le builtin, puis l'identifiant brut.
- **Régression** : `npx tsc --noEmit`, `npx vite build`, `cargo test -p
  atelier-providers -p atelier-runtime`, et les tests de contrat UI existants.

## Risque relevé

`grok agent --debug-file <path>` écrit le jeton OAuth xAI **en clair** dans le
log. Toute option de debug Grok exposée dans Atelier devrait écrire dans un
répertoire privé et être purgée à la fermeture. Rien à faire dans ce
périmètre — aucune option de debug n'est exposée aujourd'hui — mais la
contrainte est notée pour plus tard.
