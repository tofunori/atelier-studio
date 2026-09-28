# Tailscale Serve et association de l'iPhone

> **Jamais Funnel.** Funnel publierait la passerelle sur Internet. Serve la garde
> dans le tailnet privé.

Mis à jour le 2026-09-28 pour l'app native [`mobile-native/`](../../mobile-native/README.md).
Le client web `mobile/` décrit par les autres documents de ce dossier est gelé.

## Chemin réseau

```text
iPhone (Tailscale, app Atelier)
  → https://<machine>.<tailnet>.ts.net:8443     Tailscale Serve (TLS du tailnet)
      → http://127.0.0.1:18765                  adaptateur local de atelier-remote-gateway
          → moteur Atelier sur 127.0.0.1         jeton de session, jamais transmis à l'iPhone
```

Atelier.app lance `atelier-remote-gateway` (`rust/crates/atelier-remote`) dès que
Tailscale est connecté sur le Mac (`src-tauri/src/remote_gateway.rs`). La
passerelle écoute sur l'IP Tailscale du Mac, port 18765, et sur
`127.0.0.1:18765` ; l'adaptateur local répond 404 à toutes les routes
`/remote/admin`. Atelier lui fournit la liste des hôtes autorisés, dont
`<machine>.<tailnet>.ts.net:8443`. Rien à exporter à la main.

## Mise en place, une fois

1. Tailscale sur le Mac et sur l'iPhone, dans le même tailnet, avec MagicDNS et
   les certificats HTTPS activés (console Tailscale, onglet DNS).
2. Sur le Mac, publier la passerelle dans le tailnet sur le port 8443 :

   ```sh
   tailscale serve --bg --https=8443 http://127.0.0.1:18765
   tailscale serve status
   ```

   `--bg` conserve la configuration après un redémarrage. Avec l'app Tailscale
   du Mac, la commande est aussi
   `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.
3. Vérifier depuis Safari sur l'iPhone, Tailscale connecté :
   `https://<machine>.<tailnet>.ts.net:8443/remote/health` doit renvoyer un JSON
   avec `ok: true`.

## Associer l'iPhone

1. Sur le Mac : Réglages → Général → Avancé → Appareils distants (iPhone) →
   **Ajouter**. Atelier demande un code temporaire (valable 120 s) à la
   passerelle par la socket locale
   `~/Library/Application Support/atelier-studio/remote/pair.sock` (mode 0600,
   réservée au compte macOS). Aucun jeton administrateur n'intervient.
2. **Copier le lien de connexion**. Il a la forme
   `atelier-native://pair?address=https://<machine>.<tailnet>.ts.net:8443&code=<code>`
   (adresse encodée dans le lien).
3. Sur l'iPhone : ouvrir ce lien (Notes, Messages, AirDrop), ou dans l'app,
   Galerie → Connecter le Mac → Coller le lien du Mac. L'app échange le code
   contre un jeton propre à l'appareil, gardé dans le trousseau iOS.

Dans le simulateur, `python3 mobile-native/scripts/connect-simulator.py <UDID>`
fait les trois étapes d'un coup.

## Révoquer un appareil

Réglages → Général → Avancé → Appareils distants (iPhone) : icône corbeille à
côté de l'appareil, puis **Oublier**. Le jeton cesse de marcher aussitôt, y
compris après un redémarrage du Mac (son empreinte est invalidée sur disque).

Sans l'interface, la même socket répond en ligne de commande :

```sh
SOCK="$HOME/Library/Application Support/atelier-studio/remote/pair.sock"
printf 'devices\n' | nc -U "$SOCK"             # liste, avec deviceId
printf 'revoke <deviceId>\n' | nc -U "$SOCK"   # révocation
```

Appareil perdu : [REVOCATION_CHECKLIST.md](REVOCATION_CHECKLIST.md).

## Interdits

| Action | Pourquoi |
|--------|----------|
| `tailscale funnel` | Exposition Internet publique |
| `ATELIER_REMOTE_BIND=0.0.0.0` | Surface large ; refusé par défaut |
| Publier le port du moteur Atelier par Serve | Contourne les portées et la politique de chemins |
| Réutiliser `ATELIER_TOKEN` sur l'iPhone | Contrôle total du Mac |

## Dépannage

| Symptôme | Piste |
|----------|--------|
| Health injoignable sur `:8443` | `tailscale serve status` : la règle 8443 → `127.0.0.1:18765` existe-t-elle ? Atelier est-il ouvert ? |
| `bad_host` | Nom MagicDNS changé : relancer Atelier, qui recalcule la liste des hôtes |
| « Le port iPhone est utilisé par un autre programme » | Un autre processus tient 18765 : `lsof -nP -iTCP:18765` |
| `pairing_expired` | Code de plus de 120 s : Ajouter à nouveau |
| Health OK mais 401 dans l'app | Jeton révoqué ou perdu : associer à nouveau |

Journal de la passerelle : `~/Library/Application Support/atelier-studio/remote/gateway.log`.

## Fichiers locaux

| Chemin | Contenu |
|--------|---------|
| `~/Library/Application Support/atelier-studio/remote/devices.json` | Appareils (jetons **hachés**), association en cours |
| `~/Library/Application Support/atelier-studio/remote/pair.sock` | Canal local d'association et de révocation |
| `~/Library/Application Support/atelier-studio/remote/gateway.lock` | Processus passerelle géré par Atelier |

Ne pas committer ces fichiers. Ne pas copier `devices.json` hors du Mac.
