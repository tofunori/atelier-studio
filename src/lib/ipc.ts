const ATELIER_PORT_MIN = 18790;
const ATELIER_PORT_MAX = 19789;
const MAX_NONCE_LENGTH = 128;
const MAX_URL_LENGTH = 4096;
const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 100_000;

export type AtelierThemeRequestMessage = {
  type: "atelier-theme-request";
  nonce: string;
};

export type AtelierOpenTabMessage = {
  type: "atelier-open-tab";
  nonce: string;
  url: string;
  title?: string;
};

export type AtelierAddToChatMessage = {
  type: "atelier-add-to-chat";
  nonce: string;
  text: string;
  path?: string;
  name?: string;
  previewUrl?: string;
};

export type BrowserAddToChatMessage = {
  type: "browser-add-to-chat";
  nonce: string;
  text: string;
  url?: string;
};

export type AtelierGalleryAction = "show" | "open" | "compare" | "reset";
export type AtelierGalleryMode = "focus" | "viewer" | "selection" | "all";

export type AtelierGalleryCommandMessage = {
  type: "atelier-gallery-command";
  nonce: string;
  action: AtelierGalleryAction;
  mode: AtelierGalleryMode;
  projectRoot: string;
  requestId: string;
  rels: string[];
};

export type AtelierGalleryResultMessage = {
  type: "atelier-gallery-result";
  nonce: string;
  ok: boolean;
  action: AtelierGalleryAction;
  projectRoot: string;
  requestId: string;
  matched?: string[];
  missing?: string[];
  applied?: boolean;
  error?: string;
};

export type AtelierInboundMessage =
  | AtelierThemeRequestMessage
  | AtelierOpenTabMessage
  | AtelierAddToChatMessage
  | BrowserAddToChatMessage
  | AtelierGalleryResultMessage;

export type AtelierOutboundMessage =
  | {
      type: "atelier-theme";
      version: 2;
      colorScheme: "dark" | "light";
      nonce: string;
      vars: Record<string, string>;
    }
  | AtelierGalleryCommandMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isOptionalBoundedString(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || isBoundedString(value, maxLength);
}

function isValidMessageUrl(value: unknown): value is string {
  if (!isBoundedString(value, MAX_URL_LENGTH)) return false;
  try {
    new URL(value, "http://127.0.0.1:18790");
    return true;
  } catch {
    return false;
  }
}

function hasTrustedAtelierOrigin(origin: string): boolean {
  if (!origin.startsWith("http://127.0.0.1:")) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") return false;
  const port = Number(url.port);
  return Number.isInteger(port) && port >= ATELIER_PORT_MIN && port <= ATELIER_PORT_MAX;
}

export function isTrustedAtelierMessage(
  event: MessageEvent<unknown>,
  nonce: string,
): event is MessageEvent<AtelierInboundMessage> {
  if (!hasTrustedAtelierOrigin(event.origin)) return false;
  const data = event.data;
  if (!isRecord(data)) return false;
  if (!isBoundedString(data.nonce, MAX_NONCE_LENGTH) || data.nonce !== nonce) return false;
  if (typeof data.type !== "string") return false;

  switch (data.type) {
    case "atelier-theme-request":
      return hasOnlyKeys(data, ["type", "nonce"]);
    case "atelier-open-tab":
      return (
        hasOnlyKeys(data, ["type", "nonce", "url", "title"]) &&
        isValidMessageUrl(data.url) &&
        isOptionalBoundedString(data.title, MAX_TITLE_LENGTH)
      );
    case "atelier-add-to-chat":
      return (
        hasOnlyKeys(data, ["type", "nonce", "text", "path", "name", "previewUrl"]) &&
        isBoundedString(data.text, MAX_TEXT_LENGTH) &&
        isOptionalBoundedString(data.path, MAX_URL_LENGTH) &&
        isOptionalBoundedString(data.name, MAX_TITLE_LENGTH) &&
        (data.previewUrl === undefined || isValidMessageUrl(data.previewUrl))
      );
    case "browser-add-to-chat":
      return (
        hasOnlyKeys(data, ["type", "nonce", "text", "url"]) &&
        isBoundedString(data.text, MAX_TEXT_LENGTH) &&
        (data.url === undefined || isValidMessageUrl(data.url))
      );
    case "atelier-gallery-result": {
      if (!hasOnlyKeys(data, ["type", "nonce", "ok", "action", "projectRoot", "requestId", "matched", "missing", "applied", "error"])) return false;
      const validRelList = (value: unknown) =>
        value === undefined ||
        (Array.isArray(value) && value.length <= 100 && value.every((item) => isBoundedString(item, MAX_URL_LENGTH)));
      return (
        typeof data.ok === "boolean" &&
        ["show", "open", "compare", "reset"].includes(String(data.action)) &&
        isBoundedString(data.projectRoot, MAX_URL_LENGTH) &&
        isBoundedString(data.requestId, MAX_NONCE_LENGTH) &&
        validRelList(data.matched) &&
        validRelList(data.missing) &&
        (data.applied === undefined || typeof data.applied === "boolean") &&
        isOptionalBoundedString(data.error, MAX_TITLE_LENGTH)
      );
    }
    default:
      return false;
  }
}

export function withAtelierNonce(rawUrl: string, nonce: string): string {
  const url = new URL(rawUrl);
  const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  params.set("atelier_nonce", nonce);
  url.hash = params.toString();
  return url.toString();
}

export function atelierTargetOrigin(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}
