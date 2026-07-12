# Rétention cache et données personnelles — Companion

## Données sur l'iPhone / iPad

| Donnée | Stockage | Rétention | Contient secrets ? |
|--------|----------|-----------|-------------------|
| Token device | secure storage / Keychain path | Jusqu'à révocation ou « Oublier cet appareil » | **Oui** |
| Send queue | secure storage | Purge des `durable` au-delà de 50 entrées | Prompt utilisateur (sensible) |
| Thread cache | secure storage | Max **20** threads, **800** events/thread ; âge max **14 jours** (purge) | Contenu conversation |
| Notif prefs | localStorage | Permanent jusqu'à reset app | Non |
| Badge count | localStorage | Jusqu'à consultation | Non |
| Attachments pending | sessionStorage | Session navigateur / jusqu'à envoi | Métadonnées fichier |

## Données sur le Mac

| Donnée | Rétention |
|--------|-----------|
| devices.json (hash tokens) | Jusqu'à révocation manuelle / purge admin |
| Journal harness | Politique desktop Atelier (inchangée) |
| Admin token hash | Rotatif à régénération process si nouveau fichier |

## Purge

### Utilisateur

- **Oublier cet appareil** (client) : efface credentials locaux.
- **Révoquer** (Mac admin) : invalide le hash serveur.
- Clear badge dans Réglages.

### Automatique (client)

- `purgeOldCaches(20)` à chaque save cache.
- `purgeExpiredCaches(14 jours)` au boot / refresh (jalon I).
- `purgeDurable` send queue (garde 50).

### Perte d'appareil

Voir `REVOCATION_CHECKLIST.md` — révoquer **d'abord** sur le Mac.

## Notifications

- Opt-in.
- Contenu minimal : pas de prompt, pas de chiffres/science par défaut.
- Option « titre de fil » seulement, jamais le corps du message.

## Interdits

- Logs avec token, admin token, pairing code en clair après affichage opérateur.
- Fixtures / captures d'écran avec secrets réels dans le dépôt.
- Funnel / exposition Internet publique.
