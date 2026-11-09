/**
 * « Le chat sait ce que tu regardes » : chaque cadre (éditeur LaTeX, éditeur
 * de code, lecteur PDF) publie à l'app hôte le fichier affiché, la ligne du
 * curseur, la page du PDF et les commentaires ouverts. L'hôte en fait une
 * pastille au-dessus du composer et la joint au message suivant.
 *
 * La SÉLECTION n'en fait pas partie (Thierry, 2026-11-08) : sélectionner un
 * passage pour le commenter ou le surligner ne doit pas l'envoyer au chat.
 * Un passage n'y va que par un geste explicite (« Ajouter au chat » de la
 * capsule, canal `atelier-add-to-chat`).
 *
 * Contrat (fixé avec l'hôte) :
 *   {type: "atelier-live-context", context: null | LiveContext}
 * Publication différée (~150 ms) et seulement quand la valeur change
 * (comparaison JSON) ; `repost()` renvoie la valeur courante sans condition,
 * à l'activation de l'onglet (`atelier-tab-activated`).
 *
 * Ce module est pur (aucun DOM) hormis l'écoute d'activation : il se teste
 * sous `vm` à partir du bundle `studio_core.bundle.js`.
 */
import type {StudioPosition} from "./editor_contract";

export type LiveContextKind = "tex" | "code" | "pdf" | "figure" | "docx";

export interface LiveContextComment {
  line?: number;
  quote?: string;
  text: string;
}

export interface LiveContext {
  /** Chemin ABSOLU du fichier affiché (relatif seulement si le cadre n'a pas mieux). */
  path: string;
  name: string;
  kind: LiveContextKind;
  /** Ligne du curseur (1-based), tête de la sélection s'il y en a une. */
  line?: number;
  page?: number;
  pageCount?: number;
  /** Paragraphe du curseur (.docx, 1-based). */
  paragraph?: number;
  comments?: LiveContextComment[];
}

// Alias (pas interface) : assignable à `Record<string, unknown>`, la forme des
// `postToHost` existants.
export type LiveContextMessage = {
  type: "atelier-live-context";
  context: LiveContext | null;
};

export const LIVE_CONTEXT_TYPE = "atelier-live-context";
export const LIVE_CONTEXT_DELAY_MS = 150;
export const LIVE_CONTEXT_COMMENT_LIMIT = 10;
/** Un passage commenté sert à situer la note, pas à recopier le document. */
export const LIVE_CONTEXT_QUOTE_LIMIT = 1000;

export function liveContextBasename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.split("/").pop() || trimmed;
}

const positiveInt = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : undefined;
};

export interface EditorLiveContextInput {
  path: string | null | undefined;
  kind: "tex" | "code";
  /** Tête de la sélection, ou curseur seul (positions 0-based CodeMirror). */
  cursor?: StudioPosition;
  comments?: readonly LiveContextComment[] | null;
}

/** Contexte d'un éditeur : fichier, ligne du curseur, commentaires ouverts.
 *  Jamais le texte sélectionné (voir l'en-tête). */
export function buildEditorLiveContext(input: EditorLiveContextInput): LiveContext | null {
  if (!input.path) return null;
  const context: LiveContext = {path: input.path, name: liveContextBasename(input.path), kind: input.kind};
  const line = input.cursor ? positiveInt(input.cursor.line + 1) : undefined;
  if (line) context.line = line;
  const comments = (input.comments || []).slice(0, LIVE_CONTEXT_COMMENT_LIMIT);
  if (comments.length) context.comments = comments.map((comment) => ({...comment}));
  return context;
}

export interface PdfLiveContextInput {
  path: string | null | undefined;
  page?: number;
  pageCount?: number;
}

/** Contexte du lecteur PDF : fichier et page. Jamais le texte sélectionné. */
export function buildPdfLiveContext(input: PdfLiveContextInput): LiveContext | null {
  if (!input.path) return null;
  const context: LiveContext = {path: input.path, name: liveContextBasename(input.path), kind: "pdf"};
  const pageCount = positiveInt(input.pageCount);
  const page = positiveInt(input.page);
  if (page) context.page = pageCount ? Math.min(page, pageCount) : page;
  if (pageCount) context.pageCount = pageCount;
  return context;
}

/**
 * Chemin du PDF affiché par `pdf_viewer.html`. Le lecteur charge toujours
 * `"/" + file` : `file` est relatif à la racine du serveur galerie (= racine
 * du projet, `GET /ping` → `project`). `texpdf` (onglet PDF d'un studio
 * LaTeX) est déjà absolu. Les routes virtuelles (`kb-pdf/<id>`,
 * `zotero/<clé>/<fichier>`) ne désignent pas un fichier du projet : elles
 * restent telles quelles plutôt que de fabriquer un chemin faux.
 */
