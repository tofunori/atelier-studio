# Plan 025: Porter le harnais agentique d’Atelier au niveau des clients Claude et Codex

> **Executor instructions**: tu es Claude Fable 5. Charge et applique
> `/efficient-fable`, puis lis intégralement `AGENTS.md`, `CLAUDE.md`,
> `plans/FABLE5_EXECUTION.md` et ce plan avant toute action. Travaille en TDD :
> ajoute d’abord les tests de caractérisation et de contrat, constate leur échec,
> puis implémente par tranches. Exécute chaque vérification avant de passer à la
> suivante. Si une condition STOP survient, arrête-toi et rapporte-la; n’invente
> pas un protocole de remplacement.
>
> Ce plan stabilise le protocole, la sécurité, l’attribution des tours et le
> transcript. Il ne fait PAS la refonte visuelle du chat. Le plan 020 consommera
> ensuite ce contrat pour construire ActivityGroup et ResultCapsule.
>
> **Drift check (run first)**:
> `git diff --stat 47cedb8..HEAD -- sidecar/index.mjs sidecar/router.mjs sidecar/history.mjs sidecar/sessions.mjs sidecar/providers src/App.tsx src/lib/ws.ts src/lib/providers.ts src/components/Chat.tsx src/components/chat src/lib/i18n.ts src/App.css`
> puis `git status --short --` sur les mêmes chemins. Le plan a été écrit alors
> que 015 venait d’extraire ChatTimeline et le composer, avant la fin de 016 et
> 018. Le drift produit par 016/018 est attendu seulement si ces plans sont DONE
> et validés : comparer leurs diffs, puis noter leur commit final comme nouvelle
> base de 025. Tout autre changement non expliqué dans `router.mjs`, `codex.mjs`,
> `claude.mjs`, `App.tsx`, `ws.ts` ou `src/components/chat/` est un STOP jusqu’à
> comparaison avec les extraits de « Current state ».

## Status

- **Priority**: P0, bloque le plan 020
- **Effort**: XL, 4 tranches révisables
- **Risk**: HIGH
- **Depends on**: plans 008, 009, 010, 015, 016 et 018 validés/repris dans le worktree courant
- **Blocks**: plan 020, puis 021, 023, 022 et 013 par transitivité
- **Category**: correctness / security / agent protocol / transcript fidelity
- **Planned at**: commit `47cedb8`, 2026-07-09

## Why this matters

Atelier utilise déjà les vrais moteurs agentiques : Claude Agent SDK avec le
preset Claude Code et Codex via `codex app-server`. Mais le harnais Atelier
aplatit encore les événements dans une liste sans identité de tour, ne respecte
pas réellement les modes de permission Codex, répond automatiquement à certaines
demandes interactives et reconstruit un historique beaucoup moins riche que le
flux live. Le chat peut donc paraître complet pendant un run tout en perdant les
preuves techniques après redémarrage, ou afficher « Plan/Ask » alors que Codex
tourne en `danger-full-access`.

Le résultat de ce plan doit être une parité **comportementale fondée sur les
protocoles publics installés**, pas une copie de détails privés des apps Claude
ou Codex. Chaque message, outil, interaction, erreur, usage et changement de
fichier doit être attribuable au bon tour, rendu depuis le même événement en
live et après reload, et gouverné par une politique de permission réellement
appliquée.

## Product contract

Les mots suivants sont contraignants dans le code, les tests et l’UI :

- **Thread** : conversation durable Atelier, possiblement reprise chez un
  provider.
- **Turn** : unité d’exécution agentique qui commence avec un prompt normal ou
  un prompt dépilé de la queue et finit par exactement un terminal `done` ou
  `error`.
- **Steer** : message utilisateur injecté dans le turn actif. Il a son propre
  `messageId`, mais conserve le `turnId` actif et ne crée ni nouveau snapshot Git,
  ni nouveau ledger turn.
- **Queue** : message utilisateur accepté pendant un run, visible immédiatement
  comme queued, mais possédant un nouveau `turnId` qui ne devient actif qu’après
  le terminal du turn précédent.
- **Item** : action interne d’un turn : raisonnement, commande, patch, outil MCP,
  sous-agent, génération d’image, plan, interaction, etc.
- **Durable event** : état nécessaire pour reconstruire le transcript final.
- **Ephemeral event** : delta, heartbeat ou progrès intermédiaire utile en live,
  mais compactable lors du reload.
- **Semantic replay parity** : après redémarrage, le transcript final contient
  les mêmes demandes, réponses, outils finaux, sorties, erreurs, diffs, usage et
  interactions. Il ne rejoue pas les animations ni chaque delta de streaming.

## Target event contract

Conserver l’union `AgentEvent` pour limiter le blast radius, mais ajouter une
métadonnée commune obligatoire pour tout événement sidecar durable :

```ts
type HarnessEventMeta = {
  schemaVersion: 1;
  eventId: string;          // UUID Atelier, idempotence WS/journal
  provider: string;
  threadId: string;
  turnId: string;           // id universel Atelier
  messageId?: string;       // chaque message user, y compris steer/queue
  itemId?: string;          // commande/tool/patch/interaction
  nativeThreadId?: string;  // session/thread du provider si disponible
  nativeTurnId?: string;    // turn Codex natif si disponible
  sequence: number;         // monotone dans le thread
  ts: number;
  durable: boolean;
  origin: "provider" | "atelier" | "legacy-import";
};
```

