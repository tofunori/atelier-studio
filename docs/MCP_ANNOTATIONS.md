# Annotations Atelier dans Claude Desktop (serveur MCP)

`atelier-annots-mcp` (crate `rust/crates/atelier-annots-mcp`) est un serveur MCP
stdio, en **lecture seule**, qui donne à Claude Desktop les passages surlignés
dans le lecteur PDF d'Atelier et les notes personnelles qui les accompagnent.

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
| `search_annotations` | mots (`query`), `only_with_note`, `article`, `color`, `limit` |
| `list_annotated_articles` | articles annotés, avec leurs nombres de passages et de notes |
| `get_article_annotations` | toutes les annotations d'un article, par page |

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
