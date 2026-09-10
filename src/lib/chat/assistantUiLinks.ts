import { openUrl } from "@tauri-apps/plugin-opener";
import { setPendingPassageOpen } from "../pendingPassageOpen";

/**
 * Link targets understood by the assistant-ui transcript.
 *
 * This module deliberately contains only the navigation contract used by the
 * markdown link delegate.  Rendering stays in the official assistant-ui
 * MarkdownText component (and the legacy chat markdown renderer keeps its own
 * compatibility surface).
 */
export const ASSISTANT_UI_FILE_REF =
  /^(?![a-z][a-z\d+.-]*:\/\/)[^\u0000-\u001f?#]+\.(tex|py|jl|md|r|bib|json|toml|yaml|yml|sh|js|ts|tsx|jsx|css|html|txt|csv|sql|rs|mjs|ipynb|png|jpg|jpeg|gif|webp|pdf|svg|doc|docx|odt|xls|xlsx|ods|ppt|pptx|odp)(:\d+(?:-\d+)?)?$/i;

export type AssistantUiOpenFileRefOptions = {
  diff?: boolean;
  baseSha?: string | null;
};

export type AssistantUiZoteroPassageRef = {
  kind: "zotero";
  key: string;
  pdfKey: string;
  pdfFile: string;
  page: number | null;
  quote: string;
  section: string;
};

export type AssistantUiGbrainPassageRef = {
  kind: "gbrain";
  slug: string;
  quote: string;
};

export type AssistantUiKnowledgeSourceRef = {
  kind: "kb-source";
  id: string | null;
  loc: string | null;
};

export type AssistantUiLinkRef =
  | { kind: "file"; ref: string }
  | AssistantUiZoteroPassageRef
  | AssistantUiGbrainPassageRef
  | AssistantUiKnowledgeSourceRef
  | { kind: "external"; href: string };

const GBRAIN_SLUG_SEGMENT = /^[A-Za-z0-9._-]+$/;

function dispatchWindowEvent(name: string, detail: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Decode a markdown/URI target without letting malformed escapes reach the
 * native navigation event. */
function decodeAssistantUiUri(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Convert the local URI forms emitted by Tauri/markdown into the editor's
 * relative-or-absolute path contract. A remote file URI is intentionally not
 * treated as a local file target.
 */
function normalizeAssistantUiFileTarget(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(?:file|tauri):\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "file:" && protocol !== "tauri:") return null;
    if (parsed.hostname && parsed.hostname.toLowerCase() !== "localhost") return null;
    if (parsed.search || parsed.hash) return null;
    const decodedPath = decodeAssistantUiUri(parsed.pathname);
    return decodedPath && decodedPath.startsWith("/") ? decodedPath : null;
  }
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) return null;
  return decodeAssistantUiUri(trimmed);
}

/** Dispatch an Atelier file-open request used by the editor surface. */
export function openAssistantUiFileRef(
  ref: string,
  options: AssistantUiOpenFileRefOptions = {},
): void {
  const normalized = normalizeAssistantUiFileTarget(ref);
  if (!normalized) return;
  const match = /^(.+?)(?::(\d+(?:-\d+)?))?$/.exec(normalized);
  if (!match) return;
  dispatchWindowEvent("chat-open-file", {
    rel: match[1],
    line: match[2] ?? null,
    diff: options.diff === true,
    baseSha: options.baseSha ?? null,
  });
}

/** Parse a safe Zotero passage hash used by source-reader links. */
export function parseAssistantUiZoteroPassageRef(
  href: string,
): AssistantUiZoteroPassageRef | null {
  const prefix = "#atelier-zotero-passage?";
  if (!href.startsWith(prefix)) return null;
  const params = new URLSearchParams(href.slice(prefix.length));
  const key = params.get("key") ?? "";
  const pdfKey = params.get("pdfKey") ?? "";
  const pdfFile = params.get("file") ?? "";
  const rawPage = params.get("page");
  const quote = (params.get("quote") ?? "").slice(0, 900);
  const section = params.get("section") ?? "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) return null;
  if (pdfKey && !/^[A-Za-z0-9_-]{1,80}$/.test(pdfKey)) return null;
  if (
    pdfFile &&
    (pdfFile.length > 255 || /[/\\]/.test(pdfFile) || !pdfFile.toLowerCase().endsWith(".pdf"))
  ) {
    return null;
  }
  let page: number | null = null;
  if (rawPage !== null && rawPage !== "") {
    page = Number(rawPage);
    if (!Number.isInteger(page) || page < 1 || page > 100_000) return null;
  }
  if (section && (section.length > 12 || !/^\d+(\.\d+)*$/.test(section))) return null;
  return { kind: "zotero", key, pdfKey, pdfFile, page, quote, section };
}

