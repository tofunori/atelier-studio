// Revue un par un des commentaires d'un relecteur dans le chat (Thierry
// 2026-11-12, maquette « chat-un-par-un ») : l'éditeur LaTeX envoie un
// commentaire de Christophe au chat ; la barre au-dessus du compositeur dit
// Réglé / À voir avec lui / Suivant et renvoie le geste à l'éditeur, qui
// répond par le commentaire suivant. Petit magasin hors React : App écrit,
// la barre (chargée à la demande) lit.
import { useSyncExternalStore } from "react";

/** Ce qu'un commentaire envoyé au chat porte pour sa carte et sa barre. */
export type ChatReviewRef = {
  author: string;
  n: number;
  total: number;
  line?: number;
  comment: string;
  quote?: string;
  now?: string;
  likely?: string;
};

export type ReviewSession = {
  threadId: string;
  /** Fenêtre de l'éditeur qui a envoyé le commentaire, et son origine. */
  source: Window;
  origin: string;
  nonce: string;
  mode: "open" | "likely";
  /** Commentaire en cours ; null quand il n'en reste plus. */
  current: (ChatReviewRef & { path: string; id: string }) | null;
  pending: boolean;
  error?: string;
};

let session: ReviewSession | null = null;
const listeners = new Set<() => void>();

export function setReviewSession(next: ReviewSession | null | ((current: ReviewSession | null) => ReviewSession | null)): void {
  session = typeof next === "function" ? next(session) : next;
  listeners.forEach((listener) => listener());
}

export function useReviewSession(): ReviewSession | null {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => session,
  );
}
