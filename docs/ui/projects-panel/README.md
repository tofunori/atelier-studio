# Captures — panneau Projets / Research Navigator (plan 024)

Banc déterministe `#navbench` (chunk lazy monté par `main.tsx`, fixtures figées,
aucun sidecar requis — même garanties que `#uibench`/`#homebench`). Moteur de
capture : Playwright WebKit (même famille que la WKWebView Tauri), viewports
exacts. « Avant » = worktree temporaire à `7b167d2` (état pré-tranche) avec le
même banc et les mêmes fixtures.

États du banc : `#navbench` (riche : 10 conversations, running, unread, actif,
favoris), `-empty`, `-unscoped`, `-light`, largeurs `-w220`/`-w180`.

| Capture | Avant | Après |
|---|---|---|
| 1512×883 dark | `avant-1512-dark.png` | `apres-1512-dark.png` |
| 800×600 dark | `avant-800-dark.png` | `apres-800-dark.png` |
| 1512×883 light | `avant-1512-light.png` | `apres-1512-light.png` |
| Chats sans projet (800) | `avant-800-unscoped.png` | `apres-800-unscoped.png` |
| Projet vide (800) | `avant-800-empty.png` | `apres-800-empty.png` |
| Panneau 220 px | `avant-w220.png` | `apres-w220.png` |
| Panneau 180 px | `avant-w180.png` | `apres-w180.png` |
| Hover ligne (slot 48 px) | `avant-hover-row.png` | `apres-hover-row.png` |
| Menu overflow header | — (n'existait pas) | `apres-overflow-menu.png` |

## Contrôles programmatiques (script `scripts/capture_navbench.cjs`)

| Contrôle | Avant | Après |
|---|---|---|
| Bounding box du titre stable au hover (layout shift) | **false** (titre décalé de 50 px) | **true** |
| Bounding box de la ligne stable au hover | true | true |
| `prefers-reduced-motion` : animation de l'arc running | **arcSpin (tournait encore)** | none |
| `--motion-fast` sous reduced motion | 0ms | 0ms |

Les heures relatives (« 1h », « 1j ») sont calculées au chargement du banc :
stables pour une capture, pas identiques au pixel entre deux exécutions.
