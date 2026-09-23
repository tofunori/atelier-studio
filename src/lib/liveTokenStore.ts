// Compteur de jetons du tour en cours (heartbeat provider, un tous les ~24
// jetons). En état React d'App, chaque heartbeat redessinait toute
// l'application (barre latérale, atelier, barre du haut) ; ici seul le chat
// abonné au fil actif se met à jour.

type Listener = () => void;

export type LiveTokenStore = {
  get(threadId: string | null): number | null;
  set(threadId: string, tokens: number | null): void;
  subscribe(listener: Listener): () => void;
};

export function createLiveTokenStore(): LiveTokenStore {
  const tokens = new Map<string, number>();
  const listeners = new Set<Listener>();
  return {
    get: (threadId) => (threadId ? tokens.get(threadId) ?? null : null),
    set(threadId, value) {
      if ((tokens.get(threadId) ?? null) === value) return;
      if (value == null) tokens.delete(threadId);
      else tokens.set(threadId, value);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
