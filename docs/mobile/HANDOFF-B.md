# Handoff jalon B — plan 034

### Périmètre livré

- Package TS `@atelier/protocol` : enveloppes wire, validation, curseur de séquence, transcripts, fixture engine + serveur WS.
- Crate Rust `atelier-protocol::remote` : négociation version, meta, apply batch, slice, test fixture JSON partagée.
- Fixtures JSON exportées (small/medium/interaction/error/interrupt).
- Tests contractuels TS (41+) + parity reducer desktop + tests Rust remote (7 nouveaux).
- Scripts root : `test:protocol`, `protocol:export-fixtures`, `test:rust-workspace` ; `verify` enrichi.
- **Pas** de gateway réseau ni d’app iOS (jalons C/D).

### Fichiers modifiés / créés

- `packages/atelier-protocol/**` — package complet
- `packages/atelier-protocol/fixtures/*.json` — fixtures contractuelles
- `rust/crates/atelier-protocol/src/remote.rs` — miroir Rust
- `rust/crates/atelier-protocol/src/lib.rs` — `mod remote`, `PROTOCOL_VERSION` aligné
- `src/lib/protocolHarnessParity.test.ts` — fixture → `harnessEvents`
- `package.json` — scripts protocol + verify
- `docs/mobile/HANDOFF-B.md` — ce handoff

### Contrats/invariants touchés

- **Nouveau** `protocolVersion` (wire) distinct de `meta.schemaVersion` (journal).
- Identités journal inchangées : `eventId`, `sequence`, `turnId`, `messageId`, `itemId`.
- Reprise formalisée : `getHistory.afterSequence` (exclusif) + `snapshotRequired`.
- Idempotence par `eventId` ; trous → gaps explicites, **pas** d’invention d’events.
- Sidecar desktop **non exposé** ; fixture loopback only.
- Desktop `ws.ts` types non déplacés encore (évite big-bang) — parity testée via fixtures.

### Tests exécutés

```text
npm run protocol:export-fixtures
  → 5 fixtures JSON

cd packages/atelier-protocol && npm test
  → 5 files, 41+ tests passed (re-run after contract file)

cargo test -p atelier-protocol --manifest-path rust/Cargo.toml --locked
  → 10 passed (dont shared_fixture_small_transcript_if_present)

npx vitest run src/lib/protocolHarnessParity.test.ts
  → (à confirmer dans la même session)
```

### Mesures appareil

- N/A (pas de client iOS). Stress transcript 500 users généré en tests unitaires.

### Preuves visuelles

- Aucune.

### Limites et risques restants

1. Les types riches `AgentEvent` desktop restent dans `src/lib/ws.ts` — le package mobile a un sous-ensemble `WireAgentEvent` ; élargir au besoin sans triplication.
2. Le sidecar Node de prod n’émet pas encore `serverHello` / `afterSequence` — gateway C devra adapter ou le runtime Rust.
3. Fixture server sans auth (voulu) — ne jamais le binder hors loopback en prod.
4. Stress 500 n’est pas exporté en JSON (trop gros) — généré à la volée en test.
5. Codex doit injecter ≥3 séquences adversariales hors suite Grok (gate B).

### Drift et changements hors plan

- `verify` inclut maintenant `test:protocol` et `test:rust-workspace` (plus long) — nécessaire pour le contrat 034.
- Aucune modification gateway/mobile UI.

### Demande à Codex

**`GO`** pour jalon C (gateway distante sécurisée), après revue des types/fixtures/idempotence et injection de 3 séquences adversariales.
