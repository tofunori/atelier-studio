# Migration et rollback — Companion + gateway

## Principes

1. Le **journal Mac** reste la source de vérité (harness-history).
2. Le cache iOS est une **projection remplaçable** (versionnée).
3. Les jetons appareil sont **hashés** sur le Mac ; un rollback binaire ne réactive pas un token révoqué.

## Versions de données locales (iOS / web companion)

| Store | Clé / format | Version |
|-------|----------------|---------|
| Credentials device | secure storage `atelier.device.credentials.v1` | 1 |
| Send queue | `atelier.sendQueue.v1` | 1 (recover inflight→pending) |
| Thread cache | `atelier.threadCache.v1.*` | 1 (migrate from unversioned) |
| Notif prefs | `atelier.notifPrefs.v1` | 1 |
| Badge | `atelier.badgeCount.v1` | 1 |
| Pending attaches | sessionStorage `atelier.pendingChatAttachments.v1` | 1 |

### Migration cache

`migrateThreadCache()` accepte :

- v1 explicite ;
- legacy sans `version` → promu en v1.

Échec de parse → cache ignoré, resync full depuis gateway.

### Rollback client

1. Installer l'IPA/build précédent.
2. Si le format credentials a changé de façon incompatible : **réapparairer**.
3. Purger le cache local (Réglages futurs ou clear secure store) si UI incohérente.

## Données Mac (gateway)

| Fichier | Rôle |
|---------|------|
| `~/Library/Application Support/atelier-studio/remote/devices.json` | devices (token **hash**), pairing, admin_token_hash |
| `…/remote/projects.json` | racines projet optionnelles |
| harness-history / threads.json | journal et liste (inchangés par mobile) |

### Migration gateway

- Ajout de champs JSON **tolérés** (forward compatible).
- Suppression de champ requis = **breaking** → bumper `protocolVersion` / min.

### Rollback gateway

1. Arrêter `atelier-remote-gateway`.
2. Restaurer binaire précédent.
3. **Ne pas** restaurer un ancien `devices.json` par-dessus un état révoqué récent si l'appareil a été compromis — préférer révoquer à nouveau.
4. Relancer + health check.

## Procédure upgrade recommandée

```text
1. Build + tests client et remote
2. Déployer gateway Mac (loopback + Tailscale Serve)
3. Health + pair test
4. Installer client (TestFlight privé / install ad-hoc)
5. Vérifier protocolVersion
6. Soak court (voir SOAK_CHECKLIST.md)
```

## Breaking changes futurs (template)

| Change | Action client | Action serveur |
|--------|---------------|----------------|
| protocol 2 | min client bump | max/min health |
| scopes renommés | re-pair | mapping transition |
| journal schema 2 | package protocol | dual-read period |
