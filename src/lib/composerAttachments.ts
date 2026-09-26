import type { DraftAttachment } from "./chatDraftStore";
import { parseAnnotationNotes } from "./annotationNotes";
import { type ZoteroPaletteItem, buildZoteroReferenceText } from "./zoteroReference";

type Attachment = DraftAttachment;

// « /chemin/avec espaces/CLAUDE.md (p.L11-224) : « … » » → {name: CLAUDE.md, lines: 11-224}
export function parseAttachment(text: string): Attachment {
  const first = text.split("\n")[0].trim();
  // Figure annotée : les badges numérotés deviennent des notes affichables.
  const notes = parseAnnotationNotes(text);
  // format viewer : <chemin> (p.LX-Y|p.N) : « … »   — chemin peut contenir des espaces
  let m = /^(.+?)\s*\((?:p\.)?(L?[\d:.,\-–]+)\)\s*:?/.exec(first);
  if (m) {
    return {
      name: m[1].split("/").pop() || m[1],
      lines: m[2].replace(/^L/, ""),
      text,
    };
  }
  // format annotation image : <chemin.png> …
  if (first.includes("/")) {
    const tok = first.split(/\s+/).find((t) => t.includes("/")) ?? first;
    return { name: tok.split("/").pop() || tok, lines: null, text, ...(notes ? { notes } : {}) };
  }
  return { name: first.slice(0, 60) || "citation", lines: null, text };
}

export function addAttachment(list: Attachment[], a: Attachment): Attachment[] {
  if (a.pdfAnnotation) {
    const source = a.pdfAnnotation;
    const existing = list.findIndex(item => item.pdfAnnotation?.id === source.id &&
      item.pdfAnnotation.rel === source.rel && item.pdfAnnotation.origin === source.origin);
    return existing < 0 ? [...list, a] : list.map((item, index) => index === existing ? a : item);
  }
  return list.some((x) => x.text === a.text) ? list : [...list, a];
}

/** Libellé d'une référence Zotero dans le composer : `@citekey`, sinon `@clé`. */
export function zoteroLabel(item: { key: string; citeKey?: string }): string {
  return item.citeKey ? `@${item.citeKey}` : `@${item.key}`;
}

/** Fichier local joint par son chemin : l'agent le lit lui-même (outil Read).
 * `preview: false` pour les surfaces qui n'affichent que le nom (lecture). */
export function fileAttachment(path: string, opts: { preview?: boolean } = {}): Attachment {
  const name = path.split("/").pop() || path;
  return {
    name,
    lines: null,
    path,
    kind: "file",
    text: `Fichier joint (chemin local, lisible avec Read) : ${path}`,
    ...(opts.preview === false ? {} : {
      preview: {
        title: name,
        rows: [
          { label: "Type", value: "File" },
          { label: "Path", value: path },
        ],
      },
    }),
  };
}

/** « Joindre le PDF au chat » (lecteur PDF) : un PDF Zotero dont l'article est
 * connu part comme sa référence (`zoteroAttachment`, PDF et digest compris) ;
 * sinon comme fichier joint par son chemin local. `null` : aucun projet pour
 * résoudre un chemin relatif. */
export function pdfChatTarget(
  rel: string,
  items: ZoteroPaletteItem[],
  projectRoot: string | null,
): { item: ZoteroPaletteItem } | { path: string } | null {
  const zotero = /^zotero\/([A-Za-z0-9]{8})\/([^/]+)$/.exec(rel);
  if (zotero) {
    const item = items.find((entry) => entry.pdfKey === zotero[1] && entry.pdfFile === zotero[2]);
    return item ? { item } : { path: `~/Zotero/storage/${zotero[1]}/${zotero[2]}` };
  }
  if (rel.startsWith("/")) return { path: rel };
  if (!projectRoot) return null;
  return { path: `${projectRoot.replace(/\/+$/, "")}/${rel.replace(/^\.\//, "")}` };
}

const FOLDER_EXCLUDED = /(^|\/)(node_modules|dist|build|target|\.git|\.next|\.vite|coverage)\//;
const FOLDER_MAX_FILES = 60;

/** Dossier joint comme contexte : la liste des fichiers indexés (60 au plus,
 * hors dossiers de build) sans leur contenu, que l'agent lit à la demande. */
