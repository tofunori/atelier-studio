# Runbook — Companion iOS + gateway Mac

> **Partiellement historique.** Les sections « iOS / companion », file d'envoi
> et cache décrivent le client web `mobile/`, gelé depuis le 2026-09-28 et
> remplacé par l'app native [`mobile-native/`](../../mobile-native/README.md).
> Les contrôles de la passerelle restent valables ; association, Tailscale et
> révocation à jour : [TAILSCALE_SERVE.md](TAILSCALE_SERVE.md).

## Santé rapide

### Mac gateway

```bash
curl -sS http://127.0.0.1:18765/remote/health | jq .
# ok:true, protocolVersion:1, service:atelier-remote-gateway
```

### Appareils associés (Mac)

Réglages → Général → Avancé → Appareils distants (iPhone), ou :

```bash
printf 'devices\n' | nc -U "$HOME/Library/Application Support/atelier-studio/remote/pair.sock"
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
2. Relancer Atelier : il relance la passerelle (voir TAILSCALE_SERVE)
3. Client : file d'envoi `pending_local` + reconnect backoff automatique
4. Ne pas conclure « bug chat » sans health gateway

### Tailscale absent

1. iPhone : app Tailscale connectée, même tailnet
2. Mac : `tailscale status`
3. `tailscale serve status` : HTTPS 8443 → `127.0.0.1:18765`
4. Client phase `tailscale_missing` si URL `.ts.net` injoignable

### Pairing échoue

| Code erreur | Action |
|-------------|--------|
| `no_pairing` | Mac : Réglages → Appareils distants (iPhone) → Ajouter |
| `pairing_expired` | Ajouter à nouveau (code valable 120 s) |
| `pairing_invalid` | Vérifier code (case-insensitive) |
| `pairing_locked` | Trop d'essais → Ajouter à nouveau |
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

Atelier calcule la liste des hôtes au lancement de la passerelle, dont
`<machine>.<tailnet>.ts.net:8443`. Après un changement de nom MagicDNS,
relancer Atelier.

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
