/** Gallery / files types — clients use opaque fileId only (never absolute paths). */

export type FileKind = "pdf" | "figure" | "latex" | "data" | "code" | "other";

export type GalleryFilter = "all" | "pdf" | "figure" | "latex" | "data" | "code";

export type GalleryItem = {
  fileId: string;
  name: string;
  size: number;
  ext: string;
  kind: FileKind;
  modifiedAt?: number | null;
  etag?: string;
  /** Never use for FS access — display only if server sent it (we strip in client). */
  relativePath?: string;
};

export type GalleryIndex = {
  projectId: string;
  items: GalleryItem[];
  count: number;
};

export type PendingChatAttachment = {
  fileId: string;
  name: string;
  size: number;
  kind: FileKind;
  projectId: string;
  etag?: string;
  excerpt?: string;
  lineStart?: number;
  lineEnd?: number;
  addedAt: number;
};

export const LARGE_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB confirm before full download
export const THUMB_MAX_BYTES = 5 * 1024 * 1024; // progressive PNG preview ceiling
