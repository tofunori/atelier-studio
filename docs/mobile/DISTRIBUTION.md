# Distribution privée — build iOS + installation

> **Historique.** Ce document décrit le build Tauri iOS du client `mobile/`, gelé
> depuis le 2026-09-28. Pour construire et installer l'app actuelle, voir
> [mobile-native/README.md](../../mobile-native/README.md) (« Installer sur
> l'iPhone »). Tailscale Serve et association : [TAILSCALE_SERVE.md](TAILSCALE_SERVE.md).

> **Pas d'App Store public** dans le MVP. Distribution privée uniquement (Thierry).

## Identité

| Champ | Valeur |
|-------|--------|
| Product name | Atelier |
| Bundle id | `com.tofunori.atelier.companion` |
| Desktop id (distinct) | `com.tofunori.tauri-app` |
| Port dev web | **1421** (desktop 1420) |

## Prérequis Mac

- Xcode (testé : 26.x)
- CocoaPods : `sudo gem install cocoapods` (ou Homebrew)
- Compte Apple Developer (adhoc / development team)
- Tailscale + gateway (voir `TAILSCALE_SERVE.md`)

## Build reproductible

```bash
cd ~/Documents/atelier-studio

# 1. Contrats + gateway
npm run test:protocol
cargo test -p atelier-remote --manifest-path rust/Cargo.toml --locked
cargo build -p atelier-remote --release --manifest-path rust/Cargo.toml

# 2. Client
cd mobile
npm ci
npm run typecheck
npm test
npm run build

# 3. Projet iOS (une fois)
npm run ios:init   # nécessite cocoapods
# Renseigner developmentTeam dans src-tauri/tauri.conf.json → bundle.iOS

# 4. Device / simulateur
npm run ios:dev
# ou
npm run ios:build
```

### Signature

- Development : team ID Apple personnel
- Ad-hoc / interne : export IPA signé, install via Xcode Devices ou Apple Configurator
- **Ne pas** committer certificats, provisioning profiles, ni `.p12`

### Scheme URL (deep links H)

Après `ios:init`, ajouter dans Info.plist / tauri iOS config :

- URL type : `atelier`
- Role : Editor

Sans cela, les notifs ouvrent l'app mais le deep link OS peut être ignoré.

## Gateway en production privée

Atelier.app lance désormais la passerelle lui-même (bind, hôtes autorisés,
jeton du moteur). Seule la publication Tailscale reste à faire, une fois, sur
le port 8443 utilisé par le lien d'association :

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:18765
```

Détails : [TAILSCALE_SERVE.md](TAILSCALE_SERVE.md).

**Interdit** : `tailscale funnel`, `ATELIER_REMOTE_BIND=0.0.0.0` sans nécessité.

## Secrets — ne jamais inclure

| Interdit dans | Exemples |
|---------------|----------|
| Bundle IPA | tokens, admin, `.env` avec clés API |
| Logs commités | pairing codes, ATELIER_TOKEN |
| Fixtures git | transcripts réels de thèse |
| Captures issues | écrans diagnostics non redacted |

Voir `SECRETS_POLICY.md` et `npm run mobile:check-secrets`.

## Install appareil physique

1. Trust developer sur l'iPhone (Réglages → Général → VPN et gestion)
2. Tailscale connecté
3. Health via Safari : `https://<machine>.<tailnet>.ts.net:8443/remote/health`
4. Association : Réglages → Général → Avancé → Appareils distants (iPhone) →
   Ajouter → lien `atelier-native://pair` ouvert sur l'iPhone
5. Ouvrir un thread, vérifier history

## Rollback

Voir `MIGRATION.md`. Conserver 1 IPA précédent signé hors dépôt.
