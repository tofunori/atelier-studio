# Contrat du harnais agentique Atelier

> Livré par le plan 025. Le plan 020 consomme ce contrat pour la présentation
> (ActivityGroup, ResultCapsule) et ne doit PAS modifier le protocole. S'il
> manque un champ, créer un plan de protocole séparé.
>
> Version de protocole Codex vérifiée : **codex-cli 0.142.5**, schéma généré le
> 2026-07-10 via `codex app-server generate-json-schema --experimental` (tmpdir,
> jamais vendoré). À chaque mise à jour du CLI : régénérer, comparer à la
> matrice, mettre à jour les fixtures minimales des tests.

## Vocabulaire contraignant

- **Thread** : conversation durable Atelier, possiblement reprise chez un provider.
- **Turn** : unité d'exécution agentique — commence avec un prompt normal ou un
  prompt dépilé de la queue, finit par exactement un terminal `done` ou `error`.
- **Steer** : message utilisateur injecté dans le turn actif. `messageId` propre,
  `turnId` du turn actif, AUCUN nouveau snapshot Git ni ledger turn.
- **Queue** : message accepté pendant un run, visible immédiatement `queued`,
  `turnId` NOUVEAU réservé, activé seulement après le terminal du turn précédent.
- **Item** : action interne d'un turn (raisonnement, commande, patch, outil MCP,
  sous-agent, interaction…), identifiée par `itemId` unique dans le turn.
- **Durable event** : nécessaire pour reconstruire le transcript final.
- **Ephemeral event** : delta/heartbeat/progrès compactable au reload.
- **Semantic replay parity** : après redémarrage, le transcript contient les
  mêmes demandes, réponses, outils finaux, sorties, erreurs, diffs, usage et
  interactions — pas les animations ni chaque delta.

## Métadonnées communes (schema v1)

Tout événement sidecar durable porte :

```ts
type HarnessEventMeta = {
  schemaVersion: 1;
  eventId: string;          // UUID Atelier, idempotence WS/journal
  provider: string;
  threadId: string;
  turnId: string;           // id universel Atelier, créé par le sidecar AVANT l'appel provider
  messageId?: string;       // chaque message user (normal, steer, queue) — généré frontend (clientMessageId)
  itemId?: string;          // commande/tool/patch/interaction
  nativeThreadId?: string;  // session/thread provider si disponible
  nativeTurnId?: string;    // turn Codex natif si disponible
  sequence: number;         // monotone par thread, attribué par UN SEUL sérialiseur sidecar
  ts: number;
  durable: boolean;
  origin: "provider" | "atelier" | "legacy-import";
};
```

Règles :

1. `turnId` universel créé côté sidecar avant l'appel provider — jamais dépendant
   d'un id natif.
2. `nativeTurnId` Codex ajouté dès `turn/started` — ne remplace jamais `turnId`.
3. `messageId` généré par le frontend (`clientMessageId`), transmis à Codex via
   `clientUserMessageId` (TurnStartParams).
4. `sequence` attribué par un seul sérialiseur par thread (sidecar). Jamais
   calculé dans React ni via un index de tableau.
5. `eventId + sequence` rendent reconnexion et replay idempotents.
6. Ancien événement sans metadata = lisible en `origin:"legacy-import"` avec
   identité synthétique stable ; ne fait jamais planter un historique.
7. Durables : `user`, `text`, `thinking`, `tool_update`, `edit`, `todos`, `goal`,
   `interaction`, `usage`, `done`, `error`. Éphémères (durable:false possibles) :
   `delta`, `thinking_delta`, `thinking_live`, `stream_set`, `streaming`,
   `started`, `heartbeat`, `activity`.

