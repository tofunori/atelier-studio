// L'état d'un widget survit au démontage par virtualisation, pas au
// redémarrage de l'app : une Map mémoire, jamais le disque. On n'écrit pas
// sur disque de l'état produit par un LLM.
export const WIDGET_STATE_MAX_BYTES = 4096;
const MAX_ENTRIES = 64;

const states = new Map<string, unknown>();

export function rememberWidgetState(id: string, state: unknown): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(state) ?? "";
  } catch {
    return false;
  }
  if (serialized.length > WIDGET_STATE_MAX_BYTES) return false;
  states.delete(id); // réinsertion = plus récent (LRU d'insertion)
  states.set(id, state);
  if (states.size > MAX_ENTRIES) {
    const oldest = states.keys().next();
    if (!oldest.done) states.delete(oldest.value);
  }
  return true;
}

export function recallWidgetState(id: string): unknown | undefined {
  return states.get(id);
}

export function clearWidgetStates(): void {
  states.clear();
}
