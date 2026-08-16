# Plan 067: Fade par mots du streaming (rendu « Cursor/Claude »)

## Status

- **Priority**: P2 (confort visuel)
- **Effort**: S
- **Risk**: LOW — purement couche d'affichage, zéro contact avec le flux
  d'événements (leçon 066-bis : le lissage vit dans le view-model, jamais
  dans le dispatcher)
- **Planned at**: 2026-08-16, après revert 48722d10

## Why

Le typewriter existe déjà (`useSmoothedStream`, turns.tsx — drainage
proportionnel ~30 Hz, dans la couche d'affichage) et le fondu par BLOC aussi
(`chunk-in`, App.css). Ce qui manque pour la sensation Claude desktop/Cursor :
la révélation **par mots entiers** avec un **fondu d'opacité à l'apparition de
chaque mot**. Vérifié : ChatGPT/Cursor (fade par mots visible), Claude
(cadence + fondu discret), Synara (useDeferredValue seulement — en dessous de
notre 066).

## Design

1. **`useSmoothedStream` : snap au mot** — après le calcul du drainage,
   étendre la révélation jusqu'à la fin du mot en cours (prochain blanc),
   plafonné à +24 caractères pour les runs sans espace (URLs, code). Un mot
   apparaît donc entier, jamais en deux ticks.
2. **`src/lib/rehypeWordFade.ts`** — plugin rehype appliqué UNIQUEMENT au
   dernier bloc pendant le streaming (MdBody) : enveloppe chaque mot des
   nœuds texte dans `<span class="sw">`. Skip : `pre`, `code`, et tout
   élément dont la classe contient `katex`. Les blancs restent des nœuds
   texte nus (copier-coller intact). Les spans sont positionnellement
   stables (append-only) → React ne les remonte pas, l'animation ne rejoue
   jamais sur un mot déjà affiché.
3. **CSS** — `.msg.is-streaming .sw { animation: word-in 220ms ease-out
   both; }` (opacity seule). Neutralisé sous `prefers-reduced-motion`
   (bloc existant) et sous `.no-stream-fade` (réglage).
4. **Réglage** — `streamFade: boolean` (défaut true), toggle dans Réglages
   (motif fontSmoothing : classe racine `no-stream-fade` posée par App.tsx).

Quand un bloc cesse d'être le dernier, il re-rend une fois sans spans (texte
identique, `both` garde opacity:1 → aucun flash). Fin de tour : StreamingText
est remplacé par AssistantText — plus aucun span.

## Test plan

- `useSmoothedStream.test.tsx` : propriété « la révélation tombe sur une
  frontière de mot (ou cible atteinte, ou run > cap) ».
- Test rehypeWordFade : mots wrappés ; rien dans code/pre ; blancs nus.
- `npx tsc --noEmit`, `npx vite build`, vitest chat verts.
- **Validation FINALE : Thierry voit le streaming en vrai (tous providers)
  AVANT tout push** — règle post-066-bis.

## STOP

- Toute modification qui toucherait App.tsx (dispatch), providers, ou
  sidecar → hors périmètre, STOP.
