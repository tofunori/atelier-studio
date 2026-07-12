# Plan 004: Rendre Atelier reproductible depuis l'index Git

> **Executor instructions**: exécuter uniquement ce plan. Charger
> `/efficient-fable`, lire `AGENTS.md` et `CLAUDE.md`, préserver tous les
> changements existants. Ne pas recréer les fichiers présents: les vérifier puis
> les intégrer tels quels s'ils correspondent aux usages actuels.
>
> **Drift check**: `git diff --stat 8a5d0ca..HEAD -- sidecar/index.mjs sidecar/highlights.mjs sidecar/highlights.test.mjs sidecar/mermaid.test.mjs .gitignore scripts/stage-sidecar.sh`
> STOP si un extrait fonctionnel ci-dessous ne correspond plus au code.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness / DX
- **Planned at**: commit `8a5d0ca`, 2026-07-09

## Why this matters

`sidecar/index.mjs` importe `./highlights.mjs`, mais ce module et ses tests ne
sont pas dans l'index Git. La machine actuelle fonctionne parce que les fichiers
existent localement; un clone ou une release peut être incomplet. Ce plan rend
le dépôt reproductible et élimine le bruit généré qui masque les vrais oublis.

## Current state

- `sidecar/index.mjs:12` importe `HighlightStore` depuis `./highlights.mjs`.
- `sidecar/highlights.mjs` contient le store durable utilisé par les routes
  `addHighlight`, `removeHighlight`, `listHighlights`.
- `sidecar/highlights.test.mjs` couvre store, routes et contexte de sélection.
- `sidecar/mermaid.test.mjs` couvre les helpers de `MermaidBlock.tsx`.
- `scripts/stage-sidecar.sh:7` copie `sidecar/*.mjs`; ne pas le modifier si cette
  hypothèse reste vraie.
- `.gitignore` n'ignore pas `.fig_thumbs/`, `generated/` et `diff_test.*` racine.

## Scope

**In scope**:
- `.gitignore`
- `sidecar/highlights.mjs`
- `sidecar/highlights.test.mjs`
- `sidecar/mermaid.test.mjs`

**Out of scope**:
- modification fonctionnelle de HighlightStore ou MermaidBlock;
- `.claude/`;
- suppression des artefacts existants;
- `src-tauri/sidecar-dist/`, `src-tauri/gallery-dist/`;
- commit, push ou nettoyage global.

## Steps

### 1. Confirmer les sources locales

```bash
node --check sidecar/highlights.mjs
(cd sidecar && npx vitest run highlights.test.mjs mermaid.test.mjs)
```

Expected: exit 0. Si une dépendance runtime supplémentaire est non versionnée,
STOP et la lister.

### 2. Ajouter uniquement les ignores avérés

Ajouter, sous un commentaire `# Local research/build artifacts`:

```gitignore
/.fig_thumbs/
/generated/
/diff_test.*
```

Ne jamais ajouter `*.pdf`, `*.tex` ou `*.json`: ce sont des sources possibles.

```bash
git check-ignore -v .fig_thumbs/board.tldr.json generated/ diff_test.pdf
```

Expected: trois correspondances issues des nouvelles lignes.

### 3. Intégrer uniquement les fichiers in-scope

```bash
git add .gitignore sidecar/highlights.mjs sidecar/highlights.test.mjs sidecar/mermaid.test.mjs
git diff --cached --check
git ls-files --error-unmatch sidecar/highlights.mjs sidecar/highlights.test.mjs sidecar/mermaid.test.mjs
```

Ne pas utiliser `git add .` ou `git add -A`. Si staging interdit, STOP et ne pas
prétendre que le dépôt est reproductible.

### 4. Prouver le build depuis l'index

```bash
tmp="$(mktemp -d)"
tree="$(git write-tree)"
git archive "$tree" | tar -x -C "$tmp"
(cd "$tmp" && npm ci && (cd sidecar && npm ci) && npx tsc --noEmit && npx vite build && (cd sidecar && npx vitest run))
rm -rf "$tmp"
```

Expected: tout passe sans lire de fichier du worktree original.

### 5. Gate application

Suivre exactement les vérifications, kill, build, relance et contrôle de process
de `AGENTS.md`. Vérifier dans le bundle:

```bash
test -f src-tauri/target/release/bundle/macos/Atelier.app/Contents/Resources/sidecar/highlights.mjs
```

## Test plan

- Ciblé: `highlights.test.mjs`, `mermaid.test.mjs`.
- Global: ≥19 fichiers / ≥195 tests sidecar verts.
- Archive de `git write-tree` construite avec succès.
- Smoke UI: créer/supprimer un surlignage, relancer, vérifier persistance.

## Done criteria

- [ ] Trois fichiers sidecar reconnus par `git ls-files`.
- [ ] Seuls les artefacts racine ciblés sont ignorés.
- [ ] Build depuis index passe.
- [ ] Gates globales et app buildée passent.
- [ ] Aucun artefact utilisateur supprimé.

## STOP conditions

- Un fichier contient un secret ou une donnée utilisateur.
- Une autre source runtime est absente de l'index.
- Le build depuis index exige un fichier hors scope.
- Le staging contient un fichier non listé.

## Maintenance notes

Toute nouvelle source runtime sidecar doit être couverte par la preuve de build
depuis l'index; le plan 008 l'automatisera.
