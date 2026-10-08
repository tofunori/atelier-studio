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

Non lus : les très anciens stores par projet (`.fig_thumbs/pdf_annots.json`)
qui n'ont pas encore été recopiés dans le store commun.

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
pointillé (bande de marge, fiche du passage, panneau Codes) et Thierry les
garde ou les refuse (`POST /pdfannot-codes`, `keep` / `reject`). Un passage
déjà annoté reçoit la proposition ; sinon un passage codé est créé, marqué
`"by": "claude"`. Supprimer un code le retire de toutes les annotations.

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
