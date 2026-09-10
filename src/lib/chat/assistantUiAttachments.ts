import { invoke } from "@tauri-apps/api/core";
import type {
  Attachment,
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
  ThreadUserMessagePart,
} from "@assistant-ui/react";
import type { DraftAttachment } from "../chatDraftStore";

/** Keep browser/IPC payloads bounded before they reach the Rust command. */
export const MAX_CHAT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type SaveChatAttachmentInput = {
  id: string;
  name: string;
  contentType: string;
  bytes: Uint8Array;
  file: File;
};

export type SaveChatAttachment = (input: SaveChatAttachmentInput) => Promise<string>;

export type AtelierAttachmentCallbacks = {
  /** Clipboard preview callback; File sends stay side-effect free. */
  onPasteImage?: (dataURL: string) => void | Promise<void>;
  /** Clipboard text callback; File sends stay side-effect free. */
  onPasteText?: (text: string) => void | Promise<void>;
  /** Route an already-native path into the Atelier draft. */
  onAttachPath?: (path: string) => void | Promise<void>;
  /** Remove the corresponding legacy Atelier draft entry. */
  onRemoveAttachment?: (index: number) => void | Promise<void>;
  /** Prefer this ID form when the host keeps drafts keyed by stable IDs. */
  onRemoveAttachmentId?: (id: string) => void | Promise<void>;
  /** Add a file saved by the official composer to the legacy Atelier draft. */
  onRestoreAttachment?: (attachment: DraftAttachment, index: number) => void | Promise<void>;
};

export type AtelierAttachmentAdapterOptions = AtelierAttachmentCallbacks & {
  /** Current legacy draft, used to make remove() address the right index. */
  attachments?: readonly DraftAttachment[];
  /** Defaults to the end of the current draft. */
  restoreIndex?: number | ((attachment: DraftAttachment) => number);
  /** Override the Tauri save command in tests or a browser-only host. */
  onSaveFile?: SaveChatAttachment;
  maxBytes?: number;
};

export type AtelierAttachmentAdapter = Omit<AttachmentAdapter, "add"> & {
  add(state: { file: File }): Promise<PendingAttachment>;
  /** Refresh the ID → legacy draft index mapping after App state changes. */
  syncDraftAttachments(attachments: readonly DraftAttachment[]): void;
  /** Explicitly route a native path through the Atelier callback. */
  attachNativePath(path: string): Promise<DraftAttachment>;
  /** Expose the existing undo contract to callers that own the shelf UI. */
  restoreDraftAttachment(attachment: DraftAttachment, index: number): Promise<void>;
};

type AttachmentRecord = {
  id: string;
  file: File;
  bytes: Uint8Array;
  path: string;
  draft: DraftAttachment;
  draftIndex: number | null;
  dataURL?: string;
  send?: Promise<CompleteAttachment>;
  cancelled: boolean;
  removed: boolean;
};

let generatedId = 0;

function newUploadId(file: File): string {
  generatedId += 1;
  return `atelier-upload:${file.name}:${file.size}:${file.lastModified}:${generatedId}`;
}

