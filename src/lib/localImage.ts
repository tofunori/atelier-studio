import { invoke, isTauri } from "@tauri-apps/api/core";

function imageMime(path: string): string {
  const extension = path.split(/[?#]/u, 1)[0]?.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  return "image/png";
}

/** Résout un chemin image local sans exposer file:// au WebView. */
export async function localImagePreviewUrl(path: string): Promise<string> {
  if (/^(?:blob:|data:image\/|https?:\/\/)/iu.test(path) || !isTauri()) return path;
  const bytes = await invoke<ArrayBuffer>("local_image_read", { path });
  return URL.createObjectURL(new Blob([bytes], { type: imageMime(path) }));
}
