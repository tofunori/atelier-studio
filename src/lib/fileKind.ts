// Type de fichier d'après le nom ou l'extension (lot 3, TRANS-04) : logique
// pure, hors du fichier de composant (Fast Refresh) ; FileGlyph la consomme.
export type FileKind =
  | "folder" | "code" | "note" | "tex" | "image" | "pdf" | "data" | "terminal" | "local" | "file";

const CODE = ["py", "r", "jl", "js", "mjs", "cjs", "ts", "tsx", "jsx", "rs", "c", "h", "cpp", "go", "java", "css", "html", "lua", "m", "f90"];
const DATA = ["json", "yml", "yaml", "toml", "csv", "tsv", "nc", "parquet", "xlsx", "lock"];
const IMAGE = ["png", "jpg", "jpeg", "gif", "webp", "svg", "tif", "tiff"];

export function fileKind(nameOrExt: string): FileKind {
  if (nameOrExt === "dir" || nameOrExt === "folder") return "folder";
  if (nameOrExt === "local") return "local";
  const ext = (nameOrExt.includes(".") ? nameOrExt.split(".").pop() : nameOrExt)?.toLowerCase() ?? "";
  if (ext === "tex" || ext === "bib" || ext === "sty" || ext === "cls") return "tex";
  if (ext === "pdf") return "pdf";
  if (ext === "md" || ext === "markdown" || ext === "txt" || ext === "org" || ext === "log" || ext === "docx") return "note";
  if (ext === "sh" || ext === "zsh" || ext === "bash") return "terminal";
  if (IMAGE.includes(ext)) return "image";
  if (DATA.includes(ext)) return "data";
  if (CODE.includes(ext)) return "code";
  return "file";
}
