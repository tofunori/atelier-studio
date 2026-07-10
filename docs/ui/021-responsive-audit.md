# 021 — Audit responsive (2026-07-10)

Playwright WebKit, app + bancs (#chatbench/#navbench/#homebench), largeurs
1512×883 / 1280×800 / 1000×700 / 800×600 + équivalent zoom 200 % (756 px) :

- **Aucun scroll horizontal** de page détecté sur aucune surface, aucune
  largeur (mesure `scrollWidth` vs `innerWidth` + inventaire des débordants).
- 800×600 : rail 48 px intact, panneau + surface + composer utilisables,
  Send visible, empty state fonctionnel.
- Settings <880 px : nav colonne → select compact (partie A).
- Zoom 200 % (équiv. 756 px) : chat sans débord.

Golden states (partie E) verrouillent 1512/1280/800 pour les surfaces clés.
