# Plan 066: Rendu markdown du chat — stabilité de stream + densité éditeur

> **Executor instructions**: suis pas à pas, vérifie chaque étape, STOP =
> arrêt + rapport. Ne touche pas à plans/README.md. Commits sur
> `advisor/066-markdown-chat`. Référence design : l'artefact de la session
> (tableau §03) est résumé ici — ce plan est autosuffisant.
> **Drift check**: `git diff --stat HEAD~5..HEAD -- src/components/chat/md.tsx src/App.css src/components/chat/ChatTimeline.tsx`

## Status
- Priority P1 · Effort M-L · Risk MED · Depends on: none · Planned 2026-08-16

## Why
Pendant le stream, tout le message re-parse à chaque chunk : le markdown
incomplet s'affiche brut puis « snappe » en élément stylé (gras, fences,
listes) → la hauteur change → le séparateur du Working « respire » (bug
opérateur, reproduit dans l'artefact rendu-markdown-chat). En prime, la prose
du chat n'a presque pas de feuille dédiée (2 familles de classes).

## Current state
- `src/components/chat/md.tsx` — rendu via react-markdown 10 + remark-gfm/math,
  re-rendu au message entier. `ChatTimeline.tsx`/`toolPresentation.tsx` ont des
  chemins `dangerouslySetInnerHTML` (mermaid etc.) — HORS SCOPE, ne pas toucher.
- `src/App.css` ~399-408 : `.working*` (déjà `flex`+`min-height:20px`, garder).
- `src/App.tsx` : les chunks texte arrivent par événements WS et mettent l'état
  à jour immédiatement (pas de coalescing).

## Livrables (4 lots, commits séparés)

### L1 — Pile de stabilité dans md.tsx
1. Découpage du markdown en BLOCS (split `\n\n+` conscient des fences : un
   `\n\n` DANS un bloc de code ne coupe pas) ; composant `MdBlock` mémoïsé
   (`React.memo`, clé = index, egalité = texte du bloc). Seul le dernier bloc
   re-parse pendant le stream.
2. Réparation du bloc de queue AVANT parsing, pendant le stream seulement
   (prop `streaming`) : auto-fermer `**`, `*`, `` ` ``, fences ```` ``` ````,
   liens `[…](` tronqués — implémenter en TS (~40 lignes, inspiration
   Streamdown/remend, PAS de nouvelle dépendance npm).
3. Dans App.tsx : coalescer les mises à jour de texte streamé au
   `requestAnimationFrame` (un seul setState par frame et par thread).

### L2 — Feuille de prose « densité éditeur » (App.css)
Nouvelle famille `.chat-md` appliquée par md.tsx : corps 13px/1.6 ;
h1→h2→h3 mappés 15/15/13px poids 600 letter-spacing -0.01em (hiérarchie par
graisse, jamais de taille display) ; listes marker `--text-disabled` ;
inline code fond `--bg-ctl` + bordure douce rayon 4 ; bloc de code fond
`--surface-sunken` bordure `--border` rayon 10 avec EN-TÊTE (langage 11px
mono muted + bouton copier IconButton) — composant `CodeBlock` dans md.tsx,
jamais de fond sombre inversé ; tableaux : th 11px muted, filets internes
55%, `tabular-nums` ; blockquote filet 2px `--border` texte
`--text-secondary` ; hr = 1px `--border`. Accent orange : liens/focus
UNIQUEMENT. Tout en variables du thème, AUCUN hex nouveau.

### L3 — Géométrie verrouillée
`.chat-thread` (ou conteneur du fil — le localiser) : `overflow-anchor:auto`
sur le scroller, `overflow-anchor:none` sur le dernier tour en stream ;
`content-visibility:auto; contain-intrinsic-size:auto 200px;` sur les tours
HORS écran (classe posée par ChatTimeline si simple, sinon CSS pur sur
`.turn:not(:last-child)` — mesurer avant/après que le scroll reste correct).

### L4 — Test de non-régression du jitter
Test (vitest jsdom OU e2e playwright si un harnais chat existe — sinon test
unitaire de md.tsx) : streamer un markdown piégé (gras ouvert, fence, liste,
tableau) chunk par chunk et vérifier : (a) les blocs clos rendent un HTML
STRICTEMENT identique d'un chunk au suivant (innerHTML comparé) ; (b) la
réparation ferme bien gras/fence sur la queue ; (c) réparation coupée quand
`streaming=false`. + tests unitaires de la fonction de réparation (~8 cas).

## Vérifs globales
`npx tsc --noEmit` ; `npx vite build` ; `npx vitest run` (toute la suite front
— le chat a des tests de caractérisation qui NE DOIVENT PAS casser : si un
test existant échoue à cause d'un changement de DOM markdown, adapte le test
SEULEMENT si le changement est voulu par ce plan, et documente-le).

## Scope
IN : md.tsx, App.css, App.tsx (coalescing), ChatTimeline.tsx (classe
containment si nécessaire), nouveaux tests.
OUT : toolPresentation.tsx, MermaidBlock, le contrat WS/provider (pas de
smoothStream), turnParts.tsx (Working est déjà corrigé), tout .mjs.

## STOP
- Le découpage en blocs casse les maths remark-math ou le mermaid → rapporte.
- Plus de 3 tests de caractérisation existants exigent une adaptation.
- Le coalescing rAF perturbe l'ordre des événements (thinking vs texte).