Règles :

1. Le `turnId` universel est créé par le sidecar avant l’appel provider. Il ne
   dépend pas de la disponibilité d’un id natif.
2. Le `nativeTurnId` Codex est ajouté dès `turn/started` ou la réponse
   `turn/start`; il ne remplace jamais le `turnId` universel.
3. `messageId` est généré par le frontend et passé au sidecar via
   `clientMessageId`; Codex reçoit aussi ce même id dans son champ public
   `clientUserMessageId`.
4. `sequence` est attribué par un seul sérialiseur sidecar par thread. Ne jamais
   le calculer dans React ni avec l’index du tableau.
5. `eventId + sequence` rendent la reconnexion et le replay idempotents.
6. Les anciens événements sans metadata restent lisibles comme
   `origin: legacy-import`; le nouveau code ne doit jamais faire planter un
   historique ancien.
7. `delta`, `thinking_delta`, `started` et `heartbeat` peuvent avoir
   `durable:false`. Les états finaux `user`, `text`, `thinking`, `tool_update`,
   `edit`, `todos`, `goal`, `interaction`, `usage`, `done`, `error` sont durables.

Ajouter un événement interactif générique, distinct du simple booléen Claude :

```ts
type HarnessInteractionEvent = {
  kind: "interaction";
  requestId: string;
  interactionType: "approval" | "user_input" | "mcp_elicitation";
  title: string;
  detail?: string;
  fields?: Array<{
    id: string;
    question: string;
    header?: string;
    options?: Array<{ label: string; description?: string }>;
    allowOther?: boolean;
    secret?: boolean;
  }>;
  state: "pending" | "answered" | "declined" | "expired";
  answerSummary?: string;
};
```

Les valeurs secrètes ne doivent jamais revenir dans `answerSummary`, le journal,
les logs ou les notifications.

## Current state

### Architecture et flux

- `sidecar/index.mjs:32-49` possède `APP_DIR`, `ThreadStore` et les providers;
  `index.mjs:543-598` construit le contexte passé à `route`. C’est l’endroit où
  injecter un journal, pas dans React.
- `sidecar/router.mjs:940-1093` orchestre les runs, snapshots, ledger, queue,
  review et événements. Il doit rester la frontière qui attribue les ids
  universels et journalise les événements enrichis.
- `src/App.tsx:780-920` réduit actuellement une liste plate. Il retrouve le
  dernier streaming dans tout le thread et remplace un `tool_update` par le seul
  `id` d’outil; deux turns réutilisant le même id peuvent donc se collisionner.
- `src/lib/ws.ts:3-62` définit les événements sans `turnId`, `sequence`,
  `eventId` ni provider.

### Steering et queue

État actuel dans `sidecar/providers/claude.mjs:153-164` :

```js
let s = sessions.get(threadId);
if (s) {
  s.onEvent = onEvent;
  // ...
  s.push(userMsg(prompt, mode === "queue" ? "next" : "now"));
  return;
}
```

Le callback du turn en cours est remplacé au milieu du run. Dans
`sidecar/router.mjs:978-1023`, chaque `send` Claude crée pourtant un nouvel objet
`turn`, snapshot et tableau `tools`. Un steer peut donc déplacer les événements
du premier prompt dans le record du second. Le plan général avait déjà différé
ce défaut dans `plans/README.md` sous « Attribution des tours en steering ».

Pour Codex, `router.mjs:1035-1046` essaie `turn/steer`, puis met le message en
queue. Ces deux chemins doivent recevoir une identité explicite au lieu d’une
sentinelle `__steered` ou `__queued` seule.

### Permissions et demandes interactives Codex

État actuel dans `sidecar/providers/codex.mjs:232-247` :

```js
return {
  cwd: cwd ?? null,
  model: actualModel,
  approvalPolicy: "never",
  sandbox: sandbox ?? "danger-full-access",
  // ...
};
```

`router.mjs:1062` transmet `permissionMode`, mais `codex.run()` ne le reçoit pas
dans sa signature (`codex.mjs:384-399`). Le sélecteur visible peut donc mentir.

`codex.mjs:53-62` répond actuellement sans utilisateur :

```js
if (method === "item/tool/requestUserInput") return { answers: {} };
if (method === "mcpServer/elicitation/request")
  return { action: "decline", content: null, _meta: null };
```

Le protocole installé peut être généré localement avec :

```bash
codex app-server generate-json-schema --experimental --out <tmpdir>
```

À `codex-cli 0.142.5`, il expose notamment :

- `approvalPolicy`: `untrusted | on-failure | on-request | never` ou granular;
- `sandbox`: `read-only | workspace-write | danger-full-access`;
- `TurnStartParams.clientUserMessageId`;
- `collaborationMode.mode`: `plan | default`;
- `item/tool/requestUserInput` avec `threadId`, `turnId`, `itemId`, questions,
  options et `isSecret`;
- `mcpServer/elicitation/request` en mode form, openai/form ou url.

Ne vendorer aucun schéma généré volumineux. Générer dans un tmpdir pour vérifier
la version installée, puis écrire des fixtures minimales revues à la main dans
les tests.

