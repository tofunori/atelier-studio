# Plan 034 — statut final MVP

**Date** : 2026-07-12
**Vérification** : `npm run verify:mobile` → **VERT**

## Jalons

| Jalon | Contenu | Statut code/docs |
|-------|---------|------------------|
| A | Audit, ADR, threat, baseline | DONE |
| B | Protocole + fixtures | DONE |
| C | Gateway sécurisée | DONE |
| D | Shell iOS + appairage | DONE |
| E | Chat fluide | DONE |
| F | Résilience réseau | DONE |
| G | Gallery / fichiers | DONE |
| H | Notifs / interactions | DONE |
| I | Hardening / distribution docs | DONE |

## `verify:mobile` (dernière exécution)

| Étape | Résultat |
|-------|----------|
| `test:protocol` | 49 passed |
| `test:remote` | 17 passed (4+13) |
| `mobile:typecheck` | OK |
| `mobile:test` | 75 passed |
| `mobile:build` | OK (~272 KB JS) |
| `mobile:check-secrets` | OK |

## Reste opérateur (hors harness agent)

1. `sudo gem install cocoapods` puis `cd mobile && npm run ios:init`
2. Team signing Apple + install iPhone
3. Gateway release + Tailscale Serve (`docs/mobile/TAILSCALE_SERVE.md`)
4. Soak table (`docs/mobile/SOAK_CHECKLIST.md`)
5. Revue Codex device (notifs lock, FPS chat si exigé gate E)

## Commandes de reprise

```bash
# Suite companion
npm run verify:mobile

# Gateway
cargo build -p atelier-remote --release --manifest-path rust/Cargo.toml
ATELIER_REMOTE_BIND=127.0.0.1:18765 ./rust/target/release/atelier-remote-gateway

# Client web (dev)
cd mobile && npm run dev   # :1421
```

## Verdict produit

MVP **implémenté et documenté** dans le dépôt.
MVP **validé sur iPhone physique** : en attente des étapes opérateur ci-dessus + gate Codex.
