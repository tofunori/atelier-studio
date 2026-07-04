# Atelier Studio

Application de bureau (Tauri + React + TypeScript) pour discuter avec des agents IA (Claude, Codex) dans une interface de type chat, avec gestion de sessions, pièces jointes, citations et navigation par chapitres épinglables.

## Stack

- **Frontend** : React 19, TypeScript, Vite
- **Desktop** : Tauri 2
- **Sidecar** : processus Node.js (`sidecar/`) qui fait le pont vers les SDK `@anthropic-ai/claude-agent-sdk` et `@openai/codex-sdk` via WebSocket

## Structure

```
src/            Interface React (composer, panneaux, navigation)
src-tauri/      Application Tauri (config, capabilities, build Rust)
sidecar/        Serveur Node (routage, historique, catalogue, annotations)
public/         Assets statiques
design/         Notes et éléments de design
```

## Développement

```bash
npm install
npm run dev        # front seul (Vite, http://localhost:1420)
npm run tauri dev  # app desktop complète
```

Le sidecar a ses propres dépendances :

```bash
cd sidecar
npm install
```

## Build

```bash
npm run build       # build front
npm run tauri build # build de l'application desktop
```

## Tests

```bash
cd sidecar
npm test
```
