# Brief — Provider Registry : Gemini + Grok natifs (modèle Synara)

**Répartition** : Codex = backend (sidecar). Claude = revue du backend + frontend UI.
**Modèle cible** : catalogue **fixe** de providers natifs (comme Synara) — PAS de
providers custom configurables par l'utilisateur, PAS d'adaptateur générique à
templates d'arguments, PAS d'API OpenAI-compatible pour l'instant.

## Providers cibles

| id | CLI | Intégration | Vérifié sur la machine |
|---|---|---|---|
| `claude` | claude | existant (`sidecar/providers/claude.mjs`) | ✅ |
| `codex` | codex | existant (`codex app-server`, JSON-RPC) | ✅ |
| `grok` | grok 0.2.87 (bundlé cmux, `/Applications/cmux.app/Contents/Resources/bin/grok`) | headless `--output-format streaming-json`, `--resume <id>`, `--continue`, `--allow/--deny`, `--effort low..max`, `--cwd` — interface clone de Claude Code → **calquer sur `claude.mjs`** | ✅ |
| `gemini` | gemini 0.35.3 (`/opt/homebrew/bin/gemini`) | headless `-p` + `--output-format stream-json`, `--resume`, `--list-sessions`, `--approval-mode yolo\|auto_edit\|plan` | ✅ |

Note bin_resolver : `grok` n'est pas dans le PATH homebrew — ajouter le chemin
cmux comme fallback dans `bin_resolver.mjs` (ou documenter l'install standalone).

## Phase 1 — Dé-hardcoder (Codex, sans changement de comportement)

Créer le catalogue et remplacer les unions `"claude" | "codex"` :

1. **`sidecar/providers/registry.mjs`** : catalogue statique
   `{ id, label, bin, defaultModel, models, efforts, capabilities: { resume, steering, goals } }`
   pour claude, codex, grok, gemini. Exporte `getProvider(id)`, `listProviders()`.
2. **`sidecar/index.mjs`** : remplacer `const providers = { claude, codex }` (l.43)
   par le registry ; généraliser le check de version (l.213, `cliVersion(...)`) en
   boucle sur le catalogue → endpoint `/providers` renvoie
   `[{ id, label, version, ok }]` pour les 4.
3. **`sidecar/store.mjs`** : `provider` devient string libre (validée contre le registry).
4. **`src/lib/settings.ts`** : remplacer les unions strictes (l.2-4, 14, 32) par
   `ProviderId = string` + `defaultModel/defaultEffort` en `Record<string, string>`.
   **Migration** : les settings existants (`{ claude: ..., codex: ... }`) restent
   valides tels quels — ne pas casser les threads existants.

**Critère de done Phase 1** : l'app build et se comporte exactement comme avant
avec claude/codex ; grok/gemini apparaissent dans `/providers` avec leur version.

## Phase 2 — Providers grok + gemini (Codex)

5. **`sidecar/providers/grok.mjs`** — calqué sur `claude.mjs` :
   spawn `grok --output-format streaming-json --always-approve` (ou `--allow`
   selon la politique sandbox actuelle de claude.mjs), prompt via stdin ou argv
   selon ce que fait claude.mjs, `--resume <sessionId>` pour la reprise,
   normalisation vers les events Atelier (`started`, `delta/text`, `thinking`,
   `tool_update`, `done`, `error`). Mapper `--effort` (low..max).
6. **`sidecar/providers/gemini.mjs`** — headless `-p` + `--output-format stream-json`,
   `--approval-mode` aligné sur la politique de sandbox, `--resume` pour la reprise.
   (Option ACP `--acp` notée pour plus tard, pas dans ce sprint.)
7. **Tests** : `grok.test.mjs` / `gemini.test.mjs` sur la normalisation des events
   (fixtures de sorties stream-json réelles), même style que `codex.test.mjs`.

**Points de vigilance** (à vérifier en premier, avant d'écrire les parsers) :
- Auth non-interactive : lancer chaque CLI en headless dans un dossier test et
  confirmer que le login subscription tient sans TTY. Si l'un des deux exige un
  TTY, le signaler au lieu de contourner.
- Format exact des events stream-json de chaque CLI (ne pas supposer qu'ils
  sont identiques à Claude Code ; capturer une vraie session et écrire les
  fixtures à partir de ça).
- Reprise : vérifier que `--resume` accepte bien l'id retourné par la session
  initiale, et où chaque CLI stocke ses sessions (pour `listSessions`).

## Phase 3 — UI Settings > Providers (Claude)

Style Synara, sobre, dans `src/components/Settings.tsx` :

- Liste des providers du catalogue : label + version détectée + statut
  (installé / introuvable), toggle **visible/masqué**, drag pour l'ordre du picker.
- Règle Synara à copier : le provider utilisé par le thread courant reste
  toujours visible même si masqué.
- Persistance : `settings.providerOrder: string[]`, `settings.hiddenProviders: string[]`.
- Pas de formulaire d'ajout, pas de champs API key.

## Phase 4 — UI Chat / QuickAsk / auto-review (Claude)

- `src/components/Chat.tsx` : sélecteur provider→modèles rendu depuis le
  catalogue (groupes dynamiques), plus d'union en dur.
- `src/components/QuickAsk.tsx`, auto-review dans Settings : listes de
  providers dynamiques.
- `src/components/icons.tsx` : icônes Grok/Gemini + fallback générique (dot
  couleur par provider).

## Revue (Claude, après chaque phase Codex)

- Phase 1 : vérifier zéro régression claude/codex (smoke test threads existants,
  resume, goals codex).
- Phase 2 : relire les parsers contre les fixtures, tester un vrai tour grok et
  gemini de bout en bout (prompt → stream → done, puis resume).

## Hors scope (explicite)

Providers custom utilisateur, adaptateur `openai-compatible-api`
(MiniMax/GLM/OpenRouter), clés API dans l'UI, mode ACP Gemini, Keychain.
