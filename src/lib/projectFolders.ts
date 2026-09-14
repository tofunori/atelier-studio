import { isDiscussionContext } from "./discussions";
export type ProjectFolder = {
  path: string;
  name: string;
  access: "read" | "write";
  gallery: boolean;
};
export type ProjectFolders = { mainGallery: boolean; folders: ProjectFolder[] };
/** Resolve absolute chat links against associated folders, independent of gallery visibility. */
export function resolveAssociatedFile(root: string, config: ProjectFolders | undefined, path: string) {
  if (!path.startsWith("/")) return null;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  const absolute = `/${parts.join("/")}`;
  const folder = normalizeProjectFolders(root, config).folders
    .filter(folder => absolute.startsWith(folder.path === "/" ? "/" : `${folder.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return folder ? { root: folder.path, rel: absolute.slice(folder.path === "/" ? 1 : folder.path.length + 1) } : null;
}
export function normalizeProjectFolders(root: string, value?: Partial<ProjectFolders>): ProjectFolders {
  const seen = new Set([root.replace(/\/+$/, "") || "/"]);
  const folders: ProjectFolder[] = [];
  for (const item of Array.isArray(value?.folders) ? value.folders : []) {
    if (!item || typeof item.path !== "string") continue;
    const path = item.path.trim().replace(/\/+$/, "") || "/";
    if (!path.startsWith("/") || seen.has(path)) continue;
    seen.add(path);
    folders.push({ path, name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : path.split("/").pop() || path,
      access: item.access === "write" ? "write" : "read", gallery: item.gallery !== false });
  }
  return { mainGallery: value?.mainGallery !== false, folders };
}
export function projectWritableDirectories(root: string | null, settings: { projectFolders?: Record<string, ProjectFolders>; additionalDirectories: string }): string[] {
  if (isDiscussionContext(root)) return [];
  if (root && settings.projectFolders?.[root]) return normalizeProjectFolders(root, settings.projectFolders[root]).folders.filter(f => f.access === "write").map(f => f.path);
  return settings.additionalDirectories.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
}