export function folderAttachment(folder: string, files: string[]): Attachment {
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  const included = files
    .filter((file) => file.startsWith(prefix) && !FOLDER_EXCLUDED.test(file))
    .slice(0, FOLDER_MAX_FILES);
  const omitted = Math.max(0, files.filter((file) => file.startsWith(prefix)).length - included.length);
  const name = prefix.split("/").filter(Boolean).pop() ?? prefix;
  return {
    name: `${name}/`,
    lines: included.length ? `${included.length} files${omitted ? `, +${omitted}` : ""}` : "empty",
    path: prefix,
    kind: "folder",
    text: [
      `Dossier joint comme contexte : ${prefix}`,
      "Contenu non injecté automatiquement; lis les fichiers précis avec Read si nécessaire.",
      included.length ? `Fichiers indexés${omitted ? ` (premiers ${included.length}, ${omitted} autres omis)` : ""} :` : "Aucun fichier indexé dans ce dossier.",
      ...included.map((file) => `- ${file}`),
    ].join("\n"),
    preview: {
      title: `${name}/`,
      rows: [
        { label: "Type", value: "Folder context" },
        { label: "Files", value: `${included.length}${omitted ? ` shown, ${omitted} omitted` : ""}` },
        { label: "Path", value: prefix },
      ],
    },
  };
}

/** Référence Zotero citée : la ligne « Digest » reste « … » jusqu'à la
 * réponse `zoteroDigest` du serveur (voir `withZoteroDigest`). */
export function zoteroAttachment(item: ZoteroPaletteItem): Attachment {
  const label = zoteroLabel(item);
  return {
    name: label,
    lines: item.year || null,
    kind: "zotero",
    text: buildZoteroReferenceText(item),
    preview: {
      title: item.title || label,
      rows: [
        { label: "Citation", value: label },
        ...(item.creators ? [{ label: "Authors", value: item.creators }] : []),
        ...(item.year ? [{ label: "Year", value: item.year }] : []),
        ...(item.doi ? [{ label: "DOI", value: item.doi }] : []),
        { label: "Digest", value: "…" },
      ],
    },
  };
}

/** Réponse `zoteroDigest` : remplace le texte de la référence `label` déjà
 * jointe et renseigne sa ligne « Digest ». */
export function withZoteroDigest(list: Attachment[], label: string, text: string, cached: boolean): Attachment[] {
  return list.map((a) =>
    a.kind === "zotero" && a.name === label
      ? {
          ...a, text,
          preview: a.preview && {
            ...a.preview,
            rows: a.preview.rows.map((r) =>
              r.label === "Digest"
                ? { label: "Digest", value: cached ? "en cache" : "à générer par l'agent" }
                : r),
          },
        }
      : a);
}

export function pastedTextAttachment(name: string, text: string): Attachment {
  return { name, lines: String(text.split("\n").length), kind: "paste", text };
}

/** Passage de la conversation cité dans le composer (bloc `>`). */
export function quoteAttachment(text: string): Attachment {
  return {
    name: `« ${text.slice(0, 50)}${text.length > 50 ? "…" : ""} »`,
    lines: null,
    kind: "quote",
    text: `Citation de la conversation :\n> ${text.split("\n").join("\n> ")}`,
  };
}

/** Extrait du navigateur : la sélection est citée, la page entière (`mode:
 * "page"`) est jointe telle quelle. Nom = hôte de l'URL. */
export function webExcerptAttachment(text: string, url?: string, mode?: "selection" | "page"): Attachment {
  let name = "extrait web";
  try { name = url ? new URL(url).hostname : name; } catch {}
  const body = mode === "page"
    ? `Source web ajoutée au contexte :\n${text}`
    : `Extrait copié depuis ${url || "une page web"} :\n> ${text.split("\n").join("\n> ")}`;
  return { name, lines: null, text: body };
}

const PREVIEWABLE_IMAGE = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

/** Fichier de la galerie atelier ajouté au chat : même contrat que le bouton
 * chat des cartes galerie (chemin absolu + consigne de lecture), vignette
 * servie par la galerie pour les images. */
export function galleryFileContext(projectRoot: string, rel: string, atelierUrl: string | null) {
  const path = `${projectRoot}/${rel}`;
  const name = rel.split("/").pop() || rel;
  const ext = (name.split(".").pop() || "").toLowerCase();
  let origin: string | null = null;
  try { origin = atelierUrl ? new URL(atelierUrl).origin : null; } catch {}
  const previewUrl = origin && PREVIEWABLE_IMAGE.includes(ext)
    ? new URL(rel, `${origin}/`).href
    : undefined;
  return {
    text: `${path}\nFichier joint depuis la galerie atelier — lis-le (outil Read) avant de répondre.`,
    file: { path, name, previewUrl },
  };
}
