export const PROJECTS_KEY = "atelier-studio.projects";
export const DISCUSSION_WORKSPACE_IDS_KEY = "atelier-studio.discussion-workspace-ids";

export function loadProjects(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function loadDiscussionWorkspaceIds(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISCUSSION_WORKSPACE_IDS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// nom court d'un projet à partir de son chemin absolu — même convention que
// projInitial (Rail.tsx) : dernier segment du chemin
export function projectDisplayName(root: string): string {
  return root.split("/").filter(Boolean).pop() ?? "";
}
