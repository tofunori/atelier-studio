# Surface Calculs — design

Date : 2026-09-06. Décision : Thierry. Remplace la surface Narval (plan 038) par
une surface générale de suivi des calculs longs : Python local sur le Mac,
conteneurs Docker et minuteries systemd sur le NAS, jobs Slurm sur Narval, puis
(tranche 2) les tâches côté fournisseur (exports Earth Engine, requêtes CDS).
Artefact de design : https://claude.ai/code/artifact/6b3a06d9-ecd8-4e1f-87b1-caee32ad249a

## Objectif

Un bouton « Calculs » dans le rail affiche la liste de tout ce qui tourne ou a
tourné récemment sur les trois hôtes, triée par activité, avec état, durée,
progression et extrait de log, et un inspecteur qui reprend pour Slurm les vues
existantes de Narval (aperçu, logs, fichiers, arborescence).

## Décisions

| Question | Décision | Raison |
|---|---|---|
| Périmètre tranche 1 | **Lecture seule** | comme Narval ; actions (arrêt, relance) en tranche 3 avec confirmation |
| Rail | **Fusion** : `narval` → `calculs`, Slurm = filtre par hôte | deux surfaces de jobs longs avec deux modèles divergeraient ; rail déjà à 9 |
| Collecte | **Instantanés sans état** (pas de collecteur permanent, pas de SQLite) | zéro coût surface fermée ; réutilise l'exécuteur ssh injecté de `narval.rs` |
| Découverte du local | **Enregistrement par manifeste** (`~/.atelier/runs/<id>/`), écrit par un wrapper | `ps` ne donne ni progression ni survie au redémarrage ; les agents lancent 90 % des runs, un skill leur impose le wrapper |
| Nom du wrapper / skill | `atelier-run` / `calculs` | recommandation acceptée |
| Conteneurs NAS | tous sauf liste d'exclusion (`jellyfin`, `paperless*`, `*mcp*`, `redis`, `postgres`, `gotenberg`, `tika`) | montrer les calculs, pas l'infra |
| Python sur le NAS hors Docker | même manifeste dans `~/.atelier/runs/` du compte NAS, lu par le NasAdapter | un seul format |
| Backend | Rust (`atelier-workspace::compute`) | règle Rust-first |

## Modèle de données

```
Run {
  id: String            // local:<uuid> | nas:docker:<nom> | nas:unit:<nom> | slurm:<jobid>
  source: local | nas | slurm | provider
  host: mac | nas | narval
  label, command (≤200 car.), work_dir
  state: queued | running | completed | failed | unknown
  started_at, ended_at?, last_activity_at   // RFC 3339
  progress?: { current, total, unit }
  log_path?, log_tail: Vec<String>          // 40 lignes par défaut, 400 max
  remote_tasks: Vec<{ provider, active, completed, failed }>  // vide tranche 1
  detail?: { slurm_job_id } | { container } | { unit } | { pid }
}
Snapshot { observed_at, runs: Vec<Run>, errors: Vec<HostError{host, kind, message}> }
```

Règles : un run local `running` dont le PID n'existe plus → `unknown`, jamais
`completed`. `last_activity_at` = mtime du log (local, NAS) ou heure d'observation
(Slurm). `progress` vient du manifeste seulement.

### Manifeste local `~/.atelier/runs/<id>/run.json`

```json
{ "version": 1, "id": "…", "label": "…", "command": "…", "work_dir": "…",
  "pid": 12345, "state": "running", "started_at": "…", "ended_at": null,
  "exit_code": null, "progress": {"current": 0, "total": 0, "unit": ""},
  "tags": {"run_tag": "…"} }
```

`log.txt` à côté. Le wrapper `scripts/atelier-run` (Python 3, stdlib seulement)
lance `atelier-run [--label L] [--total N --unit U] -- cmd args…`, redirige
stdout/stderr vers `log.txt` (tee vers le terminal), écrit `run.json` au départ,
puis `state`/`ended_at`/`exit_code` à la sortie, y compris sur SIGTERM/SIGINT.
Une ligne de log `::progress current=<n> total=<m>` met à jour `progress`.
Le skill `~/.claude/skills/calculs/SKILL.md` impose le wrapper pour tout processus
attendu > 2 min, localement et sur le NAS.

