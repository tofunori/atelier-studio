# ADR-001 — Architecture client iOS ↔ gateway Mac

- **Statut** : Proposé (jalon A plan 034) — en attente de GO Codex
- **Date** : 2026-07-12
- **Commit baseline** : `0fbfc7a`
- **Décideurs** : Grok (audit), Codex (gate), Thierry (produit)

## Contexte

Thierry veut poursuivre ses conversations Atelier depuis iPhone/iPad, consulter
la Gallery et prévisualiser PDF/PNG/LaTeX, sans déplacer le moteur d’agents hors
du Mac. Le plan 034 impose un client distant sécurisé, jamais un second sidecar.

L’audit du code vivant (commit `0fbfc7a`) montre :

| Surface | État réel |
|---------|-----------|
| Sidecar chat | Rust **par défaut** (`ATELIER_BACKEND` défaut rust, Node en soak) |
| Bind réseau | **`127.0.0.1:0`** uniquement (`atelier-runtime` `ServerConfig.bind`) |
| Auth | Un seul `ATELIER_TOKEN` de session, header `x-atelier-token` / query `?token=` |
| Transport UI | `ws://127.0.0.1:${port}?token=…` depuis `src/lib/ws.ts` |
| Journal | Schema harnais v1 (`HarnessEventMeta` : `eventId`, `sequence`, `turnId`, …) |
| Replay client | `reduceHarnessEvent` + `mergeHarnessHistory` (`src/lib/harnessEvents.ts`) |
| `protocolVersion` | Constante Rust `PROTOCOL_VERSION = 1` — **pas encore sur le fil** |
| Reprise séquence | **Absente** : reconnexion = `listThreads` + `getHistory` complet + merge par `eventId` |
| Gallery | Serveur dédié, origin loopback obligatoire, bearer optionnel |
| Mobile / iOS | Aucune cible active : seul `#[cfg_attr(mobile, tauri::mobile_entry_point)]` + icônes `src-tauri/icons/ios/` |

## Décision

### 1. Modèle client–moteur (verrouillé)

```text
Atelier iOS (Tauri 2 + React)
  → HTTPS/WSS + auth appareil (Tailscale privé)
      → Gateway distante MINIMALE sur le Mac
          → Sidecar loopback (Rust défaut / Node soak)
          → Gallery loopback
          → Journal canonique / store / providers
```

- L’iPhone **ne lance aucun** CLI agent, shell, Git, Zotero ou provider.
- Les clés API restent sur le Mac.
- Le client **ne lit jamais** le filesystem Mac directement.
- Tailscale = réseau privé uniquement ; **pas** d’auth applicative.

### 2. Gateway séparée du sidecar desktop

**Interdiction absolue** d’exposer le sidecar brut (`127.0.0.1` WS/HTTP actuel)
sur le tailnet.

La gateway (jalon C) doit :

1. Écouter uniquement sur l’interface Tailscale (ou `tailscale serve` privé) —
   jamais Funnel / Internet public.
2. Authentifier **par appareil** (jeton long terme Keychain, distinct du
   `ATELIER_TOKEN` desktop de session).
3. Autoriser par **scopes** : `chat:read`, `chat:send`, `chat:interact`,
   `gallery:read`, `files:read`, …
4. Proxifier / adapter vers le sidecar loopback avec le token de session Mac.
5. Refuser par défaut toute route non déclarée.
6. Résoudre les fichiers par `projectId` + id opaque, jamais un chemin client.

Emplacement cible (à confirmer au jalon C après POC) :

```text
rust/crates/atelier-remote/     # crate dédiée gateway
  ou module atelier-runtime::remote
```

Ne pas étendre silencieusement le bind de `atelier-studio-server` à `0.0.0.0`.

### 3. Journal canonique = source de vérité

Réutiliser **sans divergence** le contrat plan 025 :

