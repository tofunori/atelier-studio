# Plan d'implémentation — Surface Calculs (tranche 1)

Spec : `docs/superpowers/specs/2026-09-06-surface-calculs-design.md`. Branche `feat/surface-calculs`.
Découvertes de la carte d'intégration qui fixent les choix ci-dessous :

- `narval.rs` n'a **aucun exécuteur injectable** (`run_ssh` spawn `ssh` en dur, tests = parseurs purs). Le module `compute` crée son propre seam `trait Exec` ; l'adaptateur Slurm délègue à `narval::snapshot` et n'est testé que sur le mapping `SlurmJob → Run`.
- Backend chat = Rust seul ; `parity.rs::inventory_covers_node_cases` exige une exemption explicite pour tout message Rust-only : ajouter `computeSnapshot | computeReadLog` à la liste des `matches!`.
- Front : `NarvalSurface.tsx` (850 l., 62 classes `.narval-*`, 4 tests) est **conservé tel quel** et embarqué comme « vue Slurm » de la nouvelle surface. Aucune réécriture des vues Slurm.
- Réponses WS reçues via le pont `App.tsx:2329` (CustomEvent `narval-message`) : ajouter un pont `compute-message` pour `computeSnapshot` / `computeLog`.
- Aucun `~/.atelier` n'existe : convention nouvelle `~/.atelier/runs/` (identique Mac/NAS), surcharge `ATELIER_RUNS_DIR`.

## Contrat WS (gel)

```
→ { type:"computeSnapshot", requestId, hosts?: ["mac"|"nas"|"narval"], days?: 1..30 (déf. 7) }
← { type:"computeSnapshot", requestId, data:{ observedAt, runs:[Run], errors:[{host,code,message}] } }
→ { type:"computeReadLog", requestId, runId, tailLines?: 1..400 (déf. 200) }
← { type:"computeLog", requestId, runId, data:{ lines:[string], truncated:bool } }  |  error:{code,message}
Run (camelCase) : id, source, host, label, command, workDir, state, startedAt, endedAt?, lastActivityAt,
  progress?{current,total,unit}, logPath?, logTail:[string], remoteTasks:[], detail:{kind:"local",pid}|{kind:"docker",container}|{kind:"unit",unit}|{kind:"slurm",jobId,profile}
```

## Tâches

