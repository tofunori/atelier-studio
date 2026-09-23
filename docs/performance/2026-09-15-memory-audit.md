# Audit mémoire Atelier — 15 septembre 2026

## Conclusion bornée

L'utilisateur rapporte environ 2 Go auparavant et 4 Go maintenant. Les mesures
actuelles retrouvent un ordre de grandeur compatible, principalement dans le
Codex lancé par Atelier et ses descendants MCP, et non dans le seul frontend.
Il manque une mesure avant sur les mêmes sessions/documents pour attribuer le
doublement à un commit particulier.

Audit en lecture seule de l'application, sans arrêt, relance, fermeture d'onglet,
changement de configuration ou suppression de processus. Seul ce rapport est ajouté.
Trois revues indépendantes ont couvert cache chat, éditeur/PDF et backend/session.

## Mesures réelles

Bundle ouvert : `src-tauri/target/release/bundle/macos/Atelier.app`, PID 79119,
démarré vers 09:49. HEAD inspecté : `ad295313` (1.9.3).

`footprint` mesure l'empreinte physique, y compris la mémoire compressée imputée.
Les unités suivantes sont des Mio/Gio. Les pics individuels ne sont pas additionnés.

| Heure locale | WebContent 79186 | GPU 79185 | Serveur chat 79243 | Total groupe interface/serveurs mesuré |
|---|---:|---:|---:|---:|
| 09:54:32 | 572,1 | 32,1 | 48,2 | 729,9 |
| 09:54:47 | 691,8 | 135,3 | 42,5 | 949,3 |
| 09:55:02 | 880,0 | 136,9 | 43,0 | 1137,4 |
| 09:55:17 | 633,8 | 140,3 | 46,0 | 896,6 |

Le groupe inclut app, trois serveurs galerie, chat, WebContent/GPU/Networking.
Les XPC WebKit ont launchd pour parent ; leur appartenance est présumée d'après
leur démarrage simultané à Atelier et l'activité, pas prouvée par coalition macOS.
Les autres processus WebKit ont été exclus. Le gateway, petit, n'est pas dans ce groupe.

Mesure séparée rapprochée du Codex 79810, enfant direct du serveur chat : environ
75 processus avec descendants, **2 894 682 456 octets = 2760,6 Mio = 2,696 Gio**
d'empreinte physique. Codex seul : environ 292 Mio. Les autres processus sont
principalement MCP/runtimes ; environ 2,3 Gio de RSS agrégée au même passage,
mesure distincte et non interchangeable avec l'empreinte.

Trois exemplaires observés de chaque chaîne open-knowledge, xcodebuildmcp,
brave-search, mcp-remote/Tavily et sideshow ; quinze wrappers npm au total.
Leurs exécutables et parentés ont été inspectés, sans conserver les commandes
complètes dans les artefacts de l'audit.

Ces ensembles mesurés à des instants proches donnent environ 3,4–3,8 Gio
(3,7–4,1 Go décimaux). Ce n'est pas une capture simultanée exacte du total,
mais cela explique son ordre de grandeur. Les descendants de l'outil Codex
utilisé pour cet audit, rattachés à ChatGPT.app, sont exclus de cet arbre Atelier.

Données brutes locales : `/tmp/atelier-footprint-20260915.json`,
`/tmp/atelier-codex-footprint-20260915.json`,
`/tmp/atelier-memory-audit-20260915.jsonl` (RSS, noms classés),
`/tmp/atelier-webcontent-memory-sample.txt` (échantillon de piles 2 secondes).
Le prélèvement de piles est séparé de la série footprint.

## Mécanisme Codex/MCP identifié

- `src/App.tsx:1756` : le premier affichage d'un fil Codex avec session envoie
  automatiquement `goalGet`.
- `rust/crates/atelier-providers/src/codex.rs:611` : `read_native_goal` ouvre la
  session via `thread/resume` si nécessaire, avant `thread/goal/get`.
