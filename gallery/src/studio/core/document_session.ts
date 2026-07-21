export interface DocumentSnapshot {
  text: string;
  mtime: number;
}

export interface DocumentWriteResult {
  mtime?: number;
  error?: string;
}

export type DocumentApplyReason = "load" | "external-reload";
export type ExternalReloadPolicy = "always" | "when-clean";

export type DocumentSessionEvent =
  | {kind: "loaded"; snapshot: DocumentSnapshot}
  | {kind: "saved"; snapshot: DocumentSnapshot; previousText: string | null}
  | {kind: "external-reload"; snapshot: DocumentSnapshot; previousText: string}
  | {kind: "conflict"; message: string; mtime?: number}
  | {kind: "error"; message: string};

export interface DocumentSessionOptions {
  read(): Promise<DocumentSnapshot>;
  write(text: string, mtime: number): Promise<DocumentWriteResult>;
  getText(): string;
  applyText(text: string, reason: DocumentApplyReason): void;
  onEvent?(event: DocumentSessionEvent): void;
  externalReload?: ExternalReloadPolicy;
  conflictPolicy?: "keep-local" | "reload";
  mtimeEpsilon?: number;
}

export interface DocumentSessionState {
  dirty: boolean;
  mtime: number;
  baseline: string | null;
}

function validSnapshot(value: DocumentSnapshot): DocumentSnapshot {
  if (!value || typeof value.text !== "string" || !Number.isFinite(Number(value.mtime))) {
    throw new Error("Invalid document snapshot");
  }
  return {text: value.text, mtime: Number(value.mtime)};
}

export function createDocumentSession(options: DocumentSessionOptions) {
  const state: DocumentSessionState = {dirty: false, mtime: 0, baseline: null};
  const externalReload = options.externalReload || "when-clean";
  const conflictPolicy = options.conflictPolicy || "keep-local";
  const epsilon = options.mtimeEpsilon ?? 0.001;
  let polling = false;

  function apply(snapshot: DocumentSnapshot, reason: DocumentApplyReason): void {
    const previousText = state.baseline ?? options.getText();
    options.applyText(snapshot.text, reason);
    state.mtime = snapshot.mtime;
    state.baseline = snapshot.text;
    state.dirty = false;
    if (reason === "load") options.onEvent?.({kind: "loaded", snapshot});
    else options.onEvent?.({kind: "external-reload", snapshot, previousText});
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

  async function save(): Promise<boolean> {
    const text = options.getText();
    const previousText = state.baseline;
    try {
      const result = await options.write(text, state.mtime);
      if (result.error === "conflit") {
        if (Number.isFinite(Number(result.mtime))) state.mtime = Number(result.mtime);
        if (conflictPolicy === "reload") {
          try {
            apply(validSnapshot(await options.read()), "external-reload");
          } catch {
            options.onEvent?.({kind: "conflict", message: result.error, mtime: result.mtime});
          }
          return false;
        }
        options.onEvent?.({kind: "conflict", message: result.error, mtime: result.mtime});
        return false;
      }
      if (result.error) {
        options.onEvent?.({kind: "error", message: result.error});
        return false;
      }
      if (!Number.isFinite(Number(result.mtime))) throw new Error("Invalid save response");
      const snapshot = {text, mtime: Number(result.mtime)};
      state.mtime = snapshot.mtime;
      state.baseline = text;
      state.dirty = false;
      options.onEvent?.({kind: "saved", snapshot, previousText});
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.onEvent?.({kind: "error", message});
      return false;
    }
  }

  async function pollOnce(): Promise<boolean> {
    if (polling || (externalReload === "when-clean" && state.dirty)) return false;
    polling = true;
    try {
      const snapshot = validSnapshot(await options.read());
      if (!snapshot.mtime || Math.abs(snapshot.mtime - state.mtime) <= epsilon) return false;
      if (snapshot.text === state.baseline && options.getText() === snapshot.text) {
        state.mtime = snapshot.mtime;
        state.dirty = false;
        return false;
      }
      apply(snapshot, "external-reload");
      return true;
    } catch {
      return false;
    } finally {
      polling = false;
    }
  }

  return {
    state,
    load,
    save,
    pollOnce,
    acceptSaved(snapshotValue: DocumentSnapshot, applyText = false): DocumentSnapshot {
      const snapshot = validSnapshot(snapshotValue);
      if (applyText) options.applyText(snapshot.text, "load");
      state.mtime = snapshot.mtime;
      state.baseline = snapshot.text;
      state.dirty = false;
      return snapshot;
    },
    markDirty(): void { state.dirty = true; },
    markClean(text = options.getText()): void {
      state.dirty = false;
      state.baseline = text;
    },
  };
}
