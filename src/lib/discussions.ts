/** Managed workspaces use the existing projectRoot transport, but never belong
 * to the user's project list. Match the complete reserved path, not a basename. */
const DISCUSSION_ROOT_RE = /^\/.*\/Library\/Application Support\/atelier-studio\/discussions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function discussionWorkspaceId(root: string | null | undefined): string | null {
  if (typeof root !== "string") return null;
  return DISCUSSION_ROOT_RE.exec(root)?.[1] ?? null;
}

export function isDiscussionRoot(root: string | null | undefined): boolean {
  return discussionWorkspaceId(root) !== null;
}

export function isDiscussionContext(root: string | null | undefined): boolean {
  return !root || isDiscussionRoot(root);
}

/** A legacy free chat predates managed workspaces and has no project root.
 * Linked child threads remain in their parent's project scope and must never
 * be silently moved into a private discussion workspace. */
export function isLegacyDiscussionThread(thread: {
  projectRoot?: string | null;
  agentLink?: unknown;
} | null | undefined): boolean {
  return Boolean(thread && !thread.projectRoot && !thread.agentLink);
}

export function isFreeDiscussionThread(thread: {
  projectRoot?: string | null;
  agentLink?: unknown;
} | null | undefined): boolean {
  return Boolean(thread && !thread.agentLink && isDiscussionContext(thread.projectRoot));
}

/** Pick a stable user Markdown file for a managed discussion. The dedicated
 * brouillon is preferred; other files are considered only when they are
 * clearly Markdown documents, with a deterministic lexical order. README and
 * hidden/derived files are left to the regular file browser. */
export function discussionMarkdownFile(files: readonly string[]): string | null {
  const markdown = [...new Set(files)]
    .filter((file) => {
      const parts = file.split("/");
      return parts.length > 0 && parts.every((part) => part.length > 0 && !part.startsWith("."))
        && /\.md$/i.test(file)
        && !/^readme(?:[-_.].*)?\.md$/i.test(parts[parts.length - 1]);
    })
    .sort((a, b) => {
      const aDraft = /(^|\/)brouillon(?:-\d+)?\.md$/i.test(a);
      const bDraft = /(^|\/)brouillon(?:-\d+)?\.md$/i.test(b);
      if (aDraft !== bDraft) return aDraft ? -1 : 1;
      const aCanonical = /(^|\/)brouillon\.md$/i.test(a);
      const bCanonical = /(^|\/)brouillon\.md$/i.test(b);
      if (aCanonical !== bCanonical) return aCanonical ? -1 : 1;
      return a.localeCompare(b);
    });
  return markdown[0] ?? null;
}
