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

// « PDF ↗ » du studio LaTeX : l'app choisit le viewer (pdf_viewer si le PDF
// est dans le projet, sinon studio mode=pdf) — chemins absolus, pas des URLs
export type AtelierOpenPdfMessage = {
  type: "atelier-open-pdf";
  nonce: string;
  tex: string;
  pdf: string;
  title?: string;
};

export type AtelierAddToChatMessage = {
  type: "atelier-add-to-chat";
  nonce: string;
  text: string;
  path?: string;
  name?: string;
  previewUrl?: string;
  direct?: boolean;
  requestId?: string;
  pdfAnnotation?: { rel: string; id: string };
};

/** Bouton « Joindre le PDF au chat » du lecteur PDF : `rel` est le chemin du
 *  lecteur (`zotero/<clé>/<fichier>` ou relatif au projet) ; l'app résout. */
/** Panneau Recette de la galerie : « Ouvrir la conversation » du tour qui a
 *  produit la figure. L'app ignore un fil inconnu. */
export type AtelierOpenThreadMessage = {
  type: "atelier-open-thread";
  nonce: string;
  threadId: string;
};

/** Panneau « À faire » et détail du compte de l'éditeur LaTeX : ouvrir un
 *  autre fichier du manuscrit (un \input) à une ligne. `path` est absolu (ou
 *  relatif au projet) ; l'app le résout comme une pilule fichier du chat. */
export type AtelierOpenFileMessage = {
  type: "atelier-open-file";
  nonce: string;
  path: string;
  line?: number;
};

export type AtelierAttachPdfMessage = {
  type: "atelier-attach-pdf";
  nonce: string;
  rel: string;
  requestId?: string;
};

/** Sélection envoyée au Quick Ask depuis un éditeur galerie (studio
 *  LaTeX/code). `around` porte les lignes voisines : un mot seul arraché à un
 *  .tex ne dit rien de plus qu'un mot seul arraché à un fil. */
export type AtelierQuickAskMessage = {
  type: "atelier-quick-ask";
  nonce: string;
  text: string;
  around?: string;
  path?: string;
  page?: string;
};

/** Revue un par un d'un relecteur (lib/reviewSession.ts) : l'éditeur LaTeX
 *  envoie un commentaire au chat (`text` = ce que lit l'agent), ou `done`
 *  quand il n'en reste plus. */
export type AtelierReviewCommentMessage = {
  type: "atelier-review-comment";
  nonce: string;
  text: string;
  review: {
    doc: string;
    mode: "open" | "likely" | "edit";
    done?: boolean;
    /** Le geste n'a pas pu se faire (accepter une retouche…) : la barre le dit. */
    error?: string;
    path?: string;
    id?: string;
    n?: number;
    total?: number;
    author?: string;
    comment?: string;
    quote?: string;
    now?: string;
    line?: number;
    fit?: string;
    kind?: string;
    likely?: string;
    /** Une de ses retouches : apply, changed ou done ; `ready` = s'applique. */
    edit?: string;
    ready?: boolean;
  };
};

