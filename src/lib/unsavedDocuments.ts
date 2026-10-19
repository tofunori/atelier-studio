// Documents ouverts dans un éditeur de l'atelier (LaTeX, Markdown, code) dont
// le tampon n'est pas enregistré. L'état « modifié » vit dans l'iframe de
// l'éditeur ; il est publié ici par postMessage (`atelier-dirty`) pour que
// l'app demande confirmation avant de fermer l'onglet ou de quitter (audit du
// 2026-10-18, problème 1). Store de module : il survit au démontage
// d'AtelierPane (vue chat seule, changement de projet) — l'onglet existe
// toujours et son brouillon de secours attend sur le serveur galerie.

export interface UnsavedDocument {
  tabId: string;
  title: string;
  /** Chemin publié par l'éditeur (paramètre `path` de son URL). */
  path: string;
  /** URL de l'iframe : origine du serveur galerie qui garde le brouillon. */
  url: string;
}

export type DiscardKind = "close" | "quit";

export interface DiscardRequest {
  kind: DiscardKind;
  documents: UnsavedDocument[];
}

const entries = new Map<string, UnsavedDocument>();
const listeners = new Set<() => void>();
let pendingRequest: (DiscardRequest & { resolve: (ok: boolean) => void }) | null = null;
const requestListeners = new Set<(request: DiscardRequest | null) => void>();

function notify() {
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* un abonné ne casse pas les autres */ }
  }
}

export function setDocumentUnsaved(document: UnsavedDocument, unsaved: boolean): void {
  const current = entries.get(document.tabId);
  if (unsaved) {
    if (current && current.title === document.title && current.path === document.path && current.url === document.url) return;
    entries.set(document.tabId, document);
  } else {
    if (!current) return;
    entries.delete(document.tabId);
  }
  notify();
}

export function isDocumentUnsaved(tabId: string): boolean {
  return entries.has(tabId);
}

export function unsavedDocument(tabId: string): UnsavedDocument | null {
  return entries.get(tabId) ?? null;
}

export function unsavedDocuments(): UnsavedDocument[] {
  return [...entries.values()];
}

/** Oublie les documents dont l'onglet n'existe plus. */
export function pruneUnsavedDocuments(liveTabIds: ReadonlySet<string>): void {
  let changed = false;
  for (const tabId of [...entries.keys()]) {
    if (liveTabIds.has(tabId)) continue;
    entries.delete(tabId);
    changed = true;
  }
  if (changed) notify();
}

