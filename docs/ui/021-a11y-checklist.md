# 021 — Checklist accessibilité par surface (audit 2026-07-10)

Constats de l'audit complet (sweep src/components + CSS) et statut après la
passe B. Référence de patrons : `ui/IconButton` (label imposé), `ui/Menu`
(rôles + flèches + retour focus), `.msg-actions`/`.row-actions`
(hover ET focus-within), `ui/StatusBadge` (jamais couleur seule).

| Surface | Corrigé (plan 021 B) | Reste (hors périmètre 017-020, à planifier) |
|---|---|---|
| App (global) | Bug de closure du handler Échap (palette/QuickAsk/usage ignorés) ; Échap dans un champ n'interrompt plus le tour | — |
| Workspace headers | `SurfaceHeader` : titre = vrai `h2` (propagé chat/galerie/document/inspecteur) | — |
| Research Home | Nom du projet = `h1` | — |
| Chat | reviewer-bar restructurée (boutons frères rb-main/min/close nommés), reviewer-strip aria-label dynamique, review-badge = bouton (aria-expanded), paste-chip = bouton, verdict interaction = role=status, boucles pulse neutralisées reduced-motion | — |
| Composer | mp-star = bouton frère (plus d'interactif imbriqué), anneau de contexte = bouton focusable (popover au focus), menus +/modèle au clavier (020) | — |
| Sidebar / Rail | Sélecteur couleur/icône factorisé (`ProjectStyleMenu`, boutons nommés, aria-pressed) ; menu contextuel du flyout Rail → primitive Menu (parité Sidebar) | — |
| Settings | Nav aria-current + 2 signaux, Échap, confirmations destructives, InlineNotice (retitle/apiModels/sidecar), select compact ≤880 px, focus-visible page entière, theme-row = bouton | sous-titres de groupes en `h2` (navigation par titres) |
| CommandPalette | combobox complet : role, aria-activedescendant, ids d'options, focus-visible sur l'input | — |
| QuickAsk | bouton réduire nommé | `.qa-busy` aria-label « … » à assainir |
| Banner | role=status (annonce des bannières) | — |
| Focus CSS | `.rename`, `.edit-box textarea`, `.cmdk input`, `.exp-search`, `.fly-rename`, selects biblio/settings, slider — anneau token | — |
| Hover-only | `.biblio-star`, `.qa-inject-one`, `.mp-star`, rb-min/close : visibles au focus | — |
| **Explorer** | — | **surface entière non clavier (arbre 100 % souris) — plan dédié requis** |
| AtelierPane / GitSurface | GitSurface : bouton ⋯ nommé | menus contextuels div onClick (onglets, fichiers git) → migrer vers `ui/Menu` |
| BiblioSurface | — | empty state sans action ; erreurs `.catch(() => {})` silencieuses (avec BrowserTab) |

Reduced-motion : toutes les boucles infinies d'App.css sont désormais
neutralisées (working-spin, skeleton, activity-pulse/step, qa-minidot,
review-badge running, thinking shimmer — en plus de celles déjà couvertes).