/** Dispatch a Zotero source-reader request and preserve the first-click retry. */
export function openAssistantUiZoteroPassage(ref: AssistantUiZoteroPassageRef): void {
  setPendingPassageOpen({ kind: "zotero", detail: ref, ts: Date.now() });
  dispatchWindowEvent("chat-open-zotero-passage", ref);
}

function isValidGbrainSlug(slug: string): boolean {
  if (!slug || slug.length > 200 || slug.startsWith("/") || slug.endsWith("/")) return false;
  return slug
    .split("/")
    .every((segment) => segment !== "." && segment !== ".." && GBRAIN_SLUG_SEGMENT.test(segment));
}

/** Parse a safe gbrain source-reader hash. */
export function parseAssistantUiGbrainPassageRef(
  href: string,
): AssistantUiGbrainPassageRef | null {
  const prefix = "#atelier-gbrain-passage?";
  if (!href.startsWith(prefix)) return null;
  const params = new URLSearchParams(href.slice(prefix.length));
  const slug = params.get("slug") ?? "";
  const quote = (params.get("quote") ?? "").slice(0, 900);
  if (!isValidGbrainSlug(slug) || !quote.trim()) return null;
  return { kind: "gbrain", slug, quote };
}

/** Dispatch a gbrain source-reader request and preserve the first-click retry. */
export function openAssistantUiGbrainPassage(ref: AssistantUiGbrainPassageRef): void {
  const detail = { slug: ref.slug, quote: ref.quote };
  setPendingPassageOpen({ kind: "gbrain", detail, ts: Date.now() });
  dispatchWindowEvent("kb-open-gbrain-passage", detail);
}

/** Parse a knowledge-base citation link without creating a renderer-specific node. */
export function parseAssistantUiKnowledgeSourceRef(
  href: string,
): AssistantUiKnowledgeSourceRef | null {
  const prefix = "#atelier-kb-src?";
  if (!href.startsWith(prefix)) return null;
  const params = new URLSearchParams(href.slice(prefix.length));
  return {
    kind: "kb-source",
    id: params.get("id"),
    loc: params.get("loc"),
  };
}

/** Dispatch a knowledge-base citation request. */
export function openAssistantUiKnowledgeSource(
  ref: AssistantUiKnowledgeSourceRef,
): void {
  dispatchWindowEvent("kb-cite-open", { id: ref.id, loc: ref.loc });
}

function parseFileRef(href: string, label?: string): string | null {
  const hrefValue = href.trim();
  const normalizedHref = normalizeAssistantUiFileTarget(hrefValue);
  // The href identifies the target. Visible labels are only a compatibility
  // fallback for legacy `#file` links; a paper URL labelled `paper.pdf` must
  // remain an external URL.
  if (normalizedHref && ASSISTANT_UI_FILE_REF.test(normalizedHref)) return normalizedHref;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(hrefValue)) return null;
  const labelRef = label?.trim() ?? "";
  const normalizedLabel = normalizeAssistantUiFileTarget(labelRef);
  return normalizedLabel && ASSISTANT_UI_FILE_REF.test(normalizedLabel)
    ? normalizedLabel
    : null;
}

function parseAssistantUiLink(href: string, label?: string): AssistantUiLinkRef | null {
  const knowledge = parseAssistantUiKnowledgeSourceRef(href);
  if (knowledge) return knowledge;
  const zotero = parseAssistantUiZoteroPassageRef(href);
  if (zotero) return zotero;
  const gbrain = parseAssistantUiGbrainPassageRef(href);
  if (gbrain) return gbrain;
  const file = parseFileRef(href, label);
  if (file) return { kind: "file", ref: file };
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) return { kind: "external", href: trimmed };
  return null;
}

/**
 * Handle one assistant-ui markdown link.
 *
 * The return value tells the caller whether it owns the click.  A markdown
 * delegate should call `preventDefault()` only when this returns `true`; an
 * unrecognised link can then keep the host's normal fallback behaviour.
 */
export function handleAssistantUiLink(href: string, label?: string): boolean {
  const ref = parseAssistantUiLink(String(href ?? ""), label);
  if (!ref) return false;
  switch (ref.kind) {
    case "file":
      openAssistantUiFileRef(ref.ref);
      return true;
    case "zotero":
      openAssistantUiZoteroPassage(ref);
      return true;
    case "gbrain":
      openAssistantUiGbrainPassage(ref);
      return true;
    case "kb-source":
      openAssistantUiKnowledgeSource(ref);
      return true;
    case "external":
      // `openUrl` is asynchronous; ownership of the click is synchronous.
      void openUrl(ref.href).catch(() => undefined);
      return true;
  }
}
