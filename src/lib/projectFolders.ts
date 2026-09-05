export type ProjectFolder = {
  path: string;
  name: string;
  access: "read" | "write";
  gallery: boolean;
};
export type ProjectFolders = { mainGallery: boolean; folders: ProjectFolder[] };
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
  if (root && settings.projectFolders?.[root]) return normalizeProjectFolders(root, settings.projectFolders[root]).folders.filter(f => f.access === "write").map(f => f.path);
  return settings.additionalDirectories.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
}
