import type {DocumentDraft, DraftOutcome} from "./document_session";

/** Brouillon de secours d'un éditeur (LaTeX, Markdown, code).
 *
 * Le tampon non enregistré vit dans l'iframe : la démonter (onglet fermé,
 * changement de projet, vue chat seule, sortie de l'app, relance) le
 * détruisait sans avertir (audit du 2026-10-18, problème 1). Le gardien :
 * - écrit le tampon modifié sur le serveur galerie (`POST /draft`) au plus
 *   une fois par `delayMs` pendant la frappe, puis tente une dernière
 *   écriture au `pagehide` ;
 * - l'efface dès que le tampon redevient propre (enregistré, rechargé) ;
 * - publie l'état « modifié » à l'app hôte (`atelier-dirty`), qui demande
 *   confirmation avant de fermer l'onglet ou de quitter ;
 * - obéit à `atelier-discard-draft` (« Fermer sans enregistrer ») et répond
 *   `atelier-draft-discarded` ; à `atelier-flush-draft` (rechargement de
 *   l'iframe, sortie de l'app) et répond `atelier-draft-flushed`.
 *
 * Le brouillon vit côté serveur : le localStorage de la WebView ne survit pas
 * au redémarrage de l'app (docs/PIEGES_CONNUS.md §1). Il n'est JAMAIS écrit
 * dans le fichier : à la réouverture, il revient comme tampon modifié. */
export interface DraftKeeperOptions {
  path: string | null;
  getText(): string;
  /** Version disque sur laquelle le tampon est tapé. */
  getBase(): {text: string | null; mtime: number};
  isDirty(): boolean;
  postToHost?(payload: Record<string, unknown>): void;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  window?: Window;
  delayMs?: number;
}

export interface DraftRestoreResult {
  outcome: DraftOutcome;
  /** Secondes depuis l'époque Unix (heure d'écriture du brouillon). */
  savedAt: number | null;
}

export interface DraftKeeper {
  /** Le tampon vient de changer : brouillon écrit au plus tard dans `delayMs`. */
  noteChange(): void;
  /** Transition modifié ↔ enregistré : publiée à l'hôte, brouillon effacé au retour au propre. */
  setDirty(dirty: boolean): void;
  /** Relit le brouillon du serveur et le confie à `adopt` (la session). */
  restore(adopt: (draft: DocumentDraft | null) => DraftOutcome): Promise<DraftRestoreResult>;
  /** Écrit tout de suite (sortie de page). */
  flush(): Promise<void>;
  /** Abandon assumé : efface le brouillon et n'en écrit plus. */
  discard(): Promise<void>;
  /** Republie l'état courant à l'hôte. */
  announce(): void;
}

/** Au-delà, `fetch(..., {keepalive:true})` est refusé par les navigateurs. */
const KEEPALIVE_LIMIT = 60_000;