export function subscribeUnsavedDocuments(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Demande confirmation (dialogue monté par UnsavedDocumentsGuard). Une
 * seconde demande pendant qu'une première est ouverte la remplace : la
 * première est refusée. */
export function confirmDiscard(kind: DiscardKind, documents: UnsavedDocument[]): Promise<boolean> {
  if (!documents.length) return Promise.resolve(true);
  if (!requestListeners.size) return Promise.resolve(false); // aucun dialogue : ne jamais jeter en silence
  pendingRequest?.resolve(false);
  return new Promise<boolean>((resolve) => {
    pendingRequest = { kind, documents, resolve };
    for (const listener of [...requestListeners]) listener({ kind, documents });
  });
}

export function answerDiscard(ok: boolean): void {
  const request = pendingRequest;
  pendingRequest = null;
  for (const listener of [...requestListeners]) listener(null);
  request?.resolve(ok);
}

export function subscribeDiscardRequests(listener: (request: DiscardRequest | null) => void): () => void {
  requestListeners.add(listener);
  if (pendingRequest) listener({ kind: pendingRequest.kind, documents: pendingRequest.documents });
  return () => { requestListeners.delete(listener); };
}

/** Pour les tests : remet le store à zéro. */
export function resetUnsavedDocumentsForTests(): void {
  entries.clear();
  pendingRequest = null;
  listeners.clear();
  requestListeners.clear();
}

const EDITOR_PAGES = /\/\.fig_thumbs\/(?:latex_studio|code_editor|md_studio|md_viewer)\.html$/;

/** Serveur et chemin du brouillon de secours d'un onglet d'éditeur. */
export function editorDraftTarget(url: string): { origin: string; path: string } | null {
  try {
    const parsed = new URL(url);
    if (!EDITOR_PAGES.test(parsed.pathname)) return null;
    const path = parsed.searchParams.get("path");
    return path ? { origin: parsed.origin, path } : null;
  } catch {
    return null;
  }
}

/** Efface le brouillon de secours côté serveur (« Fermer sans enregistrer »). */
export async function discardServerDraft(
  url: string,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<boolean> {
  const target = editorDraftTarget(url);
  if (!target) return false;
  try {
    const response = await fetchImpl(`${target.origin}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: target.path, clear: true }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const IGNORED_FOR_IDENTITY = new Set(["line"]);

/** Deux URLs d'onglet qui ne diffèrent que par `line` désignent le même
 * document : recibler la ligne ne doit pas recharger l'iframe (le tampon non
 * enregistré serait jeté). Renvoie la ligne demandée par `next` ("" si
 * aucune), ou null si un rechargement est nécessaire. */
export function lineOnlyChange(previous: string, next: string): string | null {
  if (previous === next) return null;
  try {
    const a = new URL(previous);
    const b = new URL(next);
    if (a.origin !== b.origin || a.pathname !== b.pathname || a.hash !== b.hash) return null;
    const keys = new Set([...a.searchParams.keys(), ...b.searchParams.keys()]);
    for (const key of keys) {
      if (IGNORED_FOR_IDENTITY.has(key)) continue;
      const left = a.searchParams.getAll(key);
      const right = b.searchParams.getAll(key);
      if (left.length !== right.length || left.some((value, index) => value !== right[index])) return null;
    }
    return b.searchParams.get("line") ?? "";
  } catch {
    return null;
  }
}

/** Source réellement chargée dans l'iframe d'un onglet de document, et
 * dernière URL demandée par l'app. Elles ne diffèrent que par `line` tant
 * qu'aucun rechargement n'a été nécessaire. `pendingSrc` : rechargement
 * retenu le temps que l'éditeur écrive son brouillon. */
export interface FrameSource {
  src: string;
  url: string;
  pendingSrc?: string;
}

export interface FrameSourceUpdate {
  source: FrameSource;
  /** Ligne à révéler par message (`atelier-goto-line`), sans rechargement. */
  gotoLine: string | null;
  /** L'iframe doit charger une nouvelle page. */
  reload: boolean;
}

/** Décide comment une nouvelle URL d'onglet atteint son iframe.
 * `loaded` : l'iframe a fini de charger (sinon un message serait perdu et il
 * n'y a encore aucun tampon à protéger : on recharge). */
export function reconcileFrameSource(previous: FrameSource | undefined, url: string, loaded = true): FrameSourceUpdate {
  if (!previous) return { source: { src: url, url }, gotoLine: null, reload: false };
  if (previous.pendingSrc !== undefined) {
    return { source: { src: previous.src, url, pendingSrc: url }, gotoLine: null, reload: false };
  }
  if (previous.url === url) return { source: previous, gotoLine: null, reload: false };
  const line = lineOnlyChange(previous.url, url);
  if (line !== null && loaded) {
    return { source: { src: previous.src, url }, gotoLine: line || null, reload: false };
  }
  return { source: { src: url, url }, gotoLine: null, reload: true };
}

function frameOrigin(frame: HTMLIFrameElement): string {
  try { return new URL(frame.src).origin; } catch { return "*"; }
}

/** Envoie une demande à l'éditeur d'une iframe et attend son accusé
 * (`ackType`, venant de cette iframe et de son origine). `false` après
 * `timeoutMs` : page figée, pas un éditeur, ou ancienne version. */
export function requestFrame(
  frame: HTMLIFrameElement,
  type: string,
  ackType: string,
  timeoutMs = 800,
  win: Window = window,
): Promise<boolean> {
  const target = frame.contentWindow;
  if (!target) return Promise.resolve(false);
  const origin = frameOrigin(frame);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      win.removeEventListener("message", onMessage);
      win.clearTimeout(timer);
      resolve(ok);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== target || (origin !== "*" && event.origin !== origin)) return;
      if ((event.data as { type?: string } | null)?.type === ackType) finish(true);
    };
    const timer = win.setTimeout(() => finish(false), timeoutMs);
    win.addEventListener("message", onMessage);
    try { target.postMessage({ type }, origin); } catch { finish(false); }
  });
}

/** Avant de quitter : chaque éditeur modifié encore monté écrit son
 * brouillon tout de suite (le `pagehide` de sortie n'est pas garanti). */
export async function flushUnsavedFrames(root: ParentNode = document, timeoutMs = 800): Promise<void> {
  const frames = [...root.querySelectorAll<HTMLIFrameElement>("iframe.atelier[data-atelier-tab]")]
    .filter((frame) => isDocumentUnsaved(frame.dataset.atelierTab ?? ""));
  await Promise.all(frames.map((frame) => requestFrame(frame, "atelier-flush-draft", "atelier-draft-flushed", timeoutMs)));
}