### Résultats d’outils Claude

`sidecar/providers/claude.mjs:245-305` ne garde que `pendingEdits`. Les autres
`tool_use` deviennent une ligne `{kind:"tool"}` et leur `tool_result` est ignoré.
Le provider possède pourtant l’id, le nom, l’input, le contenu du résultat et
`is_error`; il doit produire le même contrat `tool_update` que Codex.

### Historique

- `sidecar/history.mjs:42-74` reconstruit Claude avec user/text et noms d’outils,
  sans thinking, sortie, statut, usage ni done.
- `sidecar/sessions.mjs:129-161` reconstruit Codex avec seulement
  `user_message` et `agent_message`.
- `sidecar/sessions.mjs:185-220` documente explicitement que Grok ignore
  reasoning et tool_result.
- `sidecar/router.mjs:752-778` choisit un loader provider mais ne possède aucun
  transcript Atelier commun.
- `src/App.tsx:911-920` n’installe l’historique que si le thread est vide, ce qui
  protège le live mais n’assure aucune fusion après reconnexion.

### Capabilities et catalogues

- `sidecar/providers/registry.mjs:23-99` possède `capabilities`, mais
  `sidecar/index.mjs:419-433` ne les renvoie pas dans `providerStatus`.
- `src/lib/providers.ts:3-21` ne les type pas.
- `src/components/Chat.tsx:17-45` conserve des modèles/efforts hardcodés et
  `baseModelsFor():419-429` préfère ces listes au catalogue sidecar.

Le sidecar doit devenir l’autorité des modèles, efforts et capacités. Les labels
humains locaux restent permis, mais jamais une seconde liste d’ids.

### Conventions et tests à imiter

- Tests sidecar Vitest en `.mjs`, fichiers temporaires via `mkdtempSync`; voir
  `sidecar/history.test.mjs` et `sidecar/claude_lifecycle.test.mjs`.
- Tests router avec provider mock et `ThreadStore` réel; voir
  `sidecar/router.test.mjs` et `sidecar/claude_lifecycle.test.mjs`.
- Tests frontend avec Testing Library et faux WebSocket; voir
  `src/App.orchestration.test.tsx`.
- Tests de rendu comportemental sans snapshots géants; voir
  `src/components/chat/ChatTimeline.characterization.test.tsx`.
- Le smoke Codex live existe dans `sidecar/scripts/codex_live_parity.mjs`; il est
  opt-in et ne doit jamais remplacer les tests déterministes.
- Les écritures durables existantes utilisent `writeFileAtomic` quand elles
  remplacent un fichier. Un journal append-only doit garantir ordre et lignes
  JSON complètes, ignorer proprement une dernière ligne tronquée et créer ses
  fichiers en mode `0600`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Drift | commande du bloc initial | aucun drift inexpliqué |
| Protocol schema | `d=$(mktemp -d /tmp/atelier-codex-schema.XXXXXX) && codex app-server generate-json-schema --experimental --out "$d" && rg -n 'requestUserInput|elicitation|approvalPolicy|SandboxMode|CollaborationMode' "$d"` | exit 0, formes attendues présentes |
| Target sidecar tests | `cd sidecar && npx vitest run harness_events.test.mjs harness_journal.test.mjs providers/codex.test.mjs claude_lifecycle.test.mjs router.test.mjs history.test.mjs sessions.test.mjs` | tous passent |
| Target frontend tests | `npx vitest run src/lib/harnessEvents.test.ts src/App.orchestration.test.tsx src/components/chat/ChatTimeline.characterization.test.tsx src/components/chat/HarnessInteraction.test.tsx` | tous passent |
| Typecheck | `npx tsc --noEmit` | exit 0, aucune erreur |
| Web build | `npx vite build` | exit 0 |
| Sidecar full | `cd sidecar && npx vitest run` | 19 fichiers/215 tests minimum plus les nouveaux, tous verts |
| Full repo | `npm run verify` | toutes les couches passent |
| Optional Codex live | `npm --prefix sidecar run test:codex-live` | JSON final `ok: true`; seulement après autorisation de coût/runtime |

## Scope

**In scope** :

- `docs/AGENT_HARNESS_CONTRACT.md` (créer, matrice provider/event)
- `sidecar/harness_events.mjs` et `sidecar/harness_events.test.mjs` (créer)
- `sidecar/harness_journal.mjs` et `sidecar/harness_journal.test.mjs` (créer)
- `sidecar/index.mjs`
- `sidecar/router.mjs`, `sidecar/router.test.mjs`
- `sidecar/history.mjs`, `sidecar/history.test.mjs`
- `sidecar/sessions.mjs`, `sidecar/sessions.test.mjs`
- `sidecar/claude_lifecycle.test.mjs`
- `sidecar/providers/claude.mjs`
- `sidecar/providers/codex.mjs`, `sidecar/providers/codex.test.mjs`
- `sidecar/providers/registry.mjs`, `sidecar/providers/registry.test.mjs`
- `sidecar/scripts/codex_live_parity.mjs`
- `src/lib/ws.ts`
- `src/lib/harnessEvents.ts` et `src/lib/harnessEvents.test.ts` (créer)
- `src/lib/providers.ts`
- `src/App.tsx`, `src/App.orchestration.test.tsx`
- `src/components/Chat.tsx`
- `src/components/chat/ComposerControls.tsx`
- `src/components/chat/Composer.characterization.test.tsx`
- `src/components/chat/ChatTimeline.tsx`
- `src/components/chat/HarnessInteraction.tsx` et test associé (créer)
- `src/components/chat/ChatTimeline.characterization.test.tsx`
- `src/test/fixtures/sidecar.ts` et `src/test/fixtures/index.ts`, uniquement pour
  les fixtures metadata/interaction nécessaires aux tests
