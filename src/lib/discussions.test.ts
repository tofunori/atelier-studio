import { describe, it, expect } from "vitest";
import { discussionMarkdownFile, discussionWorkspaceId, isDiscussionRoot, isFreeDiscussionThread, isLegacyDiscussionThread } from "./discussions";
import { deriveProjectNavigatorModel } from "../components/sidebar/projectNavigatorModel";
import { makeThread } from "../test/fixtures";
const root = "/Users/test/Library/Application Support/atelier-studio/discussions/12345678-1234-4321-abcd-123456789012";
const other = root.replace("12345678", "87654321");
describe("Discussions", () => {
  it("recognizes only reserved workspace roots", () => {
    expect(isDiscussionRoot(root)).toBe(true);
    for (const path of ["/tmp/discussions", root + "/nested", root + "/../escape", "/Users/test/Documents/discussions/12345678", "", null]) {
      expect(isDiscussionRoot(path)).toBe(false);
    }
  });
  it("extracts only the managed workspace UUID", () => {
    expect(discussionWorkspaceId(root)).toBe("12345678-1234-4321-abcd-123456789012");
    expect(discussionWorkspaceId("/Users/test/Library/Application Support/atelier-studio/discussions/not-an-id")).toBeNull();
    expect(discussionWorkspaceId(`${root}/nested`)).toBeNull();
  });
  it("keeps legacy free threads separate from linked children", () => {
    const legacy = { projectRoot: "", title: "legacy" };
    const managed = { projectRoot: root, title: "managed" };
    const linked = { projectRoot: "", agentLink: { parentThreadId: "p" } };
    expect(isLegacyDiscussionThread(legacy)).toBe(true);
    expect(isFreeDiscussionThread(legacy)).toBe(true);
    expect(isLegacyDiscussionThread(managed)).toBe(false);
    expect(isFreeDiscussionThread(managed)).toBe(true);
    expect(isLegacyDiscussionThread(linked)).toBe(false);
    expect(isFreeDiscussionThread(linked)).toBe(false);
  });
  it("chooses a stable draft without promoting hidden or README artifacts", () => {
    expect(discussionMarkdownFile(["README.md", ".hidden.md", "notes.md", "brouillon-2.md", "brouillon.md"])).toBe("brouillon.md");
    expect(discussionMarkdownFile(["README.md", "notes.md"])).toBe("notes.md");
    expect(discussionMarkdownFile([".atelier/notes.md", "notes.txt"])).toBeNull();
  });
  it("groups independent workspaces and legacy free chats, excluding projects", () => {
    const threads = [makeThread({ id: "one", projectRoot: root }), makeThread({ id: "two", projectRoot: other }),
      makeThread({ id: "legacy", projectRoot: "" }), makeThread({ id: "project", projectRoot: "/science" })];
    for (const activeProject of [null, root, other]) {
      const model = deriveProjectNavigatorModel({ activeProject, activeId: null, threads, favorites: [], threadOrder: "recent", query: "", expanded: true });
      expect(model.mode).toBe("unscoped");
      expect(model.identity).toBeNull();
      expect(model.visibleThreadIds.sort()).toEqual(["legacy", "one", "two"]);
    }
    const project = deriveProjectNavigatorModel({ activeProject: "/science", activeId: null, threads, favorites: [], threadOrder: "recent", query: "", expanded: true });
    expect(project.visibleThreadIds).toEqual(["project"]);
  });
});
