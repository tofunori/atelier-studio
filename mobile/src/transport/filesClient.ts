import { normalizeItem } from "../files/classify.ts";
import type { GalleryIndex, GalleryItem } from "../files/types.ts";
import type { DeviceCredentials, ProjectSummary } from "./types.ts";
import { GatewayError } from "./gatewayClient.ts";

function base(url: string): string {
  return url.replace(/\/$/, "");
}

function authHeaders(token: string, extra?: HeadersInit): HeadersInit {
  return {
    "x-atelier-device-token": token,
    ...extra,
  };
}

async function parseError(res: Response): Promise<GatewayError> {
  let code = "http_error";
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { code?: string; error?: string };
    code = body.code || code;
    message = body.error || message;
  } catch {
    /* ignore */
  }
  return new GatewayError(message, code, res.status);
}

export async function fetchGalleryIndex(
  creds: DeviceCredentials,
  projectId: string,
  signal?: AbortSignal,
): Promise<GalleryIndex> {
  const items: GalleryItem[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let snapshot: string | undefined;
  while (true) {
    const res = await fetch(
      `${base(creds.gatewayBaseUrl)}/remote/v1/gallery/${encodeURIComponent(projectId)}?offset=${offset}${snapshot ? `&snapshot=${encodeURIComponent(snapshot)}` : ""}`,
      { headers: authHeaders(creds.token), signal },
    );
    if (!res.ok) throw await parseError(res);
    const body = (await res.json()) as { items: Record<string, unknown>[]; nextOffset?: number | null; snapshot?: string };
    snapshot = body.snapshot;
    for (const raw of body.items ?? []) {
      const item = normalizeItem(raw);
      if (!seen.has(item.fileId)) { seen.add(item.fileId); items.push(item); }
    }
    if (body.nextOffset == null) break;
    if (!Number.isSafeInteger(body.nextOffset) || body.nextOffset <= offset) throw new Error("Pagination de la galerie invalide");
    offset = body.nextOffset;
  }
  return { projectId, items, count: items.length };
}

export type FileBlobResult = {
  blob: Blob;
  etag?: string;
  notModified?: boolean;
  status: number;
  contentType: string;
};

/** Fetch by opaque fileId only — never path. */
export async function fetchFileById(
  creds: DeviceCredentials,
  fileId: string,
  opts?: {
    signal?: AbortSignal;
    range?: string;
    ifNoneMatch?: string;
  },
): Promise<FileBlobResult> {
  const headers: Record<string, string> = {
    "x-atelier-device-token": creds.token,
  };
  if (opts?.range) headers.Range = opts.range;
  if (opts?.ifNoneMatch) headers["If-None-Match"] = opts.ifNoneMatch;

  const res = await fetch(
    `${base(creds.gatewayBaseUrl)}/remote/v1/file/${encodeURIComponent(fileId)}`,
    { headers, signal: opts?.signal },
  );
  if (res.status === 304) {
    return {
      blob: new Blob(),
      etag: res.headers.get("etag") ?? opts?.ifNoneMatch,
      notModified: true,
      status: 304,
      contentType: res.headers.get("content-type") || "application/octet-stream",
    };
  }
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  return {
    blob,
    etag: res.headers.get("etag") ?? undefined,
    status: res.status,
    contentType: res.headers.get("content-type") || blob.type || "application/octet-stream",
  };
}

/** Move a file to the recoverable Atelier trash using its opaque id. */
export async function trashFileById(
  creds: DeviceCredentials,
  fileId: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `${base(creds.gatewayBaseUrl)}/remote/v1/file/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: authHeaders(creds.token),
      signal,
    },
  );
  if (!res.ok) throw await parseError(res);
}

export async function fetchProjects(
  creds: DeviceCredentials,
  signal?: AbortSignal,
): Promise<ProjectSummary[]> {
  const res = await fetch(`${base(creds.gatewayBaseUrl)}/remote/v1/projects`, {
    headers: authHeaders(creds.token),
    signal,
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { projects: ProjectSummary[] };
  return body.projects ?? [];
}

/** Client must never construct file URLs from raw paths. */
export function assertNoPathInRequest(url: string): void {
  if (url.includes("..") || url.includes("%2e%2e")) {
    throw new Error("path_escape");
  }
  if (/\/remote\/v1\/files\//.test(url) && /\/\.\./.test(url)) {
    throw new Error("path_escape");
  }
}
