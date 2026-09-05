import { describe, expect, it } from "vitest";
import { normalizeProjectFolders, projectWritableDirectories } from "./projectFolders";
describe("project folder scopes", () => {
  it("separates projects and explicitly overrides legacy global roots", () => {
    const settings = { additionalDirectories: "/legacy", projectFolders: { "/a": { mainGallery: true, folders: [{ path: "/data", name: "Data", access: "read" as const, gallery: true }] } } };
    expect(projectWritableDirectories("/a", settings)).toEqual([]);
    expect(projectWritableDirectories("/b", settings)).toEqual(["/legacy"]);
  });
  it("keeps gallery visibility independent of writing", () => {
    const config = normalizeProjectFolders("/a", { folders: [{ path: "/data", name: "Data", access: "write", gallery: false }] });
    expect(projectWritableDirectories("/a", { additionalDirectories: "", projectFolders: { "/a": config } })).toEqual(["/data"]);
    expect(config.folders[0].gallery).toBe(false);
  });
  it("rejects the primary folder and duplicates without broadening access", () => {
    const folders = ["/a", "/b/", "/b", "relative"].map(path => ({ path, name: "", access: "read" as const, gallery: true }));
    expect(normalizeProjectFolders("/a", { folders }).folders).toEqual([{ path: "/b", name: "b", access: "read", gallery: true }]);
  });
});
