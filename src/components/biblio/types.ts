// Types partagés de la surface Bibliothèque (extraction en hooks, plan biblio).
// Le contrat WebSocket est décrit dans useBiblioList.ts.

export type ZoteroItem = {
  key: string;
  dateAdded: string;
  title: string;
  creators: string;
  year: string;
  publication: string;
  tags: string[];
  hasPdf: boolean;
  pdfKey: string | null;
  pdfFile: string | null;
  citeKey: string;
  fav: boolean;
  doi?: string;
  abstract?: string;
};

export type ZoteroCollection = { id: number | string; name: string; parent: number | string | null };

export type FilterMode = "all" | "fav" | "collection";

export type SortBy = "added" | "year" | "author" | "title";

// Cible de passage : seule la clé Zotero est obligatoire (lien de citation
// interne par section ou page). Le PDF ouvert est celui de l'item
// sélectionné ; `page`/`quote`/`section` disent seulement OÙ aller dedans.
export type PassageTarget = {
  key: string;
  pdfKey?: string;
  pdfFile?: string;
  page?: number | null;
  quote?: string;
  section?: string;
};

export type ZoteroAddResult = {
  name: string;
  ok: boolean;
  error?: string;
  match?: string;
};
