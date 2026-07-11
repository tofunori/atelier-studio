# Décision de distribution macOS

Date: 2026-07-11
Décision: **embarquer Node.js 22.22.3 arm64 dans Atelier**.
Approbation: Thierry a explicitement autorisé cette option après présentation du coût en taille.

## Options évaluées

| Option | Installation chercheur | Reproductibilité | Taille | Risque principal |
|---|---|---:|---:|---|
| Node embarqué | Aucune installation Node | Forte, version figée | +108 Mo non compressés | Suivi des correctifs Node à notre charge |
| Sidecar compilé | Aucune | Moyenne | Potentiellement moindre | Compatibilité des SDK, modules natifs et chargements dynamiques |
| Node système | Node/Homebrew requis | Faible | Aucun surcoût | PATH Finder, versions divergentes, onboarding fragile |

Le runtime embarqué est retenu parce que la fiabilité d'une application de
recherche partageable prime sur environ 108 Mo supplémentaires. Le sidecar et
la galerie utilisent le même runtime. Les CLI Claude Code et Codex restent
externes afin de réutiliser leurs authentifications et permissions.

## Provenance et intégrité

- Runtime: Node.js `v22.22.3`, distribution officielle `darwin-arm64`.
- Archive: `node-v22.22.3-darwin-arm64.tar.gz`.
- Source: `https://nodejs.org/dist/v22.22.3/`.
- SHA-256 archive: `0da7ff74ef8611328c8212f17943368713a2ad953fb7d89a8c8a0eae87c23207`.
- Le script `scripts/stage-node-runtime.sh` refuse toute archive dont le
  checksum diffère, puis ne copie que `bin/node`, `LICENSE` et `VERSION`.
- La licence Node distribuée avec l'archive est incluse dans le bundle.

## Mesures

- Bundle Atelier avant intégration: 135 Mo.
- Runtime minimal stagé: 108 Mo (`bin/node` = 112 915 776 octets).
- Bundle Atelier après intégration: 243 Mo (+108 Mo exactement à l'échelle `du`).
- DMG signé de validation: 80 Mo.

## Exploitation et mises à jour

- Vérifier mensuellement les correctifs de sécurité de la branche Node 22.
- Toute mise à jour modifie ensemble version, URL et checksum, puis repasse
  `npm run verify`, le build Tauri et le smoke réel sans Node système.
- Le cache `.cache/node-runtime` accélère les builds locaux; il n'est jamais
  considéré comme fiable sans la vérification SHA-256.
- La signature/notarisation publique demeure un chantier séparé et aucun secret
  de signature n'est stocké dans le dépôt.
- Les builds locaux gardent l'identité stable `Atelier Dev Signing` pour limiter
  les consultations TCC. Le workflow de release applique
  `src-tauri/tauri.release.conf.json` et produit une RC non signée tant que les
  secrets de signature/notarisation ne sont pas configurés.
