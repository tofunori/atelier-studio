# Tailscale Serve — gateway Atelier (plan 034 C)

> **Jamais Funnel.** Funnel publierait la gateway sur Internet. STOP produit.

## Objectif

Exposer **uniquement** `atelier-remote-gateway` sur le tailnet privé de Thierry,
pendant que le sidecar desktop reste sur `127.0.0.1`.

```text
iPhone (Tailscale)
  → https://<magicdns>  (Serve TLS)
      → 127.0.0.1:18765  atelier-remote-gateway
          → 127.0.0.1:xxxx  sidecar (optionnel, token session)
```

## Prérequis

1. Tailscale installé et connecté sur le Mac et l'iPhone (même tailnet).
2. Binaire gateway compilé :

```bash
cd ~/Documents/atelier-studio
cargo build -p atelier-remote --release --manifest-path rust/Cargo.toml
# binaire : rust/target/release/atelier-remote-gateway
```

3. Lancer la gateway en loopback (recommandé — Serve fait le pont) :

```bash
export ATELIER_REMOTE_BIND=127.0.0.1:18765
export ATELIER_APP_DIR="$HOME/Library/Application Support/atelier-studio"
# optionnel : proxy vers sidecar
# export ATELIER_SIDECAR_BASE=http://127.0.0.1:PORT
# export ATELIER_TOKEN=...   # token session sidecar, jamais le token device

./rust/target/release/atelier-remote-gateway
# noter le jeton admin imprimé une fois sur stderr
```

Autoriser le Host Serve dans l'env si besoin :

```bash
export ATELIER_REMOTE_ALLOWED_HOSTS="127.0.0.1,localhost,<machine>.<tailnet>.ts.net"
```

## Configuration Serve (privée)

Sur le Mac :

```bash
# HTTPS vers la gateway locale — reste dans le tailnet
sudo tailscale serve --bg --https=443 http://127.0.0.1:18765

# Vérifier
tailscale serve status
```

Sur l'iPhone : ouvrir `https://<magicdns-du-mac>/remote/health` depuis Safari
**sur le tailnet** (Tailscale connecté). Attendu : JSON `ok: true`.

### Appairage

1. Mac : Réglages → Avancé → Appareils distants → coller jeton admin → « Démarrer l'appairage ».
   Ou CLI :

```bash
curl -sS -X POST http://127.0.0.1:18765/remote/admin/pairing/start \
  -H "x-atelier-admin-token: $ADMIN" -H 'content-type: application/json' -d '{}'
```

2. iPhone (client jalon D+) : `POST /remote/v1/pair` avec le code court (TTL ~2 min).
3. Stocker le **token device** dans le Keychain iOS — distinct de `ATELIER_TOKEN`.

### Révocation

```bash
curl -sS -X POST "http://127.0.0.1:18765/remote/admin/devices/<deviceId>/revoke" \
  -H "x-atelier-admin-token: $ADMIN"
```

Ou UI Mac (Réglages → Avancé). Un jeton révoqué reste mort après redémarrage Mac
(hash invalidé sur disque).

## Interdits

| Action | Pourquoi |
|--------|----------|
| `tailscale funnel on` | Exposition Internet publique |
| `ATELIER_REMOTE_BIND=0.0.0.0` sans nécessité | Surface large ; refusé par défaut |
| Exposer le port sidecar (chat) via Serve | Contourne scopes / path policy |
| Réutiliser `ATELIER_TOKEN` sur l'iPhone | Contrôle total du Mac |

## Dépannage

| Symptôme | Piste |
|----------|--------|
| `bad_host` | Ajouter le MagicDNS à `ATELIER_REMOTE_ALLOWED_HOSTS` |
| `admin_loopback_only` | Admin uniquement depuis 127.0.0.1 |
| `pairing_expired` | Relancer start pairing |
| Health OK mais threads 401 | Token device manquant / révoqué |

## Fichiers locaux

| Chemin | Contenu |
|--------|---------|
| `~/Library/Application Support/atelier-studio/remote/devices.json` | Devices (token **hashés**), pairing |
| `~/Library/Application Support/atelier-studio/remote/projects.json` | Optionnel : `[{ "path", "name" }]` |

Ne pas committer ces fichiers. Ne pas copier `devices.json` hors du Mac.
