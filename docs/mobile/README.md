# Documentation mobile

Le client mobile d'Atelier est l'app SwiftUI native
[`mobile-native/`](../../mobile-native/README.md) : fonctionnement, compilation,
installation sur l'iPhone et renouvellement de la signature y sont décrits.

Le client web React/Tauri `mobile/` (plan 034) est gelé depuis le 2026-09-28 :
il reste dans le dépôt comme référence, mais n'est plus construit, testé en CI,
livré dans Atelier.app ni servi par la passerelle (décision B de
`plans/TRI-2026-09-24.md`, addendum de [ADR-002](./ADR-002-ios-ui-runtime.md)).

## À jour

| Doc | Sujet |
|-----|--------|
| [TAILSCALE_SERVE](./TAILSCALE_SERVE.md) | Tailscale Serve (port 8443), association et révocation de l'iPhone |
| [REVOCATION_CHECKLIST](./REVOCATION_CHECKLIST.md) | Appareil perdu ou compromis |
| [RUNBOOK](./RUNBOOK.md) | Diagnostic de la passerelle (sections client historiques) |

## Historique (plan 034, client `mobile/`)

Conservés comme trace des décisions ; ils décrivent `mobile/` comme le client
courant, ce qui n'est plus vrai.

| Doc | Sujet |
|-----|--------|
| [ADR-001](./ADR-001-client-gateway.md) | Architecture client ↔ passerelle |
| [ADR-002](./ADR-002-ios-ui-runtime.md) | Tauri/React vs Swift (addendum du 2026-09-28) |
| [THREAT_MODEL](./THREAT_MODEL.md) | Menaces et contrôles |
| [BASELINE](./BASELINE.md) | Audit de départ |
| [MODULE_MATRIX](./MODULE_MATRIX.md) | Réutiliser / adapter / interdire |
| [COMPATIBILITY](./COMPATIBILITY.md) | Matrice client/serveur |
| [MIGRATION](./MIGRATION.md) | Migration et rollback |
| [DATA_RETENTION](./DATA_RETENTION.md) | Cache et données personnelles |
| [DISTRIBUTION](./DISTRIBUTION.md) | Build iOS Tauri |
| [SECRETS_POLICY](./SECRETS_POLICY.md) | Interdits secrets |
| [SOAK_CHECKLIST](./SOAK_CHECKLIST.md) | Soak multi-appareil |
| HANDOFF-A … HANDOFF-I | Preuves par jalon |
| [STATUS_FINAL](./STATUS_FINAL.md) | Clôture du MVP |

## Code

| Chemin | Rôle |
|--------|------|
| `mobile-native/` | App iPhone/iPad SwiftUI |
| `rust/crates/atelier-remote/` | Passerelle sécurisée (`atelier-remote-gateway`) |
| `src-tauri/src/remote_gateway.rs` | Lancement de la passerelle par Atelier.app |
| `packages/atelier-protocol/` | Contrats + fixtures |
| `mobile/` | Client web gelé, référence seulement |

## Vérification

```bash
npm run test:remote     # passerelle (cargo)
npm run test:protocol   # contrats partagés
```

L'app Swift se vérifie par le job CI `mobile-native` ou sur un Mac avec Xcode 26
(voir [mobile-native/README.md](../../mobile-native/README.md)).