## Événement interactif générique

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
  answerSummary?: string;   // JAMAIS de valeur secrète ici
};
```

Les valeurs marquées secrètes circulent uniquement dans le message WS de
réponse ; jamais dans AgentEvent, journal, logs ou notifications.

## Formes protocolaires Codex vérifiées (0.142.5)

- `AskForApproval` : `untrusted | on-failure | on-request | never` (+ granular).
- `SandboxMode` : `read-only | workspace-write | danger-full-access`.
- `CollaborationMode` : `{mode:"plan"|"default", settings:{model, reasoning_effort?, developer_instructions?}}`
  — `settings.model` requis : le mode Plan fournit un settings réel.
- `TurnStartParams` inclut `approvalPolicy`, `sandboxPolicy`, `collaborationMode`,
  `clientUserMessageId`, `model`, `effort`, `input`, `threadId`.
- Server requests relayables : `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, `item/tool/requestUserInput`
  (`{threadId,turnId,itemId,questions[{id,header,question,isOther,isSecret,options}],autoResolutionMs?}`),
  `mcpServer/elicitation/request` (`{serverName,threadId,turnId}` ⊕ mode
  `form`/`openai/form`/url), `item/permissions/requestApproval`,
  `item/tool/call` (dynamic tool client — Atelier n'en déclare aucun →
  interaction/erreur explicite `unsupported`).

## Politique de permissions Codex

| Mode Atelier | sandbox | approvalPolicy | collaborationMode |
|---|---|---|---|
| Full access (`bypassPermissions`) | `danger-full-access` | `never` | `default`/omis |
| Accept edits (`acceptEdits`) | `workspace-write` | `on-request` | `default`/omis |
| Ask (`default`) | `workspace-write` | `untrusted` | `default`/omis |
| Plan (`plan`) | `read-only` | `never` | `{mode:"plan", settings}` réel |
| **Mode inconnu** | `read-only` | `on-request` | omis + diagnostic visible |

Jamais de retombée silencieuse sur Full access. Reviewer/auto-review :
read-only explicite. `additionalDirectories` writable seulement si le mode
autorise l'écriture.

## Matrice provider × événement

Colonnes : source native → méthode/notification ; durable ; terminal ; ids
natifs ; payload UI (AgentEvent) ; reload ; permission/interactivité ; fallback
legacy.

_(matrice remplie tranche par tranche — voir sections ci-dessous)_

### user prompt / steer / queue

Le routeur est l'unique autorité : `turnId` créé AVANT l'appel provider,
`messageId` = `clientMessageId` du frontend, bulle user émise par le sidecar
(`origin:"atelier"`) et dédupliquée côté client par `messageId`.

| Cas | Claude (Agent SDK) | Codex (app-server) | durable / terminal | reload |
|---|---|---|---|---|
| prompt (idle) | `query()` streaming input, 1er `push(userMsg)` ; sessionId via `system/init` | `thread/start` ou `thread/resume` + `turn/start` (porte `clientUserMessageId`) ; `nativeTurnId` via `turn/started` | `user` durable / non | bulle user rejouée depuis le journal (tranche C) |
| steer (running) | `s.push(userMsg(prompt,"now"))` — le dispatcher de session est STABLE, jamais réattribué | `turn/steer` avec `expectedTurnId` ; chip `__steered` | `user` durable, MÊME `turnId`, `messageId` propre ; AUCUN snapshot/ledger | idem |
| queue (running) | file EXPLICITE du routeur (plus de `priority:"next"` invisible) ; provider rappelé au terminal | refus de steer → même chemin ; chip `__queued` | `user` durable immédiat, `turnId` NEUF réservé ; snapshot au démarrage réel | idem |
| steer refusé | n/a (SDK accepte toujours) | `turn/steer` → false → devient queue avec le MÊME `messageId`, sans double bulle | — | — |

### text / delta, thinking / delta

