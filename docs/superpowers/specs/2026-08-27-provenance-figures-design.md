# Provenance des figures — design

**Date** : 2026-08-27 · **Statut** : approuvé en discussion (Thierry) · **Inspiration** : Claude Science (Anthropic, 2026-06-30) — la provenance comme sous-produit de l'exécution par l'agent, jamais une instrumentation des scripts.

## Objectif

Chaque figure produite par un agent dans Atelier connaît son origine : script, commande, environnement, conversation. Les actions « régénère », « axe en log », « pourquoi ce point ? » cessent d'être des devinettes — l'agent reçoit la provenance et édite le bon script du premier coup.

## Décisions structurantes

1. **Capture côté agent uniquement** (v1). Une figure créée/modifiée pendant un tour d'agent reçoit sa provenance automatiquement. Les runs manuels au terminal ne sont pas couverts (fidèle à Claude Science) ; un lanceur `pyprov` pourra compléter plus tard.
2. **Sidecar JSON à côté de la figure** : `<figure>.prov.json`. Pas de base centrale — le fichier voyage avec la figure (rsync, NAS, git), lisible par tout outil.
3. **Rust-first** : la capture vit dans le runtime Rust (`atelier-runtime`), au même endroit qui calcule déjà `fileStats` au `done` du tour. Aucun changement aux scripts de Thierry, aucune consigne nouvelle aux agents.

## A. Capture (atelier-runtime, au `done`)

Point d'ancrage : `normalize_provider_event` / le chemin `done` de `send.rs`, qui appelle déjà `changed_since_stats(project_root, snapshot_sha)` (arbre snapshot ↔ arbre worktree, untracked inclus — les PNG nouveaux ressortent, binaires avec add/del `None`).

Au `done` d'un tour :

1. Filtrer `fileStats` : figures = extensions `.png .svg .pdf` (hors dossiers cachés, hors `annotations/`, hors `_view_*.png` — captures d'écran de viewer, pas des figures).
2. S'il y en a ≥ 1, écrire/mettre à jour `<figure>.prov.json` pour chacune.
3. Matière collectée pendant le tour (accumulée dans l'état de tour existant) :
   - scripts touchés ce tour parmi `fileStats` (`.py .R .jl .sh .tex .mjs`),
   - commandes shell des événements `{kind:"tool"}` du tour (name type bash/exec ; `detail` = la commande),
   - prompt utilisateur du tour (tronqué ~500 c),
   - threadId, titre du fil, provider, modèle, horodatage, snapshotSha, HEAD, projectRoot.
4. Environnement best-effort : `python3 --version` du PATH + `$CONDA_DEFAULT_ENV` s'il existe. Pas de gel de l'env complet en v1.
5. Échec d'écriture = log, jamais un tour cassé. Zéro spawn coûteux supplémentaire (le numstat existe déjà ; la version python est mémoïsée).

## B. Format `<figure>.prov.json`

```json
{
  "version": 1,
  "figure": "figures/albedo_trend.png",
  "history": [
    {
      "ts": "2026-08-27T20:43:26Z",
      "threadId": "…", "threadTitle": "…",
      "provider": "codex", "model": "baseten/zai-org-GLM-5.3-Flash",
      "prompt": "mets l'axe y en log et resserre la palette",
      "scripts": ["scripts/plot_albedo_trend.py"],
      "commands": ["python3 scripts/plot_albedo_trend.py --region saskatchewan"],
      "snapshotSha": "…", "head": "…",
      "projectRoot": "/Users/tofunori/Documents/UTQR/Master/Albedo-Modis-Pipeline-Analysis",
      "env": { "python": "3.12.4", "conda": "albedo" },
      "reconstructed": false
    }
  ]
}
```

`history` plafonné à 20 entrées, la plus récente en tête. Une régénération ajoute une entrée, n'écrase rien.

## C. Panneau Provenance (viewer galerie)

Dans le viewer de figure (`gallery/`), un panneau sobre « Provenance » alimenté par un endpoint du serveur galerie Rust (`GET …/prov?file=…` qui lit le sidecar JSON — la webview ne lit pas le disque) :

- script principal cliquable → ouvre l'éditeur de code sur ce fichier,
- commande, env, commit court, date, phrase de contexte (prompt),
- lien « conversation d'origine » → ouvre le fil `threadId` dans Atelier,
- si `history` > 1 : dépliant des générations précédentes.

Contraintes projet respectées : lire `docs/PIEGES_CONNUS.md` avant de toucher au viewer, `node gallery/server/tests/diff_suite.mjs` obligatoire, restage `src-tauri/gallery-dist/` après modif du template. Design system : tokens existants, pas d'emoji, SVG stroke 1.3.

## D. Actions

- **« Régénère »** (bouton du panneau) et **annotations** (« axe en log » sur la figure) : le message envoyé à l'agent embarque le contenu du `prov.json` (ou son chemin). Pas de replay aveugle de la commande : l'agent décide, comme dans Claude Science où il réédite son propre code.
- Skill `annotation` (`~/.claude/skills/annotation/`) : ajouter l'étape « si `<figure>.prov.json` existe, le lire d'abord — le script générateur y est ». Commit + push du repo skills (règle CLAUDE.md global).

## E. Figures sans provenance

Panneau : « Aucune provenance — figure antérieure au système », bouton « Reconstruire » = envoie à l'agent une demande de retrouver le script générateur et d'écrire un `prov.json` rétroactif marqué `"reconstructed": true`.

## F. Tests

- **Rust** (`atelier-runtime`) : le `done` d'un tour qui a créé `fig.png` + modifié `plot.py` écrit un prov.json avec le script, la commande et le thread ; un tour sans figure n'écrit rien ; `history` plafonne à 20 ; échec d'écriture n'altère pas l'événement `done`.
- **Galerie** : endpoint prov (présent/absent/malformé) ; le panneau ne casse pas le viewer sans prov.json (suite diff_suite verte).
- **Aucun test dans les scripts de Thierry** : rien n'y change.

## Hors périmètre v1

Lanceur `pyprov` (runs manuels), hash des données d'entrée, gel d'environnement complet (conda export), provenance des figures produites sur Narval.
