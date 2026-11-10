# Annotations Atelier dans Claude Desktop (serveur MCP)

`atelier-annots-mcp` (crate `rust/crates/atelier-annots-mcp`) est un serveur MCP
stdio qui donne à Claude Desktop les passages surlignés dans le lecteur PDF
d'Atelier et les notes personnelles qui les accompagnent. Trois outils écrivent :
`highlight_passage`, qui surligne un passage cité dans un PDF Zotero, et
`update_highlights` / `remove_highlights`, qui changent ou retirent les
surlignages **faits par Claude** (jamais ceux de Thierry). Deux autres,
`create_code` et `code_passages`, servent au codage qualitatif (voir plus bas).

## Ce qu'il lit

- `~/Library/Application Support/atelier-studio/pdf_annots.json`
  (`$ATELIER_APP_DIR`), relu à chaque appel : une annotation posée dans Atelier
  est visible tout de suite, sans relance.
- `~/Zotero/zotero.sqlite` (`$ATELIER_ZOTERO_DIR`), lu sur une copie dans le
  dossier temporaire : titre, auteurs et année de chaque article, et les
  annotations faites dans Zotero (lecteur Zotero, iPad, iPhone via Atelier).

La « Note » d'une annotation est le champ du haut de la bulle d'annotation
(`memo` dans le JSON), jamais envoyé au chat. Le texte du champ du chat
(`note`) n'est **pas** exposé, sauf pour une note libre posée sur la page
(`kind: "note"`), qui est une note par nature. Pour Zotero, la note est le
commentaire de l'annotation.

Non lus : les stores par projet (`.fig_thumbs/pdf_annots.json`). Seules
leurs entrées Zotero d'avant le store commun y sont recopiées, une fois ; le
reste y vit toujours et n'existe nulle part ailleurs (annotations des PDF du
projet, commentaires LaTeX et Markdown, couleurs de section). Ce fichier
n'est donc pas un cache : ne jamais supprimer `.fig_thumbs/`.

## Outils

| Outil | Usage |
| --- | --- |
| `search_annotations` | tous les articles en un appel, résultats groupés par article : `query`, `match` (`all` par défaut, `any` pour une recherche thématique classée par nombre de mots trouvés dans le passage et la note), `only_with_note`, `articles`, `color`, `limit` (100 par défaut, 1000 au plus), `per_article` (5 par défaut en mode `any`) |
| `list_annotated_articles` | articles annotés, avec leurs nombres de passages et de notes |
| `get_article_annotations` | toutes les annotations d'un ou de plusieurs articles nommés (`articles: [...]`, ou l'ancien `article`), par page |
| `highlight_passage` | surligne dans le PDF Zotero d'un article (`article` : clé, auteur et année, ou mots du titre) les passages cités mot pour mot (`passages: [{quote, page?, memo?, color?, style?}]`, 20 au plus, ou `quote` seul), en `color` jaune (défaut), vert, bleu, rose, orange ou violet, et en `style` surligner (défaut) ou souligner ; `color` et `style` de premier niveau valent pour les passages qui n'ont pas les leurs |
| `update_highlights` | change la `color`, le `style` (surligner / souligner) et/ou la note (`memo`, vide = retirée) de surlignages faits par Claude, désignés par un extrait de leur texte (`passages: [{quote, page?}]` ou `quote`) ou `all: true` |
| `remove_highlights` | supprime des surlignages faits par Claude, désignés de la même façon |
| `list_codes` | livre de codes (codage qualitatif façon NVivo) : arbre des codes avec passages et articles (sous-codes compris), propositions en attente et mémo |
| `get_code_passages` | tous les passages d'un `code` (nom ou chemin « Parent › Code »), groupés par article ; `subcodes` (oui par défaut), `suggested` (non par défaut), `articles`, `limit` |
| `create_code` | ajoute un code (`name`, `parent?`, `memo?`) ; un code du même nom au même endroit est gardé tel quel |
| `code_passages` | **propose** des codes existants pour des passages cités mot pour mot (`article`, `passages: [{quote, page?, codes?}]`, `codes`) ; rien n'est posé d'office |

Les instructions du serveur demandent à Claude de ne jamais parcourir les
articles un par un : « des passages pour ma discussion » se fait en un seul
`search_annotations` avec `match: "any"` et des mots-clés en anglais et en
français (les articles sont en anglais, les notes en français).

`search_annotations` accepte aussi `code` : seuls les passages portant ce
code (ou un de ses sous-codes) sont gardés.

## Codage qualitatif

