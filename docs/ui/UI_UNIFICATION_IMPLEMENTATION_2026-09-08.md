# Uniformisation UI — implémentation du 8 septembre 2026

Implémentation répartie entre trois sous-agents GPT-5.6 Luna en effort maximal : primitives et consommateurs, menus, puis CSS et thème. Revue d'intégration par l'agent principal et revue indépendante croisée. Le dépôt contenait d'autres chantiers actifs ; aucun commit global n'a été réalisé.

## Socle et migrations

- Conservation de shadcn/Base UI, du préfixe `tw` et des tokens Atelier. Pas de nouvelle bibliothèque.
- API produit commune pour Button, IconButton, Tooltip, StatusBadge, Select, Tabs et SegmentedControl. Select conserve son chemin historique `src/components/Select.tsx`.
- Menus d'actions via LazyDropdownMenu/DropdownMenuSurface : groupes, cases, sous-menus, pieds informatifs et maintien à l'ouverture. Les consommateurs n'importent plus directement la primitive dropdown-menu.
- Migration des contrôles concernés dans les réglages, Terminal, Narval, Calculs, Generator, Git, bibliographie, appareils distants et dossiers associés.
- Migration des menus KB, Sidebar/reprise, Git, TopBar, AtelierPane, Automations, dossiers et tours en attente. Les panneaux riches projet et contexte du composeur utilisent Popover.
- Contrat de thème commun app/galerie ; alias galerie confinés au message d'iframe. La géométrie et le mouvement restent pilotés par CSS pour préserver densité et réduction des animations.
- Conservation de la direction compacte orange du composeur et de ses fonctions.

## Corrections issues de la revue

- Priorité unique des valeurs d'onglet ; état visuel fourni par Base UI, sans classe active indépendante. L'ancien `active` ne sert que d'indice initial en mode non contrôlé.
- Une seule sémantique accessible pour les boutons segmentés : radio, sans `aria-pressed` concurrent.
- Échap ferme un menu dès le premier appui après une action `keepOpen`.
- Actions secondaires TopBar regroupées en sous-menus ; retour du focus vérifié dans les tests.
- Contrat compact adapté au nouveau Select Narval.
- Select conserve son portail local et utilise le placement standard par défaut (`alignItemWithTrigger=false`) : le menu reste visible dans SettingsSheet. La page de réglages standalone laisse Échap au Select ouvert ; le test navigateur utilise le focus réel.
- Suppression de l'allowlist autorisant les imports directs Button/Tooltip ; contrôle des variables CSS sémantiques référencées sans définition.

## Vérifications exécutées

- Composants communs après corrections : 10 fichiers, 114 tests réussis.
- Lot menus : 322 tests ciblés réussis, dont GitSurface 15/15.
- Tests visuels : 18/18 lors de la première intégration ; après le dernier correctif, 17 captures réussies puis test clavier Select corrigé et vérifié séparément (1/1). Aucune image de référence mise à jour. Select + SettingsPage : 17 tests ciblés réussis.
- Sidecar : 40 fichiers, 656 tests réussis.
- Galerie : parité réussie ; diff 207 tests réussis ; contrat thème 15/15.
- TypeScript et Vite finaux réussis. Bundle natif reconstruit avec `npm run tauri:build:app` (exit 0), signé `Atelier Dev Signing`, relancé avec vérification du chemin exact du checkout : PID 88936. Backend Rust sain (`health.ok=true`, PID 89197, bundleHash `29861e5be341f92bd7b51f3aea1b3de3`). Log final : `/tmp/atelier-ui-native-select-final.log`.

Deux erreurs de compilation rencontrées dans le chantier image parallèle ont été corrigées avec son propriétaire avant le build réussi : `find_map` dans le parseur image et possession de l'identifiant avant déplacement de l'événement dans `send.rs`. `cargo check -p atelier-runtime` a passé. Aucun changement de logique backend n'était demandé par la migration UI.

La suite frontend complète initiale a passé 1842/1846 tests. Les deux échecs Git ont ensuite été corrigés et vérifiés. Les deux échecs App (fichier récent `frais.ts` absent et état `No project open` du miroir disque) se reproduisent après superposition complète des sources du snapshot initial dans un dossier temporaire isolé : 52 tests réussis et les mêmes 2 échecs, log `/tmp/atelier-app-baseline-full-20260908.log`. Deux tests de contrat CM6 attendent aussi des comportements déjà changés avant ce lot : `mergeControls: false` et `externalReload: "always"`, preuve dans le patch de départ. Ces échecs ne sont pas attribuables à la migration UI observée.

## Limites de portée

Cette passe consolide les familles auditées du desktop et le thème du chrome galerie. Elle ne prétend pas convertir le mobile ni les moteurs PDF, CodeMirror, LaTeX et terminal en composants React. Les contenus métier riches et quelques adaptations de disposition restent spécifiques. La fermeture intégrée facultative de Tab conserve une dette clavier ancienne ; le Terminal utilise son IconButton séparé accessible.

La validation interactive native a pu être réalisée après déverrouillage : panneau modèle compact orange et superposé au composeur, menu permissions visible, ouverture KB, sous-menu de surfaces au clavier et retour du focus. Le dernier bundle a confirmé visuellement le menu Langue dans SettingsSheet ; Échap ferme le menu, conserve les réglages ouverts et rend le focus au sélecteur. Les réglages ont ensuite été refermés. Les captures/tests ne constituent pas une vérification exhaustive de chaque écran, thème ou moteur spécialisé.
