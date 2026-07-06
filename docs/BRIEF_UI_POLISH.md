# Brief — UI polish niveau Codex app

Objectif : amener le fil de chat et le système visuel au niveau de l'app Codex d'OpenAI. STYLE SOBRE STRICT : pas d'emojis colorés, icônes SVG monochromes fines, pas de gradients.

## 1. Tokens de design (src/App.css)
- Échelle typo UNIQUE : --fs-xs:10px, --fs-s:11px, --fs-m:12px, --fs-l:13px, --fs-xl:15px. Remapper TOUTES les font-size existantes (211 occurrences, 15 tailles → 5). Arrondir au cran le plus proche (12.5→12 ou 13 selon contexte, 9→10, 14.5→15…).
- Rayons : --r-s:6px (contrôles/inputs), --r-m:10px (cartes/panneaux/menus), --r-pill:999px. Remapper les 12 valeurs existantes.
- Poids : 400 corps, 500 léger accent, 600 titres. Remplacer les 550/640/660.
- NE PAS toucher aux tokens de couleur existants ni aux thèmes.

## 2. Blocs de code dans le chat (src/components/Chat.tsx)
- Coloration syntaxique (highlight.js, thème sobre adapté aux deux thèmes via CSS vars — pas de CDN, npm install).
- Header de bloc : nom du langage à gauche, bouton copier (icône SVG) à droite, apparait toujours. border-radius --r-m, fond légèrement distinct.

## 3. Groupement des lignes d'outils
- Dans le fil : >3 lignes d'outil consécutives (kind tool/tool_update) → repliées sous un en-tête « N actions ▸ » cliquable (deplié = les lignes actuelles). Compteur mis à jour en streaming. Etat déplié persistant par groupe (useState local suffit).

## 4. Diffs inline
- Événement done avec fichiers modifiés (gitChanged existe déjà côté sidecar) : sous la réponse, ligne discrète « N fichiers modifiés ▸ » dépliable montrant le diff coloré (vert/rouge, monospace, max-height scrollable). Récupérer le diff via le WS existant (gitDiff route existe dans router.mjs — vérifier le nom exact et l'utiliser, ne pas créer de doublon).

## Contraintes
- npx tsc --noEmit doit passer (ignorer src/test_auto_review*.ts), npx vite build doit passer, vitest sidecar doit passer.
- Ne PAS toucher : sidecar/providers/*, main.tsx, reviewer*.
- Commits atomiques par chantier (1 tokens, 2 code blocks, 3 tool grouping, 4 diffs). NE PAS pusher.
