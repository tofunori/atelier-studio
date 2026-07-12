# Plan 010: Restaurer la fidélité historique et les métriques d'usage

> **Executor instructions**: charger `/efficient-fable`. Aucun secret API dans
> fixtures. Tests uniquement en répertoires temporaires/providers factices.
>
> **Drift check**: `git diff --stat 8a5d0ca..HEAD -- sidecar/router.mjs sidecar/router.test.mjs sidecar/ledger.mjs sidecar/ledger.test.mjs sidecar/providers/openai_api.mjs sidecar/providers/openai_api.test.mjs sidecar/providers/opencode.mjs sidecar/providers/opencode.test.mjs`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 008
- **Category**: correctness / data fidelity
- **Planned at**: commit `8a5d0ca`, 2026-07-09

## Why this matters

`getHistory` envoie tout non-Claude/non-Grok vers historique Codex, bien que les
API aient leur JSONL. Après restart transcript vide/incorrect. `ledger.getAll`
appelle `readFileSync` non importé puis avale l'erreur; usage modèles reste vide.

## Target history contract

- Claude → claudeHistory.
- Codex → codexHistory.
- Grok → grokHistory.
- API dynamique → méthode `history` basée sur api_sessions.
- OpenCode → transcript Atelier local pour nouveaux tours.
- Provider sans history → [] + diagnostic borné, jamais fallback d'un autre format.

## Scope

Fichiers du drift check. Hors scope: backfill anciennes sessions OpenCode,
migration Claude/Codex/Grok, sorties outils indisponibles, coûts inventés.

## Steps

### 1. Corriger ledger getAll

API fs cohérente; `opts.baseDir`; lire JSONL multiples, ignorer lignes invalides
individuellement, trier ts, limite globale. N'avaler que absence dossier/corruption
donnée, pas erreur programmation. Tests: deux projets, tri, limite, corruption,
dossier absent. Test routeur getUsage agrège turns/output aujourd'hui.

### 2. Exposer history API

`makeApiProvider` retourne history. Mapper user→user; reasoning assistant non vide
→ thinking compatible UI; content→text. Préserver ordre/limite. Test sans réseau.

### 3. Persister nouveaux transcripts OpenCode

Store JSONL Application Support, chemin injectable. Pendant run accumuler texte
final/usage sans changer streaming. Quand sessionId stable, append user+assistant
une fois. Interruption conserve partiel une fois. Exposer history. Documenter
qu'anciennes sessions ne sont pas rétro-importées.

### 4. Router explicitement

Branches explicites puis provider.history. Tests sentinelles Claude, Codex, Grok,
API, OpenCode, inconnu; prouver qu'aucun loader incorrect n'est appelé.

## Verification

```bash
(cd sidecar && npx vitest run ledger.test.mjs router.test.mjs providers/openai_api.test.mjs providers/opencode.test.mjs)
npm run verify
```

Puis Tauri. Manuel: deux tours API/OpenCode, restart app, rouvrir threads, vérifier
rôles/ordre; Usage affiche modèle du jour.

## Done criteria

- [ ] getAll réel + tests multi-fichiers.
- [ ] getUsage n'avale plus bug de code.
- [ ] API/OpenCode jamais via codexHistory.
- [ ] API survit restart.
- [ ] Nouveaux OpenCode survivent restart.
- [ ] Aucun secret tests/logs/diffs.

## STOP conditions

- Format thinking UI ambigu: ouvrir types + test avant code.
- OpenCode sans sessionId stable.
- Interruption double les messages.
- Solution scanne tout le home.

## Maintenance notes

Documenter `provider.history` près du registre. Tout nouveau provider fournit un
loader ou déclare explicitement resume visuel indisponible.
