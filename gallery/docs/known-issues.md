# Known issues

## Muxy : curseur main/loupe/flèche erratique dans les onglets Notes/Whiteboard (2026-07-03)
Les onglets du browser Muxy partagent la même vue native : les cursor rects de
l'onglet **galerie** inactif (zoom-in sur les vignettes, main sur les liens)
fuient dans l'onglet actif (Notes, Whiteboard). Confirmé : la loupe apparaît aux
positions des vignettes de la galerie et disparaît quand l'onglet galerie est
fermé. Bug côté Muxy — rien à corriger dans cmux-gallery. Contournement : ouvrir
Notes/Board via le fallback lightbox, ou fermer l'onglet galerie.
Signalé : https://github.com/muxy-app/muxy/issues/857
