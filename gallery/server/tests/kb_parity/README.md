# kb_parity — fixtures de parité KB (plan 065, C2)

Contrat de sortie de `sidecar/kb_cli.mjs`, figé par exécution RÉELLE du CLI
(vrai spawn `node`, jamais un import direct des modules), à respecter à
l'identique par le futur port Rust (065 phase C3). Rejoué par
`../kb_parity.test.mjs` :

```
node --test gallery/server/tests/kb_parity.test.mjs
```

Voir `plans/065-inventaire-kb.md` pour la cartographie complète des
16 commandes (entrées/sorties, stockage, réseau, spawns).

## Layout

- `inputs/` — fichiers d'entrée réels et fixes (texte, CSV, PDF généré via
  `pandoc`, mini-vault markdown). Jamais modifiés par les commandes testées
  (lecture seule côté CLI), donc réutilisables tels quels d'un run à
  l'autre.
- `fake-gbrain.mjs` — faux binaire `gbrain` (get/put/search/list/capture),
  branché via la variable `ATELIER_TEST_GBRAIN` que `knowledge.mjs::
  resolveGbrainBin()` supporte nativement pour les tests. **Jamais le NAS
  réel** : aucune fixture n'écrit ni ne lit le corpus gbrain de l'opérateur.
- `fixtures/*.json` — un groupe = un scénario séquentiel (un `ATELIER_APP_DIR`
  frais par groupe), chaque étape = une commande CLI réelle avec ses
  arguments, son entrée stdin éventuelle, et la sortie attendue (JSON gelé :
  timestamps/mtime/chemins locaux/ids dérivés de chemin remplacés par des
  jetons `<ISO>`/`<NUM>`/`<APPDIR>`/`<INPUTS>`/`<ID>`/`<DATE>`).

## Groupes

