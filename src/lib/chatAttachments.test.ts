import { describe, expect, it } from "vitest";
import { localImagePathsForAttachments } from "./chatAttachments";
import type { DraftAttachment } from "./chatDraftStore";

function attachment(path: string): DraftAttachment {
  return { name: path.split("/").pop() ?? path, lines: null, text: path, path, kind: "file" };
}

describe("localImagePathsForAttachments", () => {
  it("n'envoie jamais les fichiers texte, PDF ou SVG comme images", () => {
    expect(localImagePathsForAttachments([
      attachment("conferences/agu2026/abstract_agu26.tex"),
      attachment("docs/methods.md"),
      attachment("papers/article.pdf"),
      attachment("figures/vector.svg"),
    ], "/repo/albedo")).toEqual([]);
  });

  it("resout les vraies images relatives depuis la racine projet", () => {
    expect(localImagePathsForAttachments([
      attachment("figures/albedo.PNG"),
      attachment("./figures/photo.jpg"),
    ], "/repo/albedo/")).toEqual([
      "/repo/albedo/figures/albedo.PNG",
      "/repo/albedo/figures/photo.jpg",
    ]);
  });

  it("conserve les chemins absolus et deduplique les images", () => {
    expect(localImagePathsForAttachments([
      attachment("/tmp/plot.webp"),
      attachment("/tmp/plot.webp"),
    ], "/repo/albedo")).toEqual(["/tmp/plot.webp"]);
  });
});
