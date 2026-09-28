# Checklist — appareil perdu ou compromis

**Ordre critique : révoquer sur le Mac avant de se préoccuper du client.**

Mis à jour le 2026-09-28 pour l'app native `mobile-native/` et le canal local
`remote/pair.sock` (plus de jeton administrateur à manipuler).

## Immédiat (Mac)

1. [ ] Ouvrir Atelier : Réglages → Général → Avancé → Appareils distants (iPhone).
2. [ ] Identifier l'appareil suspect (nom, dernière activité).
3. [ ] Icône corbeille → **Oublier**. Le jeton est refusé aussitôt.

   Sans l'interface, par la socket locale (réservée au compte macOS) :

   ```sh
   SOCK="$HOME/Library/Application Support/atelier-studio/remote/pair.sock"
   printf 'devices\n' | nc -U "$SOCK"             # repérer le deviceId
   printf 'revoke <deviceId>\n' | nc -U "$SOCK"
   ```

4. [ ] Vérifier que l'appareil figure comme révoqué (`devices` : `"revoked": true`).
   Depuis un autre poste du tailnet, une requête avec l'ancien jeton sur
   `https://<machine>.<tailnet>.ts.net:8443/remote/v1/threads` doit répondre **401**.
5. [ ] Un code d'association en cours expire seul après 120 s.

## Ensuite

6. [ ] Retirer l'appareil du tailnet dans la console Tailscale si possible.
7. [ ] Sur un appareil de remplacement : nouvelle association (nouveau jeton),
   voir [TAILSCALE_SERVE.md](TAILSCALE_SERVE.md).
8. [ ] Ne **pas** restaurer une sauvegarde de l'ancien appareil qui contiendrait
   l'ancien jeton sans vérifier la révocation côté Mac.

## Ce qui est garanti

- Jeton stocké **haché** sur le Mac → la révocation invalide l'empreinte.
- Un redémarrage du Mac **ne réactive pas** un jeton révoqué (`devices.json` persistant).
- Les autres appareils associés restent valides.

## Ce qui n'est pas couvert

- Contenu déjà synchronisé sur l'appareil volé (cache de chats, articles,
  annotations locales).
- Accès physique au téléphone déverrouillé avant la révocation.
