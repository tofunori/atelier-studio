export interface DocumentSnapshot {
  text: string;
  mtime: number;
}

export interface DocumentWriteResult {
  mtime?: number;
  error?: string;
}

export type DocumentApplyReason = "load" | "external-reload" | "draft";
/** « always » est un alias historique de « when-clean » : depuis l'audit du
 * 2026-10-18, un tampon modifié n'est JAMAIS remplacé par la version disque,
 * quelle que soit la politique (fusion quand elle est possible, conflit
 * signalé sinon). */
export type ExternalReloadPolicy = "always" | "when-clean";

export type DocumentSessionEvent =
  | {kind: "loaded"; snapshot: DocumentSnapshot}
  | {kind: "saved"; snapshot: DocumentSnapshot; previousText: string | null}
  | {kind: "external-reload"; snapshot: DocumentSnapshot; previousText: string}
  /** Version disque fusionnée sur un buffer sale : `previousText` = buffer
   * avant, `text` = buffer après (delta disque appliqué), `snapshot` = disque. */
  | {kind: "external-merge"; snapshot: DocumentSnapshot; previousText: string; text: string}
  /** `snapshot` : version disque qui a provoqué le conflit, quand elle a pu
   * être lue — l'éditeur la verse à l'historique, le tampon reste intact.
   * `previousText` : la base connue avant ce conflit. */
  | {kind: "conflict"; message: string; mtime?: number; snapshot?: DocumentSnapshot; previousText?: string | null}
  | {kind: "error"; message: string};

/** Brouillon de secours relu à l'ouverture (route `/draft`). */
export interface DocumentDraft {
  text: string;
  /** Version disque sur laquelle le brouillon a été tapé. */
  base: string | null;
  baseMtime: number | null;
  savedAt?: number | null;
}

/** none : rien à restaurer ; restored : brouillon remis tel quel ; merged :
 * brouillon fusionné avec une version disque plus récente ; conflict :
 * brouillon remis, mais le disque a changé sur le même passage — la
 * sauvegarde suivante signalera le conflit au lieu d'écraser. */
export type DraftOutcome = "none" | "restored" | "merged" | "conflict";

export interface DocumentSessionOptions {
  read(): Promise<DocumentSnapshot>;
  /** Sonde légère : mtime seul (route /statfile). Quand fournie, pollOnce ne
   * télécharge le texte complet que si le mtime a réellement bougé. */
  stat?: () => Promise<number | null>;
  write(text: string, mtime: number): Promise<DocumentWriteResult>;
  getText(): string;
  applyText(text: string, reason: DocumentApplyReason): void;
  onEvent?(event: DocumentSessionEvent): void;
  /** Appelé à chaque passage modifié ↔ enregistré (publication vers l'hôte,
   * brouillon de secours). */
  onDirtyChange?(dirty: boolean): void;
  externalReload?: ExternalReloadPolicy;
  /** Changement disque sur un tampon modifié : l'y fusionner (base =
   * dernière version disque connue, local = buffer, remote = disque). `null`
   * = chevauchement : le buffer reste, un événement `conflict` est émis une
   * fois par version disque. Sans `merge`, le changement disque attend que le
   * tampon soit propre. */
  merge?: (base: string, local: string, remote: string) => string | null;
  /** Sauvegarde refusée (409, fichier changé depuis la base) :
   * - « keep-local » : le tampon reste, le mtime connu avance — un second ⌘S
   *   assumé écrase la version disque (éditeur Markdown) ;
   * - « merge » : la version disque est relue et fusionnée avec le tampon
   *   puis la sauvegarde est rejouée ; si la fusion échoue, le tampon reste,
   *   la version disque devient la base (versée à l'historique par
   *   l'éditeur) et le conflit est signalé — jamais de remplacement. */
  conflictPolicy?: "keep-local" | "merge";
  mtimeEpsilon?: number;
}

export interface DocumentSessionState {
  dirty: boolean;
  mtime: number;
  baseline: string | null;
}

export const CONFLICT_KEPT_MESSAGE =
  "conflit : le fichier a changé sur le disque au même endroit — tes retouches sont gardées et la version du disque est dans l'historique ; ⌘S de nouveau pour garder ta version";

export interface DraftRestorePlan {
  outcome: DraftOutcome;
  /** Texte à remettre dans l'éditeur (comme tampon modifié). */
  text: string;
  /** Base et mtime connus après restauration : la version disque, sauf en
   * conflit où l'on garde la base du brouillon pour que la sauvegarde
   * suivante voie le conflit au lieu d'écraser. */
  base: string;
  baseMtime: number;
}

/** Décide comment remettre un brouillon de secours sur la version disque
 * fraîchement chargée. Pure : partagée par la session et par l'éditeur
 * Markdown riche (md_studio), qui n'a pas de session. */
