# Matrice de compatibilité client / serveur — Companion iOS

**Wire protocol** : `protocolVersion` (entier), distinct de `meta.schemaVersion` (journal harnais v1).

## Versions supportées (MVP plan 034)

| Composant | Version | Notes |
|-----------|---------|--------|
| Client mobile (`mobile/`) | app `0.1.0-h` / protocol **1** | `PROTOCOL_VERSION = 1` |
| Package `@atelier/protocol` | **1** | `MIN=1`, `MAX=1` |
| Gateway `atelier-remote` | protocol **1** | `/remote/health` |
| Journal harnais | schemaVersion **1** | plan 025 |
| Sidecar chat Mac | Rust défaut / Node soak | reste **loopback** |

## Négociation

1. Client lit `GET /remote/health` → `protocolVersion`, `minProtocolVersion`, `maxProtocolVersion`.
2. Si `client ∉ [min, max]` → **refus explicite** (`version_incompatible`), pas de dégradation silencieuse.
3. Pairing envoie `protocolVersion` dans `POST /remote/v1/pair`.

## Matrice client × serveur

| Client \ Serveur | S v1 (actuel) | S v2 (futur) |
|------------------|---------------|--------------|
| C v1 | **OK** | Refus clair côté client si min>1 |
| C v0 (hypothétique) | Refus serveur | — |
| C v2 | Refus serveur tant que max=1 | OK quand livré |

## Surfaces API gateway (v1)

| Route | Scope | Stable v1 |
|-------|-------|-----------|
| `GET /remote/health` | public | oui |
| `POST /remote/v1/pair` | pairing code | oui |
| `GET /remote/v1/projects` | chat:read | oui |
| `GET /remote/v1/threads` | chat:read | oui |
| `GET …/history?afterSequence=` | chat:read | oui |
| `POST /remote/v1/send` | chat:send | oui (ack ; stream live limité) |
| `POST /remote/v1/interrupt` | chat:send | oui |
| `POST /remote/v1/interaction` | chat:interact | oui |
| `GET /remote/v1/gallery/{projectId}` | gallery:read | oui |
| `GET /remote/v1/file/{fileId}` | files:read | oui (+ ETag/Range) |
| Admin `/remote/admin/*` | admin token + loopback | oui |

## Tests de mise à jour

| Scénario | Attendu |
|----------|---------|
| Client récent + serveur ancien (v1) | Health OK si plage chevauche ; sinon message version |
| Client ancien + serveur qui monte min | `version_incompatible` |
| Appairage après upgrade serveur | Re-pair si scopes/token format changent (documenter breaking) |

Commandes :

```bash
# Client
cd mobile && npm test && npm run build
# Serveur
cargo test -p atelier-remote --manifest-path rust/Cargo.toml --locked
npm run test:protocol
```
