// Erreurs JavaScript non rattrapées (audit du 2026-10-18, problème 14).
//
// Avant le premier rendu, une erreur veut dire que l'app n'a pas pu
// démarrer : l'écran fatal reste la seule réponse honnête. Après, une
// promesse rejetée quelque part (copie refusée par WebKit, requête perdue…)
// ne doit plus vider la fenêtre et ses éditeurs : elle est journalisée et
// signalée discrètement, une fois par message et par fenêtre de temps.

export interface RuntimeErrorGuardOptions {
  renderFatal(error: unknown): void;
  report(message: string): void;
  log?(message: string, error: unknown): void;
  now?(): number;
  /** Un même message n'est signalé qu'une fois par fenêtre (ms). */
  quietMs?: number;
}

export interface RuntimeErrorGuard {
  /** Premier rendu commité : les erreurs suivantes ne sont plus fatales. */
  markBooted(): void;
  readonly booted: boolean;
  handle(error: unknown): void;
}

export function describeRuntimeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    const text = JSON.stringify(error);
    return text && text !== "{}" ? text : String(error);
  } catch {
    return String(error);
  }
}

export function createRuntimeErrorGuard(options: RuntimeErrorGuardOptions): RuntimeErrorGuard {
  const now = options.now ?? (() => Date.now());
  const quietMs = options.quietMs ?? 10_000;
  const log = options.log ?? ((message, error) => console.error(message, error));
  let booted = false;
  const lastShown = new Map<string, number>();
  return {
    markBooted() { booted = true; },
    get booted() { return booted; },
    handle(error: unknown) {
      if (!booted) {
        options.renderFatal(error);
        return;
      }
      log("Atelier: erreur après le démarrage (interface conservée) :", error);
      const message = describeRuntimeError(error);
      const at = now();
      const previous = lastShown.get(message);
      if (previous != null && at - previous < quietMs) return;
      lastShown.set(message, at);
      try { options.report(message); } catch { /* le signalement ne doit jamais relancer */ }
    },
  };
}

/** Signal navigateur bénin des listes virtualisées : ni exception ni échec. */
export function isBenignResizeObserverError(event: Pick<ErrorEvent, "error" | "message">): boolean {
  return event.error == null && (
    event.message === "ResizeObserver loop limit exceeded"
    || event.message === "ResizeObserver loop completed with undelivered notifications."
  );
}
