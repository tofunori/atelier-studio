import { beforeEach, describe, expect, it } from "vitest";
import {
  loadGalleryFavorites,
  saveGalleryFavorites,
  toggleGalleryFavorite,
} from "./favorites.ts";

describe("gallery favorites", () => {
  beforeEach(() => localStorage.clear());

  it("persists and toggles opaque file ids", () => {
    saveGalleryFavorites(new Set(["f_b", "f_a"]));
    expect([...loadGalleryFavorites()]).toEqual(["f_a", "f_b"]);
    expect([...toggleGalleryFavorite(loadGalleryFavorites(), "f_a")]).toEqual(["f_b"]);
  });

  it("ignores malformed storage", () => {
    localStorage.setItem("atelier.gallery.favorites.v1", "not-json");
    expect(loadGalleryFavorites().size).toBe(0);
  });
});