export function resolvePdfLivePath(options: {
  file: string | null | undefined;
  projectRoot?: string | null;
  texPdf?: string | null;
}): string | null {
  if (options.texPdf && options.texPdf.startsWith("/")) return options.texPdf;
  const file = options.file || "";
  if (!file) return null;
  if (file.startsWith("/")) return file;
  if (/^(kb-pdf|zotero)\//.test(file)) return file;
  const root = (options.projectRoot || "").replace(/\/+$/, "");
  return root.startsWith("/") ? `${root}/${file.replace(/^\.\//, "")}` : file;
}

export interface LiveContextAnnotation {
  from?: {line: number} | null;
  text?: string | null;
  comment?: string | null;
}

/**
 * Commentaires ouverts d'un fichier, dans l'ordre du document. L'éditeur
 * LaTeX n'a pas d'état « résolu » : un commentaire existe tant qu'il n'est
 * pas supprimé. Les simples surlignages (note vide) ne sont pas des
 * commentaires et restent dehors.
 */
export function liveContextComments(
  annotations: readonly LiveContextAnnotation[] | null | undefined,
  limit = LIVE_CONTEXT_COMMENT_LIMIT,
): LiveContextComment[] {
  if (!annotations?.length) return [];
  const open = annotations
    .filter((annotation) => typeof annotation?.comment === "string" && annotation.comment.trim())
    .map((annotation, index) => ({annotation, index}))
    .sort((a, b) => ((a.annotation.from?.line ?? Infinity) - (b.annotation.from?.line ?? Infinity)) || a.index - b.index);
  return open.slice(0, Math.max(0, limit)).map(({annotation}) => {
    const comment: LiveContextComment = {text: String(annotation.comment).trim()};
    const line = annotation.from ? positiveInt(annotation.from.line + 1) : undefined;
    if (line) comment.line = line;
    const quote = String(annotation.text || "").trim();
    if (quote) comment.quote = quote.length > LIVE_CONTEXT_QUOTE_LIMIT ? quote.slice(0, LIVE_CONTEXT_QUOTE_LIMIT) : quote;
    return comment;
  });
}

type TimerHost = {
  setTimeout(callback: () => void, delay: number): number | ReturnType<typeof setTimeout>;
  clearTimeout(id: number | ReturnType<typeof setTimeout> | undefined): void;
};

export interface LiveContextPublisherOptions {
  build(): LiveContext | null;
  postToHost(payload: LiveContextMessage): void;
  delayMs?: number;
  timers?: TimerHost;
}

export interface LiveContextPublisher {
  /** Différée (~150 ms) ; ne poste que si la valeur a changé. */
  schedule(): void;
  /** Immédiate ; `force` renvoie même une valeur identique. */
  flush(force?: boolean): void;
  /** Renvoie la valeur courante sans condition (activation de l'onglet). */
  repost(): void;
  dispose(): void;
  /** JSON du dernier contexte posté (tests, diagnostic). */
  lastPosted(): string | null;
}

export function createLiveContextPublisher(options: LiveContextPublisherOptions): LiveContextPublisher {
  const delay = options.delayMs ?? LIVE_CONTEXT_DELAY_MS;
  const timers: TimerHost = options.timers || (globalThis as unknown as TimerHost);
  let timer: ReturnType<TimerHost["setTimeout"]> | undefined;
  let last: string | null = null;
  let disposed = false;

  const cancel = (): void => {
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
  };
  const flush = (force = false): void => {
    cancel();
    if (disposed) return;
    let context: LiveContext | null;
    try { context = options.build(); } catch { return; /* état transitoire : le prochain mouvement réessaie */ }
    const json = JSON.stringify(context);
    if (!force && json === last) return;
    last = json;
    try { options.postToHost({type: LIVE_CONTEXT_TYPE, context}); } catch { /* hôte absent (page autonome) */ }
  };
  return {
    schedule(): void {
      if (disposed) return;
      cancel();
      timer = timers.setTimeout(() => { timer = undefined; flush(false); }, delay);
    },
    flush,
    repost: () => flush(true),
    dispose(): void {
      cancel();
      disposed = true;
    },
    lastPosted: () => last,
  };
}

/** L'app prévient l'onglet qui redevient actif (PIEGES_CONNUS §4). */
export function onTabActivated(win: Window, callback: () => void): () => void {
  const listener = (event: MessageEvent): void => {
    if (event.source !== win.parent || win.parent === win) return;
    if ((event.data as {type?: unknown} | null)?.type === "atelier-tab-activated") callback();
  };
  win.addEventListener("message", listener);
  return () => win.removeEventListener("message", listener);
}
