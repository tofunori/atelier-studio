# Plan 056 : Grok CLI natif via ACP Rust

## Verdict et objectif

Remplacer le provider Rust Grok one-shot (`streaming-json`, un process par
tour, `--always-approve`) par un client ACP persistant et isolé par thread :

```text
Atelier UI → routeur WS Rust → GrokProvider → AcpServer → grok agent --no-leader stdio
```

Le processus, la session, le cwd et l'annulation appartiennent au thread. Une
erreur ACP ne bascule jamais vers le legacy au milieu d'un tour. Le binaire et
le harnais restent ceux de Grok CLI ; Atelier ne réimplémente ni ses outils, ni
son stockage de sessions.

## Base vérifiée

- Worktree : `/Users/tofunori/Documents/atelier-studio-grok-acp-rust`
- Branche : `codex/grok-acp-rust`
- Base : `b2b3fac26e10bc00d0cbf7a50d95bd85f4ae3e81`
- CLI local au probe initial : Grok `0.2.103` ; validation finale après mise
  à jour automatique : `0.2.106`
- Version minimale retenue : `0.2.101`
- Backend Atelier prioritaire : Rust

Le probe réel sans appel modèle a confirmé :

- framing JSON-RPC 2.0 NDJSON ;
- `initialize`, protocole 1 ;
- auth `cached_token` ;
- `session/new` avec `models` et `_meta["x.ai/sessionConfig"]` ;
- `session/set_model {modelId, _meta:{reasoningEffort}}` ;
- `promptCapabilities.image:false` ;
- notifications standard `session/update` et extension
  `_x.ai/session_notification`.

## Étapes d'implémentation

### P0 — Isolation

- travailler dans un worktree dédié ;
- préserver le checkout principal sale ;
- ne pas fusionner ni pousser sans demande ;
- garder le `target/` Cargo local au worktree.

### P1 — Client ACP partagé

- ajouter un cwd optionnel au spawn ;
- router `session/update` et `_x.ai/session_notification` par session ;
- ignorer les autres notifications xAI, notamment MCP, pour ne jamais
  journaliser des variables d'environnement ;
- exposer un arrêt explicite qui draine les RPC pending ;
- conserver single-flight, génération et handlers async existants.

### P2 — Runtime Grok par thread

- un `AcpServer` par thread, avec mutex de tour ;
- maximum souple de huit runtimes ;
- TTL inactif d'une heure et éviction LRU uniquement au repos ;
- `--no-leader` pour éviter qu'un leader global mélange les projets ;
- respawn si le cwd ou le mode process-scoped change ;
- arrêt sur suppression et déplacement du thread.

### P3 — Auth et sessions

- `initialize` avec fs/terminal ACP désactivés ;
- préférer `xai.api_key` si annoncé et configuré, sinon `cached_token` ;
- auth une fois par génération ;
- `session/load` pour reprendre ;
- installer un handler de décharge avant le load et attendre une fenêtre
  calme pour empêcher le replay de polluer le tour vivant ;
- en erreur applicative de load avec process sain, créer une nouvelle session ;
- en panne de transport, échouer explicitement.

### P4 — Tour, modèle et événements

- valider/construire les inputs avant `session/prompt` ;
- référencer images et skills par chemin puisque Grok annonce image=false ;
- aligner modèle/effort via `session/set_model`, avec compatibilité
  `session/set_mode` pour les anciens 0.2.x ;
- conserver les ids, noms, inputs et statuts d'outils xAI ;
- émettre texte, pensée, outils, diffs, plans et usage final ;
- garder le handler pendant une courte fenêtre après la réponse pour attribuer
  les événements tardifs au bon tour ;
- transformer un `end_turn` silencieux en erreur visible.

### P5 — Permissions, interruption et compaction

- aller-retour opaque de `optionId` ;
- fermeture/timeout/id inconnu = `cancelled` ;
- `acceptEdits` n'auto-approuve que les permissions identifiées comme édition ;
- `bypassPermissions` active aussi le flag natif `--always-approve` ;
- `session/cancel` est une notification, jamais une requête ;
- `/compact` est exécuté comme prompt ACP natif, sérialisé avec les tours et
  borné à 120 secondes.

### P6 — Catalogue et UI

- découvrir les modèles avec `grok models` ;
- supprimer le modèle statique obsolète ;
- exposer seulement les efforts low/medium/high réellement consommés ;
- activer tool output, permissions, MCP, skills attachés, compaction et
  historique durable ;
- rendre `/compact` provider-générique tout en gardant `/clear` Codex-only.

### P7 — Vérification

- fixture ACP déterministe : auth, xAI, replay, permissions, modèle, cancel ;
- tests mapping et cycle de vie ;
- `cargo check` providers/runtime ;
- `npx tsc --noEmit` ;
- `npx vite build` ;
- `(cd sidecar && npx vitest run)` ;
- protocole complet `AGENTS.md` : arrêt des zombies, build `.app`, relance du
  bundle de ce worktree et preuve du PID/binaire.

## Limite de sécurité explicite

Atelier n'annonce pas de proxy ACP filesystem/terminal. Grok exécute donc ses
outils natifs. Le relais de `session/request_permission` est complet lorsqu'il
est émis, mais les règles déjà accordées dans la configuration Grok peuvent
court-circuiter une demande. Une garantie « plan strict » indépendante du CLI
exigerait une seconde phase : proxy fs/terminal ou hook `pre_tool_use` bloquant,
avec tests adversariaux. Cette phase n'est pas simulée par une capability.

## Conditions de fin

Le plan n'est terminé que si le provider legacy n'est plus dans le chemin
Rust, que les tests applicables passent, que tout échec préexistant est séparé
des régressions du plan, et que l'app buildée du bon worktree est saine.

## Résultat — 2026-07-19

**DONE.** Le chemin Rust Grok utilise exclusivement ACP. La validation finale a
passé : 119 tests provider Rust (1 E2E réseau ignoré), 64 tests runtime Rust,
599 tests frontend, 542 tests sidecar, typecheck TypeScript et build Vite. Le
bundle `.app` release du worktree a été construit et signé, puis lancé comme
instance unique. Son `/health` répond `ok:true` avec `backend:"rust"`; le setup
réel voit Grok `0.2.106`, authentifié, avec `grok-4.5` comme modèle dynamique.

La limite de sécurité décrite ci-dessus reste volontairement ouverte : Atelier
relaie les permissions ACP mais ne prétend pas remplacer le sandbox et les
règles persistantes de Grok.