Le livre de codes vit à côté du store : `codebook.json`
(`{"codes": [{id, name, parent, memo}]}`), lu et écrit par le serveur galerie
(`GET`/`POST /codebook`) sous le même verrou. Une annotation porte ses codes
dans `codes` (ids gardés) et les propositions de Claude dans `suggested`.
Un passage codé sans surlignage est une annotation `kind: "code"` (voile gris,
sans teinte) ; elle disparaît quand son dernier code est retiré.

`code_passages` n'écrit que dans `suggested` : Atelier montre ces codes en
pointillé (bande de marge, fiche du passage, onglet Codes) et Thierry les
garde ou les refuse (`POST /pdfannot-codes`, `keep` / `reject`). Un passage
déjà annoté reçoit la proposition ; sinon un passage codé est créé, marqué
`"by": "claude"`. Supprimer un code le retire de toutes les annotations.

Il n'y a qu'un panneau d'annotations : celui du lecteur PDF (onglets
Annotations, Codes et Plan ; portée Article ou Bibliothèque). Le bouton
« Annotations » de la barre du haut de l'app l'ouvre dans le PDF actif
(message `atelier-annots-pane`). L'onglet Codes montre l'arbre du livre de
codes avec ses effectifs (sous-codes compris) et la vue d'un code : mémo,
propositions de Claude à garder ou refuser, passages groupés par article.
L'onglet Annotations filtre aussi par code.

## Surligner depuis Claude Desktop