- `src/lib/i18n.ts`
- `src/App.css`, uniquement styles minimaux de l’interaction générique en
  réutilisant les tokens existants
- `plans/README.md`, statut seulement à la fin

**Out of scope** :

- refonte anatomique/visuelle des tours, ActivityGroup final, ResultCapsule et
  simplification du composer : plan 020;
- nouveaux providers, remplacement de Grok ACP/OpenCode/API;
- page de gestion des serveurs MCP;
- installation ou modification de la configuration MCP utilisateur;
- changement du système de design, nouvelle dépendance UI ou base de données;
- analyse du contenu scientifique des réponses;
- galerie, Rust/Tauri, terminal, browser, Zotero et GitSurface;
- vendorer le JSON Schema Codex complet;
- exposer ou persister secrets, tokens, variables d’environnement ou réponses
  marquées `isSecret`;
- commit, push ou PR sans instruction explicite de Thierry.

## Git workflow

- Branche recommandée si Thierry autorise une branche :
  `fable/025-agent-harness-parity`.
- Commits logiques recommandés, seulement si autorisés :
  1. `test(harness): caractériser tours et interactions`
  2. `feat(harness): normaliser et journaliser les événements`
  3. `fix(harness): appliquer permissions et interactions Codex`
  4. `feat(harness): préserver résultats Claude et replay fidèle`
- Ne jamais pousser sans ordre explicite.
- À chaque tranche, `git diff --stat` doit rester dans le Scope.

## Steps

### Checkpoints obligatoires du plan XL

Ce plan reste un seul lot dans la feuille de route, mais Fable le remet en quatre
tranches séquentielles. Après chaque tranche : tests ciblés, `npx tsc --noEmit`,
`git diff --stat`, liste des invariants validés et revue Codex avant de continuer.
Ne pas lancer les tranches en parallèle : elles touchent les mêmes frontières.

| Tranche | Steps | Résultat révisable |
|---|---|---|
| A | 1–3 | contrat, ids, terminalité, steer/queue |
| B | 4–5 | permissions et interactions Codex/Claude sûres |
| C | 6–8 | résultats Claude, journal, reducer live/replay |
| D | 9–11 | capabilities, smokes, build et validation réelle |

Le statut 025 reste `IN PROGRESS` entre les tranches et ne passe à `DONE`
qu’après la tranche D et la revue indépendante finale.

### Step 1: Documenter et tester le contrat avant l’implémentation

Créer `docs/AGENT_HARNESS_CONTRACT.md` avec une matrice par provider et par type
d’événement. Colonnes obligatoires : source native, méthode/notification,
durable, terminal, ids natifs disponibles, payload UI, comportement reload,
permission/interactivité, fallback legacy.

La matrice couvre au minimum :

- user prompt, steer, queue;
- text/delta;
- thinking/delta;
- command start/progress/completed/failure/exit code;
- file change/diff;
- Claude tool use/result;
- MCP start/progress/result/error;
- dynamic tool et collab/subagent;
- plan/todos;
- image input/generation/view;
- approval, user input, MCP elicitation;
- usage, goal, compact, interrupt, done, error, heartbeat.

Ajouter les tests rouges suivants avant le code :

1. `harness_events.test.mjs` : metadata obligatoire, `sequence` monotone,
   un seul terminal, aucune collision entre deux turns réutilisant `itemId`.
2. `router.test.mjs` : steer réutilise le turn actif sans snapshot/ledger neuf;
   queue réserve un turn distinct et ne démarre qu’après terminal.
3. `codex.test.mjs` : les quatre modes UI donnent quatre politiques explicites;
   aucun mode non Full access ne produit `danger-full-access`.
4. `claude_lifecycle.test.mjs` : un second send steer ne remplace pas le
   dispatcher du premier turn; queue ne détourne pas ses événements.
5. `App.orchestration.test.tsx` : deux `tool_update` avec le même `itemId` dans
   deux `turnId` restent deux actions distinctes.

**Verify** : lancer les tests ciblés. Ils doivent échouer pour les assertions
nouvelles et uniquement pour elles. Joindre cette sortie au rapport de tranche.

### Step 2: Créer le sérialiseur universel de turns

Créer `sidecar/harness_events.mjs` avec une petite API pure :

```js
createHarnessThread({ threadId, provider, emit, journal, now, randomUUID })
  .startTurn({ turnId?, messageId, userEvent, nativeThreadId? })
  .steer({ messageId, userEvent })
  .queue({ turnId?, messageId, userEvent })
  .activateQueued(turnId)
  .emit(turnId, event, nativeMeta?)
  .terminal(turnId, event)
```

Le nom exact peut varier, mais les invariants non :

