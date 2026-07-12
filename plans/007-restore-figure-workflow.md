# Plan 007: Restaurer le workflow scientifique des figures

> **Executor instructions**: charger `/efficient-fable`, lire
> `gallery/AGENTS.md`. Ne pas toucher aux éditeurs diff/LaTeX/code. Le workflow
> doit rester sobre et utiliser les tokens existants.
>
> **Drift check**: `git diff --stat 8a5d0ca..HEAD -- gallery/assets/gallery_template.html gallery/server/routes/core.mjs gallery/tests/test_fullscreen_regression.py gallery/server/tests/parity.mjs`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 005
- **Category**: correctness / research workflow
- **Planned at**: commit `8a5d0ca`, 2026-07-09

## Why this matters

Le serveur lit/écrit encore `workflow`, et le template garde un listener
`.wfsel`, mais variables/fonctions ont disparu. La suite attend quatre états
scientifiques (`draft`, `candidate`, `final`, `rejected`) et échoue. Pour une
thèse, distinguer brouillons, candidats et figures finales est plus utile qu'un
simple favori; ce plan restaure le contrat sans select visible sur chaque carte.

## Current state

- `gallery/server/routes/core.mjs:25-34`: workflow vide par défaut.
- `core.mjs:212-234`: validation/persistance des quatre valeurs.
- `gallery_template.html:503-506`: listener appelle `setWorkflow` absent.
- `gallery_template.html:532-538`: pushState omet workflow.
- `gallery_template.html:561-575`: hydratation omet workflow serveur.
- `gallery_template.html:843-862`: menu carte est l'emplacement prévu.
- test Python lignes 128-166 décrit le contrat; 31/32 passaient à l'audit.

## Product contract

- États: none, draft, candidate, final, rejected.
- Source durable: `.fig_state.json`; localStorage est cache.
- Affectation via menu `…`, pas select permanent.
- Filtre global `Status ▾`, un état actif ou tous.
- Marqueur discret seulement si état défini.
- Changement/clear met à jour UI, localStorage et serveur.
- Noms toujours échappés via `esc`/`escA`.

## Scope

**In scope**: `gallery/assets/gallery_template.html`, test fullscreen Python,
`gallery/server/tests/parity.mjs`, E2E galerie si nécessaire.

**Out of scope**: core serveur sauf bug réel, tags/ratings/collections/compare,
bundle généré, nouveau design/couleur, éditeurs galerie.

## Steps

### 1. Restaurer état/persistance

Près de collections, déclarer `workflow` depuis `figWorkflow`,
`WORKFLOW_STATUSES` value/label, `activeWorkflow`. Créer save/set:

- clear pour none/invalide;
- accepter seulement les quatre valeurs;
- écrire localStorage, appeler pushState, reconstruire chip et render.

Ajouter workflow au JSON pushState. À hydration `/state`, remplacer cache par
valeur serveur validée puis sauvegarder localStorage avant render.

### 2. Ajouter filtre global

Chip/menu près de Collections. `buildWorkflowChip()` affiche Status sans filtre,
label + classe on quand actif, All + quatre états et comptes. Les handlers
basculent activeWorkflow, ferment menu, render. Dans render, filtrer par égalité.

### 3. Affectation menu carte

Dans cardMenu, section Status avec cinq actions `data-wfset`, coche état courant,
handlers DOM après insertion. Supprimer listener `.wfsel` mort. Badge discret
avec classes/tokens, tailles autorisées uniquement.

### 4. Tests

- Python: variables, buildWorkflowChip, data-wfset, push/hydration, absence select.
- Parity: final + invalide, relire state et confirmer persistance.
- Playwright: candidate, filtre, reload, persistance; clear, reload, disparition.

### 5. Gates

```bash
python3 -m unittest discover -s gallery/tests -v
(cd gallery && node server/tests/parity.mjs)
node gallery/server/tests/diff_suite.mjs
(cd gallery && npm run test:e2e)
npx tsc --noEmit
npx vite build
(cd sidecar && npx vitest run)
```

Expected: 32/32 Python, parity ok, 78 diff, E2E vert. Si Playwright absent,
STOP et passer par 008. Puis protocole Tauri et rescan galerie dans app.

## Done criteria

- [ ] Quatre états assignables/supprimables.
- [ ] Filtre Status + comptes.
- [ ] Reload app/serveur conserve état.
- [ ] Payload workflow n'écrase aucune autre clé.
- [ ] 32/32 Python + E2E passent.
- [ ] Aucune copie générée modifiée directement.

## STOP conditions

- Suppression workflow confirmée volontaire.
- Format state migré.
- Nouvelle couleur hors tokens nécessaire.
- Fix implique diff_versions/latex_studio/code_editor.

## Maintenance notes

`pushState` envoie un snapshot complet: toute future clé UI doit être incluse au
payload ou migrée explicitement pour éviter une nouvelle perte silencieuse.
