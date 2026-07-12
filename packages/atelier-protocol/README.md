# @atelier/protocol

Contrats fil mobile/desktop partagés (plan **034 jalon B**).

## Contenu

| Zone | Rôle |
|------|------|
| `src/version.ts` | `protocolVersion` + négociation stricte |
| `src/meta.ts` | `HarnessEventMeta` (journal 025) |
| `src/envelopes.ts` | clientHello, serverHello, history, errors, wire events |
| `src/validate.ts` | champs obligatoires / inconnus tolérés |
| `src/sequence.ts` | idempotence `eventId`, gaps, `afterSequence` |
| `src/transcripts/` | transcripts synthétiques S/M/stress-500 |
| `src/fixture/` | moteur déterministe + serveur HTTP/WS loopback |
| `fixtures/*.json` | fixtures partagées Rust ↔ TS |

## Commandes

```bash
# depuis la racine atelier-studio
npm run test:protocol
npm run protocol:export-fixtures
npm run test:rust-workspace   # inclut remote:: tests + fixture JSON

# serveur fixture local
cd packages/atelier-protocol && npm run fixture-server
# (ajouter src/fixture/cli.ts si besoin — les tests démarrent le serveur en process)
```

## Rust miroir

`rust/crates/atelier-protocol/src/remote.rs` — mêmes constantes et sémantiques
de curseur de séquence. Ne pas diverger sans test contractuel des deux côtés.

## Hors scope (jalons suivants)

- Gateway authentifiée (C)
- Client iOS (D+)
- Exposition hors loopback