- une seule instance par `threadId` dans le routeur;
- attribution de `eventId`, `sequence`, `ts`, provider/thread/turn;
- `itemId` tiré de `event.id` ou du payload natif;
- rejet/dégradation contrôlée d’un second terminal;
- sérialisation des enrichissements async : un `edit` enrichi ne peut pas être
  dépassé par le `done` qui suit;
- le journal reçoit l’événement enrichi dans le même ordre que le broadcast;
- broadcast et journal utilisent le même objet, sans remapping divergent.

Dans `src/lib/ws.ts`, exprimer la metadata par intersection/type partagé afin de
ne pas dupliquer `meta?` dans chaque branche. Les imports legacy sans metadata
restent acceptés à l’entrée du reducer, mais toute sortie sidecar nouvelle doit
être normalisée.

**Verify** : `cd sidecar && npx vitest run harness_events.test.mjs router.test.mjs`
→ tous les tests Step 1 liés à metadata/ordre/terminal passent.

### Step 3: Rendre le sidecar autoritaire pour les messages user, steer et queue

Dans `src/App.tsx:1579-1678` :

1. générer `clientMessageId = crypto.randomUUID()`;
2. transmettre un `displayEvent` séparé du `prompt` enrichi. Le displayEvent
   contient le texte réellement tapé et des attachments structurés, jamais le
   handoff système ni le contexte injecté;
3. ne jamais envoyer de data URL/base64 au journal : transmettre les chemins,
   noms, provenance et nombres de lignes;
4. conserver l’affichage optimiste avec `eventId/messageId` provisoires, puis
   dédupliquer l’ack sidecar par `messageId` et remplacer la metadata provisoire
   par le `turnId/sequence/eventId` autoritaire. Ne pas attendre le provider pour
   afficher la demande;
5. faire passer `clientMessageId` à Codex comme `clientUserMessageId`.

Dans `sidecar/router.mjs` :

- maintenir `activeTurnByThread` et une queue structurée;
- prompt normal idle : créer/activer un nouveau turn, snapshot une seule fois;
- steer pendant running : associer le message au turn actif, appeler le steer
  natif/provider, ne pas recréer snapshot, `turn`, ledger ni review;
- queue pendant running : journaliser/acknowledger le user event `queued`, mais
  différer snapshot et appel provider; activer exactement ce turn au terminal;
- utiliser cette queue explicite également pour Claude au lieu d’envoyer
  `priority:"next"` sans frontière observable;
- si le provider refuse le steer, transformer en queue avec le même messageId et
  un nouveau turnId, sans dupliquer la bulle user;
- interruption : terminal `done ok:false` ou `error` sur le turn actif, puis
  politique explicite pour la queue : conserver en attente et démarrer la
  suivante uniquement si le comportement actuel le fait; documenter/tester.

Dans `claude.mjs`, le callback d’une session devient un dispatcher stable. Un
second `send()` ne fait plus `s.onEvent = onEvent`. Le router décide quel turn
est actif; le provider ne réattribue pas les événements.

**Verify** : tests router + lifecycle. Attendus : un snapshot et un ledger pour
le turn exécuté, zéro pour steer, ordre terminal puis activation de queue,
aucun spinner fantôme.

### Step 4: Appliquer réellement les modes de permission Codex

Créer un helper pur exporté `resolveCodexSafety(permissionMode, capabilities)`
dans `codex.mjs`. Mapping minimal attendu avec le schéma 0.142.5 :

| Mode Atelier | Codex sandbox | approvalPolicy | collaborationMode |
|---|---|---|---|
| Full access (`bypassPermissions`) | `danger-full-access` | `never` | `default` ou omis |
| Accept edits (`acceptEdits`) | `workspace-write` | `on-request` | `default` ou omis |
| Ask (`default`) | `workspace-write` | `untrusted` | `default` ou omis |
| Plan (`plan`) | `read-only` | `never` | objet `plan` obtenu/validé depuis le protocole installé |

Contraintes :

- `permissionMode` entre explicitement dans `codex.run`, `buildThreadOptions`
  et `turn/start`;
- ne jamais laisser un mode inconnu retomber sur Full access. Fallback sûr :
  `read-only + on-request`, avec diagnostic visible;
- `additionalDirectories` ne devient writable qu’en mode autorisant l’écriture;
- reviewer/auto-review reste explicitement read-only;
- si `collaborationMode/list` est nécessaire pour obtenir les settings du mode
  plan, interroger/cache le résultat; ne pas inventer un objet incomplet;
- ne pas confondre approbation, sandbox et permission profile;
- le provider registry expose les permission modes réellement supportés.

**Verify** : tests unitaires des quatre mappings, mode inconnu, reviewer,
additionalDirectories. `rg -n 'sandbox \?\? "danger-full-access"' sidecar/providers/codex.mjs`
ne doit plus être le fallback d’un mode UI non résolu.

### Step 5: Relayer approvals, request_user_input et MCP elicitation

Généraliser `permWaiters` du routeur en `interactionWaiters`, sans casser le
chemin Claude existant :

- chaque waiter possède requestId, threadId, turnId, itemId, type, timeout,
  resolve/reject et AbortSignal;
- timeout : 120 s par défaut; respecter `autoResolutionMs` quand fourni et
  borné, puis répondre de façon sûre (`decline`/réponse vide documentée);
