# Atelier Studio — instructions agents

## Portée et autorisations

- Préserver les modifications présentes et le travail des autres agents. Ne pas
  nettoyer, réinitialiser, committer, pousser, installer ou publier hors de la
  portée demandée.
- Une demande de modification autorise les changements locaux et les contrôles
  proportionnés nécessaires. Elle n’autorise pas une release, un DMG, une
  mutation externe, ni l’arrêt ou le remplacement d’une instance Atelier déjà
  ouverte.
- Poursuivre sans confirmation pour les choix réversibles dans la portée. Demander
  seulement avant d’arrêter/remplacer une instance ouverte, sauf autorisation déjà
  donnée dans la session, ou si une information manquante change réellement le but.

## App, runtime, build, galerie et diagnostic

- Avant de préparer un build ou une relance, lire et suivre la
  [procédure actuelle](docs/agent-reference/atelier-runtime.md). Pour un diagnostic
  runtime, charger seulement la référence correspondant au symptôme; les invariants
  ci-dessous suffisent avant une petite modification locale.
- Documents et plans seuls : aucun rebuild ni relance; les contrôles ciblés de
  liens, syntaxe ou structure restent permis.
- Les agents utilisent `npm run tauri:build:app`, jamais `npm run tauri dev` ni un
  build Tauri direct. Ne pas contourner le verrou et garder un `target/` par
  worktree.
- Avant de déclarer une modification applicative terminée, effectuer les contrôles
  proportionnés, construire le `.app` du bon worktree, vérifier le chemin du
  processus `tauri-app`, puis exercer le comportement demandé dans ce bundle.
  Si une étape est impossible, rapporter précisément la limite de validation.
- Modifier `gallery/`, jamais `src-tauri/gallery-dist/`. DMG uniquement pour une
  release explicitement demandée, depuis le checkout principal sur `main`.
- Lire l’aperçu avant `npm run rust:targets:prune -- --apply`. Ne jamais écrire
  dans le bundle `.app` au chargement d’un module sidecar.

## Primitives shadcn et Base UI

- Avant d’ajouter, mettre à jour ou migrer une primitive, lire le
  [skill shadcn du projet](.agents/skills/shadcn/SKILL.md). Lire aussi
  [migrate-radix-to-base](.agents/skills/migrate-radix-to-base/SKILL.md) seulement
  pour une migration Radix vers Base UI explicitement demandée.
- Conserver le préfixe Tailwind `tw`, Precision Native, l’absence de Preflight et
  l’accessibilité. Ne pas utiliser `--overwrite`, `--force` ou `add --all` sans
  demande explicite, ni modifier la configuration MCP globale depuis ce dépôt sans
  demande explicite.
