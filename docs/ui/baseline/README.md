# Baselines — état réel capturé le 2026-07-09 (app buildée, plan 014)

Captures fenêtre seule (`screencapture -o -l<id>`), retina @2x, aucune retouche.
Build du jour (post-plans 004–010), thème « Atelier (défaut) », accent `#E8823A`.

## 1512x883-dark-split-sans-thread.png

Split chat + galerie, aucun thread sélectionné, projet atelier-studio.

- **Guide l'œil** : la carte centrée « Ready for a session » (seul bloc à fond
  `--bg-card` dans une zone vide) ; à droite, la grille de vignettes claires sur
  fond sombre domine tout.
- **Concurrence l'action principale** : la rangée de chips de la galerie
  (recherche, tri, dossiers, formats, favoris, collections, statut, recent,
  densité, rescan, Board, Notes, Settings) — 13 contrôles au même niveau visuel
  alors que l'action attendue ici est « reprendre ou démarrer une session ».
- **Manque pour lire l'état scientifique** : rien ne dit où en est la recherche
  (dernier thread, artefacts récents, tâches en attente). L'empty state propose
  des verbes génériques (New chat / Resume / Open project) sans contexte.

## 1512x883-dark-split-thread-actif.png

Thread « Albédo glaciaire et aérosols de feu », fin de conversation, galerie du
projet Albedo-Modis-Pipeline-Analysis à droite.

- **Guide l'œil** : le texte de réponse (contraste `--fg` sur `--bg`) et les
  vignettes de figures. La ligne d'activité « Read 2 files · » est bien discrète.
- **Concurrence** : la densité des vignettes à droite attire plus que la
  conclusion du tour ; aucune capsule de résultat ne ferme visuellement le tour.
- **Manque** : provenance/statut des figures dans la grille (aucun badge
  workflow visible sans survol), et lien explicite entre le texte du tour et les
  artefacts qu'il cite.

## 1512x883-dark-split-thread-zotero.png

Même thread, remonté au message utilisateur contenant une fiche Zotero collée.

- **Guide l'œil** : la bulle utilisateur (fond `--bg-card`) occupe presque tout
  l'écran — un collage long n'est pas replié.
- **Concurrence** : le résumé d'article complet noie la question réelle
  (« quen penses tu ? », 3 mots à la toute fin).
- **Manque** : une capsule de référence compacte (titre + auteurs + actions)
  au lieu du texte brut — le transfert de contexte scientifique existe mais
  n'est pas matérialisé.

## 1512x883-dark-galerie-formats.png

Layout atelier plein écran, galerie du projet Albedo avec ~28 vignettes
(SVG/PNG mélangés, heatmaps, flowcharts, séries temporelles).

- **Guide l'œil** : les vignettes claires — très efficace pour scanner les
  figures.
- **Concurrence** : doublons visuels svg/png du même graphique au même rang que
  des figures distinctes ; la toolbar reste chargée.
- **Manque** : sélection/inspection — aucune zone ne montre les métadonnées,
  le statut workflow ni la provenance d'une figure sans ouvrir la lightbox.

## 1280x800-light-settings.png

Settings pleine page, préset « GitHub Light », onglet Appearance.

- **Guide l'œil** : la liste de présets de thème avec leurs bandes de couleurs.
- **Concurrence** : rien — la page est calme, hiérarchie propre (nav gauche,
  titre, groupes, contrôle à droite). Bon modèle pour le reste.
- **Manque** : l'état light n'est pas au contraste cible partout (chips de la
  galerie à revalider en light dans la matrice QA).

## 800x600-dark-split.png

Split à la taille minimale réaliste.

- **Guide l'œil** : l'empty state, toujours lisible.
- **Concurrence/casse** : la toolbar galerie déborde sa largeur (chips
  tronquées), la zone chat descend sous 400 px utiles ; le rail et la TopBar
  tiennent bien.
- **Manque** : règles de repli explicites (quelles chips se replient dans ⋯,
  à quelle largeur la galerie passe à 2 colonnes).

## 1512x883-dark-sidecar-indisponible.png

Bannière « Sidecar disconnected, reconnecting… » (bordure `--accent`), capturée
0,6 s après kill du sidecar ; disparue à ~3 s (reconnexion plan 009).

- **Guide l'œil** : la bannière orange — correct, statut nécessitant attention.
- **Manque** : durée/étape de reconnexion (la bannière ne dit pas si un retry
  est en cours ou échoue en boucle) ; à couvrir par le contrat États.

## Non reproduits

- **running** (spinner de tour + activité en direct) et **error de tour** :
  exigent un tour agent réel ; couverts par la matrice QA (mécanisme : test
  manuel lors du prochain tour réel + Playwright plan 021).
