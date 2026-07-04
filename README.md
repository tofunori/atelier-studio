# Atelier Studio

Application de bureau (Tauri + React + TypeScript) pour discuter avec des agents IA (**Claude** via `@anthropic-ai/claude-agent-sdk`, **Codex** via `@openai/codex-sdk`) dans une interface façon chat, avec sessions persistantes, pièces jointes, citations et navigation par chapitres épinglables.

## Architecture

L'app est composée de deux processus qui communiquent en WebSocket :

```
┌─────────────────────────┐        WS (localhost, port aléatoire)        ┌──────────────────────────┐
│  Frontend (React/Vite)  │ <──────────────────────────────────────────> │  Sidecar (Node.js)       │
│  fenêtre Tauri           │                                              │  spawné par l'app Tauri  │
└─────────────────────────┘                                              └──────────────────────────┘
                                                                                    │
                                                                     ┌──────────────┴───────────────┐
                                                                     │                               │
                                                          @anthropic-ai/claude-agent-sdk   @openai/codex-sdk
```

- **Tauri (Rust, `src-tauri/`)** : shell natif de l'app, lance le sidecar au démarrage et affiche la fenêtre webview.
- **Frontend (`src/`)** : interface React — liste des threads, zone de chat, panneau latéral, rail de navigation par chapitres.
- **Sidecar (`sidecar/`)** : petit serveur Node autonome (`ws`) qui route les messages du frontend vers le bon provider IA, gère la persistance des threads sur disque, l'historique, le catalogue de commandes/fichiers du projet, et surveille les annotations.

### Protocole WebSocket (sidecar)

Le sidecar écoute sur `127.0.0.1:<port>` (port choisi dynamiquement, imprimé en JSON au démarrage : `{"port": ...}`). Messages `type` gérés côté serveur (`sidecar/router.mjs`) :

| type | rôle |
|---|---|
| `send` | envoie un prompt à un thread (crée le thread si besoin), stream la réponse via des events `event` |
| `interrupt` | interrompt le run en cours d'un thread |
| `revert` | rewind d'une session Claude à un point antérieur (`resumeSessionAt`) |
| `listThreads` / `getHistory` | liste des threads / historique complet d'un thread Claude |
| `renameThread` / `deleteThread` | gestion des threads |
| `listCommands` / `listFiles` | catalogue des commandes slash et fichiers du projet courant (pour l'autocomplétion) |
| `saveImage` | sauvegarde une image collée (⌘V, dataURL) sur disque et renvoie le chemin |
| `ping` | health check |

Deux modes de streaming selon le provider :
- **Claude** : session persistante avec *steering* natif du SDK (priorité `now`/`next`) — les messages peuvent interrompre ou s'enchaîner sur un run en cours.
- **Codex** : pas de steering ; les messages envoyés pendant un run sont mis en file d'attente (`pending`) et partent au tour suivant.

### Persistance

- Threads : `~/Library/Application Support/atelier-studio/threads.json` (`sidecar/store.mjs`)
- Images collées : `~/Library/Application Support/atelier-studio/pasted/`
- Historique des sessions Claude : lu directement depuis les logs de session du SDK (`sidecar/history.mjs`)

## Stack

- **Frontend** : React 19, TypeScript, Vite 7
- **Desktop** : Tauri 2 (Rust)
- **Sidecar** : Node.js (ESM), `ws`, SDK Claude et Codex
- **Markdown** : `react-markdown`
- **Layout** : `react-resizable-panels`

## Structure du dépôt

```
src/
  App.tsx              point d'entrée React
  components/
    Sidebar.tsx         liste des threads / navigation
    Chat.tsx             zone de conversation, composer, pièces jointes
    AtelierPane.tsx       panneau de travail (contenu, fichiers, etc.)
    Rail.tsx              rail latéral de navigation par chapitres épinglés
  lib/ws.ts              client WebSocket vers le sidecar

src-tauri/
  src/                  code Rust (spawn du sidecar, commandes Tauri)
  capabilities/         permissions Tauri
  tauri.conf.json       config de l'app (fenêtre, bundle, identifiant)

sidecar/
  index.mjs             serveur WebSocket, entrée du processus
  router.mjs            dispatch des messages (send/interrupt/revert/...)
  store.mjs             persistance des threads (JSON)
  history.mjs           lecture de l'historique des sessions Claude
  catalog.mjs           liste des commandes slash / fichiers du projet
  annotations.mjs       watcher de fichiers d'annotations
  providers/
    claude.mjs           intégration @anthropic-ai/claude-agent-sdk (steering, sessions)
    codex.mjs            intégration @openai/codex-sdk (fire-and-forget + file d'attente)

design/                 notes et éléments de design
public/                 assets statiques
```

## Développement

Installer les dépendances (front + sidecar) :

```bash
npm install
cd sidecar && npm install && cd ..
```

Lancer en dev :

```bash
npm run tauri dev   # app desktop complète (front + sidecar + fenêtre native)
npm run dev          # front seul (Vite, http://localhost:1420) — sans sidecar ni fenêtre native
```

## Build

```bash
npm run build        # build du front (tsc + vite build) → dist/
npm run tauri build  # bundle de l'application desktop (dmg/app sur macOS)
```

## Tests

```bash
cd sidecar
npm test   # vitest : router.test.mjs, store.test.mjs
```

## Prérequis

- Node.js
- Rust + toolchain Tauri (pour `npm run tauri dev/build`)
- Clés API configurées pour les SDK Claude / Codex (variables d'environnement standard de chaque SDK)
