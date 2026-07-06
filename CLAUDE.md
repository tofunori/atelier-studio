# Atelier Studio — règles pour agents

App macOS Tauri 2 : chat multi-agents (Claude Agent SDK + Codex SDK via sidecar Node) + atelier scientifique (galerie, éditeurs, PDF, browser, terminal). Utilisateur : Thierry (MSc glaciologie).

## Système de design — CONTRAIGNANT

Style sobre strict : **jamais d'emojis colorés dans l'UI, icônes = SVG monochromes fins (stroke 1.3–1.5), pas de gradients décoratifs.**

Toute valeur visuelle vient des tokens — **ne jamais inventer de valeur locale** :

- **Tailles de texte** : 10 / 11 / 12 / 13 / 15 px uniquement (`--fs-xs` à `--fs-xl` si définis). Pas de 9px, 12.5px, 14.5px.
- **Poids** : 400 (corps), 500 (accent léger), 600 (titres). Rien d'autre.
- **Rayons** : 6px (contrôles), 10px (cartes/panneaux/menus), 999px (pilules). Rien d'autre.
- **Espacement** : multiples de 4 (4/8/12/16/20/24). Paddings de panneaux : 16 ou 20.
- **Gris de texte** : 3 niveaux max — `--fg` (contenu), `--muted` (secondaire), `--muted2` (éteint). Ne pas multiplier les gris.
- **Profondeur** : surfaces élevées (menus, popovers, modales) = fond + ombre douce (`0 4px 16px rgba(0,0,0,.25)` env.), pas une bordure de plus. Bordures 1px réservées aux séparateurs internes.
- **Typo** : `letter-spacing:-0.01em` sur les titres ; `font-variant-numeric:tabular-nums` sur tout chiffre aligné (heures, tailles, compteurs) ; interligne 1.5 corps, 1.3 titres.
- **Motion** : tout changement d'état visible transitionne en 120–150ms (opacity/transform). Jamais plus de 200ms. Respecter `prefers-reduced-motion`.
- **Thèmes** : toute couleur passe par les variables CSS — jamais de hex en dur dans un composant (exceptions existantes : sémantique ok/warn/erreur documentée dans App.css).

## Contraintes techniques

- `npx tsc --noEmit` et `npx vite build` doivent passer (ignorer `src/test_auto_review*.ts`).
- Tests sidecar : `cd sidecar && npx vitest run`.
- Ne pas pusher sans demande explicite.
- `npm run tauri dev` ne survit PAS lancé depuis un harness d'agent — seul Thierry le lance depuis son terminal.
- La galerie vendorisée vit dans `gallery/` — toute modif galerie se commit ICI, jamais dans `~/Documents/cmux-gallery`.
