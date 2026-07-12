# Baseline desktop & inventaire mobile — plan 034 jalon A

- **Date** : 2026-07-12
- **Commit** : `0fbfc7a` (`fix(033): report live Rust providers and prefer bundled server`)
- **Branche** : `main` (ahead of origin au moment de l’audit)
- **Machine audit** : macOS dev de Thierry (pas d’iPhone physique mesuré ici)

> Les budgets iPhone du plan 034 §3.1 restent les **cibles produit**. Cette
> baseline documente l’état **desktop/code** avant tout code gateway/mobile.
> Les mesures FPS/rerender sur appareil sont **non disponibles** tant que le
> shell iOS n’existe pas (jalon D/E).

## 1. Drift check

| Zone plan 034 | Attendu | Observé |
|---------------|---------|---------|
| Client iOS | À créer | **Absent** (`mobile/` inexistant) |
| `mobile_entry_point` | À auditer | Présent mais **stub** ; pas de projet Xcode |
| Gateway distante | À créer | **Absente** — sidecar `127.0.0.1` only |
| Protocole partagé | atelier-protocol | Crate Rust **partielle** ; events riches en TS |
| Journal 025 | Requis | **Livré** : `harnessEvents` + contract doc |
| Backend 033 | Rust défaut | **Livré** (Portes 1–11 tooling) ; soak humain **ouvert** |
| Virtualisation chat | Budget E | **Absente** — liste complète + stick/jump |
| Resume `lastSequence` | Budget F | **Absent** — full `getHistory` + merge eventId |
| `protocolVersion` wire | Budget B | Constante Rust, **pas sur le fil** |

**Conclusion drift** : aucun chevauchement de worktree mobile ; démarrer A en
docs-only est cohérent. Ne pas commencer B/C sans GO.

## 2. Cartographie des chemins réels

### 2.1 Bootstrap UI

```text
src/main.tsx
  → refreshSidecarInfo() / invoke sidecar
  → GET http://127.0.0.1:${port}/uistate (hydrate localStorage)
  → installUiStateWriteThrough
  → render <App />
```

Dépendances **non portables mobile** : Tauri invoke, loopback HTTP, ui.json partagé
avec le profil Application Support Mac.

### 2.2 Connexion

```text
useSidecarConnection
  → connectSidecar (src/lib/ws.ts)
      → refreshSidecarInfo (port/token)
      → WebSocket ws://127.0.0.1:${port}?token=
      → clientHello + listThreads + providerStatus
      → onclose : backoff 1s→30s, reconnect
```

Statuts : `connected` | `reconnected` | `disconnected` | `failed`.

### 2.3 Journal / streaming

```text
WS message → App.handleMessage
  → reduceHarnessEvent(list, ev)     // live
  → mergeHarnessHistory / materialize // history
```

Invariants (tests `harnessEvents.test.ts`, 26 cas) :

- dédup `eventId`
- une bulle streaming par `turnId`
- tool identity `(turnId, itemId)`
- live ≡ materialize(replay)
- history tardif fusionne sans écraser le live plus récent

### 2.4 Chat UI

| Fichier | Rôle | Mobile |
|---------|------|--------|
| `ChatTimeline.tsx` | transcript, stick ≤80px, jump >200px | **Adapter** (virtualiser) |
| `turns.tsx` / `turnParts.tsx` | anatomie tours | Adapter / extraire |
| `ChatComposer.tsx` + `ComposerControls` | envoi | Adapter clavier |
| `PromptInput.tsx` | textarea | Adapter |
| `HarnessInteraction.tsx` | approvals / elicitation | Réutiliser contrat |
| `md.tsx` | Markdown + math idle | Adapter perf |
| `App.tsx` | orchestration globale | **Ne pas importer** tel quel |

### 2.5 Backend Mac

| Composant | Bind | Auth | Notes |
|-----------|------|------|-------|
| `atelier-studio-server` (Rust) | `127.0.0.1` | `x-atelier-token` / `?token=` | Défaut production |
| Node sidecar soak | idem | idem | `ATELIER_BACKEND=node` |
| Gallery server | `127.0.0.1` | origin loopback + bearer opt. | par projet |

HTTP sidecar : `/health`, `/providers`, `/setup`, `/uistate`, `/` (WS).

WS : inventaire exhaustif dans `plans/033-parity-matrix.md` et
`atelier-runtime::ws_router` — surface **beaucoup trop large** pour exposition
réseau (term, git, zotero, settings, …).

### 2.6 Sécurité desktop documentée

`docs/SECURITY.md` : iframe gallery non fiable, ports 18790–19789, nonce IPC,
CSP loopback. **Aucun** modèle d’appareil distant.