`highlight_passage` lit le PDF avec l'outil `atelier-pdf` (PDFium ; même
sortie que `pdftotext -bbox-layout -cropbox`), cherché à côté du serveur puis
dans Atelier installé ; à défaut, `pdftotext` de poppler s'il est là
(`ATELIER_PDFTOTEXT` l'impose pour les tests). Il retrouve la citation avec la normalisation du lecteur
(accents, ligatures et ponctuation ignorés, césures de fin de ligne
recollées) et écrit une annotation `hl` par page couverte, un rectangle par
ligne, marquée `"by": "claude"`. La note facultative (`memo`) va sur la
première page du passage. Une citation introuvable n'écrit rien ; si seuls
son début et sa fin sont retrouvés, la réponse demande de vérifier. Un
passage déjà surligné sur la même page n'est pas doublé. Le `memo` est une
note courte disant pourquoi le passage compte ; « Claude » seul n'est pas
gardé comme note (l'origine est dans `by`).

`update_highlights` et `remove_highlights` ne touchent que les annotations
`"by": "claude"` : une citation qui ne désigne qu'un surlignage de Thierry
est refusée (la réponse le dit). Un passage surligné sur deux pages est
modifié ou retiré en entier (ses annotations partagent le préfixe d'id
`{ms}-c{i}`). Les outils de lecture marquent ces passages « surligné par
Claude ».

L'écriture prend le verrou du serveur galerie (`pdf_annots.lock`) et ne
remplace jamais un store illisible. Le lecteur PDF ouvert veille la date du
store (`GET /pdfannot-stamp`, toutes les 2,5 s) et fusionne les nouveautés :
le surlignage apparaît en 2 à 3 secondes. Atelier fermé, il est là à la
prochaine ouverture.

Pour qu'une sauvegarde du lecteur n'efface pas un surlignage qu'il n'a pas
encore vu, `POST /pdfannot` accepte `known` (ids déjà vus par l'écrivain) :
une annotation du store absente de `annots` et de `known` est gardée. Le
lecteur et le panneau d'annotations de l'app l'envoient ; les suppressions
du panneau passent par `removeIds`.

## Installation

```bash
cargo build --release --manifest-path rust/Cargo.toml -p atelier-annots-mcp
```

Puis, dans `~/Library/Application Support/Claude/claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "atelier-annotations": {
      "command": "/CHEMIN/VERS/atelier-studio/rust/target/release/atelier-annots-mcp"
    }
  }
}
```

Relancer Claude Desktop. Exemple de demande : « Propose-moi des éléments pour
ma discussion à partir des passages que j'ai notés. »

## Lecture seule (relecteur d'Atelier)

Avec `ATELIER_ANNOTS_READONLY=1`, le serveur n'annonce et n'exécute que ses
outils de lecture (`readOnlyHint`) : `search_annotations`,
`list_annotated_articles`, `get_article_annotations`, `read_article`,
`list_codes`, `get_code_passages`. Un appel à un outil d'écriture est refusé.

C'est ainsi que le relecteur d'Atelier (mode `claims`,
`rust/crates/atelier-runtime/src/review_claims.rs`) le joint pour vérifier
une citation contre son PDF ; il n'autorise en plus que `read_article` et
`get_article_annotations`. Le relecteur cherche le binaire dans cet ordre :
`ATELIER_ANNOTS_MCP_BIN`, à côté de `atelier-studio-server`, la commande
déclarée ci-dessus pour Claude Desktop, puis `rust/target/` du dépôt. Sans
binaire trouvé, la relecture se fait sans les articles et une citation reste
« non concluante ».

## Révisions LaTeX dans la conversation (prototype « MCP App »)

Quand le client sait afficher les vues « MCP App » (Claude Desktop annonce
l'extension `io.modelcontextprotocol/ui` à `initialize` ; `ATELIER_MCP_UI=1`
le force), le serveur offre en plus :

| Outil | Usage |
| --- | --- |
| `open_tex_file` | ouvre un .tex dans la carte « lecteur » d'Atelier (`ui://atelier/reader`) : l'utilisateur y sélectionne et note des passages, puis « Envoyer à Claude » remplit la barre de message avec chaque passage recopié mot pour mot et sa note ; Claude répond par `propose_revision`. N'écrit rien |
| `get_selection` | le passage sélectionné dans l'éditeur LaTeX d'Atelier (`~/.claude/fig-selection.json`, publié par la galerie via `/selinfo`) : fichier, lignes, texte exact. Geste : sélectionner dans Atelier, puis écrire « révise ma sélection » dans Claude Desktop |
| `read_tex_file` | lit un .tex (chemin absolu), lignes numérotées, par tranches |
| `propose_revision` | `path`, `quote` (passage actuel, mot pour mot), `text` (réécriture), `reason` : n'écrit **rien** ; Claude Desktop affiche la carte d'Atelier (`ui://atelier/revision`) avec l'avant / après et Accepter / Refuser |
| `apply_revision`, `undo_revision` | réservés à la carte (`_meta.ui.visibility: ["app"]`) : écrivent seulement après un clic sur Accepter ou Annuler |

Sécurité : le passage doit exister une seule fois (les blancs et retours à
la ligne peuvent différer) ; il est revérifié au clic, et une copie du
fichier d'avant est gardée dans `$ATELIER_APP_DIR/mcp-revisions/` (les 100
dernières). Un client sans vues (Claude Code, relecteur d'Atelier en lecture
seule) ne voit ni ces outils ni la ressource.

La page de la carte est `rust/crates/atelier-annots-mcp/view/revision.html` ;
son script client (SDK navigateur des MCP Apps) est vendorisé dans
`vendor/ext-apps/` et inclus dans la page : rien n'est chargé du réseau.
Refuser propose « Demander une autre version », qui met une demande dans la
barre de message de Claude (jamais envoyée sans l'utilisateur).

## Connecteur distant pour claude.ai (`--http`, prototype)

Dans les conversations « unifiées » de Claude Desktop (chat et Cowork), les
serveurs MCP locaux passent par un relais vers claude.ai qui ne transmet pas
les cartes (`_meta.ui`). Pour avoir les cartes d'Atelier et le panneau
latéral, le même binaire sert aussi de **connecteur distant** :

```sh
atelier-annots-mcp --set-code          # une fois : le code tapé pour connecter Claude (8 caractères au moins)
ATELIER_CONNECTOR_URL=https://<mac>.<tailnet>.ts.net atelier-annots-mcp --http 8791
tailscale funnel --bg 8791             # adresse publique https → 127.0.0.1:8791
```

Puis, dans Claude : Réglages, Connecteurs, « Ajouter un connecteur
personnalisé », adresse `https://<mac>.<tailnet>.ts.net/mcp`. Claude ouvre la
page d'Atelier où l'on tape son code.

- Écoute seulement sur 127.0.0.1 ; Streamable HTTP (réponses JSON, pas de flux SSE).
- OAuth 2.1 minimal (`src/oauth.rs`) : enregistrement dynamique limité aux
  adresses de retour de Claude, PKCE S256, code d'autorisation à usage unique
  (2 min), jeton d'accès 1 h, renouvellement 60 jours remplacé à chaque usage ;
  seules les empreintes SHA-256 sont gardées
  (`$ATELIER_APP_DIR/claude-connector/state.json`, droits 600). Cinq codes
  faux bloquent la page quinze minutes. `--set-code` retire les connexions accordées.
- Seuls les outils LaTeX (`open_tex_file`, `get_selection`, `read_tex_file`,
  `propose_revision`, `apply_revision`, `undo_revision`), sur des fichiers sous
  `ATELIER_CONNECTOR_ROOTS` (défaut `~/Documents`, chemins séparés par `:`).
- Les appels de Claude (`/mcp`, `/token`, `/register`) doivent venir des
  adresses d'Anthropic (`ATELIER_CONNECTOR_ALLOW`, défaut `160.79.104.0/21`)
  quand le tunnel transmet `X-Forwarded-For`.
- Le Mac doit être allumé.
