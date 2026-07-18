import type { DraftAttachment } from "./chatDraftStore";

// Formats acceptes par le plus strict des providers image (Kimi). Les autres
// fichiers, y compris SVG/PDF/TEX, restent du contexte texte que l'agent peut
// ouvrir avec Read au lieu d'etre encodes comme une image.
const LOCAL_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

function extension(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isLocalImageAttachment(attachment: DraftAttachment): boolean {
  return Boolean(attachment.path) && LOCAL_IMAGE_EXTENSIONS.has(extension(attachment.path!));
}

function resolveFromProject(path: string, projectRoot: string): string {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\")) {
    return path;
  }
  if (!projectRoot) return path;
  const root = projectRoot.replace(/[\\/]+$/, "");
  const relative = path.replace(/^\.\//, "").replace(/^[\\/]+/, "");
  return `${root}/${relative}`;
}

/** Chemins image prets pour les providers : images seulement, absolus et dedupliques. */
export function localImagePathsForAttachments(
  attachments: DraftAttachment[],
  projectRoot: string,
): string[] {
  return [...new Set(
    attachments
      .filter(isLocalImageAttachment)
      .map((attachment) => resolveFromProject(attachment.path!, projectRoot)),
  )];
}