- `codex.rs:572` documente que la configuration MCP s'applique à la première
  ouverture native, y compris les commandes lancées dès la consultation du fil.
- `codex_rpc.rs:126` conserve les IDs ouverts ; `ThreadConnection::drop` retire
  les handlers locaux. Aucun déchargement explicite de session trouvé.

Visiter plusieurs fils peut donc initialiser et retenir plusieurs jeux de MCP
dans un seul app-server. Les trois grappes peuvent aussi correspondre à des
sous-agents natifs. Sans métadonnées des ouvertures RPC, on ne distingue pas
trois sessions utiles d'une duplication fautive d'une même session.

L'effet goalGet existe depuis juillet. Les lignes Rust actuelles ont été ajustées
le 14 septembre mais existaient déjà dans la référence pré-optimisation 5f65154a.
Aucun diff sous rust/ depuis cette référence : ne pas présenter les optimisations
du streaming comme cause démontrée de ce comportement.

Priorité : observer les ouvertures/fermetures par ID (métadonnées seulement),
éviter une activation complète des outils pour une simple lecture d'objectif,
puis définir la mise en sommeil des sessions inactives sans casser goals,
sous-agents ou reprise. Ne pas tuer les MCP arbitrairement.

## Optimisations chat : coût mémoire réel, ordre de grandeur limité

Le WeakMap de `turnViewModel.ts:288` conserve les modèles tant que les premiers
événements restent dans les transcripts chargés. Il augmente donc la mémoire
après sortie d'un fil conservé dans le store MRU.

Micro-expérience de la revue indépendante : Node avec GC explicite, ancienne et
nouvelle fonction, dépendances courantes, 2108 événements synthétiques riches en
outils. Après abandon du résultat mais conservation du transcript : environ
213 Kio avant contre 1388 Kio après, soit 1,2 Mio supplémentaires. Mesure V8 de
heap, non extrapolable directement à WebKit ou à tout fil réel.

Un cas particulier retient des événements supprimés si le premier événement du
tour reste vivant et que ce tour n'est pas reprojeté ; la reprojection libère
ces références. Pas de fuite massive établie.

Le canal committed/live partage les événements historiques ; il ne garde pas
un transcript par delta. L'éviction des fils et le nettoyage des abonnements
sont présents. Une minuterie typewriter, annulée au démontage ; handoffs bornés
à 256 clés/compteurs. Aucun mécanisme trouvé expliquant à lui seul +2 Go.

## Éditeur LaTeX et PDF : risques distincts

- `AtelierPane.tsx:834` masque les onglets document avec display:none : chaque
  iframe conserve éditeur, journal, PDF et workers. Navigation != fermeture.
- `gallery/assets/diff_versions.js:51` conserve l'historique des interventions
  before/after et les snapshots de revue. Accepter un diff ne purge pas le
  journal. Le chargement persistant explique une mémoire liée au nombre de
  révisions ; aucune taille réelle de ces journaux n'a été mesurée ici.
- `gallery/assets/pdf_viewer.html:918` recharge le PDF autonome sans détruire
  explicitement l'ancien PDFDocumentProxy ; un résultat obsolète est également
  abandonné sans destroy. Défaut de nettoyage suspect, ancien depuis juillet,
  à reproduire par cycles avant d'en chiffrer l'effet.
- `gallery/src/studio/features/latex/pdf_sync.ts:205` prépare le nouveau PDF
  intégré pendant que l'ancien reste affiché : pic temporaire plausible depuis
  le changement du 14 septembre, puis destruction de l'ancien document.
  Les canvas évincés sont retirés mais pas explicitement redimensionnés à zéro.
- Le cache de rendu diff est borné à huit ; pas de cache global non nettoyé
  d'EditorView identifié. La revue ancrée limite déjà ses scans au viewport.

Ces points peuvent contribuer aux ralentissements de documents riches en diffs,
mais les mesures présentes n'attribuent pas le heap WebKit à chacun d'eux.