| Fichier | Portée | gbrain | réseau |
|---|---|---|---|
| `a-local-store.json` | `add` (note/file/csv petit+gros/folder/pdf/web-stdin), `collection`, `tag`, `archive`, `list`, `search`, `kb-text`, `remove`, erreurs d'arguments | non touché | aucun |
| `b-gbrain.json` | `add --kind gbrain`, `gbrain-search`, `gbrain-page`, `promote-page` (preview + write) | fake-gbrain | aucun |
| `c-article-local.json` | `article-import` (+`--progress`), `article-draft`, `article-write`, `article-list` | fake-gbrain (vide, isolé) | Crossref en best-effort (voir plus bas), MinerU désactivé |
| `d-network.json` | `add --kind web` (fetch réel), `article-doi` (Crossref réel) | fake-gbrain (vide) | **réel**, marqué `network: true` |
| `e-kinds-heritage.json` | `list`/`kb-text`/`search` sur des sources `youtube`/`zotero` déjà épinglées (registre+cache préfabriqués, setup `seed-source` — jamais `add`, hors périmètre) | non touché | aucun |
| `f-search-passages.json` | `search` avec de VRAIS passages (PDF, dossier, web, file) — voir `inputs/search-vault/` | non touché | aucun |
| `g-ensure-fresh.json` | `ensureFresh` : fichier mutable réécrit (setup `copy-input` + step `op: write-file`), cache supprimé (step `op: rm-path`) | non touché | aucun |
| `h-mineru-fake.json` | `article-import` avec MinerU réellement spawné (`fake-mineru-ok.py`/`fake-mineru-fail.py`, jamais l'API cloud) | fake-gbrain (vide) | best-effort (Crossref, comme groupe c) |
| `i-gbrain-corpus.json` | Corpus gbrain semé (4 pages `articles/`, bannière), `findDuplicates`/`exists`, mode panne `FAKE_GBRAIN_FAIL=1\|TIMEOUT` (3 steps d'erreur, ~20s le step timeout) | fake-gbrain (semé) | aucun |
| `j-misc.json` | `refreshed:true` (tags/archived conservés), `tag --off`, `--ids` (tag/archive), `--dir`, `search --limit 0` | non touché | aucun |
| `k-corrupt-registry.json` | Registre `knowledge.json` illisible dès la 1ère invocation (setup `write-file`) — sauvegarde + `warning` | non touché | aucun |

Groupes e→k : vague 5 (plan 065, `plans/065-revue-findings.md`, section
MAJEURS KBG-*) — voir les commentaires `notes`/`description` de chaque
fixture pour le détail des pièges gelés.

## Extensions du harnais (vague 5)

- **`step.op`** (`write-file` / `rm-path`) : mute le système de fichiers
  ENTRE deux invocations CLI réelles, sans spawn — jamais d'`expect`.
- **`step.env`** : override d'environnement PAR STEP, fusionné sur l'env du
  groupe (ex. script MinerU différent selon succès/échec dans un même
  groupe).
- **setup `copy-input`** : copie mutable d'un `inputs/*` figé sous
  `<appdir>/…` — `inputs/` lui-même n'est JAMAIS réécrit.
- **setup `seed-source`** : registre + cache préfabriqués directement sur
  disque (pas de spawn CLI) — seul moyen de fixer une source `youtube`/
  `zotero` déjà épinglée sans dépendre de `yt-dlp`/Zotero réels.
- **setup `write-file`** : fichier arbitraire écrit AVANT le premier appel
  CLI du groupe (registre corrompu dès la première invocation).
- **`fake-gbrain.mjs`** : `FAKE_GBRAIN_FAIL=1|TIMEOUT` (panne immédiate /
  jamais de réponse), `FAKE_GBRAIN_BANNER=1` (ligne parasite dans `list`).
- **`fake-mineru-ok.py`/`fake-mineru-fail.py`** : faux script MinerU,
  invoqués via `ATELIER_MINERU_SCRIPT` + un `HOME` de scratch portant un
  `.mineru_token` vide (fixture.env `mineruFake`) — jamais le vrai jeton.

## Choix délibérés (et pourquoi)

- **gbrain toujours simulé.** `promote-page --write` et `article-write`
  mutent réellement un corpus (`gbrain put`) ; les exécuter contre le NAS de
  l'opérateur pour un test aurait pollué ses données réelles. Le hook
  `ATELIER_TEST_GBRAIN` existe déjà dans `knowledge.mjs` pour ça — on ne l'a
  pas ajouté, on l'a juste branché sur un faux binaire déterministe. Les
  commandes de LECTURE seule (`gbrain-search`, `gbrain-page`) auraient pu
  toucher le NAS réel sans le muter, mais on les a quand même simulées : le
  contenu réel du corpus change dans le temps (recherche non reproductible),
  et `article-import`/`article-doi` appellent `findDuplicates` en interne
  (recherche gbrain implicite, voir inventaire §3) — les laisser sur le NAS
  réel aurait rendu CETTE fixture non reproductible aussi, par ricochet.
- **MinerU désactivé.** Le script et le jeton existent sur cette machine
  (`~/.claude/skills/mineru-pdf/mineru_convert.py`, `~/.mineru_token`) —
  déclencher une vraie conversion cloud pour un fixture de test aurait
  consommé un appel payant réel sur le compte de l'opérateur. `resolveMineru`
  dégrade silencieusement vers `pdftotext` local quand le script est
  introuvable (`ATELIER_MINERU_SCRIPT` pointe vers un chemin qui n'existe
  pas) — c'est un vrai chemin de code (`converter:"local"`, `warning`
  renseigné), pas une invention : n'importe quelle machine sans jeton MinerU
  configuré prend exactement ce chemin en production.
- **Crossref appelé réellement.** `resolveArticleMeta` (dans
  `article-import`) et `article-doi` font un VRAI appel réseau à
  `api.crossref.org` — aucun moyen de le désactiver sans mocker (donc sans
  s'écarter de « exécuter le CLI réel »). `article-import-local` utilise un
  DOI fictif (`10.1234/fixture.2022.001`) qui ne matchera jamais rien chez
  Crossref → dégrade proprement en `metaSource:"texte"`, ce qui est
  lui-même un cas réel et utile à fixturer. `article-doi-crossref-real`
  (groupe D) utilise un DOI publié réel et stable
  (`10.3390/rs15010031`, Zhang et al. 2023, *Remote Sensing*) pour fixturer
  le chemin `metaSource:"crossref"`. Les deux sont tolérants à une panne
  réseau (le harnais saute la fixture au lieu de la faire échouer si le
  message d'erreur correspond à un motif réseau connu).
- **YouTube exclu.** `add --kind youtube` dépend de `yt-dlp` + d'une vidéo
  réelle dont le contenu (sous-titres, durée) peut changer ou disparaître —
  aucune fixture stable n'est possible sans mocker `fetchYoutube`, ce que la
  consigne « exécuter le CLI réel » exclut. Le format de sortie
  (`vttToPages`, pages de 60 s, `meta.segmentSeconds`) est documenté par
  lecture de code dans `plans/065-inventaire-kb.md` §2.1 ; à re-vérifier
  manuellement (ou via une fixture VTT statique fournie en dépendance
  injectée côté tests unitaires `knowledge.test.mjs`) au moment du port
  Rust plutôt que d'inventer une valeur ici.
- **`zotero` (kind) exclu.** Dépend d'une vraie bibliothèque Zotero locale
  (`~/Zotero/storage/…`) — spécifique à la machine de l'opérateur, jamais
  testable sans données réelles. Le chemin de résolution
  (`resolveZoteroPdf`, garde anti-traversée) est couvert par
  `sidecar/zotero_passages.test.mjs` (tests unitaires existants avec un
  faux `storageRoot`), pas repris ici.
- **Ids non portables gelés en `<ID>`.** Pour `file`/`pdf`/`folder`/`zotero`,
  l'id est `sha256(kind + "\n" + cheminAbsoluRésolu)` — le chemin absolu
  dépend d'où le dépôt est cloné, donc l'id diffère d'une machine à l'autre.
  Le harnais capture l'id RÉEL au moment de l'`add` (`capture` dans la
  fixture) et le réinjecte dans les étapes suivantes (`{{fileId}}`, etc.),
  et le compare à `<ID>` (jamais à une valeur littérale) dans les
  assertions. Pour `note`/`gbrain`/`web`, la clé est un contenu choisi par
  la fixture elle-même (titre, slug, URL) — portable, donc gardé en clair.