- déconnexion du client ne doit pas tuer le sidecar; l’interaction reste
  répondable par un client reconnecté jusqu’au timeout;
- interruption/fin de turn résout les waiters pendants par refus et les journalise
  `expired` ou `declined`;
- une réponse tardive ou double est ignorée idempotemment.

Dans `codex.mjs`, rendre la gestion des server requests asynchrone. Le reader
JSONL continue à traiter les autres messages; la réponse RPC est écrite quand le
waiter se résout. Relayer :

1. command/file/permissions approvals;
2. `item/tool/requestUserInput` avec 1 à 3 questions, options, Other et secret;
3. `mcpServer/elicitation/request` form/openai-form;
4. mode URL : montrer domaine + action ouvrir/refuser, ne jamais ouvrir sans clic;
5. `item/tool/call` client-side : Atelier ne déclare aucun dynamic tool client;
   s’il est reçu sans spec déclarée, produire une interaction/erreur explicite
   `unsupported`, pas une exécution arbitraire.

Créer `HarnessInteraction.tsx` et l’insérer dans `ChatTimeline` sans refaire la
timeline : carte compacte, nom exact accessible, champs clavier, Allow once /
Deny pour approval, Submit/Cancel pour formulaires, secret en input password,
état final non éditable. Utiliser les tokens et SVG existants, sans nouvelle
valeur visuelle locale.

Les réponses secrètes circulent uniquement dans le message WS réponse; elles ne
sont jamais copiées dans AgentEvent, journal, notification ou console.

**Verify** : tests provider/router/frontend pour allow, deny, timeout, abort,
double réponse, secret, multi-question, MCP form et URL. Aucun test réseau réel.

### Step 6: Transporter les résultats complets des outils Claude

Remplacer `pendingEdits` par `pendingTools`, indexé par `tool_use_id` :

```js
{ id, name, input, detail, source, editPath, startedAt }
```

À `tool_use` : émettre `tool_update` running avec id, input borné, détail et
source. À `tool_result` : normaliser le contenu string/blocs, émettre le même
item completed/failed avec output et durée si calculable. Pour Edit/Write/
NotebookEdit, émettre en plus l’événement `edit` après succès, mais ne pas perdre
le `tool_update` qui porte statut/sortie. Les noms `mcp__<server>__<tool>` sont
présentés avec `source:"mcp"` et un nom humain, tout en conservant le nom exact
dans le payload diagnostic.

Bornes :

- output transporté/journalisé maximum 64 KiB par item avec métadonnée
  `truncated:true` et longueur originale;
- ne jamais inclure env complet, credentials SDK ou stderr global;
- contenu objet/blocs converti déterministement en texte/JSON;
- tool_result sans tool_use connu devient item `unknown` diagnostique, sans crash;
- tool_use sans résultat avant terminal reste `interrupted`/`failed`, jamais
  éternellement running au reload.

**Verify** : fixtures Claude Bash success/fail, Read long/truncated, Edit success,
MCP tool, résultat objet, résultat orphelin et interruption.

### Step 7: Ajouter le journal canonique Atelier et le replay sémantique

Créer `sidecar/harness_journal.mjs`. Stockage :

```text
~/Library/Application Support/atelier-studio/harness-history/
  <sha256(threadId)>.jsonl
```

Le hash empêche toute traversée de chemin; la première ligne contient
`schemaVersion`, `threadId`, date et provider initial. Fichiers/dossier privés
(`0700` dossier, `0600` fichiers). Le journal est local et n’est jamais servi par
HTTP.

API minimale :

```js
openThread(thread)
seedLegacy(thread, events)
append(event)
load(threadId)
materialize(threadId)
deleteThread(threadId)
```

Règles de persistance :

- append une ligne JSON complète par état durable;
- queue d’écriture sérialisée par thread;
- ignorer avec diagnostic borné une dernière ligne tronquée après crash;
- refuser une ligne > limite documentée au lieu de charger tout en mémoire;
- compacter les deltas : `materialize` garde texte/thinking final, dernier état
  de chaque item, dernière todo/goal pertinente et terminal;
- conserver l’ordre via sequence, dédupliquer eventId;
- usage appartient au turn, pas seulement au thread courant;
- interaction secrète : seulement état/résumé non secret;
- suppression d’un thread supprime aussi son journal après confirmation du
  chemin hashé;
- `/clear` Codex commence une nouvelle session native mais pas un nouveau thread
  Atelier : conserver le transcript et marquer une frontière de session;
- revert/fork : documenter et tester la sémantique. Un fork reçoit une copie
  jusqu’au point de fork; un revert tronque logiquement via un événement tombstone
  ou une génération, jamais par réécriture destructive non testée.

Migration : au premier nouveau send d’un thread existant sans journal, charger
son historique provider actuel, le transformer en événements `legacy-import`
avec ids/sequence synthétiques, écrire le seed une seule fois, puis append le
nouveau turn. Ainsi, le premier message post-upgrade ne masque pas l’historique
ancien. Si le seed échoue, continuer le run mais afficher un avertissement et ne
pas prétendre à la parité historique.

