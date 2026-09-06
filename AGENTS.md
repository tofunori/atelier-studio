# Atelier Studio — instructions agents

## App, runtime, build, galerie et diagnostic

Avant toute intervention dans ces domaines, lire et suivre intégralement
[le protocole de relance](docs/agent-reference/atelier-runtime.md). Cette référence
fait partie des instructions obligatoires : commandes, critères de réussite,
arrêts sur échec, nettoyage, worktrees, shadcn et diagnostic TCC sont conservés.

- Avant de déclarer une modification de l’app terminée, valider le `.app` du bon
  worktree avec ce protocole. Documents/plans seuls : aucun rebuild ni relancement.
- Les agents utilisent `npm run tauri:build:app`, jamais `npm run tauri dev`.
  Arrêter l’app, les sidecars et les serveurs galerie avant le build ; vérifier
  le chemin du processus `tauri-app` après relance. Pas de simple `open`.
- Modifier `gallery/`, jamais `src-tauri/gallery-dist/`. DMG uniquement pour une
  release explicite, depuis le checkout principal sur `main`.
- Garder un `target/` par worktree ; ne pas contourner le verrou de build.
  Lire l’aperçu avant `rust:targets:prune -- --apply`.
- Ne jamais écrire dans le bundle `.app` au chargement d’un module sidecar.

## Primitives shadcn

Avant création, utilisation ou mise à jour : lire
[le skill projet](.agents/skills/shadcn/SKILL.md) et la section « Workflow shadcn/ui »
du protocole. Conserver `tw`, Precision Native, absence de Preflight et a11y.
Ne pas utiliser `--overwrite`, `--force` ou `add --all` sans demande explicite.
Ne pas modifier la configuration MCP globale sans autorisation explicite.