function hashIdentity(value: string): string {
  // FNV-1a is enough for a UI identity and avoids placing pasted text in an
  // attachment ID.  Paths intentionally use their readable stable form below.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Stable across composer remounts, with a readable ID for saved native files. */
export function draftAttachmentId(attachment: DraftAttachment, _index = 0): string {
  if (attachment.path) return `atelier-file:${attachment.path}`;
  if (attachment.pdfAnnotation) {
    const { origin, rel, id } = attachment.pdfAnnotation;
    return `atelier-pdf:${origin}:${rel}:${id}`;
  }
  const identity = [
    attachment.kind ?? "",
    attachment.name,
    attachment.text,
    attachment.imageUrl ?? "",
  ].join("\u0000");
  return `atelier-draft:${hashIdentity(identity)}`;
}

function attachmentLabel(name: string): string {
  return name.trim() || "attachment";
}

function pathAttachmentText(path: string): string {
  return `Fichier joint (chemin local, lisible avec Read) : ${path}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

const TEXT_MIME_TYPES = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/json",
  "application/ld+json",
  "application/manifest+json",
  "application/rtf",
  "application/sql",
  "application/toml",
  "application/typescript",
  "application/xml",
  "application/yaml",
  "text/css",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/markdown",
  "text/plain",
  "text/xml",
  "text/yaml",
]);

const TEXT_EXTENSIONS = new Set([
  "c",
  "cc",
  "conf",
  "cpp",
  "css",
  "csv",
  "env",
  "go",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "md",
  "mjs",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "tex",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

export function isTextAttachment(file: Pick<File, "name" | "type">): boolean {
  const mime = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  // A trusted binary MIME wins over a misleading text-looking filename. In
  // particular, never call text() on a PDF merely because it was renamed
  // `report.md` by a browser drag/drop source.
  if (
    mime === "application/pdf" ||
    mime === "application/zip" ||
    mime === "application/gzip" ||
    mime === "application/wasm" ||
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/") ||
    mime.startsWith("font/")
  ) return false;
  if (mime && !mime.startsWith("text/") && !TEXT_MIME_TYPES.has(mime) && mime !== "application/octet-stream") {
    return false;
  }
  return mime.startsWith("text/") || TEXT_MIME_TYPES.has(mime) || TEXT_EXTENSIONS.has(extensionOf(file.name));
}

function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25 // %
    && bytes[1] === 0x50 // P
    && bytes[2] === 0x44 // D
    && bytes[3] === 0x46 // F
    && bytes[4] === 0x2d; // -
}

function bytesToBase64(bytes: Uint8Array): string {
  const nodeBuffer = (globalThis as typeof globalThis & {
    Buffer?: { from(value: Uint8Array): { toString(encoding: string): string } };
  }).Buffer;
  if (nodeBuffer) return nodeBuffer.from(bytes).toString("base64");

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export { bytesToBase64 };

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  if (typeof FileReader === "undefined") throw new Error("Attachment bytes are unavailable");
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read attachment bytes"));
    reader.readAsArrayBuffer(file);
  });
}

export async function fileToDataURL(file: File, bytes?: Uint8Array): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("Could not read attachment preview"));
      reader.readAsDataURL(file);
    });
  }
  const payload = bytes ?? await readFileBytes(file);
  return `data:${file.type || "application/octet-stream"};base64,${bytesToBase64(payload)}`;
}

export async function fileToText(file: File): Promise<string> {
  if (typeof FileReader === "undefined") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read text attachment"));
    reader.readAsText(file);
  });
}

export async function saveChatAttachmentFile(input: SaveChatAttachmentInput): Promise<string> {
  if (input.bytes.byteLength > MAX_CHAT_ATTACHMENT_BYTES) {
    throw new Error(`Attachment exceeds the ${MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024)} MiB limit`);
  }
  return invoke<string>("save_chat_attachment", {
    name: input.name,
    base64: bytesToBase64(input.bytes),
  });
}

/** Convert a persisted Atelier draft into assistant-ui's complete shape. */
export function draftAttachmentToCompleteAttachment(
  attachment: DraftAttachment,
  index = 0,
): CompleteAttachment {
  const id = draftAttachmentId(attachment, index);
  const name = attachmentLabel(attachment.name);
  if (attachment.imageUrl) {
    const image: ThreadUserMessagePart = {
      type: "image",
      image: attachment.imageUrl,
      filename: name,
    };
    return {
      id,
      type: "image",
      name,
      contentType: "image/*",
      content: [image],
      status: { type: "complete" },
    };
  }

  const text = attachment.text || (attachment.path ? pathAttachmentText(attachment.path) : "");
  const content: ThreadUserMessagePart[] = [{ type: "text", text }];
  return {
    id,
    type: "document",
    name,
    contentType: "text/plain",
    content,
    status: { type: "complete" },
  };
}

export function draftAttachmentsToCompleteAttachments(
  attachments: readonly DraftAttachment[],
): CompleteAttachment[] {
  return attachments.map((attachment, index) => draftAttachmentToCompleteAttachment(attachment, index));
}

function fileDraftAttachment(file: File, path: string, imageUrl?: string): DraftAttachment {
  return {
    name: attachmentLabel(file.name),
    lines: null,
    text: pathAttachmentText(path),
    path,
    kind: "file",
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function attachmentPart(record: AttachmentRecord, text?: string): ThreadUserMessagePart {
  if (record.dataURL && record.file.type.toLowerCase().startsWith("image/")) {
    return { type: "image", image: record.dataURL, filename: record.file.name };
  }
  if (text !== undefined) {
    return { type: "text", text: `<attachment name=${record.file.name}>\n${text}\n</attachment>` };
  }
  return {
    type: "file",
    filename: record.file.name,
    data: record.dataURL ?? "",
    mimeType: record.file.type || "application/octet-stream",
  };
}

/**
 * Official assistant-ui adapter for Atelier. `add` persists the browser File
 * before exposing it to the composer, so a reload can always recover a local
 * path. `send` only converts the MIME-safe payload required by assistant-ui:
 * text files use `file.text()`, images use a data URL, and every other file
 * remains an opaque file part (PDFs are never decoded as text).  It does not
 * call the legacy paste callbacks during `send`: those callbacks are reserved
 * for clipboard handlers, because App already adds the restored Draft entry.
 */
export function createAtelierAttachmentAdapter(
  options: AtelierAttachmentAdapterOptions = {},
): AtelierAttachmentAdapter {
  const records = new Map<string, AttachmentRecord>();
  const draftIndexes = new Map<string, number>();
  const draftsById = new Map<string, DraftAttachment>();
  const removedIds = new Set<string>();
  const reservedRestoreIndexes = new Set<number>();
  const maxBytes = options.maxBytes ?? MAX_CHAT_ATTACHMENT_BYTES;
  let currentDrafts: readonly DraftAttachment[] = options.attachments ?? [];

  const syncDraftAttachments = (next: readonly DraftAttachment[]) => {
    const previousIds = new Set(draftIndexes.keys());
    currentDrafts = next;
    draftIndexes.clear();
    draftsById.clear();
    next.forEach((draft, index) => {
      const id = draftAttachmentId(draft, index);
      draftIndexes.set(id, index);
      draftsById.set(id, draft);
    });
    for (const id of [...removedIds]) {
      // A removed item that disappeared and was later restored can be removed
      // again.  Keep the marker while a stale render still contains the item.
      if (!draftIndexes.has(id) || !previousIds.has(id)) removedIds.delete(id);
    }
    for (const record of records.values()) {
      const index = draftIndexes.get(record.id);
      if (index != null) {
        record.draftIndex = index;
        reservedRestoreIndexes.delete(index);
        if (!previousIds.has(record.id)) record.removed = false;
      }
    }
  };
  syncDraftAttachments(currentDrafts);

  const reserveRestoreIndex = (): number => {
    let index = currentDrafts.length;
    while (
      [...draftIndexes.values()].includes(index) ||
      reservedRestoreIndexes.has(index) ||
      [...records.values()].some((record) => record.draftIndex === index)
    ) {
      index += 1;
    }
    reservedRestoreIndexes.add(index);
    return index;
  };

  const restoreDraftAttachment = async (attachment: DraftAttachment, index: number) => {
    await options.onRestoreAttachment?.(attachment, index);
  };

  const attachNativePath = async (path: string): Promise<DraftAttachment> => {
    const name = path.split(/[\\/]/).pop() || "attachment";
    const draft: DraftAttachment = {
      name,
      lines: null,
      text: pathAttachmentText(path),
      path,
      kind: "file",
    };
    await options.onAttachPath?.(path);
    return draft;
  };

  const adapter: AtelierAttachmentAdapter = {
    accept: "*",

    async add({ file }): Promise<PendingAttachment> {
      const reservedIndex = options.restoreIndex == null ? reserveRestoreIndex() : null;
      let savedId: string | undefined;
      try {
        if (file.size > maxBytes) {
          throw new Error(`Attachment exceeds the ${maxBytes / (1024 * 1024)} MiB limit`);
        }
        const bytes = await readFileBytes(file);
        if (bytes.byteLength > maxBytes) {
          throw new Error(`Attachment exceeds the ${maxBytes / (1024 * 1024)} MiB limit`);
        }

        const provisionalId = newUploadId(file);
        const path = await (options.onSaveFile ?? saveChatAttachmentFile)({
          id: provisionalId,
          name: file.name,
          contentType: file.type || "application/octet-stream",
          bytes,
          file,
        });
        if (!path) throw new Error("Attachment save returned no path");

        const id = `atelier-file:${path}`;
        savedId = id;
        let dataURL: string | undefined;
        if (file.type.toLowerCase().startsWith("image/")) {
          try {
            dataURL = await fileToDataURL(file, bytes);
          } catch {
            // The saved path remains valid even if a WebView preview is not
            // available (for example, a native FileReader polyfill is absent).
          }
        }
        const draft = fileDraftAttachment(file, path, dataURL);
        const draftIndex = typeof options.restoreIndex === "function"
          ? options.restoreIndex(draft)
          : typeof options.restoreIndex === "number"
            ? options.restoreIndex
            : reservedIndex!;
        const record: AttachmentRecord = {
          id,
          file,
          bytes,
          path,
          draft,
          draftIndex,
          dataURL,
          cancelled: false,
          removed: false,
        };
        records.set(id, record);
        if (options.onRestoreAttachment) {
          await options.onRestoreAttachment(draft, draftIndex);
        } else if (options.onAttachPath) {
          await options.onAttachPath(path);
        }

        return {
          id,
          type: file.type.toLowerCase().startsWith("image/") ? "image" : "document",
          name: attachmentLabel(file.name),
          contentType: file.type || "application/octet-stream",
          file,
          status: { type: "requires-action", reason: "composer-send" },
        };
      } catch (error) {
        if (reservedIndex != null) reservedRestoreIndexes.delete(reservedIndex);
        if (savedId) records.delete(savedId);
        throw error;
      }
    },

    async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
      const record = records.get(attachment.id);
      if (!record) throw new Error("Attachment is no longer available");
      if (record.cancelled) throw new Error("Attachment was removed before send");
      if (record.send) return record.send;

      record.send = (async () => {
        const mime = record.file.type.toLowerCase();
        if (isTextAttachment(record.file) && !isPdfBytes(record.bytes)) {
          const text = await fileToText(record.file);
          return {
            ...attachment,
            status: { type: "complete" as const },
            content: [attachmentPart(record, text)],
          };
        }

        if (mime.startsWith("image/")) {
          const dataURL = record.dataURL ?? await fileToDataURL(record.file);
          record.dataURL = dataURL;
          return {
            ...attachment,
            status: { type: "complete" as const },
            content: [attachmentPart(record)],
          };
        }

        // Binary formats, including PDF, are kept opaque. The bytes were
        // already persisted in add(); no text decoder is invoked here.
        const dataURL = record.dataURL ?? await fileToDataURL(record.file);
        record.dataURL = dataURL;
        return {
          ...attachment,
          status: { type: "complete" as const },
          content: [{
            type: "file" as const,
            filename: record.file.name,
            data: dataURL,
            mimeType: record.file.type || "application/octet-stream",
          }],
        };
      })();
      return record.send;
    },

    async remove(attachment: Attachment): Promise<void> {
      const record = records.get(attachment.id);
      if (record?.removed || removedIds.has(attachment.id)) return;
      const index = draftIndexes.get(attachment.id) ?? record?.draftIndex;
      if (!record && index == null) return;
      removedIds.add(attachment.id);
      if (record) {
        record.cancelled = true;
        record.removed = true;
        if (record.draftIndex != null) reservedRestoreIndexes.delete(record.draftIndex);
      }
      if (options.onRemoveAttachmentId) {
        await options.onRemoveAttachmentId(attachment.id);
      } else if (index != null) {
        await options.onRemoveAttachment?.(index);
      }
    },

    syncDraftAttachments,
    attachNativePath,
    restoreDraftAttachment,
  };

  return adapter;
}
