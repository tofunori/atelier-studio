# Plan 051 : La base de connaissances à l'échelle — collections, panneau réorganisé, chargement instantané

> Suite des plans 049/050 (livrés). Design de référence : artefact « Atelier —
> Panneau KB à l'échelle » v4 (2026-07-18). Décisions YouTube actées en
> défauts : playlists hors périmètre v1, pas de transcription whisper (refus
> propre conservé), chaîne affichée en méta. Committer tôt et petit ; pas de
> push sans demande. Toute écriture de store vit dans le CLI `atelier-kb` ;
> lectures chaudes en natif là où ça compte (kbList Rust).

## Statut

- **Priority** : P1 — **Effort** : L (4 tranches) — **Risk** : LOW-MEDIUM
  (additif ; migration de registre v1→v2 douce ; refonte UI du panneau)
- **Planned at** : 2026-07-18, worktree `atelier-knowledge-base`

## Décisions actées (design v4)

- **Collections manuelles** en chips-filtres (une source ∈ 0..n collections,
  assignation par menu de rangée, suppression d'une collection = perte de
  l'étiquette, jamais des sources).
- **Groupes repliables** avec comptes (états mémorisés), plafond 20 rangées +
  « tout afficher (N) » ; Attachées + Récents toujours ouverts en tête.
- **Rangée Récents** (5 dernières ajoutées/mises à jour).
- **Recherche étendue** (titre + origine + préfixes `type:` / `coll:`) et
  **tri** Récent / A-Z / Taille.
- **Archivage** (masqué partout sauf filtre « archivées » ; une source
  archivée mais attachée reste injectée — l'attache prime).
- **Vitesse** : kbList natif Rust (~1 ms, plus de spawn Node en lecture),
  TTL 30 s du store front, rendu minimal par construction (replié = 0 DOM).
- **YouTube** : méta chaîne (« 48 min · TED ») ; playlists et whisper = non.
- Le popover du composer hérite chips-collections + Récents, reste compact.

## Modèle (additif, migration douce)

```
knowledge.json v2 :
{ "version": 2,
  "collections": [{ "slug": "agu26", "title": "AGU26" }],   // ordre = récence
  "sources": [{ …, "collections": ["agu26"], "archived": false,
                "meta": { …, "channel": "TED" } }] }
v1 lu tel quel (champs absents = [] / false) ; réécrit en v2 à la première
mutation. Les lecteurs (kb_block rs, kbList rs) tolèrent version 1 ET 2.
```

### CLI (écritures, relayées par les deux backends)

```
atelier-kb collection --add "AGU26" | --rename agu26 "AGU 2026" | --remove agu26
atelier-kb tag --id <id> --collection <slug> [--off]
atelier-kb archive --id <id> [--off]
atelier-kb list [--collection <slug>] [--archived]
```

### Routes WS

`kbCollection { op, slug?, title? }`, `kbTag { id, collection, off? }`,
`kbArchive { id, off? }` → réponses `kbSources` complètes (source de vérité
rebroadcastée). `kbList` : Rust répond en natif (lecture directe du
registre) ; Node répond via le store comme avant.

## Tranches

- **P1 — Store & CLI** : registre v2, commandes collection/tag/archive,
  list filtré, méta channel YouTube à l'extraction ; miroir de lecture Rust
  tolérant v1/v2 ; tests sidecar + rust. *Accept.* : cycle complet en
  terminal ; parité kb_block inchangée.
- **P2 — Panneau réorganisé** : chips-filtres + création/gestion, groupes
  repliables mémorisés + plafond 20, Récents, tri, recherche étendue, menu
  d'assignation, action archiver, footer ; popover hérite chips + Récents.
  *Accept.* : tests front (états repliés, filtres, plafond), css-contract.
- **P3 — Vitesse** : kbList natif Rust + TTL 30 s front. *Accept.* : mesure
  avant/après consignée ici ; plus aucun spawn Node sur le chemin lecture.
- **P4 — Validation** : base synthétique 200 sources (script jetable),
  ouverture fluide, e2e vivant (collections + filtre + attache + send),
  relance protocolaire, statut.

## STOP conditions

- Registre v1 corrompu par la migration = interdit (backup .corrupt- déjà en
  place ; la migration n'écrit qu'après relecture réussie).
- css-contract rouge = corriger le design, pas le test.

## Hors périmètre

Playlists/chaînes YouTube (source composée — plus tard si demande réelle),
transcription whisper locale, drag & drop d'assignation, virtualisation de
liste (> 1000 sources), base de données.
