# Captures — plan 018 (hiérarchie workspace et contexte actif)

Banc déterministe `#wsbench[-light][-added]` (fixtures fixes, vrai
`presentStatus`), bundle de production.

| Fichier | Contenu | Taille |
|---|---|---|
| `018-ws-dark-1512.png` | ChatHeader (terminé / en cours+durée / interrompu+titre très long tronqué), GalleryHeader (refresh migré), DocumentHeader (type + accès clavier inspecteur), ContextInspector complet | 1512×883 dark |
| `018-ws-light-added-1512.png` | idem en clair, inspecteur à l'état « Ajouté au contexte » (accusé) | 1512×883 light |
| `018-ws-dark-800.png` | grille resserrée à 800×600 | 800×600 dark |
| `018-app-dark-1512.png` | app réelle : ChatHeader sur le thread actif + galerie, intégration complète | capture fenêtre |

Reproduire : `npx vite preview` puis `http://localhost:4173/#wsbench`
(`-light`, `-added`). Regard attendu : titre local → contenu → action ;
un seul accent orange par surface ; statuts par `presentStatus`
(« terminé » ton neutre — jamais de vert pour un résultat scientifique).
