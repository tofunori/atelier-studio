import { describe, expect, it } from "vitest";
import { normalizeProjectFolders, projectWritableDirectories, resolveAssociatedFile } from "./projectFolders";
describe("project folder scopes", () => {
  it("routes read-only associated documents even when hidden from the gallery", () => {
    const config = { mainGallery: true, folders: [{ path: "/chapter2", name: "Chapter 2", access: "read" as const, gallery: false }] };
    expect(resolveAssociatedFile("/chapter1", config, "/chapter2/pipeline/README.md")).toEqual({ root: "/chapter2", rel: "pipeline/README.md" });
    expect(resolveAssociatedFile("/chapter1", config, "/chapter2-other/README.md")).toBeNull();
    expect(resolveAssociatedFile("/chapter1", config, "/chapter2/../private/README.md")).toBeNull();
    expect(resolveAssociatedFile("/chapter1", config, "pipeline/README.md")).toBeNull();
  });
  it("normalizes associated folder separators, including the filesystem root", () => {
    const folder = { path: "/chapter2/", name: "Two", access: "read" as const, gallery: true };
    expect(resolveAssociatedFile("/chapter1", { mainGallery: true, folders: [folder] }, "/chapter2/file.md")).toEqual({ root: "/chapter2", rel: "file.md" });
    expect(resolveAssociatedFile("/chapter1", { mainGallery: true, folders: [{ ...folder, path: "/" }] }, "/other/file.md")).toEqual({ root: "/", rel: "other/file.md" });
  });
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