export type AtelierAddToChatAckMessage = {
  type: "atelier-add-to-chat-ack";
  nonce: string;
  requestId: string;
  ok: boolean;
  error?: string;
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

export type AtelierGalleryFullscreenMessage = {
  type: "atelier-gallery-fullscreen" | "atelier-gallery-viewport-request";
  nonce: string;
  active: boolean;
};

export type AtelierInboundMessage =
  | AtelierGalleryFullscreenMessage
  | AtelierThemeRequestMessage
  | AtelierOpenTabMessage
  | AtelierOpenPdfMessage
  | AtelierAddToChatMessage
  | AtelierAttachPdfMessage
  | AtelierOpenThreadMessage
  | AtelierOpenFileMessage
  | AtelierQuickAskMessage
  | AtelierReviewCommentMessage
  | BrowserAddToChatMessage
  | AtelierGalleryResultMessage;

export type AtelierOutboundMessage =
  | {
      type: "atelier-theme";
      version: 2;
      colorScheme: "dark" | "light";
      /** Preset de l'app : l'éditeur de code y aligne son profil de couleurs. */
      preset?: string;
      nonce: string;
      vars: Record<string, string>;
    }
  | AtelierAddToChatAckMessage
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

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000_000;

function isReviewPayload(review: Record<string, unknown>): boolean {
  if (!hasOnlyKeys(review, ["doc", "mode", "done", "error", "path", "id", "n", "total", "author", "comment", "quote", "now", "line", "fit", "kind", "likely", "edit", "ready"])) return false;
  if (!isBoundedString(review.doc, MAX_URL_LENGTH) || (review.mode !== "open" && review.mode !== "likely" && review.mode !== "edit")) return false;
  if (review.error !== undefined) return review.done === undefined && isBoundedString(review.error, MAX_TITLE_LENGTH);
  if (review.done !== undefined) return review.done === true;
  const text = (value: unknown) => value === undefined || (typeof value === "string" && value.length <= MAX_TEXT_LENGTH);
  const short = (value: unknown) => value === undefined || (typeof value === "string" && value.length <= MAX_TITLE_LENGTH);
  return isBoundedString(review.path, MAX_URL_LENGTH) && isBoundedString(review.id, MAX_TITLE_LENGTH)
    && isCount(review.n) && isCount(review.total) && (review.line === undefined || isCount(review.line))
    && short(review.author) && short(review.fit) && short(review.kind)
    && text(review.comment) && text(review.quote) && text(review.now) && text(review.likely)
    && short(review.edit) && (review.ready === undefined || typeof review.ready === "boolean");
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
    case "atelier-gallery-viewport-request":
    case "atelier-gallery-fullscreen":
      return hasOnlyKeys(data, ["type", "nonce", "active"]) && typeof data.active === "boolean";
    case "atelier-theme-request":
      return hasOnlyKeys(data, ["type", "nonce"]);
    case "atelier-open-tab":
      return (
        hasOnlyKeys(data, ["type", "nonce", "url", "title"]) &&
        isValidMessageUrl(data.url) &&
        isOptionalBoundedString(data.title, MAX_TITLE_LENGTH)
      );
    case "atelier-open-pdf":
      return (
        hasOnlyKeys(data, ["type", "nonce", "tex", "pdf", "title"]) &&
        isBoundedString(data.tex, MAX_URL_LENGTH) &&
        isBoundedString(data.pdf, MAX_URL_LENGTH) &&
        isOptionalBoundedString(data.title, MAX_TITLE_LENGTH)
      );
    case "atelier-quick-ask":
      return (
        hasOnlyKeys(data, ["type", "nonce", "text", "around", "path", "page"]) &&
        isBoundedString(data.text, MAX_TEXT_LENGTH) &&
        isOptionalBoundedString(data.around, MAX_TEXT_LENGTH) &&
        isOptionalBoundedString(data.path, MAX_URL_LENGTH) &&
        isOptionalBoundedString(data.page, MAX_TITLE_LENGTH)
      );
    case "atelier-add-to-chat":
      return (
        hasOnlyKeys(data, ["type", "nonce", "text", "path", "name", "previewUrl", "requestId", "pdfAnnotation", "direct"]) &&
        (data.pdfAnnotation === undefined || (isRecord(data.pdfAnnotation) &&
          hasOnlyKeys(data.pdfAnnotation, ["rel", "id"]) &&
          isBoundedString(data.pdfAnnotation.rel, MAX_URL_LENGTH) &&
          isBoundedString(data.pdfAnnotation.id, MAX_TITLE_LENGTH))) &&
        isBoundedString(data.text, MAX_TEXT_LENGTH) &&
        isOptionalBoundedString(data.path, MAX_URL_LENGTH) &&
        isOptionalBoundedString(data.name, MAX_TITLE_LENGTH) &&
        (data.previewUrl === undefined || isValidMessageUrl(data.previewUrl)) &&
        (data.direct === undefined || typeof data.direct === "boolean") &&
        isOptionalBoundedString(data.requestId, MAX_NONCE_LENGTH)
      );
    case "atelier-review-comment":
      return hasOnlyKeys(data, ["type", "nonce", "text", "review"]) && typeof data.text === "string"
        && data.text.length <= MAX_TEXT_LENGTH && isRecord(data.review) && isReviewPayload(data.review);
    case "atelier-open-thread":
      return hasOnlyKeys(data, ["type", "nonce", "threadId"]) && isBoundedString(data.threadId, MAX_TITLE_LENGTH);
    case "atelier-open-file":
      return (
        hasOnlyKeys(data, ["type", "nonce", "path", "line"]) &&
        isBoundedString(data.path, MAX_URL_LENGTH) &&
        (data.line === undefined ||
          (typeof data.line === "number" && Number.isInteger(data.line) && data.line >= 1 && data.line <= 10_000_000))
      );
    case "atelier-attach-pdf":
      return hasOnlyKeys(data, ["type", "nonce", "rel", "requestId"]) && isBoundedString(data.rel, MAX_URL_LENGTH)
        && isOptionalBoundedString(data.requestId, MAX_NONCE_LENGTH);
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

// Jeton galerie (accès hors-projet) transporté par le fragment plutôt que la
// query : jamais envoyé au serveur dans la requête de navigation initiale,
// jamais dans les logs d'accès ni l'historique du navigateur — récupéré
// côté page comme le nonce l'est déjà (voir studio_runtime.bundle.js /
// atelier_theme.js). Voir plan 062 étape 5.
export function withAtelierToken(rawUrl: string, token: string): string {
  const url = new URL(rawUrl);
  const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  params.set("atelier_token", token);
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
