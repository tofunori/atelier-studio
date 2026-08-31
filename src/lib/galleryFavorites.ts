// Favoris de la galerie vus depuis l'APP (barre d'onglet d'un document
// ouvert). La vérité vit dans `.fig_state.json` du projet, tenue par le
// serveur galerie : l'app lit `GET /state` et bascule par `POST /favorite`.
//
// Pourquoi une route dédiée plutôt que `POST /state` : ce dernier RECONSTRUIT
// l'état à partir du corps reçu. Un client qui ne connaît que les favoris
// effacerait notes, tags et collections en marquant une figure.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function base(origin: string): string {
  return origin.replace(/\/$/, "");
}

/** Favoris du projet, ensemble vide si le serveur ne répond pas. */
export async function loadGalleryFavorites(
  origin: string,
  fetchImpl: FetchLike = fetch,
): Promise<Set<string>> {
  if (!origin) return new Set();
  try {
    const response = await fetchImpl(`${base(origin)}/state`);
    if (!response.ok) return new Set();
    const state = await response.json();
    const favs = Array.isArray(state?.favs) ? state.favs : [];
    return new Set(favs.filter((rel: unknown): rel is string => typeof rel === "string"));
  } catch {
    return new Set();
  }
}

/**
 * Pose ou retire un favori. `on` est TOUJOURS explicite : deux clics rapides
 * sur l'étoile ne doivent pas dépendre de l'ordre d'arrivée des réponses.
 * Retourne l'état retenu par le serveur, ou null si l'appel a échoué — dans
 * ce cas l'appelant remet son étoile comme elle était.
 */
export async function setGalleryFavorite(
  origin: string,
  rel: string,
  on: boolean,
  fetchImpl: FetchLike = fetch,
): Promise<boolean | null> {
  if (!origin || !rel) return null;
  try {
    const response = await fetchImpl(`${base(origin)}/favorite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rel, on }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return typeof result?.fav === "boolean" ? result.fav : null;
  } catch {
    return null;
  }
}