| Événement | Claude | Codex | durable | reload |
|---|---|---|---|---|
| `delta` | `stream_event`/`text_delta` | — (Codex : `stream_set` cumulatif via `item/agentMessage/delta`) | non | compacté (texte final seul) |
| `text` | bloc `text` d'un message `assistant` (N blocs possibles par turn) | `item/completed` `agentMessage` (1 par message) | oui | rejoué |
| `thinking_delta` | `stream_event`/`thinking_delta` | — | non | compacté |
| `thinking` | bloc `thinking` d'un `assistant` | `item/completed` `reasoning` | oui | rejoué |

### commandes, outils, patchs, MCP

Contrat commun `tool_update` : `{id, name, detail?, input?, source?, status
(running|completed|failed|interrupted), output, exitCode?, truncated?,
outputLength?, durationMs?}` — identité d'item `(turnId, itemId)`. Bornes :
sortie 64 KiB (+`truncated`/`outputLength`), input 16 KiB (aperçu) ; jamais
d'env complet, credentials ou stderr global. Un `tool_use` sans résultat au
terminal passe `interrupted` — jamais running éternel au reload.

| Événement | Claude (Agent SDK) | Codex (app-server) | reload |
|---|---|---|---|
| outil running | bloc `tool_use` d'un `assistant` → tool_update running | `item/started` (commandExecution, mcpToolCall, webSearch…) | dernier état seul |
| outil terminé | bloc `tool_result` du message `user` suivant (contenu string/blocs normalisé, `is_error`→failed) | `item/updated`/`item/completed` + `outputDelta` agrégés | rejoué (dernier état) |
| édition | tool_use Edit/Write/NotebookEdit → tool_update + événement `edit` APRÈS succès (les deux) | `item/completed` fileChange → `edit` | rejoués |
| patch | n/a | `item/fileChange/patchUpdated`/`outputDelta` → tool_update apply_patch | dernier état |
| MCP | nom exact `mcp__<server>__<tool>` conservé, `source:"mcp"` | `item/*` mcpToolCall + `progress`, `source:"mcp"` | dernier état |
| résultat orphelin | tool_result sans tool_use connu → item diagnostique `unknown` (pas de crash) | n/a | conservé |
| enrichissement | `edit` enrichi ±lignes (git numstat) par le routeur, SÉRIALISÉ avant le done | idem | valeurs enrichies |

### usage, goal, todos, compact, interrupt, done, error, heartbeat

| Événement | Claude | Codex | durable / notes |
|---|---|---|---|
| usage | `assistant.usage` (contexte cumulé) + message `result` (output/cost/turns) porté par `done.usage` | `thread/tokenUsage/updated` (agrégé, porté par done) | usage indexé par thread + turn (meta.turnId) |
| goal | /goal texte natif CLI | `thread/goal/updated`/`cleared` → relais broadcast HORS turn (événement global documenté) | durable |
| todos | n/a | `turn/plan/updated` → `todos` | dernier état seul |
| compact | `system/compact_boundary` → chip `__compacted` | `codexCompact` → chip | frontière visible |
| /clear | n/a (nouvelle session = resume) | session native NEUVE, MÊME thread Atelier : frontière `__session-cleared` dans le journal | transcript conservé |
| interrupt | `q.interrupt()` → `result` (ok:false) | `turn/interrupt` → `turn/completed interrupted` → done ok:false | un seul terminal ; interactions pendantes déclinées AVANT |
| done | message `result` (`subtype==="success"`) | `turn/completed` | terminal unique par turn (harnais) |
| error | catch/filet `!sawTerminal` | `turn/completed failed`, `error` non-retry, filet resetServerState | terminal unique |
| heartbeat | n/a | interval sidecar (5 s) | éphémère, jamais journalisé |

### interactions (approval, user input, elicitation)

Relais générique (event `interaction`, waiters sidecar) : le waiter survit à
une déconnexion du client (répondable après reconnexion) ; timeout 120 s par
défaut, `autoResolutionMs` respecté borné 1 s–10 min ; réponse tardive/double
ignorée ; fin/interruption de turn → interactions pendantes `declined` AVANT
le terminal ; les valeurs `secret` circulent uniquement dans le message WS
`interactionResponse` — jamais dans les événements, `answerSummary`, journal
ou logs.