export function formatDraftTime(savedAt: number | null, locale?: string): string {
  if (!savedAt || !Number.isFinite(savedAt)) return "";
  try {
    return new Date(savedAt * 1000).toLocaleString(locale, {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"});
  } catch {
    return "";
  }
}

export function createDraftKeeper(options: DraftKeeperOptions): DraftKeeper {
  const win = options.window || window;
  const fetchImpl = options.fetchImpl || ((input: string, init?: RequestInit) => win.fetch(input, init));
  const delayMs = options.delayMs ?? 1000;
  const path = options.path;
  let timer: number | null = null;
  // Un brouillon peut exister côté serveur (écrit ici ou restauré) : à effacer
  // quand le tampon redevient propre.
  let mayExist = false;
  let discarded = false;
  let lastPublished: boolean | null = null;
  // Les écritures et effacements partent dans l'ordre : un effacement ne doit
  // jamais doubler une écriture encore en vol.
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = (task: () => Promise<unknown>): Promise<void> => {
    const next = queue.then(task, task).catch(() => undefined);
    queue = next;
    return next.then(() => undefined);
  };

  const payload = (): string => {
    const base = options.getBase();
    return JSON.stringify({path, text: options.getText(), base: base.text, baseMtime: base.mtime});
  };

  const write = (): Promise<void> => enqueue(async () => {
    if (!path || discarded || !options.isDirty()) return;
    const response = await fetchImpl("/draft", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: payload(),
    });
    if (response.ok) mayExist = true;
  });

  const clear = (): Promise<void> => enqueue(async () => {
    if (!path) return;
    const response = await fetchImpl("/draft", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({path, clear: true}),
    });
    if (response.ok) mayExist = false;
  });

  const cancelTimer = (): void => {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
  };

  const publish = (dirty: boolean): void => {
    if (!path || lastPublished === dirty) return;
    lastPublished = dirty;
    try { options.postToHost?.({type: "atelier-dirty", dirty, path}); } catch { /* hôte absent (page autonome) */ }
  };

  const keeper: DraftKeeper = {
    noteChange(): void {
      if (!path || discarded || timer !== null) return;
      timer = win.setTimeout(() => {
        timer = null;
        void write();
      }, delayMs);
    },
    setDirty(dirty: boolean): void {
      publish(dirty);
      if (dirty) {
        // Une nouvelle frappe après « Fermer sans enregistrer » (onglet
        // finalement gardé) rouvre le filet.
        discarded = false;
        keeper.noteChange();
        return;
      }
      cancelTimer();
      if (mayExist) void clear();
    },
    async restore(adopt): Promise<DraftRestoreResult> {
      let draft: DocumentDraft | null = null;
      if (path) {
        try {
          const response = await fetchImpl(`/draft?path=${encodeURIComponent(path)}`);
          const result = await response.json() as {draft?: DocumentDraft | null};
          draft = response.ok && result?.draft && typeof result.draft.text === "string" ? result.draft : null;
        } catch {
          draft = null;
        }
      }
      const outcome = adopt(draft);
      if (draft) mayExist = true;
      if (outcome === "none" && draft) void clear();
      publish(options.isDirty());
      return {outcome, savedAt: draft && Number.isFinite(Number(draft.savedAt)) ? Number(draft.savedAt) : null};
    },
    async flush(): Promise<void> {
      cancelTimer();
      await write();
    },
    async discard(): Promise<void> {
      discarded = true;
      cancelTimer();
      await clear();
    },
    announce(): void {
      lastPublished = null;
      publish(options.isDirty());
    },
  };

  // Dernière chance quand l'iframe est démontée ou la page quittée.
  win.addEventListener("pagehide", () => {
    if (!path || discarded || !options.isDirty()) return;
    cancelTimer();
    const body = payload();
    try {
      void fetchImpl("/draft", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body,
        keepalive: body.length < KEEPALIVE_LIMIT,
      }).catch(() => undefined);
    } catch { /* la page part : rien d'autre à faire */ }
  });
  // Page ouverte seule dans un navigateur : l'invite native du navigateur.
  win.addEventListener("beforeunload", (event) => {
    if (win.self !== win.top || discarded || !options.isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  // Demandes de l'app hôte (seulement de la fenêtre parente) :
  // - `atelier-discard-draft` : « Fermer sans enregistrer » ;
  // - `atelier-flush-draft` : l'iframe va être rechargée ou l'app quittée,
  //   le brouillon doit être sur le serveur AVANT (pas de course avec la page
  //   suivante qui le relit).
  win.addEventListener("message", (event) => {
    if (event.source !== win.parent || win.parent === win) return;
    const data = event.data as {type?: string} | null;
    const reply = (type: string): void => {
      try { options.postToHost?.({type, path}); } catch { /* hôte parti */ }
    };
    if (data?.type === "atelier-discard-draft") void keeper.discard().then(() => reply("atelier-draft-discarded"));
    else if (data?.type === "atelier-flush-draft") void keeper.flush().then(() => reply("atelier-draft-flushed"));
  });
  return keeper;
}