- `docs/AGENT_HARNESS_CONTRACT.md`
- Types TS : `src/lib/ws.ts` (`HarnessEventMeta`, `AgentEvent`)
- Reducer : `src/lib/harnessEvents.ts` (live ≡ replay)
- Crate Rust : `atelier-protocol` (à enrichir au jalon B, aujourd’hui partiel)

Règles non négociables :

- Idempotence par `eventId`.
- Ordre par `sequence` monotone **par thread**, attribuée côté serveur.
- Pas d’inférence de `done` depuis fermeture de socket.
- Cache mobile = projection remplaçable, jamais source concurrente.

### 4. Reprise réseau (delta vs aujourd’hui)

**Aujourd’hui (desktop)** : reconnect → `getHistory` intégral →
`mergeHarnessHistory` (manquants par `eventId`/`sequence`).

**Cible mobile (jalon F)** : reprise par `lastSequence` + snapshot si la fenêtre
de replay a expiré. Le jalon B formalise l’enveloppe ; le jalon C l’expose.

### 5. Surface API gateway (MVP)

| Capacité | Notes |
|----------|--------|
| `GET /remote/health` | version serveur, `protocolVersion`, scopes |
| Pairing | secret court / QR TTL, échange jeton appareil |
| Projets / threads | lecture paginée |
| Historique | paginé + depuis `lastSequence` |
| Stream WSS | mêmes `AgentEvent` que le journal |
| send / stop / interaction | idempotent (`clientRequestId`) |
| Gallery index | miniatures, filtres |
| Fichier borné | range, ETag, anti-traversée |

Hors MVP gateway : terminal PTY, Git mutatif, Zotero écriture, shell, chemins
arbitraires, Funnel.

### 6. Partage de protocole

Créer un package partagé **seulement** si l’audit B prouve qu’il évite la
duplication (direction plan 034) :

```text
packages/atelier-protocol/   # TS, sans UI
rust/crates/atelier-protocol # déjà existant, à élargir
```

Aujourd’hui les formes `AgentEvent` vivent surtout en TypeScript (`ws.ts`) ;
Rust a health/providers/WS framing. Jalon B doit unifier les enveloppes
minimales sans copier-coller dans trois endroits.

## Alternatives rejetées

| Option | Pourquoi non |
|--------|--------------|
| Exposer sidecar sur Tailscale avec le même token | Surface énorme (term, git, files, settings) ; un token de session desktop volé = full control |
| Agent local sur iPhone | Contredit le produit ; fuites de clés ; hors périmètre |
| Sync fichiers iCloud/rsync des projets | Contournement du journal ; conflits ; pas de streaming |
| Cloudflare Tunnel / Funnel public | STOP condition plan 034 |

## Conséquences

**Positives**

- Isolation sécu claire (scopes, révocation appareil, pas de path arbitraire).
- Réutilisation du journal et du reducer 025.
- Desktop inchangé tant que la gateway n’est pas branchée.

**Négatives / coûts**

- Nouveau composant à opérer (pairing, rotation, UI révocation Mac).
- Double auth (appareil ↔ gateway, gateway ↔ sidecar).
- `protocolVersion` et resume par séquence à construire (absents sur le fil).

**Risques résiduels** : voir `THREAT_MODEL.md`.

## Critères de succès (programme)

- Appairage / révocation sans exposer credentials desktop.
- Live et replay même reducer, zéro doublon.
- Aucun endpoint de chemin arbitraire.
- Desktop non régressé ; soak 033 non cassé.

## Références code

- `src/lib/ws.ts`, `src/hooks/useSidecarConnection.ts`, `src/lib/harnessEvents.ts`
- `src/App.tsx` (orchestration history/send/interaction)
- `rust/crates/atelier-runtime/src/server.rs` (bind loopback, routes)
- `rust/crates/atelier-protocol/src/lib.rs` (`PROTOCOL_VERSION`)
- `docs/AGENT_HARNESS_CONTRACT.md`, `docs/SECURITY.md`
- `plans/025-agent-harness-parity.md`, `plans/033-*.md`, `plans/034-*.md`
