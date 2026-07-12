# Distribution privée — build iOS + installation

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

```bash
export ATELIER_REMOTE_BIND=127.0.0.1:18765
export ATELIER_APP_DIR="$HOME/Library/Application Support/atelier-studio"
export ATELIER_REMOTE_ALLOWED_HOSTS="127.0.0.1,localhost,$(hostname).$(tailscale status --json 2>/dev/null | jq -r .Self.DNSName | sed 's/\.$//')"

./rust/target/release/atelier-remote-gateway
# Conserver admin token stderr hors git

sudo tailscale serve --bg --https=443 http://127.0.0.1:18765
```

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
3. Health via Safari : `https://<magicdns>/remote/health`
4. Appairage Mac → code → companion
5. Ouvrir un thread, vérifier history

## Rollback

Voir `MIGRATION.md`. Conserver 1 IPA précédent signé hors dépôt.