### T1 — Rust `atelier-workspace::compute` (agent Rust)
Fichiers : `rust/crates/atelier-workspace/src/compute/{mod.rs,types.rs,exec.rs,local.rs,nas.rs,slurm.rs}`, `lib.rs` (exports `compute_snapshot`, `compute_read_log`, types), fixtures `rust/crates/atelier-workspace/tests/fixtures/compute/*.json|txt`.
- `types.rs` : `Run`, `RunState`, `Progress`, `RunDetail`, `HostError`, `Snapshot` (Serialize camelCase, PartialEq).
- `exec.rs` : `trait Exec { fn run(&self, program:&str, args:&[&str], timeout:Duration) -> Result<Output,ExecError> }` ; `SystemExec` (sortie bornée 2 MiB, kill à l'échéance, même options ssh que narval : BatchMode, ConnectTimeout=8) ; `FakeExec` en test (map commande → sortie).
- `local.rs` : lit `$ATELIER_RUNS_DIR|~/.atelier/runs/*/run.json` (version 1), `kill(pid,0)` via `libc` (ou `/bin/kill -0` par Exec) ; `running` + pid mort → `unknown` ; `last_activity_at` = mtime `log.txt` ; `log_tail` 40 lignes ; fenêtre `days`.
- `nas.rs` : une commande `ssh nas 'docker ps -a --no-trunc --format "{{json .}}" ; echo ::SEP ; systemctl --user list-units --type=service,timer --all --output=json --no-pager ; echo ::SEP ; for f in ~/.atelier/runs/*/run.json; do echo "::FILE $f"; cat "$f"; done'` ; parseurs séparés et testés ; exclusion par nom (`jellyfin`, `paperless`, `mcp`, `redis`, `postgres`, `gotenberg`, `tika`, `broker`) ; état docker : `Up` → running, `Exited (0)` → completed, `Exited (n)` → failed, `Created` → queued ; unités : `activating|active` → running, `inactive` + résultat `success` → completed, `failed` → failed. Logs : `docker logs --tail N`, `journalctl --user -u U -n N --no-pager`, `tail -n N`.
- `slurm.rs` : `fn runs_from_snapshot(profile:&str, snap:&NarvalSnapshot) -> Vec<Run>` (actifs + récents), état normalisé ; `collect` appelle `narval::snapshot(profile, days)`.
- `mod.rs` : `pub fn snapshot(hosts:&[Host], days:u32, exec:&dyn Exec) -> Snapshot` (3 threads `std::thread::scope`, erreurs par hôte, tri running d'abord puis `last_activity_at` desc, ≤ 200 runs) ; `pub fn read_log(run_id:&str, tail:u32, exec:&dyn Exec) -> Result<LogChunk,HostError>` qui route par préfixe d'id.
- Tests : parseurs sur fixtures ; local sur tempdir (pid vivant = pid du test, pid mort = 999999, terminé) ; fusion avec un hôte en erreur ; exclusion ; mapping Slurm ; tri et plafond.

### T2 — `ws_router.rs` (agent Rust, après T1)
- `ALL_MESSAGE_TYPES` + 2 ; arms `computeSnapshot` / `computeReadLog` en `spawn_blocking`, même enveloppe que `narval_reply_with` (généraliser en `workspace_reply_with` ou dupliquer 20 lignes) ; `parity.rs` exemption ; test `compute_snapshot_preserves_request_id`.

### T3 — Front (agent front, en parallèle de T1/T2 sur le contrat gelé)
- `src/components/surfaces.tsx` : `"narval"` → `"calculs"`, `labelKey "atelier.calculs"`, icône SVG maison (cadran, stroke 1.3, viewBox 16). `workspaceLayout.ts` : set + migration `narval → calculs` au chargement. `AtelierPane.tsx` : lazy `CalculsSurface`, guard singleton, rendu `surface:calculs`, `openNarvalTerminal` renommé `openHostTerminal`. `App.tsx` : pont `compute-message`.
- `src/components/CalculsSurface.tsx` : props `{visible, onOpenTerminal, paneControls?}` ; chips hôte (Tous/Mac/NAS/Narval) via `SegmentedControl` ou `RowButton` ; `wsSend({type:"computeSnapshot"…})` avec latch requestId ; poll 30 s si visible ; liste (pastille+mot d'état, label, hôte·source, commande mono tronquée, durée, dernière activité) ; inspecteur onglets Aperçu / Log (`computeReadLog` 400) ; bandeau par hôte en erreur ; « périmé » si `observedAt` > 2 × poll ; bouton terminal (`ssh nas` pour NAS, `ssh nas -t ssh narval-vpn` pour Narval) ; chip Narval ou bouton « Vue Slurm » sur un run slurm → rend `<NarvalSurface visible={visible && slurmView} …/>` à la place de la liste. Snapshot identique (hash JSON) → pas de setState.
- CSS `.calculs-*` dans `App.css` : tokens seulement, tailles 11/12/13, rayons `var(--r-s)`/`var(--r-m)`, pas de hex, pas de nouveau z-index, pas de `transition: all`, pas de classe contenant `menu|pop|dropdown`.
- i18n : `atelier.calculs` (« Calculs » / « Compute ») + clés `calculs.*` FR/EN. Garder `atelier.narval` (utilisé par le titre de la vue Slurm).
- Tests : `CalculsSurface.test.tsx` (mock `wsBus` comme `NarvalSurface.test.tsx` ; rendu, filtre, tri, erreur d'hôte, pas de re-rendu sur snapshot identique via compteur de rendus, bascule vue Slurm) ; mettre à jour `TopBarSurfaces.test.tsx`, `Rail.test.tsx`, `TopBarTabs.test.tsx` (`narval` → `calculs`), `workspaceLayout` test de migration.

### T4 — Vérification (moi)
`npx tsc --noEmit`, `npx vite build`, `npx vitest run` (ciblé puis complet), `cargo test -p atelier-workspace -p atelier-runtime --manifest-path rust/Cargo.toml --locked`, `python3 scripts/tests/test_atelier_run.py`, vérificateur indépendant sur le diff, puis lien `atelier-run` dans le PATH et copie sur le NAS.
