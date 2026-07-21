# Plan 057 — Handoff d'implémentation (Grok → Codex)

**Worktree** : `/Users/tofunori/Documents/atelier-studio/.worktrees/plan-057-sessions-liees-mcp`  
**Branche** : `plan/057-sessions-liees-mcp`  
**Base** : `25f1b397`  
**Ne pas fusionner / ne pas pousser** — revue Codex attendue.

## P0 — PASS

| Check | Résultat |
|---|---|
| Claude MCP distinct par session (`--mcp-config` + env) | PASS |
| Codex MCP distinct par thread sur app-server partagé (`config.mcp_servers`) | PASS |
| Capabilities non confondues | PASS |
| SDK MCP | shim stdio maison (pas de dep Git) ; binaire `atelier-agent-mcp` |

Preuves : `plans/057-p0-probes/` (P0-REPORT.md, fixtures, markers).

## Implémenté

### Rust
- `AgentLink` typé sur `Thread` + index parent→enfants
- `createLinkedThread` / `unlinkThread` WS
- move bloqué si lié ; delete détache / révoque
- Capability registry (hash only) + `POST /internal/agent-mcp` loopback
- Projection journal expurgée + enveloppe premier tour
- Mailbox durable (`agent-mailbox.json`) + drain worker + budget/hop
- Binaire `atelier-agent-mcp` (stdio, outil unique `atelier_sessions`)
- Injection Claude (`--strict-mcp-config` + fichier 0600) et Codex (`config.mcp_servers`)
- Injection ACP Kimi/Grok/OpenCode (`mcpServers`)
- Staging script : `atelier-agent-mcp` dans `BIN_NAMES`
- Node router : refus `feature_requires_rust_backend` pour create/unlink

### Frontend
- Types `agentLink` + `agent_message`
- Compactage harness `messageId`
- Menu sidebar : ajouter / délier / voir parent
- `LinkedAgentDialog`, `LinkedAgentCapsule`, `AgentMessageCard`
- i18n FR/EN

## Tests exécutés (ce worktree)

```
cargo test -p atelier-store -p atelier-runtime -p atelier-providers   # verts
cargo build -p atelier-agent-mcp --release                            # ok
npx tsc --noEmit                                                      # ok
atelier-agent-mcp initialize (stdio)                                  # ok
```

## Non fait / limites (pour la revue)

1. **Validation visuelle app `.app`** non exécutée (protocole AGENTS.md complet non relancé ici — laisser à Codex / Thierry pour soak providers réels).
2. **stage-rust-server.sh** pas rejoué jusqu'au bundle app (binaire release MCP buildé localement dans `rust/target/release/`).
3. **Capsule header** branchée partiellement (composant prêt, intégration header chat à peaufiner si le header de la branche diverge).
4. **Sidebar indentation parent/enfant** minimale (menu seulement ; indent visuelle légère optionnelle).
5. **Métriques `/health` agrégées** (compteurs plan § Observabilité) non exposées.
6. **Agents payants réels** Claude→Codex→report→unlink non rejoués (STOP 10 — consentement).
7. Delivery mailbox via worker `handle_send` : implémentée ; soak concurrence writer lock à valider en app.

## Verdict par couche

| Couche | Statut |
|---|---|
| P0 sondes | **validé providers réels** (sans prompt modèle facturé pour Codex ; Claude kill après init MCP) |
| Types / store / liens | **implémenté + testé fixture** |
| Bridge / capability | **implémenté + testé fixture** (auth tests unitaires partiels) |
| MCP binaire | **implémenté + smoke stdio** |
| Projection / enveloppe | **implémenté + testé fixture** |
| Injection Claude/Codex | **implémenté** (code path) ; **fixture P0** prouve le mécanisme |
| UX création | **implémenté** |
| Mailbox / scheduler | **implémenté** ; soak app **reste à faire** |
| Parité ACP | **injection code** ; annonce support = true pour CLI MCP-capable |
| Bundle `.app` | **reste à faire** |

## Fichiers clés

Voir `git status` / `git log` sur la branche. Commits locaux dans le worktree uniquement.