`getHistory` préfère ensuite `journal.materialize`. Il retombe sur les loaders
Claude/Codex/Grok/API seulement pour les threads non migrés. Ne jamais concaténer
aveuglément journal + provider au risque de doubler les messages.

**Verify** : tests round-trip de toutes les familles durables, ligne tronquée,
id dupliqué, séquence out-of-order, path hostile, permissions fichier, seed
legacy, restart, clear, delete, fork et revert.

### Step 8: Unifier le reducer live/replay dans le frontend

Extraire la logique de `App.tsx:794-879` vers `src/lib/harnessEvents.ts` :

```ts
reduceHarnessEvent(current, incoming)
materializeHarnessHistory(events)
eventIdentity(event) // turnId + itemId/eventId
```

Le même reducer traite les événements live et ceux de `history`. Invariants :

- streaming recherché dans le `turnId` courant seulement;
- `tool_update` remplacé par `(turnId,itemId)`, jamais itemId global;
- thinking final remplace thinking_live du même turn;
- terminal fige seulement le streaming du même turn;
- sequence déjà vue ignorée; reconnexion ne duplique pas;
- history tardif peut fusionner les événements manquants par eventId/sequence
  sans écraser les événements live plus récents;
- usage indexé par thread + turn; l’anneau peut continuer à montrer le dernier
  usage, mais plan 020 recevra les usages par turn pour ResultCapsule;
- événement legacy sans metadata reçoit une identité synthétique stable au
  chargement, sans `as any` dispersé.

Ne pas restructurer visuellement ChatTimeline ici. Ajouter seulement le rendu de
`interaction`; les groupes/outils existants restent pixel-equivalents.

**Verify** : tests reducer purs + orchestration : collision itemId, duplicate WS,
reconnect, history/live merge, terminal d’un autre turn, interruption partielle,
usage par turn et ancien history sans metadata.

### Step 9: Rendre catalogue et capabilities server-authoritative

Étendre `registry.mjs` avec des capabilities explicites au minimum :

```js
{
  resume, steering, queue, goals,
  tools, toolOutput, permissions,
  interactiveInput, mcpElicitation,
  durableHistory
}
```

`providerStatus()` doit les renvoyer; `ProviderInfo` doit les typer. Le composer
montre uniquement les contrôles supportés ou un état explicitement indisponible.
Supprimer les listes d’ids de modèles/efforts dupliquées dans `Chat.tsx`; garder
`BUILTIN_MODEL_LABELS` uniquement comme map label par id. Le catalogue sidecar
reste la source des ids et efforts.

Ne pas annoncer `durableHistory:true` pour un provider avant qu’un vrai tour de
ce provider ait passé le test journal/reload. Les providers API chat-only restent
`tools:false`.

**Verify** : registry tests, provider picker tests, modèle présent côté backend
visible sans modification frontend, modèle absent côté backend absent du picker,
contrôles goals/permissions conformes aux capabilities.

### Step 10: Étendre les smokes sans rendre la CI dépendante des comptes

Étendre `codex_live_parity.mjs` pour vérifier, sous flags explicites :

- `clientUserMessageId` et native turn id présents;
- workspace-write ne crée rien hors racine;
- read-only ne modifie rien;
- Full access reste possible explicitement;
- steer conserve le turn universel;
- commande, patch, MCP, image, heartbeat, interrupt, goal;
- journal puis `getHistory` reproduit les états finaux.

Ne jamais mettre les appels live dans `npm run verify`; ils dépendent des comptes,
coûts et outils locaux. Les fixtures déterministes couvrent le contrat par défaut.
Si Claude live est ajouté, le placer derrière un script/flag séparé et demander
autorisation avant exécution.

**Verify** : tests déterministes complets d’abord. Smoke live seulement si Thierry
l’autorise; joindre le JSON résumé sans secrets.

### Step 11: Vérification globale, build et parcours réels

1. Exécuter les tests ciblés sidecar/frontend.
2. Exécuter `npx tsc --noEmit`, `npx vite build`, puis `npm run verify`.
3. Suivre exactement `AGENTS.md` : tuer `tauri-app`, tous les sidecars et tous
   les serveurs galerie, builder l’app, relancer, vérifier le process.
4. Dans l’app buildée, réaliser au minimum :
   - Claude : Bash avec sortie, Edit avec diff, outil échoué, Ask allow/deny,
     steer, queue, stop, reload;
   - Codex : Full, Accept edits, Ask, Plan, commande, patch, MCP, question
     interactive simulée/réelle, steer, queue, stop, goal, reload;
   - changer de thread pendant deux runs parallèles puis revenir;
   - tuer/reprendre le sidecar et vérifier zéro duplication;
   - fermer/réouvrir Atelier et comparer le transcript avant/après;
   - historique ancien sans metadata;
   - secret input : vérifier absence dans journal et logs.
5. Capturer une preuve texte/JSON de la matrice de résultats; les captures
   visuelles détaillées restent au plan 020.

**Verify** : `pgrep -f tauri-app` retourne un pid; le rapport donne les nombres
de tests, chemins de journaux de test (pas le contenu sensible), résultats de
chaque parcours et `git diff --stat` final.

## Test plan

### Sidecar unit/integration

