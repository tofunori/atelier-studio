# Atelier Studio — design v1

Date : 2026-07-04 · Statut : validé en brainstorming avec Thierry

## But

App macOS native (style Synara) : chat multi-provider (Claude, Codex) à gauche,
galerie **atelier** (cmux-gallery) à droite, sidebar projets → threads. Permet de
piloter des agents sur un projet tout en voyant ses figures/artefacts en direct.

## Layout

Fenêtre à 3 zones, splits redimensionnables :

```
┌──────────┬──────────────────────┬──────────────────────┐
│ Sidebar  │  Chat agent          │  Atelier (galerie)   │
│ Projets  │  bulles, markdown,   │  webview intégrée,   │
│  └ alo ⟳ │  blocs outils        │  masquable (⌘⇧A),    │
│  └ alo   │  input + dropdown    │  redimensionnable    │
│          │  provider/modèle     │                      │
└──────────┴──────────────────────┴──────────────────────┘
```

- Sidebar : projets épinglés → threads dessous ; spinner sur threads actifs ;
  badge sur threads terminés non lus.
- Chat : UI propre (pas de terminal) — bulles, markdown, blocs d'appels d'outils
  repliables ; input avec dropdown provider (Claude / Codex) et modèle.
- Atelier : panneau webview pleine hauteur, escamotable pour chat plein écran.

## Stack

- **Tauri 2** — shell macOS (~10 Mo), fenêtre native, WKWebView.
- **Frontend** — React + `react-resizable-panels` ; rendu markdown du chat.
- **Sidecar Node** (spawné par Tauri) — héberge `@anthropic-ai/claude-agent-sdk`
  et `@openai/codex-sdk` derrière une interface commune :

  ```ts
  interface AgentProvider {
    start(project: string, opts): ThreadHandle
    send(threadId, message): void          // streame les events
    cancel(threadId): void
    resume(sessionId): ThreadHandle
  }
  ```

  Transport sidecar ↔ frontend : WebSocket local (ou stdio JSON-lines).
- **Auth** : réutilise les logins CLI existants (`claude`, `codex`) — aucune clé
  API gérée par l'app.
- **Atelier** : l'app exécute `python3 ~/Documents/cmux-gallery/cmux_gallery.py run`
  dans le projet ouvert (serveur réutilisé s'il tourne ; port stable 8790-9789
  dérivé du chemin), puis pointe la webview sur l'URL. Aucune modification
  d'atelier lui-même.
- Piège connu macOS : hydrater le PATH du login shell dans le sidecar et les
  spawns (les apps GUI ont un env strippé).

## Projets et threads

- **Sélecteur de projet unifié** : ouvrir un dossier ⇒ (1) serveur atelier lancé
  pour ce projet, (2) cwd des agents = ce dossier.
- **Threads multiples en parallèle** par projet ; chaque thread = une session SDK
  (`session_id`) ; le sidecar multiplexe les streams.
- **Persistance** : les sessions vivent déjà côté SDK (`~/.claude/projects/*`,
  équivalent Codex) ; l'app garde un index local (JSON ou SQLite) :
  projet → threads {titre, provider, session_id, statut, dernier message}.
- Reprendre un thread = `resume(session_id)`.
- **Permissions** : v1 = toggle « full access » par thread ; prompts fins plus tard.

## Providers v1

Claude **et** Codex dès la v1, via le dropdown. Architecture `AgentProvider`
prête pour Grok/OpenCode plus tard.

## Hors scope v1

Worktrees par agent, diff viewer riche, Grok/OpenCode, notifications système,
auto-update, multi-fenêtres, prompts de permission fins.

## Critères de succès

1. Ouvrir un projet ⇒ atelier s'affiche à droite en < 5 s.
2. Deux threads (un Claude, un Codex) streament en parallèle sans se bloquer.
3. Fermer/rouvrir l'app ⇒ les threads réapparaissent et se reprennent (resume).
4. Une figure régénérée par l'agent apparaît dans atelier après refresh du panneau.
