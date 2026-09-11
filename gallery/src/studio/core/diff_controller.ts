import type {StudioEditor} from "./editor_contract";

export interface StudioDiffJournal {
  push(before: string, after: string, metadata?: Record<string, unknown>): unknown;
  isShown(): boolean;
  isBusy(): boolean;
}

export interface StudioDiffFactoryOptions {
  individualReview?: boolean;
  getCm(): StudioEditor | null;
  path: string | null;
  notify(message: string): void;
  els: {
    group: HTMLElement | null;
    tag: HTMLElement | null;
    prev: HTMLElement | null;
    next: HTMLElement | null;
    restore: HTMLElement | null;
  };
  restoreText(text: string): Promise<boolean>;
  /** Marques du diff en termes de source, pour les vues sans éditeur. */
  onMarks?(marks: ReadonlyArray<{kind: string; line: number; text: string}>): void;
  /** Navigation entre changements (⌥↓/⌥↑) — true = la vue visible a pris le
   *  changement en charge, l'éditeur masqué ne défile pas. */
  onNavigate?(line: number, index: number, total: number): boolean;
}

export interface StudioDiffControllerOptions {
  individualReview?: boolean;
  factory(options: StudioDiffFactoryOptions): StudioDiffJournal;
  getEditor(): StudioEditor | null;
  path: string | null;
  notify(message: string): void;
  restoreText(text: string): Promise<boolean>;
  onMarks?(marks: ReadonlyArray<{kind: string; line: number; text: string}>): void;
  onNavigate?(line: number, index: number, total: number): boolean;
  enableSelectionQuote?: boolean;
  hideEmbeddedIdentity?: boolean;
  postToHost?(message: unknown): void;
  requestQuote?(text: string): Promise<string | null>;
  /** Mode Diff, embarqué : laisse la surface composer la capsule de sélection
   *  (mêmes actions qu'hors Diff — ajouter, annoter, Quick Ask) au lieu du
   *  seul bouton « Add to chat ». `send` déclenche la citation vers le chat. */
  buildQuotePill?(host: HTMLElement, send: () => void): void;
  document?: Document;
  window?: Window;
}

export interface StudioDiffController extends StudioDiffJournal {
  destroy(): void;
}

export function createStudioDiffController(options: StudioDiffControllerOptions): StudioDiffController {
  const doc = options.document || document;
  const win = options.window || window;
  const journal = options.factory({
    getCm: options.getEditor,
    individualReview: options.individualReview,
    path: options.path,
    notify: options.notify,
    els: {
      group: doc.getElementById("diffGrp"),
      tag: doc.getElementById("diffTag"),
      prev: doc.getElementById("diffPrev"),
      next: doc.getElementById("diffNext"),
      restore: doc.getElementById("diffRestore"),
    },
    restoreText: options.restoreText,
    onMarks: options.onMarks,
    onNavigate: options.onNavigate,
  });
  let quotePill: HTMLButtonElement | null = null;
  let selectedText = "";
  let bindTimer: number | null = null;
  let boundHost: HTMLElement | null = null;
  const requestQuote = options.requestQuote || (async (text: string): Promise<string | null> => {
    const response = await win.fetch("/quote", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        rel: options.path,
        page: "",
        text,
        comment: "",
        direct: true,
        embed: true,
      }),
    });
    const result = await response.json() as {message?: string};
    return result.message || null;
  });
  const updateQuotePill = (): void => {
    if (!quotePill) return;
    win.setTimeout(() => {
      const selection = win.getSelection();
      const text = selection ? String(selection).trim() : "";
      if (!text || !selection?.rangeCount) {
        quotePill!.style.display = "none";
        selectedText = "";
        return;
      }
      selectedText = text;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      quotePill!.style.left = `${Math.max(8, rect.left + rect.width / 2 - 55)}px`;
      quotePill!.style.top = `${Math.max(8, rect.top - 42)}px`;
      quotePill!.style.display = options.buildQuotePill ? "flex" : "block";
    }, 0);
  };
  const onHostMouseUp = (): void => { if (journal.isShown()) updateQuotePill(); };
  const bindSelection = (): void => {
    const host = options.getEditor()?.getWrapperElement();
    if (!host) {
      bindTimer = win.setTimeout(bindSelection, 300);
      return;
    }
    boundHost = host;
    host.addEventListener("mouseup", onHostMouseUp);
  };
  if (options.enableSelectionQuote && win.self !== win.top) {
    if (options.hideEmbeddedIdentity) {
      const identity = doc.getElementById("fileIdentity");
      if (identity) identity.style.display = "none";
    }
    const sendQuote = (): void => {
      if (!selectedText) return;
      void requestQuote(selectedText).then((message) => {
        if (message) options.postToHost?.({type: "atelier-add-to-chat", text: message});
      }).catch(() => undefined);
      quotePill!.style.display = "none";
      win.getSelection()?.removeAllRanges();
    };
    if (options.buildQuotePill) {
      // La surface fournit la capsule complète (Thierry 2026-09-11 : en mode
      // Diff, seule la citation apparaissait — ni Annoter ni Quick Ask).
      const host = doc.createElement("div");
      host.style.cssText = "position:fixed;z-index:9999;display:none";
      doc.body.appendChild(host);
      options.buildQuotePill(host, sendQuote);
      host.addEventListener("mousedown", (event) => { event.preventDefault(); event.stopPropagation(); });
      quotePill = host as unknown as HTMLButtonElement;
    } else {
      quotePill = doc.createElement("button");
      quotePill.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" style="vertical-align:-2px"><path d="M14 8c0 3-2.7 5.5-6 5.5-.8 0-1.5-.1-2.2-.4L2 14l1.1-2.9C2.4 10.2 2 9.1 2 8c0-3 2.7-5.5 6-5.5S14 5 14 8Z"/></svg> Add to chat';
      quotePill.style.cssText = "position:fixed;z-index:9999;display:none;background:#2c313a;color:#dadee3;border:1px solid #3a414d;border-radius:999px;padding:7px 14px;font-size:13px;font-family:inherit;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)";
      doc.body.appendChild(quotePill);
      quotePill.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        sendQuote();
      });
    }
    bindSelection();
  }
  return {
    push: journal.push.bind(journal),
    isShown: journal.isShown.bind(journal),
    isBusy: journal.isBusy.bind(journal),
    destroy: () => {
      if (bindTimer !== null) win.clearTimeout(bindTimer);
      boundHost?.removeEventListener("mouseup", onHostMouseUp);
      quotePill?.remove();
      quotePill = null;
    },
  };
}