## 3. Métriques bundle (desktop web build existant)

Mesure locale le 2026-07-12 (artefacts `dist/` déjà présents / budget script) :

| Métrique | Valeur |
|----------|--------|
| `dist/` total | ~11 Mo |
| Chunk entrée `index-*.js` | **866 KB** min (budget ≤ 950 KB — `check_entry_budget.mjs` ✓) |
| CSS entrée | ~151 KB |
| KaTeX (lazy) | ~255 KB JS + 29 KB CSS |
| TerminalSurface (lazy) | ~438 KB |
| Mermaid core (lazy) | ~607 KB |
| Historique perf 022 | entrée réduite de 1639 → ~864 KB (docs/performance) |

**Implication mobile** : le chunk desktop inclut encore trop de surfaces
(atelier, mermaid, etc.). Le client iOS doit un **entry budget plus bas** et
n’embarquer ni terminal ni mermaid au boot chat.

## 4. Tests exécutés (preuves jalon A)

| Commande | Résultat |
|----------|----------|
| `npx vitest run src/lib/harnessEvents.test.ts src/lib/ws.test.ts` | **31 passed** (26 + 5), ~0,5 s |
| `node scripts/check_entry_budget.mjs` | **✓** entrée 866 KB ≤ 950 KB |
| `cargo test --workspace --locked` (rust/) | **81 unit tests passed** (agrégat crates) |
| Mesures iPhone FPS / long tasks | **N/A** — pas d’app iOS |
| Rerenders React par token (Profiler) | **N/A** instrumenté — à faire jalon E |

Inventaire tests frontend : ~319 lignes listées par `vitest list` (fichiers de
test multiples sous `src/`). Fichiers `*.test.*` sous `src/` : 33.

Scripts package pertinents (pas encore de `mobile:*`) :

```text
typecheck, build:web, test:frontend, test:sidecar, test:gallery,
test:rust, check:backend-policy, verify, soak:sidecar
```

## 5. Comportement transcript de référence (logique, non perf)

Sur desktop, pour un thread de N événements journalisés :

1. `getHistory` renvoie le journal (durables + forme materialize).
2. Client rejoue via `materializeHarnessHistory` / merge.
3. Streaming live applique le même reducer.
4. Scroll : si `fromBottom ≤ 80` → stick ; si `> 200` → bouton jump.
5. Modes formels `pinned | reading | catch-up` du plan 034 **ne sont pas**
   nommés dans le code — comportement proche stick/jump binaire.

Conversation stress 500 messages / 50 codes / 20 équations : **pas de fixture
automatisée dédiée** aujourd’hui. À créer au jalon B (transcripts synthétiques).

## 6. Plans dépendants — état effectif

| Plan | Intention | État code `0fbfc7a` |
|------|-----------|---------------------|
| 025 harness | meta, reducer, interactions | **Livré** (contract + harnessEvents + tests) |
| 020 chat turns | présentation tours/composer | Composants chat présents ; revue visuelle partielle historique |
| 022 perf load | lazy chunks | Livré ; budget entrée actif |
| 033 Rust backend | parité Node | Portes mergeées ; **soak humain ouvert** ; Node non retiré |
| 034 mobile | ce programme | **A–I livrés** (MVP doc+code companion) ; soak device & FPS iPhone encore humains ; cocoapods pour IPA |

## 7. Gaps bloquants avant client réel

1. **Gateway** + auth appareil + scopes (jalon C) — sans ça, STOP.
2. **protocolVersion** + fixtures adversariales (jalon B).
3. **Resume lastSequence** (B/C/F) — le merge full history ne suffit pas sur
   radio mobile / background iOS.
4. **Workspace `mobile/`** Tauri iOS (D) sans casser desktop.
5. **Virtualisation + buffer frame** (E) pour budgets 60 FPS.
6. **Mesures appareil physique** — obligatoire gates D–E ; simulateur insuffisant.

## 8. Emplacement de code recommandé (post-GO)

```text
docs/mobile/                 # ADR, threat, baseline (ce jalon)
mobile/                      # client Tauri iOS (jalon D+)
rust/crates/atelier-remote/  # gateway (jalon C) — nom exact à figer au C
packages/atelier-protocol/   # optionnel jalon B si partage TS justifié
rust/crates/atelier-protocol # enrichir enveloppes (jalon B)
```

Ne pas créer ces arbres code avant verdict Codex sur A.

## 9. Matrice réutiliser / adapter / interdire

Voir fichier dédié : [`MODULE_MATRIX.md`](./MODULE_MATRIX.md).