| Source | Méthode native | Relais | Réponse au refus sûr |
|---|---|---|---|
| Claude Ask | `canUseTool` (SDK, bloquant) | chemin historique `permissionRequest`/`permissionResponse` (120 s), event `permission` | deny |
| Codex approvals | `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `execCommandApproval`, `applyPatchApproval` | `interaction` approval (Allow once / Deny) sur les runs interactifs ; auto-réponse par sandbox (full uniquement) pour reviewer/quickAsk | decline/denied ; permissions vides + `strictAutoReview` |
| Codex user input | `item/tool/requestUserInput` (1-3 questions, options, `isOther`, `isSecret`) | `interaction` user_input (formulaire, Other, secret=password) | `{answers:{}}` |
| MCP elicitation | `mcpServer/elicitation/request` form / openai-form / url | `interaction` mcp_elicitation (champs du schéma form ; url → domaine + accepter/refuser, JAMAIS d'ouverture sans clic) | `{action:"decline"}` |
| Dynamic tool | `item/tool/call` | non relayé : réponse `unsupported` explicite (Atelier ne déclare aucun dynamic tool client) | `success:false` |

Réponse WS frontend : `{type:"interactionResponse", requestId, response}` avec
`response` = `{allow}` (approval), `{answers}` (user_input, valeurs secrètes
incluses ICI seulement), `{action, content?}` (elicitation).

Câblage des politiques : `buildThreadOptions` — un `sandbox` EXPLICITE
(reviewer read-only) prime et n'est jamais escaladé ; sinon `permissionMode`
résolu par `resolveCodexSafety` ; l'absence des deux = appelant programmatique
historique (full access explicite). `additionalDirectories` writable seulement
hors read-only. Mode Plan : `collaborationMode` complet (settings.model du
tour, sinon `collaborationMode/list` mis en cache ; introuvable → tour
read-only sans plan natif + diagnostic visible `__permission-fallback`).

### usage, goal, todos, compact, interrupt, done, error, heartbeat

_(à compléter en tranche C)_

## Journal canonique

`~/Library/Application Support/atelier-studio/harness-history/<sha256(threadId)>.jsonl`
— dossier 0700, fichiers 0600, jamais servi par HTTP. Première ligne :
`{schemaVersion, threadId, date, provider}`. Append-only, une ligne JSON par
état durable, dernière ligne tronquée ignorée avec diagnostic. `materialize`
compacte les éphémères. Migration : seed `legacy-import` une seule fois au
premier send post-upgrade. `/clear` Codex = frontière de session native dans le
MÊME thread Atelier. Fork = copie jusqu'au point de fork ; revert = tombstone
logique, jamais de réécriture destructive.

## Capabilities provider

```js
{ resume, steering, queue, goals, tools, toolOutput, permissions,
  interactiveInput, mcpElicitation, durableHistory }
```

Le sidecar (registry) est l'autorité des modèles/efforts/capabilities ;
`providerStatus()` les renvoie ; le frontend n'a JAMAIS de seconde liste d'ids.
`durableHistory:true` seulement après qu'un vrai tour du provider a passé le
test journal/reload. Providers API chat-only : `tools:false`.

## Maintenance

- `harness_events` est la seule porte d'émission durable ; une émission directe
  `{type:"event"}` depuis provider/router est un défaut de review (exception :
  événements globaux hors-turn documentés).
- MàJ `@openai/codex-sdk`/CLI : régénérer le schéma, comparer, ajuster fixtures.
- MàJ `@anthropic-ai/claude-agent-sdk` : rejouer fixtures tool_use/tool_result,
  permissions, compact, resume.
- Nouveau provider : déclare ses capabilities et produit ce contrat, ou annonce
  explicitement les dimensions indisponibles.
- Journaux = données locales sensibles ; export/sync/cloud = plan
  privacy/security séparé + consentement explicite.
