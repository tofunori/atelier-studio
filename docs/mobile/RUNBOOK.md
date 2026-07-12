# Runbook — Companion iOS + gateway Mac

## Santé rapide

### Mac gateway

```bash
curl -sS http://127.0.0.1:18765/remote/health | jq .
# ok:true, protocolVersion:1, service:atelier-remote-gateway
```

### Mac admin devices

```bash
curl -sS http://127.0.0.1:18765/remote/admin/devices \
  -H "x-atelier-admin-token: $ADMIN" | jq .
```

### iOS / companion

- Réglages → Diagnostics (copiable, **sans** token).
- Phase : `never_paired` | `offline` | `tailscale_missing` | `auth_expired` | `version_incompatible` | `connecting` | `ready`.

### Sidecar desktop (ne pas exposer)

```bash
# loopback only — token session ATELIER_TOKEN
curl -sS -H "x-atelier-token: $ATELIER_TOKEN" http://127.0.0.1:$PORT/health
```

---

## Symptômes → actions

### Mac hors ligne / gateway down

1. Vérifier process : `pgrep -fl atelier-remote-gateway`
2. Relancer (voir DISTRIBUTION / TAILSCALE_SERVE)
3. Client : file d'envoi `pending_local` + reconnect backoff automatique
4. Ne pas conclure « bug chat » sans health gateway

### Tailscale absent

1. iPhone : app Tailscale connectée, même tailnet
2. Mac : `tailscale status`
3. `tailscale serve status` pointe vers `127.0.0.1:18765`
4. Client phase `tailscale_missing` si URL `.ts.net` injoignable

### Pairing échoue

| Code erreur | Action |
|-------------|--------|
| `no_pairing` | Mac : démarrer pairing admin |
| `pairing_expired` | Relancer start (TTL ~120 s) |
| `pairing_invalid` | Vérifier code (case-insensitive) |
| `pairing_locked` | Trop d'essais → nouveau start |
| `protocol_version_unsupported` | Aligner versions client/serveur |

### Certificat / HTTPS Serve

1. Tailscale gère le TLS MagicDNS — pas de cert custom MVP
2. Si erreur TLS : horloge appareil, Serve redémarré, DNS
3. Dev local : `http://127.0.0.1:18765` (simulateur / même machine)

### Auth expirée / 401

1. Token révoqué ou corrompu → **réappareiller**
2. Vérifier scopes device sur Mac
3. Ne jamais coller `ATELIER_TOKEN` sidecar dans le client

### Cache corrompu (UI bizarre / historique incomplet)

1. Ouvrir un autre thread puis revenir (resync)
2. « Oublier cet appareil » + re-pair (nuclear)
3. Ou purge programmatique des clés `atelier.threadCache.v1.*`
4. Le journal Mac n'est pas affecté

### Host / Origin refusés (`bad_host`)

```bash
export ATELIER_REMOTE_ALLOWED_HOSTS="127.0.0.1,localhost,<machine>.<tailnet>.ts.net"
```

### Fichier hors projet / path escape

- Normal : gateway refuse `..`, absolu, symlink sortant
- Client ne doit utiliser que `fileId`

### Double appareil / un seul révoqué

- Attendu : l'autre continue à fonctionner (tests security C)

---

## Logs

- Gateway : stderr tracing, **sans** token fields
- Companion diagnostics : redacted
- Ne pas coller de logs bruts contenant pairing codes actifs dans des issues publiques
