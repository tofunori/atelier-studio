# Captures — tours de chat et composer (plan 020)

Banc déterministe `#chatbench` (chunk lazy monté par `main.tsx`, fixtures
figées, aucun sidecar — mêmes garanties que `#uibench`/`#navbench`). Moteur :
Playwright WebKit (`scripts/capture_chatbench.cjs`), viewports exacts.
« Avant » = worktree temporaire à `7ed0eab` (base de la tranche, 024 incluse)
avec le même banc et les mêmes fixtures.

États : `#chatbench` (tour riche : outils, table, capsule), `-running`,
`-error`, `-contexts` (6 contextes dont nom long et groupe ×2), `-markdown`
(Mermaid + code), `-light`.

| Capture | Avant | Après |
|---|---|---|
| Tour riche 1512×883 dark | `avant-rich-1512-dark.png` | `apres-rich-1512-dark.png` |
| Tour riche 1512×883 light | `avant-rich-1512-light.png` | `apres-rich-1512-light.png` |
| Tour riche 1280×800 | `avant-rich-1280-dark.png` | `apres-rich-1280-dark.png` |
| Tour riche 800×600 | `avant-rich-800-dark.png` | `apres-rich-800-dark.png` |
| Running 1280×800 | `avant-running-1280-dark.png` | `apres-running-1280-dark.png` |
| Erreur 800×600 | `avant-error-800-dark.png` | `apres-error-800-dark.png` |
| Composer 6 contextes | `avant-contexts-1512-dark.png` | `apres-contexts-1512-dark.png` |
| Mermaid + code + table | `avant-markdown-1512-dark.png` | `apres-markdown-1512-dark.png` |
| Activité dépliée | `avant-activity-open.png` | `apres-activity-open.png` |
| Popover modèle (+ effort) | `avant-model-menu.png` | `apres-model-menu.png` |

Différences structurantes visibles : header « Activité · N étapes · durée »
aligné sur la colonne de lecture (avant : « A travaillé 45s ▸ » collé au bord
gauche), capsule résultat unifiée (statut · tokens · coût · Annuler le tour ·
Vérifier · N fichiers modifiés — avant : lignes éparses sans usage), effort
retiré de la barre (résumé « · Auto (défaut) » dans le bouton modèle, réglage
dans le popover), chevrons texte remplacés par des SVG trait fin.

Les heures relatives sont calculées au chargement du banc : stables pour une
capture, pas identiques au pixel entre deux exécutions.
