# Golden states (plan 021, partie E)

`npm run test:visual` — build web + Playwright **Chromium** (même moteur que la
CI macos-latest), locale fr-FR, `reducedMotion: reduce`, horloge figée
(`page.clock`, 2026-07-09T18:00Z) : les bancs `#homebench/#navbench/#chatbench/
#setbench` et l'app déconnectée produisent 13 captures byte-stables.

- Baselines : `tests/visual/__screenshots__/` (committées, zéro donnée
  personnelle — fixtures uniquement, stockage vierge pour l'app).
- Diff : en local `playwright-report/` ; en CI, artefacts `test-results`
  uploadés à l'échec. `maxDiffPixelRatio: 0.02` absorbe l'anti-aliasing
  entre machines macOS.
- Mise à jour : `npm run test:visual -- --update-snapshots`, puis revue
  EXPLICITE du diff d'images au commit — jamais de mise à jour automatique.
- Fidélité moteur : Chromium ≠ WKWebView — la parité visuelle app réelle est
  couverte par les captures des bancs (docs/ui/*) et la QA app buildée.
- Galerie : iframe servie par le serveur galerie (non déterministe sans
  fixture serveur) — hors golden v1, couverte par ses E2E dédiés.
