# P0 Report — Plan 057 Sessions liées MCP

**Date** : 2026-07-20  
**Worktree** : `/Users/tofunori/Documents/atelier-studio/.worktrees/plan-057-sessions-liees-mcp`  
**Branch** : `plan/057-sessions-liees-mcp`  
**Base** : `25f1b397` (main)

## Versions providers

| Provider | Binary | Version |
|---|---|---|
| Claude Code | `~/.local/bin/claude` | 2.1.215 |
| Codex | `~/.local/bin/codex` | codex-cli 0.144.1 |
| Kimi | `~/.kimi-code/bin/kimi` | 0.27.0 |
| Grok | `~/.grok/bin/grok` | 0.2.106 |
| OpenCode | `~/.opencode/bin/opencode` | 1.18.3 |

## Porte P0 — résultat

| Check | Résultat |
|---|---|
| Claude lance un MCP distinct par session via `--mcp-config` + env | **PASS** |
| Codex lance un MCP distinct par thread via `config.mcp_servers` sur un app-server partagé | **PASS** |
| Capabilities/env non confondues entre threads | **PASS** |
| PIDs MCP distincts | **PASS** |
| Aucune écriture dans `~/.codex` / `~/.claude` globales | **PASS** |
| Config Claude mode `0600` | **PASS** |

## Preuves

- `fixtures/codex-p0-report.json` — `ok: true`, `distinctCaps`, `distinctPids`
- `fixtures/codex-thread-start-mcp.json` — forme JSON-RPC expurgée
- `fixtures/claude-p0-report.json` — `ok: true`
- `fixtures/claude-mcp-config.json` — forme `--mcp-config`
- `markers/codex-thread-A.jsonl`, `markers/codex-thread-B.jsonl`
- `markers/claude-thread-A.jsonl`, `markers/claude-thread-B.jsonl`

## Chemin d'injection retenu

### Claude
```
claude --strict-mcp-config --mcp-config <AppSupport/mcp-configs/<hash>.json>
```
Fichier JSON `mcpServers.<name>.{command,args,env}`, mode `0600`, répertoire `0700`.

### Codex (app-server partagé)
```json
{
  "method": "thread/start" | "thread/resume",
  "params": {
    "config": {
      "mcp_servers": {
        "atelier-sessions": {
          "command": "<path atelier-agent-mcp>",
          "args": [],
          "env": {
            "ATELIER_MCP_ENDPOINT": "http://127.0.0.1:<port>/internal/agent-mcp",
            "ATELIER_MCP_CAPABILITY": "<opaque>",
            "ATELIER_MCP_CALLER_LABEL": "Codex"
          }
        }
      }
    }
  }
}
```
Preuve : `mcpServerStatus/list` avec `threadId` voit le serveur ; markers prouvent env distincte.

**Note** : l'override `mcp_servers` fusionne avec la config utilisateur globale (les autres MCP restent). Seul le serveur nommé `atelier-sessions` doit recevoir la capability thread-scoped.

## SDK Rust MCP

- Crate crates.io : **`rmcp` 2.2.0** (verrouillé dans Cargo.lock)
- Transport : stdio
- Pas de dépendance Git flottante

## STOP conditions

Aucune condition STOP P0 déclenchée. Codex supporte bien une capability distincte par thread sur l'app-server partagé.
