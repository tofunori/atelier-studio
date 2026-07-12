# Checklist — appareil perdu ou compromis

**Ordre critique : révoquer sur le Mac avant de se préoccuper du client.**

## Immédiat (Mac)

1. [ ] Ouvrir Atelier **ou** appeler l'API admin gateway en loopback.
2. [ ] Lister les appareils :
   ```bash
   curl -sS http://127.0.0.1:18765/remote/admin/devices \
     -H "x-atelier-admin-token: $ADMIN"
   ```
3. [ ] Identifier `deviceId` suspect (nom, lastSeenAt).
4. [ ] Révoquer :
   ```bash
   curl -sS -X POST \
     "http://127.0.0.1:18765/remote/admin/devices/<deviceId>/revoke" \
     -H "x-atelier-admin-token: $ADMIN"
   ```
5. [ ] Vérifier qu'un `GET /remote/v1/threads` avec l'ancien token renvoie **401**.
6. [ ] (Optionnel) Annuler tout pairing en cours :
   ```bash
   curl -sS -X POST http://127.0.0.1:18765/remote/admin/pairing/cancel \
     -H "x-atelier-admin-token: $ADMIN"
   ```
7. [ ] Si l'admin token a pu fuiter : régénérer (supprimer `admin_token_hash` / relancer gateway pour nouveau token, ou API rotate si dispo) et mettre à jour Réglages Mac.

## Ensuite

8. [ ] Changer le code Tailscale / déconnecter l'appareil du tailnet si possible.
9. [ ] Sur un appareil de remplacement : nouvel appairage (nouveau token).
10. [ ] Ne **pas** restaurer une sauvegarde iCloud du compagnon qui contiendrait l'ancien token sans re-vérifier la révocation serveur.

## Ce qui est garanti

- Token stocké **hashé** sur le Mac → la révocation invalide le hash courant.
- Redémarrage Mac **ne réactive pas** un token révoqué (`devices.json` persistant).
- Les autres appareils appairés restent valides.

## Ce qui n'est pas couvert

- Contenu déjà synchronisé / capturé hors app sur l'appareil volé.
- Accès physique au téléphone déverrouillé avant révocation.
