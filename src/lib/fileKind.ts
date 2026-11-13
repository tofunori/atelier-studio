// Type de fichier d'après le nom ou l'extension (lot 3, TRANS-04 ; affiné le
// 2026-11-13, variante C « forme + teinte discrète ») : logique pure, hors du
// fichier de composant (Fast Refresh) ; FileGlyph la consomme. Chaque type
// courant a sa propre silhouette : Word ne se confond plus avec Markdown, ni
// le tableur avec le JSON ou le NetCDF.
export type FileKind =
  | "folder" | "pdf" | "word" | "note" | "tex" | "bib" | "sheet" | "json" | "data"
  | "html" | "code" | "notebook" | "terminal" | "image" | "slides" | "archive" | "local" | "file";

const EXT: Record<string, FileKind> = {};
const add = (kind: FileKind, exts: string) => { for (const e of exts.split(" ")) EXT[e] = kind; };
add("pdf", "pdf");
add("word", "docx doc docm dotx odt rtf pages");
add("note", "md markdown txt org log rst qmd rmd");
add("tex", "tex sty cls ltx");
add("bib", "bib bst");
add("sheet", "xlsx xls xlsm ods csv tsv numbers");
add("json", "json jsonc geojson yml yaml toml lock ini cfg");
add("data", "nc nc4 parquet h5 hdf5 hdf feather npy npz mat zarr db sqlite duckdb gpkg shp");
add("html", "html htm xml xhtml");
add("code", "py r jl js mjs cjs ts tsx jsx rs c h cpp hpp go java css scss lua m f90 f swift kt rb");
add("notebook", "ipynb");
add("terminal", "sh zsh bash fish");
add("image", "png jpg jpeg gif webp svg tif tiff bmp heic eps");
add("slides", "pptx ppt key odp");
add("archive", "zip tar gz tgz bz2 xz 7z rar");

export function fileKind(nameOrExt: string): FileKind {
  if (nameOrExt === "dir" || nameOrExt === "folder") return "folder";
  if (nameOrExt === "local") return "local";
  const ext = (nameOrExt.includes(".") ? nameOrExt.split(".").pop() : nameOrExt)?.toLowerCase() ?? "";
  return EXT[ext] ?? "file";
}

/** Teinte discrète (variante C) : seuls cinq types de travail prennent une
 *  couleur, tirée des jetons d'état (tokens.css, --file-tint-*) ; les autres
 *  restent au gris du parent. */
export type FileTint = "pdf" | "word" | "tex" | "sheet" | "data";
const TINT: Partial<Record<FileKind, FileTint>> = {
  pdf: "pdf", word: "word", tex: "tex", bib: "tex", sheet: "sheet", json: "data", data: "data",
};
export function fileTint(kind: FileKind): FileTint | undefined {
  return TINT[kind];
}
