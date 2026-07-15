const STORAGE_KEY = "atelier.gallery.favorites.v1";

export function loadGalleryFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const values = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveGalleryFavorites(favorites: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites].sort()));
  } catch {
    // Favorites remain available for the current session when storage is unavailable.
  }
}

export function toggleGalleryFavorite(favorites: Set<string>, fileId: string): Set<string> {
  const next = new Set(favorites);
  if (next.has(fileId)) next.delete(fileId);
  else next.add(fileId);
  saveGalleryFavorites(next);
  return next;
}