- metadata/schema/sequence/eventId;
- turn terminal unique et enrichissements sérialisés;
- prompt, steer, queue, steer fallback queue;
- queue après success/error/interruption;
- Claude callback stable et tool_use/tool_result complet;
- permissions Codex quatre modes + inconnu + reviewer;
- approvals once/deny/timeout/abort;
- request_user_input options/Other/secret;
- MCP elicitation form/openai-form/url;
- dynamic client tool non déclaré = unsupported explicite;
- journal permissions/path/truncation/dedupe/materialization;
- migration legacy, delete, clear, fork, revert;
- capabilities et catalogues.

### Frontend

- reducer live/replay identique;
- collision `itemId` inter-turn impossible;
- out-of-order et duplicate WS tolérés;
- streaming/terminal limités au bon turn;
- history tardif fusionné sans écraser le live;
- interaction clavier, focus, secret, allow/deny/cancel/expired;
- permission réelle reflétée par le contrôle;
- ancien événement sans metadata;
- ChatTimeline existante et composer sans régression.

### Manual built app

- tous les parcours Step 11;
- aucun zombie selon AGENTS.md;
- comparaison transcript live/reload;
- vérification des quatre politiques Codex par comportement observable, pas par
  simple valeur affichée;
- aucun secret dans `harness-history`, logs sidecar ou export thread.

## Done criteria

Tous les critères sont obligatoires :

- [ ] `docs/AGENT_HARNESS_CONTRACT.md` contient la matrice complète et la version
      de protocole Codex vérifiée.
- [ ] Tout événement durable nouveau possède metadata schema v1, ids et sequence.
- [ ] Un turn possède exactement un terminal; queue/steer sont attribués selon le
      Product contract.
- [ ] Steering ne crée ni snapshot, ni ledger/review turn fictif.
- [ ] Queue active le turn réservé seulement après le terminal précédent.
- [ ] Les quatre modes Codex produisent des politiques testées; seul Full access
      peut devenir `danger-full-access`.
- [ ] Ask/approvals, request_user_input et MCP elicitation peuvent être répondus
      dans Atelier et expirent/refusent sûrement.
- [ ] Les réponses secrètes ne sont ni journalisées, ni loguées, ni notifiées.
- [ ] Claude affiche et persiste input, output, statut, erreur et edit des outils.
- [ ] Le journal privé survit au restart, ignore une ligne tronquée et empêche la
      traversée de chemin.
- [ ] Reload reproduit demandes, thinking final, texte, outils finaux/sorties,
      edits, todos, goals, interactions, usage et terminal.
- [ ] Live/replay utilisent le même reducer frontend.
- [ ] Catalogue/capabilities sidecar pilotent le composer; aucune liste d’ids de
      modèles hardcodée concurrente ne subsiste dans Chat.
- [ ] Tests ciblés, `npm run verify`, build Tauri et parcours app buildée passent.
- [ ] Aucun fichier hors Scope n’est modifié.
- [ ] `plans/README.md` passe 025 à DONE uniquement après revue Codex indépendante.

## STOP conditions

Fable s’arrête et rapporte, sans workaround, si :

- 015/016/018 ne sont pas intégrés/reproductibles ou `App.tsx`/ChatTimeline ont
  divergé des extraits au point de réintroduire un mega Chat;
- la version installée de `codex app-server` ne génère pas les schémas ou ne
  supporte pas les formes publiques nécessaires;
- le mode Plan Codex exige un objet collaborationMode introuvable par le protocole;
- une permission UI ne peut pas être mappée sans élargir silencieusement l’accès;
- l’attribution Claude native rend impossible de distinguer queue et steer avec
  la stratégie routeur explicite; ne pas deviner d’après le timing;
- un provider ne peut pas garantir un terminal par turn;
- le journal demanderait de persister un secret ou une data URL pour conserver
  le comportement; revoir la représentation, ne pas écrire la valeur;
- fork/revert ne peuvent pas être rendus non destructifs avec le journal;
- une étape exige de modifier gallery, Rust/Tauri, terminal ou browser;
- une vérification échoue deux fois après correction raisonnable;
- le build app montre un zombie ou un bundle ancien; appliquer AGENTS.md, ne pas
  conclure sur le fix avant d’avoir éliminé les vieux process.

## Maintenance notes

- À chaque mise à jour de `@openai/codex-sdk` ou du CLI Codex, régénérer le schéma
  en tmp, comparer les méthodes/notifications à la matrice et mettre à jour les
  fixtures minimales. Le protocole généré, pas la mémoire, est la vérité.
- À chaque mise à jour de `@anthropic-ai/claude-agent-sdk`, rejouer les fixtures
  tool_use/tool_result, permissions, compact et session resume.
- Tout nouveau provider doit déclarer ses capabilities et produire le même
  contrat ou annoncer explicitement les dimensions indisponibles.
- `harness_events` est la seule porte d’émission durable. Une émission directe
  `{type:"event"}` depuis un provider/router doit être rejetée en review, sauf
  événement global documenté comme goal hors-turn.
- Le plan 020 peut changer la présentation mais ne doit plus modifier le
  protocole. S’il manque un champ à ResultCapsule, créer un plan de protocole
  séparé plutôt que d’inférer un succès depuis du texte.
- Les journaux sont des données locales sensibles. Toute future fonction export,
  sync ou cloud exige un plan privacy/security distinct et un consentement clair.
