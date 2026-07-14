import type { AtelierGalleryCommandMessage, AtelierGalleryResultMessage } from "./ipc";

const ATELIER_PORT_MIN = 18790;
const ATELIER_PORT_MAX = 19789;
const MAX_RELS = 100;
const MAX_REL_LENGTH = 2048;
const MAX_REQUEST_ID_LENGTH = 128;

export type GalleryCommandRequest = Omit<AtelierGalleryCommandMessage, "type" | "nonce">;

type GalleryFrame = {
  src: string;
  contentWindow: { postMessage(message: unknown, targetOrigin: string): void } | null;
};

type GalleryCommandBridgeOptions = {
  nonce: string;
  timeoutMs?: number;
  getCurrentProjectRoot(): string | null;
  getGalleryFrame(): GalleryFrame | null;
  onValidated?(): void;
  onEmpty?(result: AtelierGalleryResultMessage): void;
};

type Pending = {
  action: GalleryCommandRequest["action"];
  projectRoot: string;
  signature: string;
  promise: Promise<AtelierGalleryResultMessage>;
  resolve(result: AtelierGalleryResultMessage): void;
  reject(error: GalleryCommandBridgeError): void;
  timer: ReturnType<typeof setTimeout>;
};

export class GalleryCommandBridgeError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "GalleryCommandBridgeError";
  }
}

function error(code: string): Promise<never> {
  return Promise.reject(new GalleryCommandBridgeError(code));
}

function galleryOrigin(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const port = Number(url.port);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !Number.isInteger(port) ||
      port < ATELIER_PORT_MIN ||
      port > ATELIER_PORT_MAX
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function validRequest(request: GalleryCommandRequest): boolean {
  const keys = request && typeof request === "object" ? Object.keys(request) : [];
  if (!(
    request &&
    keys.length === 5 &&
    keys.every((key) => ["action", "mode", "projectRoot", "requestId", "rels"].includes(key)) &&
    typeof request.projectRoot === "string" && request.projectRoot.length > 0 &&
    typeof request.requestId === "string" &&
    request.requestId.length > 0 && request.requestId.length <= MAX_REQUEST_ID_LENGTH &&
    Array.isArray(request.rels) && request.rels.length <= MAX_RELS &&
    request.rels.every((rel) =>
      typeof rel === "string" && rel.length > 0 && rel.length <= MAX_REL_LENGTH,
    )
  )) return false;
  if (request.action === "show") return request.mode === "focus" && request.rels.length > 0;
  if (request.action === "open") return request.mode === "viewer" && request.rels.length === 1;
  if (request.action === "compare") return request.mode === "selection" && request.rels.length >= 2;
  return request.action === "reset" && request.mode === "all" && request.rels.length === 0;
}

export function createGalleryCommandBridge(options: GalleryCommandBridgeOptions) {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const pending = new Map<string, Pending>();

  function send(request: GalleryCommandRequest): Promise<AtelierGalleryResultMessage> {
    if (!validRequest(request)) return error("gallery-command-invalid");
    if (options.getCurrentProjectRoot() !== request.projectRoot) return error("project-mismatch");

    const signature = JSON.stringify(request);
    const existing = pending.get(request.requestId);
    if (existing) {
      return existing.signature === signature
        ? existing.promise
        : error("request-id-collision");
    }

    const frame = options.getGalleryFrame();
    if (!frame?.contentWindow) return error("gallery-frame-unavailable");
    const origin = galleryOrigin(frame.src);
    if (!origin) return error("gallery-origin-invalid");

    let resolve!: Pending["resolve"];
    let reject!: Pending["reject"];
    const promise = new Promise<AtelierGalleryResultMessage>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const timer = setTimeout(() => {
      const current = pending.get(request.requestId);
      if (!current) return;
      pending.delete(request.requestId);
      current.reject(new GalleryCommandBridgeError("gallery-timeout"));
    }, timeoutMs);
    pending.set(request.requestId, {
      action: request.action,
      projectRoot: request.projectRoot,
      signature,
      promise,
      resolve,
      reject,
      timer,
    });

    options.onValidated?.();
    frame.contentWindow.postMessage({
      type: "atelier-gallery-command",
      nonce: options.nonce,
      ...request,
    } satisfies AtelierGalleryCommandMessage, origin);
    return promise;
  }

  function acceptResult(result: AtelierGalleryResultMessage): boolean {
    const item = pending.get(result.requestId);
    if (!item) return false;
    if (
      result.nonce !== options.nonce ||
      result.action !== item.action ||
      result.projectRoot !== item.projectRoot ||
      options.getCurrentProjectRoot() !== item.projectRoot
    ) return false;

    pending.delete(result.requestId);
    clearTimeout(item.timer);
    if (!result.ok) {
      item.reject(new GalleryCommandBridgeError(result.error || "gallery-command-failed"));
      return true;
    }
    if (result.applied === false || (result.action !== "reset" && (result.matched?.length ?? 0) === 0)) {
      options.onEmpty?.(result);
    }
    item.resolve(result);
    return true;
  }

  function reset(code = "gallery-bridge-reset") {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(new GalleryCommandBridgeError(code));
    }
    pending.clear();
  }

  return {
    send,
    acceptResult,
    reset,
    dispose: () => reset("gallery-bridge-disposed"),
    pendingCount: () => pending.size,
  };
}

export type GalleryCommandBridge = ReturnType<typeof createGalleryCommandBridge>;