## Backend Rust

Les chargements d'historique reconstruisent des snapshots, relisent parfois le
journal et sérialisent/reparsent les réponses. Cela peut expliquer les pics
transitoires : serveur observé à 382 Mio de pic puis 42–48 Mio d'empreinte.
Les queues WS sont bornées en nombre de messages, pas en octets de réponses.
`HarnessThread.seen_event_ids` et le registre des fils n'ont pas d'éviction
identifiée : croissance possible des métadonnées à long terme, non chiffrée ici.

## Limites et prochaine vérification

Pas de référence avant comparable à l'observation 2 Go ; l'ancien audit du
5 septembre excluait WebKit de certains chiffres et ne prouve pas un total plus bas.
Pas de manipulation des documents de l'utilisateur ni de heap snapshot JSC.
Les fluctuations observées excluent seulement une croissance monotone sur ces
45 secondes ; elles ne prouvent pas l'absence de fuite à long terme.

Le premier comparatif utile est une session Codex puis trois sessions consultées,
à documents constants, en comptant MCP et footprint par groupe. Il doit préserver
les sessions actuellement utiles. Ensuite, cycles contrôlés de documents/diffs/PDF
sur une instance de test, avec même contenu et retour au repos.

## Correctif local : lecture passive des objectifs

`read_native_goal` appelle désormais directement `thread/goal/get`, sans
`thread/resume`. Les notifications passent par le même circuit ; les erreurs
restent visibles et la reprise d'un rollout momentanément vide reste bornée.
Le premier message conserve la reprise de session et sa configuration MCP.
Les actions de modification d'objectif ne changent pas.

Banc reproductible sur Codex 0.154.0 :

```sh
python3 scripts/bench/codex_goal_read_bench.py --binary /Users/tofunori/.local/bin/codex.opencodex-real
```

Trois sessions et objectifs synthétiques, CODEX_HOME temporaire, MCP sentinelle
local, aucun tour modèle. Deux exécutions réussies :

| Mesure | Avant : reprise puis lecture | Après : lecture directe |
|---|---:|---:|
| Objectifs correctement lus | 3 | 3 |
| Sessions chargées | 3 | 0 |
| Démarrages MCP sentinelle | 3 | 0 |

Après les lectures directes, une reprise volontaire démarre bien une sentinelle.
Ce banc prouve les activations évitées, pas un gain fixe en Go avec tous les MCP
personnels. Les groupes temporaires créés par le banc sont arrêtés à sa fin.

Contrôles : 2185 tests frontend passent ; suites Rust providers/runtime :
312 + 259 + 10 tests passent, deux tests providers ignorés ; revue indépendante
sans défaut bloquant. Le test trois lectures échouait avant le correctif.
Logs locaux : `/tmp/atelier-goal-rust-tests.log`, `/tmp/atelier-goal-vitest.log`.

Après autorisation explicite, `npm run tauri:build:app` a réussi et le bundle
signé du checkout a été relancé : tauri-app PID 24907, serveur PID 25070,
version 1.9.3, `/health` authentifié HTTP 200 et ok=true. Le binaire serveur
embarqué est identique au serveur stagé par le build (`cmp` réussi).

Validation via le WebSocket du serveur de ce bundle : lecture des objectifs
de trois fils Codex existants, trois événements goal reçus, aucun tour lancé.
Arbre descendant du serveur : deux processus avant/après, zéro wrapper npm,
zéro atelier-agent-mcp avant/après ; RSS du groupe 362,7 puis 364,1 Mio.
Ce groupe exclut le frontend/WebKit ; ce n'est pas la mémoire totale d'Atelier.
L'utilisateur rapporte une amélioration nette après relance. Le gain total
avant/après à sessions et documents identiques n'a pas été mesuré.
Aucune mise en sommeil des sessions déjà ouvertes n'est implémentée ici.
