# Documentation Companion iOS (plan 034)

## Index

| Doc | Sujet |
|-----|--------|
| [ADR-001](./ADR-001-client-gateway.md) | Architecture client ↔ gateway |
| [ADR-002](./ADR-002-ios-ui-runtime.md) | Tauri/React vs Swift |
| [THREAT_MODEL](./THREAT_MODEL.md) | Menaces et contrôles |
| [BASELINE](./BASELINE.md) | Audit baseline + état jalons |
| [MODULE_MATRIX](./MODULE_MATRIX.md) | Réutiliser / adapter / interdire |
| [COMPATIBILITY](./COMPATIBILITY.md) | Matrice client/serveur |
| [MIGRATION](./MIGRATION.md) | Migration et rollback |
| [DATA_RETENTION](./DATA_RETENTION.md) | Cache et données personnelles |
| [REVOCATION_CHECKLIST](./REVOCATION_CHECKLIST.md) | Appareil perdu |
| [RUNBOOK](./RUNBOOK.md) | Ops Mac offline, Tailscale, cache… |
| [DISTRIBUTION](./DISTRIBUTION.md) | Build iOS privé |
| [SECRETS_POLICY](./SECRETS_POLICY.md) | Interdits secrets |
| [TAILSCALE_SERVE](./TAILSCALE_SERVE.md) | Serve sans Funnel |
| [SOAK_CHECKLIST](./SOAK_CHECKLIST.md) | Soak multi-appareil |
| HANDOFF-A … HANDOFF-I | Preuves par jalon |
| [STATUS_FINAL](./STATUS_FINAL.md) | Clôture MVP + verify:mobile |

## Code

| Chemin | Rôle |
|--------|------|
| `mobile/` | Client Tauri/React |
| `packages/atelier-protocol/` | Contrats + fixtures |
| `rust/crates/atelier-remote/` | Gateway sécurisée |

## Vérification minimale

```bash
npm run test:protocol
npm run test:remote
npm run mobile:typecheck
npm run mobile:test
npm run mobile:build
npm run mobile:check-secrets
```
