# Raffinement sobre d’Atelier

Demande approuvée le 5 septembre 2026 : plan détaillé, goal et implémentation complète de l’audit UI. Implémentation et validation terminées dans la tâche Codex `01a071c5-4475-74b2-b496-250919fd4058`.

## Direction

Conserver le graphite, la police système, les icônes compactes, les panneaux et leurs gouttières. Raffiner par la hiérarchie, les proportions, la cohérence et la suppression de bruit. Aucun effet décoratif supplémentaire. Préserver l’ordre des épingles, les préférences, les données, les images scientifiques et les modifications présentes avant cette tâche.

Baseline locale des fichiers concernés : `/tmp/atelier-refinement-20260905-before`. Le checkout contient déjà du travail non committé, notamment une nouvelle présentation de galerie et des dossiers de projet. Les adaptations se font sur ces versions et ne les remplacent pas.

## 1. Fondations visuelles

- [x] Faire suivre l’échelle typographique de l’interface au réglage de taille générale, avec un plancher lisible pour les petits textes. Garder le réglage du texte du chat indépendant.
- [x] Transmettre aux vues intégrées les valeurs effectives des tokens du shell plutôt que des constantes divergentes : arrondis, hauteurs, mouvement, typographie et surfaces.
- [x] Conserver la réduction des animations, y compris après transmission du thème.
- [x] Rendre plus lisibles le placeholder, les métadonnées documentaires et les métadonnées d’activité en utilisant le gris secondaire.
- [x] Actualiser le contrat de design pour expliciter la priorité des tokens actuels sur les anciens tableaux.

Acceptation : palette inchangée ; tailles cohérentes à 12, 15 et 18 ; aucune régression du texte du chat ; mêmes tokens effectifs dans le shell et la galerie ; focus toujours visible.

## 2. Surfaces principales

- [x] Composeur : contour neutre au repos, accent au focus de saisie, ombre retirée au repos et texte indicatif court.
- [x] Conversations : réserver moins d’espace aux métadonnées dans une colonne étroite, conserver les familles et l’accès aux favoris via le menu, éviter tout saut du titre au survol.
- [x] Galerie : préserver la partie finale distinctive et l’extension des noms à la largeur réelle ; nom complet accessible ; aucune modification du fichier réel.
- [x] Galerie : ligne secondaire limitée au format et à une date compacte, avec favoris/statuts utiles ; détails complets dans l’inspecteur et l’infobulle. Préserver le mode liste détaillé.
- [x] Galerie : harmoniser la typographie et les rayons des légendes ; préserver les aperçus scientifiques et leurs proportions.

Acceptation : noms distinguables en galerie à deux et trois colonnes ; légendes sans débordement ; titres de conversation stables au survol ; opérations ouvrir, sélectionner, menu et favoris accessibles.

## 3. Commandes et réglages

Précision approuvée pendant le travail : retirer les graisses excessives, les cadres inutiles des boutons et alléger les sous-menus. Les libellés restent en 400, les titres locaux en 500 ; le gras sémantique du contenu scientifique reste préservé.

- [x] Alléger les titres, boutons secondaires et sous-menus ; conserver les états clavier et les actions importantes.

- [x] TopBar : corriger le repli des commandes secondaires sur les éléments réellement présents dans le DOM, maintenir les surfaces actives et toutes les entrées du menu.
- [x] Harmoniser les infobulles des commandes principales avec le délai du projet et conserver noms accessibles, focus, clic et glisser-déposer.
- [x] Réglages : français cohérent, descriptions orientées action plutôt que paramètres internes ; traduction anglaise équivalente.
- [x] Apparence : montrer le thème courant d’abord et rendre les autres palettes disponibles dans un repli explicite et clavier-compatible.

Acceptation : aucune préférence d’épingle réécrite ; commandes accessibles dans le menu à toute largeur ; aucune infobulle native doublée ; choix des thèmes et recherche fonctionnels.

## 4. Vérification et livraison

- [x] Tests fonctionnels ciblés sur les comportements modifiés : thème transmis, noms longs, commandes et réglages.
- [x] Revue indépendante du résultat et des critères, sans transmission du raisonnement.
- [x] `npx tsc --noEmit` puis `npx vite build`.
- [x] `cd sidecar && npx vitest run`.
- [x] Galerie : `node server/tests/parity.mjs` et `node server/tests/diff_suite.mjs`.
- [x] Construire les assets React galerie depuis leurs sources.
- [x] Appliquer le protocole AGENTS : arrêter app/sidecars/galeries, construire avec `npm run tauri:build:app`, inspecter le log, ouvrir le bundle de ce checkout et vérifier le chemin du PID.
- [x] Contrôle visuel de l’app buildée : composeur au repos, sidebar, galerie, TopBar et réglages ; vérification automatisée du focus/clic des commandes. Vérifier la convergence du sidecar.
- [x] Mettre à jour ce plan avec les résultats réels avant de terminer le goal.

## Résultats

- 147 tests frontend ciblés passent, notamment noms longs/échappement, échelle typographique, focus/clic des infobulles, repli des thèmes, sidebar, contrats CSS et persistance des réglages.
- 654 tests sidecar passent (40 fichiers).
- TypeScript, build Vite et build React galerie passent.
- Parité galerie : `parity: ok`. Suite de différences : 207 tests verts, 0 restant. Le sandbox interdisant l’écoute localhost, ce contrôle a été relancé avec les permissions d’exécution nécessaires.
- Revue indépendante : un P2 sur la fin distinctive d’un nom très long a été corrigé puis levé en seconde lecture. Aucun autre problème actionnable signalé.
- Les écarts préexistants aux contrats CSS dans les nouvelles surfaces projet ont été corrigés par les adaptateurs Button/RowButton et les tokens existants, sans réécriture de leur logique.
- Validation `.app` terminée après attente des builds concurrents : arrêt complet, `npm run tauri:build:app` réussi, aucun « error » dans `/tmp/atelier-refinement-build-20260905.log`, puis relance du bundle de ce checkout. PID vérifié : `96621`, lancé le 5 septembre 2026 à 09:58:36 depuis `src-tauri/target/release/bundle/macos/Atelier.app/Contents/MacOS/tauri-app`.
- Contrôle visuel direct du composeur neutre, des titres de sidebar, des noms et dates en galerie, des réglages Général et Apparence avec les autres thèmes repliés. Menu des surfaces ouvert et entrées vérifiées dans l’arbre d’accessibilité. Recherche/repli des thèmes et focus/clic couverts par les tests ciblés ; aucune préférence changée pendant cette vérification.
- Sidecar convergé : `/health` répond HTTP 200 avec `ok: true`. `git diff --check` passe.
