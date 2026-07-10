# Plan 025 — notes d'exécution (Fable, 2026-07-10)

État vivant du chantier harnais. Survit à la compaction de session — TENIR À JOUR.

## Cadre (arrêté)

- Directive Thierry (EXECUTION-STATE.md) : revue Codex GLOBALE en fin de série
  (pas par tranche), commit + push à chaque étape, plans à la lettre,
  auto-vérification (panels adversariaux). Elle remplace la « revue Codex avant
  de continuer » des checkpoints A–D du plan.
- Ordre validé par Thierry le 2026-07-10 : 025 puis 020 (024 reporté après).
- Base du plan : 47cedb8 ; drift 017/018/019 attendu et validé (nouvelle base
  f58bc35). AUCUN drift sidecar depuis 47cedb8 avant nos travaux.
- Merge b07ae8e (poussé) : fix boucle d'entre-tuerie sidecar (branche
  claude/cool-moore-ac30f1) — single_instance.mjs, retry health Rust,
  kill+reap, backoff ws.ts (fusionné avec l'abort-safety 015), timeout boot
  10 s via refreshSidecarInfo. 229 tests sidecar verts post-merge.
- Éléments de Thierry à NE PAS absorber dans les commits : src/lib/i18n.ts
  modifié (clés nav.* du plan 024), docs/ui/ATELIER_*.md + baseline/ +
  specimens/ non trackés (014), plans/*.md non trackés, gallery/figures_data.json.
  → commits ciblés fichier par fichier, jamais `git add` large.

## Protocole Codex vérifié (codex-cli 0.142.5, schéma généré en tmp le 2026-07-10)

- AskForApproval : `untrusted | on-failure | on-request | never` (+ forme granular).
- SandboxMode : `read-only | workspace-write | danger-full-access`.
- CollaborationMode : `{mode: "plan"|"default", settings: {model: string,
  reasoning_effort?, developer_instructions?}}` — settings.model REQUIS →
  le mode Plan doit fournir un settings réel (collaborationMode/list ou modèle courant).
- TurnStartParams : approvalPolicy, sandboxPolicy, collaborationMode,
  clientUserMessageId, permissions, model, effort, input, threadId…
  (note : `sandboxPolicy` au niveau turn, `sandbox` au niveau thread options).
- Server requests (Codex → client) : item/commandExecution/requestApproval,
  item/fileChange/requestApproval, item/tool/requestUserInput,
  mcpServer/elicitation/request, item/permissions/requestApproval,
  item/tool/call (dynamic tools), + legacy applyPatchApproval/execCommandApproval,
  + account/chatgptAuthTokens/refresh, attestation/generate, currentTime/read.
- ToolRequestUserInputParams : {threadId, turnId, itemId, questions[],
  autoResolutionMs?: uint64|null} ; Question : {id, header, question,
  isOther?=false, isSecret?=false, options?: [{label, description}]|null}.
- McpServerElicitationRequestParams : {serverName, threadId, turnId} ⊕ oneOf
  {message, mode:"form", requestedSchema: McpElicitationSchema} |
  {message, mode:"openai/form", requestedSchema} | (mode url).

## Carte router.mjs (vérifiée ligne à ligne, 1098 l.)

- send : case l.940 ; provider lookup 942 ; running+threads 969-976 ;
  snapshot AVANT provider (981 Claude / 1050 Codex, def 184-196) ;
  objet turn LOCAL à la closure : `{threadId, projectRoot, provider, model,
  effort, prompt, tools, snapshotSha, lastText}` (982/1051) — aucun registre
  central du turn actif.
- Émission : `emit = ctx.broadcast ?? ctx.send` (947) ; forme
  `{type:"event", threadId, event}` ; enrichDoneEvent (156-164, filesChanged
  git) + enrichEditEvent (166-182, numstat) awaité avant emit (1001-1002 /
  1068-1069) ; puis emitGitChanged, maybeAutoReview (247-262,
  lastTurnByThread.set), appendLedgerForDone (264-281, sur done seulement).
- Steer : Claude = passthrough `mode: msg.mode` → p.send (993), AUCUNE garde
  running côté router (le SDK sérialise) ; Codex = si running (1036) →
  p.steer (1037-41, sentinelle `__steered`) sinon queue `pending` Map (12,
  1042-46, sentinelle `__queued`).
- Queue drain : onEvent Claude done/error (1017-21) ET .finally Codex
  (1087-92) → route(next, ctx) récursif. Interrupt (285-290) NE draine PAS.
- permWaiters (13) : Claude-only, permissionMode==="default" (124), timeout
  120 s → resolve(false) (127), réponse WS `permissionResponse` (470-473),
  émis `{type:"permissionRequest", threadId, requestId, toolName, input}` (132).
- getHistory (752-780) : loaders par provider (claudeHistory/codexHistory/
  grokHistory/p.history), émission `{type:"history", threadId, events}` (778).
- ctx (index.mjs:552-614) : send lié socket, broadcast global (524-529), store,
  providers, history, sessions, gitops, ledger, reviewer…
- Émissions directes hors frontière : __compacted (894), __session-cleared
  (904), goalGet (932), erreurs catch (1029, 1084), sentinelles (1039, 1045),
  relais goal index.mjs:548. Erreurs ledger via ctx.send (1006/1073) — socket
  unique, incohérent.
- Statut : running posé en un point (969) mais réinitialisé différemment
  (Claude onEvent 1008-13 ; Codex .then/.catch 1078/1083).

## Carte providers (vérifiée ligne à ligne)

CLAUDE (claude.mjs, 409 l.) :
- sessions Map (40) `threadId→{push,q,onEvent,model,permissionMode,close}` ;
  2e send : `s.onEvent = onEvent` (157) = LE bug d'attribution ; push(userMsg(
  prompt, mode==="queue"?"next":"now")) (163). 1er send : query() 186-219,
  boucle 249-328 persistante multi-tours, emit wrapper 238-241 (sawTerminal).
- Kinds émis : delta 264, thinking_delta 267, text 280, thinking 281,
  tool 291 (tool_use non-édition — RÉSULTATS IGNORÉS), edit 304 (tool_result
  edit ok) / tool 302 (edit erreur), __compacted 309, done 313-26 (msg result,
  ok=subtype==="success"), error 330 + filet finally 334-36 (!sawTerminal).
- pendingEdits Map (247) DANS la closure = partagée entre tours ; capturer le
  turnId au tool_use (289) pour le ressortir au tool_result (304).
- PAS de kind "started" Claude — fabriquer l'ouverture de tour au push user.
- canUseTool bloquant 201-212, seulement si onPermissionRequest fourni
  (mode "default" via makePermissionRelay router:124).
- usage : s.lastCtx (272-78, input+cache) + result output/cost/turns (312-25).
- sessionId : onSession(msg.session_id) sur system/init (250) ;
  resume/resumeSessionAt/forkSession options 215-17.

CODEX (codex.mjs, 849 l.) :
- ensureServer spawn 152-160, reader JSONL 161-181 : server requests répondues
  SYNCHRONEMENT dans le reader (167-169) → à rendre async (waiters).
- buildServerRequestFallback 53-64 : requestUserInput→{answers:{}} (57-59),
  elicitation→decline (60-62), item/tool/call→unsupported success:false (54).
- answerServerRequest 102-115 : 5 méthodes approval → buildApprovalResponse
  31-51, décision auto par `threadSandbox.get(tid)==="danger-full-access"`.
  Report post-hoc : atelier/serverRequest/resolved → emitServerRequestUpdate
  555-572 (tool_update source:"approval").
- buildThreadOptions 232-248 : approvalPolicy:"never" (243), sandbox ??
  danger-full-access (244), effortHint retiré à openThread (251).
  run() 384-399 SANS permissionMode. turn/start 799-805 (approvalPolicy never).
- activeTurns Map (323) : turnId NATIF déjà là (turn/started 583 + réponse
  turn/start 806) jamais propagé au front ; steer 328-341 (turn/steer,
  expectedTurnId) = même turnId pour plusieurs messages user.
- Mapping notifications → events : table complète 580-785 (item/started 587-627,
  agentMessage/delta→stream_set 659-62, item/completed 689-737 dont
  fileChange→edit 704-10, turn/plan/updated→todos 739-45, tokenUsage 747-55
  (pas d'event), turn/completed→done/error 761-83, doneEmitted 776 + filet
  resetServerState 92-96).
- registry.mjs capabilities = {resume, steering, goals} seulement (claude
  36 : goals:false ; codex 45 : goals:true) ; providerStatus (index.mjs:414-44)
  OMET capabilities dans base (428-36) → à ajouter aux DEUX endroits.

PIÈGES metadata :
- enrichEditEvent (router 167-181) RECONSTRUIT l'objet edit → préserver meta.
- collectTool (router 198-209) indexe par event.id → meta en champ séparé.
- Terminaux filets (claude 335, codex 810, resetServerState 94) doivent
  connaître le turnId courant.
- Claude : N blocs text par tour vs Codex : 1 agentMessage par message ;
  delta→text (Claude) vs stream_set cumulatif→text+reset (Codex 692).

## Carte history/replay (vérifiée)

- claudeHistory (history.mjs:44-75,104-106) : SEULEMENT user/text/tool —
  perd thinking, tool_result/outputs, usage, done, edit, permission, todos,
  goal. stripHandoff (handoff.mjs:15-28), filtre SYSTEM_TAG (12-13),
  toolDetail (claude.mjs:6-19), repli findClaudeSessionDir (83-96).
- codexHistory (sessions.mjs:129-162) : user_message/agent_message seuls —
  le plus lossy (pas même de puce tool). grokHistory (192-221) :
  user/text/tool sans detail.
- Chemins sessions : Claude ~/.claude/projects/<slug=root avec / → ->/<id>.jsonl ;
  Codex ~/.codex/sessions/**/rollout-*-<uuid>.jsonl (walk ≤4) ; Grok
  ~/.grok/sessions/<encodeURIComponent(root)>/<id>/chat_history.jsonl ;
  API APP_DIR/api_sessions/<id>.jsonl (openai_api.mjs:12-14).
- App.tsx : history installé SEULEMENT si thread vide (922-931) ; reducer
  791-921 : started/heartbeat→workingSince, usage→usageByThread (PAS dans la
  liste), streaming cherché dans TOUT le thread (813-16), tool_update REMPLACÉ
  par id sans merge (856-62), done/error figent la bulle (885-90).
- writeFileAtomic store.mjs:7-12. Patterns tests : history.test (12, vi.mock
  SDK, mkdtemp), sessions.test (5), router.test (19, ctx mock + loaders
  vi.fn), claude_lifecycle (2, ThreadStore réel), App.orchestration (12,
  FakeWS stubGlobal + fake timers), ChatTimeline.characterization (7,
  chatProps sans WS). Fixtures src/test/fixtures/{index,sidecar}.ts —
  aucune fixture permission/interaction.

## Carte frontend chat (vérifiée)

- Envoi : App.tsx sendMessage — handoff 1580-85, fullPrompt 1586-91
  (attachments EN TEXTE, images par chemins), userEvent optimiste 1592-1614
  (text=prompt brut), sendPrompt 1676-94. clientMessageId/displayEvent :
  0 occurrence dans src/.
- Permission : WS permissionRequest → App 1087-96 (push kind:"permission") ;
  ChatTimeline 300-317 .perm-card ; boutons → CustomEvent "permission-answer"
  → App 1213-21 → WS permissionResponse. Styles App.css 1926-44.
- Chat.tsx : BUILTIN_MODEL_LABELS 20-27, MODELS 29-40 (court-circuit
  baseModelsFor:430), EFFORTS 42-47, API_REASONING_LEVELS 48 ;
  groupage renderedEvents 685-713, turnFolds 656-76 (KEEP_TAIL/COUNTED
  658-59 — y ajouter "interaction" sinon plié) ; composer bundles 800-825 →
  ChatComposer → ComposerControls (PERMISSION_MODES locale = modes de
  permission, ne pas toucher).
- ProviderInfo (providers.ts:4-21) sans capabilities. i18n : fr = source de
  vérité, en typé Record<keyof fr> (clé manquante = erreur TS).

## Décisions de design

- (à remplir au fil des tranches)

## Décisions de design (tranche A)

- Un dispatcher STABLE par thread (threadDispatchers) relit threadRuns à
  chaque événement : claude.mjs ne fait plus `s.onEvent = onEvent` au 2e send.
- startProviderTurn unifie les deux branches (claude p.send / p.run) ; le
  .catch de p.run passe par le dispatcher (kind error) → statut + drain
  unifiés dans handleTurnEvent ; terminal dupliqué refusé par le harnais.
- Queue explicite TOUS providers ({msg, turnId} réservé) ; chips __steered/
  __queued conservées (i18n event.steered/queued) ; sentinelle __queued émise
  sur le turn réservé.
- resolveCodexSafety livré (pur, testé 6 cas) — CÂBLAGE en tranche B ;
  settings.model du mode plan résolu au câblage.
- Frontend : meta par intersection (HarnessEventMeta | ProvisionalEventMeta) ;
  dédup ack user par messageId (meta autoritaire adoptée, affichage local
  gardé) ; tool_update ET clé de grappe React keyés (turnId, itemId).
- displayEvent : texte tapé + label + pastes {name, lines} + imagePaths —
  jamais handoff/textes injectés/data URL.

## Progression

- [x] Drift check + schéma Codex vérifié + merge fix sidecar (b07ae8e, poussé)
- [x] Tranche A (steps 1–3) : contrat (matrice user/steer/queue + text/thinking),
      harness_events.mjs (12 tests), router autoritaire (3 tests), dispatcher
      stable claude (2 tests), resolveCodexSafety (6 tests), collision itemId
      frontend (1 test) + clientUserMessageId Codex. Gates : sidecar 252/252,
      frontend 178/178, tsc, vite build.
- [ ] Tranche B (steps 4–5) : resolveCodexSafety + interactionWaiters + HarnessInteraction.tsx
- [ ] Tranche C (steps 6–8) : pendingTools Claude + harness_journal + reducer harnessEvents.ts
- [ ] Tranche D (steps 9–11) : capabilities/catalogue + smokes + gates + app buildée + parcours réels

## Gates

cd sidecar && npx vitest run (229+ verts) ; npx tsc --noEmit ; npx vite build ;
npm run verify ; protocole AGENTS.md (leçon TCC premier lancement incluse).
