# Brief — Select custom (tuer les popups natifs macOS)

Lis CLAUDE.md (design contraignant). Le popup natif des <select> (bleu système) casse le style de l'app.

## Tâche
1. Créer src/components/Select.tsx : composant contrôlé réutilisable.
   - Props : { value, onChange, options: {value,label,icon?}[], compact?: boolean, title? }.
   - Fermé : bouton discret (fond transparent ou --bg-ctl selon `compact`, radius --r-s, chevron SVG fin 10px à droite, --fs-l).
   - Ouvert : menu positionné au-dessus/dessous selon la place (position:fixed calculée via getBoundingClientRect), fond var(--bg-pop), border --border2, radius --r-m, box-shadow var(--elev), animation pop-in existante. Option cochée = petite coche SVG à gauche + fond --bg-ctl. Hover = --bg-ctl.
   - Clavier : Escape ferme, flèches naviguent, Enter choisit. Clic dehors ferme.
2. Remplacer TOUS les <select> de src/components/Chat.tsx (provider, modèle, effort, permission dans le composer) et de src/components/Settings.tsx par ce composant. Garder exactement les mêmes valeurs/labels/comportements.
3. CSS dans App.css avec les tokens uniquement.

## Contraintes
- npx tsc --noEmit et npx vite build passent.
- Ne toucher à rien d'autre. Ne pas committer.
