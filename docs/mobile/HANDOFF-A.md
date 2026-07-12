# Handoff jalon A — plan 034

### Périmètre livré

- Audit du code vivant (bootstrap, WS, reducer, Tauri, Rust server, gallery, sécu).
- Vérification de l’état effectif des plans 025 (harnais) et 033 (Rust backend).
- Baseline mesurable desktop (bundle, tests unitaires ciblés, inventaire gaps).
- Quatre documents + matrice modules exigés par le plan 034 §6.
- **Aucun** code gateway/mobile produit (conforme instruction de démarrage).

### Fichiers modifiés

- `docs/mobile/ADR-001-client-gateway.md` — architecture client↔gateway, interdiction sidecar brut
- `docs/mobile/ADR-002-ios-ui-runtime.md` — Tauri/React vs frontières Swift
- `docs/mobile/THREAT_MODEL.md` — actifs, menaces, contrôles, gaps
- `docs/mobile/BASELINE.md` — drift, chemins réels, métriques, gaps bloquants
- `docs/mobile/MODULE_MATRIX.md` — réutiliser / adapter / interdire / nouveau
- `docs/mobile/HANDOFF-A.md` — ce handoff

### Contrats/invariants touchés

- **Aucun contrat runtime modifié.**
- Documentation des invariants existants à préserver :
  - journal 025 (`eventId`, `sequence`, `turnId`, live≡replay)
  - sidecar loopback + token session (ne pas exposer)
  - `PROTOCOL_VERSION = 1` non négocié sur le fil (gap B)

### Tests exécutés

- `npx vitest run src/lib/harnessEvents.test.ts src/lib/ws.test.ts` → **31 passed**
- `node scripts/check_entry_budget.mjs` → **✓** `index-*.js` 866 KB ≤ 950 KB
- `cargo test --workspace --locked` (sous `rust/`) → **81 unit tests passed**
- Suite `npm run verify` complète : **non rejouée** (hors périmètre docs A ; worktree clean hors docs)

### Mesures appareil

- iPhone physique : **non applicables** (pas d’app iOS).
- Desktop baseline documentée dans `BASELINE.md` (bundle, reducer tests).
- FPS / long tasks / rerenders par token : **à instrumenter jalon E**.

### Preuves visuelles

- Aucune (jalon documentation). Captures iOS à partir du jalon D.

### Limites et risques restants

1. Gateway et auth appareil absentes — client réel **interdit** tant que C n’est pas GO.
2. Pas de resume `lastSequence` — critique pour background iOS.
3. Chat desktop non virtualisé — risque perf WKWebView si on copie tel quel.
4. Soak 033 encore ouvert — parité Rust/Node partielle sur interactions/goals.
5. `atelier-protocol` Rust ≠ surface complète `AgentEvent` TS — risque de triple copie si B mal cadré.
6. Mesures perf iPhone non encore possibles.

### Drift et changements hors plan

- **aucun** code applicatif hors `docs/mobile/`.
- Lecture seule du dépôt pour l’audit.

### Demande à Codex

**`GO`** pour ouvrir le jalon B (protocole partagé + simulateur déterministe), sous réserve de validation que :

1. les ADR reposent bien sur le code actuel (loopback, pas d’expo brute) ;
2. les budgets §3.1 restent des cibles mesurables, non silencieusement baissées ;
3. aucun démarrage de gateway/mobile avant ce GO.

Si findings HIGH/CRITICAL sur l’audit : **`GO avec corrections`** ou **`STOP`** avec liste.
