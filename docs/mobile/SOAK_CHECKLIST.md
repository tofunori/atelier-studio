# Soak multi-appareil — Mac + iPhone + iPad (plan 034 I)

**Statut** : checklist humaine (pas d'automation device dans le CI).

## Préparation

- [ ] Gateway release + Tailscale Serve
- [ ] Client build release/profiling si dispo
- [ ] Au moins 1 projet avec PDF/PNG/LaTeX réels
- [ ] 2 appareils mobiles OU 1 mobile + simulateur

## Scénarios (cocher + dater)

| # | Scénario | OK | Date | Notes |
|---|----------|----|------|-------|
| 1 | Pair iPhone + list threads | ☐ | | |
| 2 | History long + scroll reading/pinned | ☐ | | |
| 3 | Send + file d'attente offline 30 s avion | ☐ | | |
| 4 | Kill app après send avant ack → retry | ☐ | | |
| 5 | Mac sleep/wake | ☐ | | |
| 6 | Tailscale off/on | ☐ | | |
| 7 | Gateway restart | ☐ | | |
| 8 | Même thread Mac + iPhone | ☐ | | |
| 9 | Gallery PDF/PNG/tex + add-to-chat | ☐ | | |
| 10 | Interaction approval (si dispo) | ☐ | | |
| 11 | Notif opt-in locked/unlocked | ☐ | | |
| 12 | Deep link vers thread | ☐ | | |
| 13 | Révoquer 1 device, l'autre OK | ☐ | | |
| 14 | iPad rotation + Dynamic Type | ☐ | | |
| 15 | 20 min streaming / usage normal | ☐ | | |

## Critères d'échec soak

- Doublon message après reconnect
- Faux `done` sans event journal
- Boucle reconnect agressive (battery)
- Fuite token dans diagnostics
- Crash sur transcript stress

## Sortie

Quand la table est majoritairement OK et 0 incident P0 :

- Cocher done criteria plan 034 §19 encore ouverts
- Archiver notes dans ce fichier ou issue privée
