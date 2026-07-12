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
  const res = await fetch(
    `${base(creds.gatewayBaseUrl)}/remote/v1/gallery/${encodeURIComponent(projectId)}`,
    { headers: authHeaders(creds.token), signal },
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { projectId: string; items: Record<string, unknown>[]; count?: number };
  const items: GalleryItem[] = (body.items ?? []).map((raw) => normalizeItem(raw));
  return {
    projectId: body.projectId ?? projectId,
    items,
    count: body.count ?? items.length,
  };
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
