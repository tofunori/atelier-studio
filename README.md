# Atelier Studio

App macOS native (Tauri 2) : chat multi-agents (Claude Agent SDK + Codex SDK) à gauche,
« atelier » scientifique (galerie de figures, éditeur LaTeX/Markdown, annotations PDF,
browser natif, vrai terminal) à droite.

![screenshot](docs/screenshot.png)

## Fonctions

- **Chat** : Claude (Fable/Opus/Sonnet/Haiku) et Codex (GPT-5.5/5.4/mini/Spark), steer/queue,
  stop, fork, édition/revert de messages, chapitres épinglables, goals (`/goal`),
  jauge de contexte (200k/1M), images ⌘V, pièces jointes, reprise de sessions CLI (⤓).
- **Atelier** : galerie de figures (cmux-gallery en mode isolé), onglets fichiers,
  éditeur unifié (LaTeX/Python/Julia + Markdown WYSIWYG), diff des modifications d'agent,
  annotations PDF persistantes, « Add to chat » partout.
- **Browser** natif (webview enfant) et **Terminal** PTY (splits, WebGL, thèmes ANSI).
- **12 thèmes** appliqués à l'app, au terminal et à la galerie.

## Prérequis

| Outil | Pourquoi |
|---|---|
| [Claude Code CLI](https://code.claude.com) ≥ 2.1.139, connecté (`claude login`) | moteur Claude (sessions, skills, goals, mémoire) |
| [Codex CLI](https://developers.openai.com/codex) connecté (`codex login`) | moteur Codex |
| Node.js ≥ 20 | sidecar (agents + terminal) |
| Python 3 + clone de [cmux-gallery](https://github.com/tofunori/atelier) dans `~/Documents/cmux-gallery` | galerie de figures (chemin configurable dans Réglages) |

## Installation (beta)

1. Télécharger le `.dmg` de la [dernière release](../../releases).
2. Glisser Atelier dans Applications.
3. App non signée : `xattr -cr /Applications/Atelier.app` puis ouvrir.

## Développement

```bash
npm install && (cd sidecar && npm install)
npm run tauri dev     # dev
npm run tauri build   # bundle production (stage le sidecar dans les ressources)
```

Le bundle embarque le sidecar Node (45 Mo, prod-only) ; les CLIs Claude/Codex du
système sont utilisés (pas de binaires embarqués). Espace de ports galerie : 18790-19789
(isolé de cmux).

## Limitations connues (beta)

- macOS Apple Silicon seulement.
- Steer Codex indisponible (limite du SDK TypeScript — queue seulement).
- L'historique Codex est reconstruit depuis les rollouts (`~/.codex/sessions`).
- Annotations PDF stockées à côté du fichier (`.fig_thumbs/pdf_annots.json`), pas gravées dans le PDF.
