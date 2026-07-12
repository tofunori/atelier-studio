# Handoff jalon C — plan 034

### Périmètre livré

- Crate **`atelier-remote`** + binaire **`atelier-remote-gateway`** (séparé du sidecar loopback).
- Appairage court (TTL 120 s, max 5 essais), jetons **par appareil** (hash SHA-256 au repos), scopes, rotation, révocation persistante.
- Surface HTTP bornée : health, pair, projects, threads, history (`afterSequence`), send/interrupt/interaction (idempotence), gallery index, files (path policy + range).
- Refuse par défaut toute route non déclarée ; Host/Origin checks ; rate limit pairing ; bind `0.0.0.0` refusé sans env explicite.
- Path policy : pas de chemin absolu / `..` / double-encodage ; symlink sortant refusé ; allowlist d'extensions ; taille max.
- UI Mac minimale : page HTML admin + panneau Réglages → Avancé (`RemoteDevicesPanel`).
- Doc Tailscale Serve **sans Funnel** : `docs/mobile/TAILSCALE_SERVE.md`.
- Suite sécu d'intégration : 13 tests + 4 unit path_policy.

### Fichiers modifiés / créés

- `rust/crates/atelier-remote/**` — gateway complète
- `rust/Cargo.toml` — member workspace
- `src/components/RemoteDevicesPanel.tsx` — UI révocation
- `src/components/Settings.tsx` — section appareils distants
- `src/lib/i18n.ts` — clé `settings.remote-devices`
- `docs/mobile/TAILSCALE_SERVE.md`
- `docs/mobile/HANDOFF-C.md`

### Contrats/invariants touchés

- Sidecar desktop **reste** `127.0.0.1` — non modifié pour l'écoute réseau.
- Token device ≠ `ATELIER_TOKEN` session.
- Journal : history via `HarnessJournal` + fixtures ; `afterSequence` / `snapshotRequired`.
- Proxy send vers sidecar : acceptation gateway MVP (`queued_on_gateway`) — câblage WS complet peut suivre en soak ; pas d'exposition shell/git.
- Admin : loopback + `x-atelier-admin-token` uniquement.

### Tests exécutés

```text
cargo test -p atelier-remote --manifest-path rust/Cargo.toml --locked
  → path_policy 4 passed
  → security 13 passed
  Total lib+integration verts
```

Cas couverts : token absent/révoqué/mauvais scope ; brute force pairing ; path traversal + symlink ; MIME/range ; bad host ; replay send/interaction ; deux appareils + révocation d'un ; reload disque ; unknown route ; refuse any-bind.

### Mesures appareil

- N/A client iOS (jalon D). Gateway testée en loopback.

### Preuves visuelles

- Aucune capture — panneau Settings présent en code.

### Limites et risques restants

1. Send/interrupt/interaction **acceptés** côté gateway ; le relais WS live vers le sidecar n'est pas encore un stream bout-en-bout (stub `queued_on_gateway`). Priorité soak avant client réel lourd.
2. Admin token en localStorage du webview Settings — acceptable dev Mac, à durcir (Keychain) plus tard.
3. Gallery scan superficiel (racine + figures/outputs/docs) — suffisant MVP, pas un index full desktop.
4. TLS réel = Tailscale Serve ; gateway HTTP locale.
5. Codex doit rejouer des requêtes adversariales hors suite Grok avant GO client réel.

### Drift et changements hors plan

- Aucune exposition Funnel.
- `Settings.tsx` / i18n touchés pour UI minimale (prévu §8 plan).

### Demande à Codex

**`GO`** pour jalon D (shell iOS lecture + appairage) **après** revue sécu et fermeture findings HIGH/CRITICAL.
Si le stub send sans proxy live est jugé HIGH pour le slice D (lecture seule), D peut avancer sans send.