export function planDraftRestore(
  draft: DocumentDraft | null | undefined,
  disk: DocumentSnapshot,
  merge?: (base: string, local: string, remote: string) => string | null,
  epsilon = 0.001,
): DraftRestorePlan {
  const none: DraftRestorePlan = {outcome: "none", text: disk.text, base: disk.text, baseMtime: disk.mtime};
  if (!draft || typeof draft.text !== "string" || draft.text === disk.text) return none;
  const baseMtime = Number(draft.baseMtime);
  const hasBase = typeof draft.base === "string";
  const sameBase = hasBase
    ? draft.base === disk.text
    : Number.isFinite(baseMtime) && Math.abs(baseMtime - disk.mtime) <= epsilon;
  if (sameBase) return {outcome: "restored", text: draft.text, base: disk.text, baseMtime: disk.mtime};
  if (hasBase && typeof merge === "function") {
    let merged: string | null = null;
    try { merged = merge(draft.base as string, draft.text, disk.text); } catch { merged = null; }
    if (typeof merged === "string") {
      return merged === disk.text ? none : {outcome: "merged", text: merged, base: disk.text, baseMtime: disk.mtime};
    }
  }
  // Le disque a changé sur le passage du brouillon : on remet le brouillon
  // sur SA base, pour que la sonde et la sauvegarde voient le conflit.
  return {
    outcome: "conflict",
    text: draft.text,
    base: hasBase ? draft.base as string : disk.text,
    baseMtime: Number.isFinite(baseMtime) ? baseMtime : disk.mtime,
  };
}

function validSnapshot(value: DocumentSnapshot): DocumentSnapshot {
  if (!value || typeof value.text !== "string" || !Number.isFinite(Number(value.mtime))) {
    throw new Error("Invalid document snapshot");
  }
  return {text: value.text, mtime: Number(value.mtime)};
}

