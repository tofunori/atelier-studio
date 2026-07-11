# Plan 031 — notes d'exécution et de revue

Date: 2026-07-11
État: **automatisation verte; validation native PDF/SyncTeX encore requise**.

## Preuves automatisées

- Les trois surfaces choisissent CM6 par défaut; la priorité
  `query > localStorage > défaut` et le fallback explicite CM5 sont couverts.
- Commande: `npm --prefix gallery run test:e2e -- editor_cm6.spec.js`.
- Résultat: 5/5 verts en 12,9 s:
  - `code editor save reload and diff`;
  - `code editor preserves Python indentation`;
  - `markdown preview split edit roundtrip`;
  - `engine resolution precedence`;
  - `latex deterministic parity`.
- La validation globale exécutée dans le même checkout est verte:
  `npm run verify` avec 308 tests frontend, 346 sidecar, 32 galerie,
  166 scénarios diff et 8 tests Rust.
- L'app finale a été reconstruite et relancée selon `AGENTS.md`; sidecar et
  galerie convergent et répondent dans le bundle final.

## Checklist native obligatoire

- [ ] Compilation réelle d'un document LaTeX dans l'app buildée et lecture du PDF.
- [ ] SyncTeX source vers PDF.
- [ ] SyncTeX PDF vers source.
- [ ] Annotation `.texc` et retour à la source.
- [ ] Sélecteur de fichier et lint Python avec les outils réellement installés.
- [ ] Capture ou résultat daté des éventuels prompts TCC.
- [ ] Smoke visuel des trois surfaces dans l'iframe de l'app, en CM6 puis en
  fallback CM5.

Le plan reste `IN PROGRESS` tant que ces cases ne sont pas exécutées. CM5 doit
rester disponible; le plan 032 ne peut pas commencer sur la seule foi des tests
automatisés.
