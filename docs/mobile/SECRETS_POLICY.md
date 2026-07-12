# Politique secrets — Companion + gateway

## Règles

1. **Jamais** de token device, admin token, `ATELIER_TOKEN`, clé API provider dans :
   - le dépôt git
   - les logs applicatifs par défaut
   - les diagnostics copiables
   - les notifications
   - les fixtures versionnées

2. Pairing code : durée de vie courte ; ne pas archiver en clair.

3. `devices.json` : uniquement **hash** SHA-256 des tokens.

4. Diagnostics client : `tokenPreview: [redacted]`, `hasToken: yes|no`.

5. Gateway tracing : pas de champs token (déjà direction R1).

## Checklist avant commit / capture

- [ ] `git diff` ne contient pas de `ATELIER_TOKEN=`, `x-atelier-admin-token` avec valeur
- [ ] Pas de `devices.json` réel
- [ ] Screenshots Diagnostics sans secret visible
- [ ] `npm run mobile:check-secrets` vert

## Scan automatisé

```bash
npm run mobile:check-secrets
```

Patterns refusés dans `mobile/` et `docs/mobile/` (hors ce fichier de politique) :
- chaînes type sk- / ghp_ / tokens hex 64 collés dans le source
- fichiers `.env` commités

## En cas de fuite

1. Révoquer tous les devices (`REVOCATION_CHECKLIST.md`)
2. Rotater admin token gateway
3. Rotater clés API providers si exposées (Mac)
4. Invalider Tailscale node si besoin