export function createDocumentSession(options: DocumentSessionOptions) {
  const state: DocumentSessionState = {dirty: false, mtime: 0, baseline: null};
  const conflictPolicy = options.conflictPolicy || "keep-local";
  const epsilon = options.mtimeEpsilon ?? 0.001;
  let polling = false;
  let conflictReported: number | null = null;

  function setDirty(dirty: boolean): void {
    if (state.dirty === dirty) return;
    state.dirty = dirty;
    try { options.onDirtyChange?.(dirty); } catch { /* un observateur ne bloque jamais la session */ }
  }

  function apply(snapshot: DocumentSnapshot, reason: DocumentApplyReason): void {
    const previousText = state.baseline ?? options.getText();
    options.applyText(snapshot.text, reason);
    state.mtime = snapshot.mtime;
    state.baseline = snapshot.text;
    setDirty(false);
    if (reason === "load") options.onEvent?.({kind: "loaded", snapshot});
    else options.onEvent?.({kind: "external-reload", snapshot, previousText});
  }

  function safeMerge(base: string, local: string, remote: string): string | null {
    if (typeof options.merge !== "function") return null;
    try {
      const merged = options.merge(base, local, remote);
      return typeof merged === "string" ? merged : null;
    } catch {
      return null;
    }
  }

  async function load(): Promise<DocumentSnapshot> {
    try {
      const snapshot = validSnapshot(await options.read());
      apply(snapshot, "load");
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.onEvent?.({kind: "error", message});
      throw error;
    }
  }

  // 409 au ⌘S. Le tampon est le travail de l'utilisateur : il n'est jamais
  // remplacé par la version disque (perte vécue le 2026-09-11, audit du
  // 2026-10-18 problème 4).
  async function resolveConflict(result: DocumentWriteResult, retry: boolean): Promise<boolean> {
    const conflictMtime = Number(result.mtime);
    if (conflictPolicy !== "merge") {
      if (Number.isFinite(conflictMtime)) state.mtime = conflictMtime;
      options.onEvent?.({kind: "conflict", message: String(result.error), mtime: result.mtime});
      return false;
    }
    let snapshot: DocumentSnapshot | null = null;
    try { snapshot = validSnapshot(await options.read()); } catch { snapshot = null; }
    if (!snapshot) {
      // Disque illisible : rien ne bouge, la garde de la sauvegarde reste armée.
      options.onEvent?.({kind: "conflict", message: CONFLICT_KEPT_MESSAGE, mtime: result.mtime});
      return false;
    }
    const local = options.getText();
    if (snapshot.text === local) {
      // Le disque porte déjà exactement ce tampon : rien à écrire.
      const previousText = state.baseline;
      state.mtime = snapshot.mtime;
      state.baseline = snapshot.text;
      setDirty(false);
      options.onEvent?.({kind: "saved", snapshot, previousText});
      return true;
    }
    const merged = retry ? safeMerge(state.baseline ?? "", local, snapshot.text) : null;
    if (merged !== null) {
      options.applyText(merged, "external-reload");
      state.mtime = snapshot.mtime;
      state.baseline = snapshot.text;
      setDirty(merged !== snapshot.text);
      conflictReported = null;
      options.onEvent?.({kind: "external-merge", snapshot, previousText: local, text: merged});
      if (merged === snapshot.text) return true;
      return save(false);
    }
    const previousText = state.baseline;
    state.mtime = snapshot.mtime;
    state.baseline = snapshot.text;
    conflictReported = snapshot.mtime;
    options.onEvent?.({kind: "conflict", message: CONFLICT_KEPT_MESSAGE, mtime: snapshot.mtime, snapshot, previousText});
    return false;
  }

  async function save(retry = true): Promise<boolean> {
    const text = options.getText();
    const previousText = state.baseline;
    try {
      const result = await options.write(text, state.mtime);
      if (result.error === "conflit") return await resolveConflict(result, retry);
      if (result.error) {
        options.onEvent?.({kind: "error", message: result.error});
        return false;
      }
      if (!Number.isFinite(Number(result.mtime))) throw new Error("Invalid save response");
      const snapshot = {text, mtime: Number(result.mtime)};
      state.mtime = snapshot.mtime;
      state.baseline = text;
      // Le tampon a pu bouger pendant l'écriture : il reste alors modifié.
      setDirty(options.getText() !== text);
      conflictReported = null;
      options.onEvent?.({kind: "saved", snapshot, previousText});
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.onEvent?.({kind: "error", message});
      return false;
    }
  }

  function mergeExternal(snapshot: DocumentSnapshot): boolean {
    const local = options.getText();
    const merged = safeMerge(state.baseline ?? "", local, snapshot.text);
    if (merged === null) {
      if (conflictReported !== snapshot.mtime) {
        conflictReported = snapshot.mtime;
        options.onEvent?.({kind: "conflict", message: "modifié sur le disque : fusion impossible avec tes retouches", mtime: snapshot.mtime, snapshot, previousText: state.baseline});
      }
      return false;
    }
    conflictReported = null;
    options.applyText(merged, "external-reload");
    state.mtime = snapshot.mtime;
    state.baseline = snapshot.text;
    setDirty(merged !== snapshot.text);
    options.onEvent?.({kind: "external-merge", snapshot, previousText: local, text: merged});
    return true;
  }

  async function pollOnce(): Promise<boolean> {
    const mergeable = typeof options.merge === "function";
    // Tampon modifié sans fusion possible : le disque attend (jamais de
    // remplacement), la sauvegarde verra le conflit.
    if (polling || (state.dirty && !mergeable)) return false;
    if (options.stat) {
      const mtime = await options.stat().catch(() => null);
      // sonde en échec : ne rien conclure, retenter au prochain tick
      if (mtime == null) return false;
      if (Math.abs(mtime - state.mtime) <= epsilon) return false;
    }
    polling = true;
    try {
      const snapshot = validSnapshot(await options.read());
      if (!snapshot.mtime || Math.abs(snapshot.mtime - state.mtime) <= epsilon) return false;
      if (snapshot.text === state.baseline && options.getText() === snapshot.text) {
        state.mtime = snapshot.mtime;
        setDirty(false);
        return false;
      }
      // Le buffer a pu se salir pendant la lecture : refaire le test ici.
      if (state.dirty) return mergeable ? mergeExternal(snapshot) : false;
      apply(snapshot, "external-reload");
      return true;
    } catch {
      return false;
    } finally {
      polling = false;
    }
  }

  /** Brouillon de secours relu après le chargement : le texte revient comme
   * tampon MODIFIÉ, jamais écrit dans le fichier. À appeler juste après
   * `load()`. */
  function adoptDraft(draft: DocumentDraft | null | undefined): DraftOutcome {
    if (state.baseline === null) return "none";
    const plan = planDraftRestore(draft, {text: state.baseline, mtime: state.mtime}, options.merge, epsilon);
    if (plan.outcome === "none") return "none";
    options.applyText(plan.text, "draft");
    state.baseline = plan.base;
    state.mtime = plan.baseMtime;
    setDirty(true);
    return plan.outcome;
  }

  return {
    state,
    load,
    save: (): Promise<boolean> => save(true),
    pollOnce,
    adoptDraft,
    acceptSaved(snapshotValue: DocumentSnapshot, applyText = false): DocumentSnapshot {
      const snapshot = validSnapshot(snapshotValue);
      if (applyText) options.applyText(snapshot.text, "load");
      state.mtime = snapshot.mtime;
      state.baseline = snapshot.text;
      setDirty(false);
      return snapshot;
    },
    markDirty(): void { setDirty(true); },
    markClean(text = options.getText()): void {
      state.baseline = text;
      setDirty(false);
    },
  };
}

export type DocumentSession = ReturnType<typeof createDocumentSession>;