## Architecture

```
Front (CalculsSurface) ──WS computeSnapshot{hosts,days}──▶ ws_router
                       ◀── computeSnapshotResult{requestId,observedAt,runs,errors}
                       ──WS computeReadLog{runId,tailLines}──▶
                       ◀── computeReadLogResult{requestId,runId,lines}
ws_router ─▶ atelier_workspace::compute::snapshot(hosts, days)
   ├─ LocalAdapter   : lit ~/.atelier/runs/*/run.json, kill -0 sur le pid
   ├─ NasAdapter     : 1 commande ssh nas (docker ps -a --format json ;
   │                   systemctl --user list-units --type=service,timer --output=json ;
   │                   cat ~/.atelier/runs/*/run.json) ; logs via docker logs / journalctl / tail
   └─ SlurmAdapter   : narval::snapshot(profile, days) → Run par job (délégation, pas de copie)
```

Chaque adaptateur implémente `trait Adapter { fn collect(&self, exec: &dyn Exec, days) -> Result<Vec<Run>, HostError> }`
avec le même exécuteur injectable que `narval.rs`. Les adaptateurs tournent en
parallèle (`spawn_blocking` × 3) ; un échec d'hôte devient une `HostError`, les
autres résultats sont renvoyés.

Le front ne construit aucune commande. Les messages `narval*` existants restent
inchangés et sont appelés par l'inspecteur quand `source == slurm`.

## Surface

- Rail : id `calculs`, icône SVG monochrome (cadran), libellé FR « Calculs » / EN « Compute ». L'id `narval` disparaît ; migration de layout persisté `narval → calculs`.
- Barre : filtres par hôte (Tous / Mac / NAS / Narval) en chips, « observé il y a N s », bouton rafraîchir (IconButton).
- Liste : pastille d'état + mot, label, hôte·source, commande tronquée en mono, durée, dernière activité. Tri : `running` puis par `last_activity_at` desc. Fenêtre 7 jours.
- Inspecteur : onglets Aperçu (progression, commande, dossier, dernières lignes), Log (`computeReadLog` 400 lignes), Fichiers (Slurm seulement : `narvalRunFiles` + arborescence existante).
- Action unique : ouvrir un terminal sur l'hôte (repris de Narval).
- États : chargement, vide, hôte injoignable (bandeau par hôte, liste conservée), périmé (observedAt > 2 × intervalle).
- Design system : tailles 11/12/13, rayons 6/10, `tabular-nums`, aucune couleur seule pour l'état, `Button`/`IconButton`/`RowButton` uniquement.

## Garde-fous de performance

1. Auto-rafraîchissement seulement si la surface est visible (même mécanisme que Narval) : local 30 s, NAS + Slurm 60 s.
2. Une seule session ssh par hôte par cycle, commandes concaténées.
3. Snapshots bornés : 7 jours, 40 lignes de log, ≤ 200 runs.
4. Pas de re-rendu si le snapshot est structurellement identique (comparaison par hash côté front, test dédié).
5. Mesure `bench_realapp` avant merge : surface ouverte 1 h, webview stable ± 5 Mo.

## Tests

- Rust : parseurs `docker ps --format json`, `systemctl --output=json`, manifeste (fixtures dans `tests/fixtures/compute/`) ; LocalAdapter sur tempdir (pid vivant, mort, terminé) ; fusion avec un hôte en erreur ; filtre d'exclusion NAS ; mapping Slurm → Run.
- Wrapper : `scripts/tests/test_atelier_run.py` (succès, échec, SIGTERM, ligne `::progress`).
- Front : rendu des états, filtre, tri, absence de re-rendu sur snapshot identique, `css-contract.test.ts` vert, i18n FR/EN complets.
- Parité : tests existants `narval.rs` et front Narval verts ; `npx tsc --noEmit`, `npx vite build`, `cargo test -p atelier-workspace -p atelier-runtime`.

## Hors périmètre (tranche 1)

Adaptateur fournisseur (GEE, CDS), journal persistant, notifications, actions
d'arrêt/relance, montage de fichiers distants.
