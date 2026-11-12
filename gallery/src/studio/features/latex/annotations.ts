import {createNoteCard, pdfAnnotationColors} from "../annotation_ui";
import {
  anchorPdfQuote, columnItemHtml, isPdfNote, noteColorName, pdfNoteId, pdfNoteText, reviewRequestKey,
  type ColumnNote, type StoredPdfAnnotation,
} from "../annotation_notes";
import {
  followUp, freshReplies, newRoundId, noteHeader, paragraphOf, proposalBlock, questionBlock, removedRanges,
  roundIcons, roundRequest, sectionOf, since, stateLabel,
  type RoundRecord, type RoundRef, type RoundReply, type RoundState, type StoredRevisions,
} from "./revision_round";
import {
  agentBlock, agentHeader, agentState, authorOf, currentSuggestion, hasUnread, isAgentNote, mergeThreads, replyRequest, waitsForAgent,
  type ThreadMessage,
} from "./agent_notes";
import {
  reviewIcons,
  agendaHtml, agendaText, editChatPrompt, importReportHtml, isEdit, isReviewerNote, likelySettled, mergeReview, progressHtml, reviewChatPrompt,
  reviewerBubble, reviewerName, reviewerState, reviewerSuggestion, reviewerTone, reviewState, triageRequest, fitNote,
  type ImportReport, type ReviewComment, type ReviewerFields, type ReviewInfo, type ReviewState, type ReviewStatus, type ReviewStatusNote,
} from "./reviewer_notes";
import {createReviewerOverlay} from "./reviewer_overlay";
import type {StudioEditor, StudioPosition, StudioRange, StudioTextMarker} from "../../core/editor_contract";

interface AnnotationEditor extends StudioEditor {
  charCoords(position: StudioPosition, mode: "window"): {left: number; top: number; bottom: number};
}

export interface LatexAnnotation {
  id: string;
  from: StudioPosition;
  to: StudioPosition;
  text: string;
  comment: string;
  color?: string;
  kind?: "comment" | "hl";
  number?: number;
  /** Ronde d'annotations en cours pour cette note (revision_round.ts). */
  round?: RoundRef;
  rstate?: RoundState;
  reply?: RoundReply;
  /** Note posée par l'agent du chat (`agent`) ou Claude Desktop (`claude`) :
   *  agent_notes.ts. */
  by?: string;
  author?: string;
  suggest?: {text: string; reason?: string};
  thread?: ThreadMessage[];
  seen?: number;
  at?: number;
  /** Commentaire d'un relecteur importé de Word (`by: "reviewer"`) :
   *  reviewer_notes.ts. */
  review?: ReviewInfo;
  /** Note posée sur le PDF compilé (lecteur PDF), ancrée ici par SyncTeX et
   *  par son texte : jamais écrite dans `tex-comments:`, elle vit dans le
   *  store du PDF ; seul son état de ronde est gardé à part (`tex-pdfnotes:`). */
  src?: "pdf";
  pdf?: {id: string; rel: string; page: number; quote: string; rects: number[][]; kind: string};
  /** Note du PDF que ni SyncTeX ni son texte n'ont pu situer dans la source :
   *  listée, mais sans marque ni ronde. */
  loose?: boolean;
}

/** Notes du PDF compilé : où les lire, et la ligne source d'un point. */
export interface LatexPdfNotesSource {
  /** Clé du PDF compilé dans le store des annotations (chemin relatif à la
   *  racine du projet), `null` hors projet ou sans PDF. */
  pdfRel(): Promise<string | null>;
  /** Ligne source (base 1) d'un point de la page, en fractions de page. */
  sourceLine(page: number, x: number, y: number): Promise<number | null>;
  /** Page (et hauteur, en points) d'une ligne source (base 1). */
  sourceView(line: number): Promise<{page: number; y: number} | null>;
  /** Ce fichier est la racine du document : une note du PDF qu'on ne situe
   *  nulle part y est quand même listée (« Ailleurs dans le PDF »). Un
   *  chapitre inclus ne liste que les siennes. */
  ownsWholePdf?(): boolean;
}

/** Ce que la couche du PDF (vue scindée) dessine : marques et pastilles. */
export interface LatexPdfLayerNote {
  id: string;
  number: number;
  color: string;
  agent: boolean;
  title: string;
  /** Note posée sur le PDF : sa page et ses rectangles (fractions). */
  page?: number;
  rects?: number[][];
  /** Note du .tex : passage, ligne (base 0) et hauteur SyncTeX (points). */
  text?: string;
  line?: number;
  top?: number;
}

export interface LatexAnnotationSelection {
  from: StudioPosition;
  to: StudioPosition;
  text: string;
  anchor?: {left: number; top: number; bottom: number};
}

export interface LatexAnnotationsOptions {
  path: string;
  getEditor(): AnnotationEditor | null;
  popover: HTMLElement;
  panel: HTMLElement;
  button: HTMLElement;
  postToHost(payload: Record<string, unknown>): void;
  /** Prévenu à chaque mutation du jeu (chargement, ajout, édition, retrait) —
   *  la vue Lecture s'en sert pour rafraîchir ses surlignages. */
  onMutated?(): void;
  /** Échec à signaler hors du popover (chargement des commentaires raté). */
  onError?(message: string): void;
  /** Ramène la vue Source (les propositions s'y affichent). */
  revealSource?(): void;
  /** Notes du PDF compilé, mêlées à celles du .tex (variante B, 2026-11-09). */
  pdfNotes?: LatexPdfNotesSource;
  /** Prévenu quand la liste ou la numérotation change : la couche du PDF
   *  de la vue scindée se redessine. */
  onNotesChanged?(): void;
  document?: Document;
  window?: Window;
}

export interface LatexAnnotationsController {
  bind(): void;
  /** `true` quand la liste du serveur est chargée (seule base d'écriture). */
  load(): Promise<boolean>;
  open(selection: LatexAnnotationSelection): void;
  highlight(selection: LatexAnnotationSelection, color: string): void;
  anchorAll(): void;
  syncFromMarks(): void;
  togglePanel(force?: boolean): void;
  annotations(): readonly LatexAnnotation[];
  marks(): Readonly<Record<string, StudioTextMarker>>;
  /** Recolorer / retirer un commentaire depuis ailleurs que le popover —
   *  la marge de la Lecture traite ses marques toutes pareilles. */
  setColor(id: string, color: string): void;
  drop(id: string): void;
  /** Ouvre le popover d'un commentaire EXISTANT (`open` en crée un nouveau). */
  focus(id: string, anchor?: {left: number; top: number; bottom: number}): void;
  /** Relit les notes du PDF compilé (après une compilation, `fresh` oublie
   *  les lignes SyncTeX déjà calculées). */
  refreshPdfNotes(fresh?: boolean): Promise<void>;
  /** Ce que la couche du PDF de la vue scindée dessine. */
  layerNotes(): LatexPdfLayerNote[];
  /** Marquages du PDF compilé sans note (surlignages nus) : voile seul. */
  pdfMarks(): StoredPdfAnnotation[];
  /** Clic sur une pastille du PDF : la colonne s'ouvre sur la note. */
  reveal(id: string): void;
  /** « Réviser avec l'agent » demandé depuis l'onglet PDF. */
  startRound(): void;
}

// Pastilles : la teinte du surlignage à 85 % (--annot-*, latex_studio.css).
const SWATCHES: Readonly<Record<string, string>> = {
  amber: "rgba(var(--annot-amber),.85)", red: "rgba(var(--annot-red),.85)",
  blue: "rgba(var(--annot-blue),.85)", green: "rgba(var(--annot-green),.85)",
  purple: "rgba(var(--annot-purple),.85)",
};

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`LaTeX annotations: missing ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
  })[character] || character);
}

export function findAnnotationRange(
  documentText: string,
  annotation: Pick<LatexAnnotation, "text" | "from">,
  editor: Pick<StudioEditor, "indexFromPos" | "posFromIndex">,
): StudioRange | null {
  const target = String(annotation.text || "");
  if (!target.trim()) return null;
  let near = 0;
  try { near = editor.indexFromPos(annotation.from); } catch { /* stale position */ }
  const candidates: Array<[number, number]> = [];
  let index = documentText.indexOf(target);
  while (index >= 0 && candidates.length < 50) {
    candidates.push([index, index + target.length]);
    index = documentText.indexOf(target, index + 1);
  }
  if (!candidates.length) {
    const map: number[] = [];
    let normalized = "";
    for (let sourceIndex = 0; sourceIndex < documentText.length; sourceIndex += 1) {
      const character = documentText[sourceIndex] || "";
      if (/\s/.test(character)) {
        if (normalized && normalized.at(-1) !== " ") {
          normalized += " ";
          map.push(sourceIndex);
        }
      } else {
        normalized += character;
        map.push(sourceIndex);
      }
    }
    const normalizedTarget = target.replace(/\s+/g, " ").trim();
    if (normalizedTarget) {
      let normalizedIndex = normalized.indexOf(normalizedTarget);
      while (normalizedIndex >= 0 && candidates.length < 50) {
        const from = map[normalizedIndex];
        const finalSourceIndex = map[normalizedIndex + normalizedTarget.length - 1];
        if (from !== undefined && finalSourceIndex !== undefined) candidates.push([from, finalSourceIndex + 1]);
        normalizedIndex = normalized.indexOf(normalizedTarget, normalizedIndex + 1);
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((left, right) => Math.abs(left[0] - near) - Math.abs(right[0] - near));
  const best = candidates[0];
  return best ? {from: editor.posFromIndex(best[0]), to: editor.posFromIndex(best[1])} : null;
}

export function createLatexAnnotationsController(
  options: LatexAnnotationsOptions,
): LatexAnnotationsController {
  const doc = options.document || document;
  const win = options.window || window;
  // Variante A (Thierry 2026-11-09), la même fiche que dans le PDF : Entrée,
  // Échap ou un clic à côté enregistrent la note (elle attend la prochaine
  // ronde) ; seule la pilule « Envoyer au chat » l'envoie tout de suite.
  const noteUI = createNoteCard(options.popover, {
    onSave(){}, onDelete(){}, onSend(){void persistCurrent(true);}, head:{title:"Note"},
    placeholder:"Ta note sur ce passage…",
  });
  const textarea = noteUI.input;
  const saveButton = options.popover.querySelector<HTMLButtonElement>(".send2")!;
  const chatButton = saveButton;
  const deleteButton = options.popover.querySelector<HTMLButtonElement>(".delete-note")!;
  const colorButtons: HTMLButtonElement[] = [];
  const relation = `tex-comments:${options.path}`;
  let all: LatexAnnotation[] = [];
  let marks: Record<string, StudioTextMarker> = {};
  const badges:Record<string,{clear():void}>={};
  let current: LatexAnnotation | null = null;
  let openedAt = 0;
  let reanchorTimer: number | null = null;
  let deleteArmTimer: number | null = null;
  let bound = false;
  // Garde anti-écrasement, comme le lecteur PDF (ANNOTS_LOADED, KNOWN_IDS) :
  // aucune écriture avant un chargement réussi, et chaque écriture dit au
  // serveur ce que l'éditeur a vu (`known`) pour qu'il garde le reste au
  // lieu de remplacer la liste stockée (audit 2026-10-18, problème 6).
  let loaded = false;
  let loading: Promise<boolean> | null = null;
  const knownIds = new Set<string>();
  // Rondes : historique des notes décidées (`tex-rounds:`), réponses de
  // l'agent relevées sur /texrevisions tant qu'une note attend.
  const roundsRel = `tex-rounds:${options.path}`;
  let history: RoundRecord[] = [];
  const historyKnown = new Set<string>();
  const roundBlocks: Record<string, Array<{clear(): void}>> = {};
  const wordMarks: Record<string, StudioTextMarker[]> = {};
  let activeId: string | null = null;
  let filter: "all" | "mine" | "agent" | "reviewer" = "all";
  // Filtre « relecteur » : état et type de ses commentaires, ordre du jour,
  // bilan du dernier import, avancement tous fichiers (/review/status).
  let reviewFilter: ReviewState | "likely" | "all" = "todo";
  let kindFilter: "all" | "question" | "remark" = "all";
  // « Ses modifications » : ses retouches de texte, filtrées par sort
  // (vide = la liste montre ses commentaires).
  let editFilter: "" | "apply" | "changed" | "done" = "";
  let agendaOpen = false;
  let report: {html: string} | null = null;
  let reviewStatus: ReviewStatus | null = null;
  let pollTimer: number | null = null;
  let roundError = "";
  const LOAD_FAILED = "Commentaires non chargés : rien n'est enregistré tant que la liste n'est pas relue. Ta note reste disponible.";

  const editor = (): AnnotationEditor | null => options.getEditor();
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  const save = (): Promise<boolean> => {
    options.onMutated?.();
    saveQueue = saveQueue.then(async () => {
      if (!(await ensureLoaded())) { noteUI.status.textContent = LOAD_FAILED; return false; }
      // instantané pris au tour de la file : l'état le plus récent part.
      // Les notes du PDF restent dans le store du PDF (syncPdfSide).
      const sent = all.filter(annotation => annotation.src !== "pdf").map((annotation) => ({...annotation}));
      const body = JSON.stringify({rel:relation, annots:sent, known:[...knownIds]});
      try {
        const response=await win.fetch("/pdfannot",{method:"POST",headers:{"Content-Type":"application/json"},body});
        const result=await response.json();
        if(!response.ok || result.error) throw new Error("save failed");
        sent.forEach((annotation) => knownIds.add(String(annotation.id)));
      } catch {noteUI.status.textContent="Enregistrement impossible. Ta note reste disponible.";return false;}
      return syncPdfSide();
    });
    return saveQueue;
  };
  // Numéro = rang dans l'ordre du document, notes du .tex et du PDF mêlées :
  // le même dans la colonne, la marge de l'éditeur, la Lecture et le PDF.
  const numberOf = (annotation: LatexAnnotation): number => {
    const index = notes().indexOf(annotation);
    return index >= 0 ? index + 1 : (annotation.number || 1);
  };
  const renumber = (): void => { notes().forEach((annotation, index) => { annotation.number = index + 1; }); };
  // Numéro affiché par la marque actuelle : on ne redessine une marque (et
  // ses widgets, dont un champ de réponse en cours) que s'il a changé.
  const shownNumber: Record<string, number> = {};
  // Éléments qui affichent ce numéro (pastille, en-têtes de ronde) : une
  // renumérotation les met à jour sur place.
  const numberRoots: Record<string, HTMLElement[]> = {};
  const mark = (annotation: LatexAnnotation): void => {
    const activeEditor = editor();
    if (!activeEditor) return;
    shownNumber[annotation.id] = numberOf(annotation);
    numberRoots[annotation.id] = [];
    try {
      if (annotation.loose) return;
      const answered = annotation.kind!=="hl" && (annotation.rstate==="prop" || annotation.rstate==="ask") && annotation.reply;
      // une note de l'agent posée sur le PDF garde son fil dans le lecteur PDF
      const agent = annotation.kind!=="hl" && isAgentNote(annotation) && annotation.src !== "pdf";
      const reviewer = annotation.kind!=="hl" && isReviewerNote(annotation);
      const tint = `note-c-${noteColorName(annotation.color)}`;
      marks[annotation.id] = activeEditor.markText(annotation.from, annotation.to, {
        className: annotation.kind === "hl" ? `texc-hl texc-c-${annotation.color || "amber"}`
          : annotation.rstate==="prop" || (agent && currentSuggestion(annotation))
            ? "texc-hl texc-comment texr-old"
            : reviewer ? `texc-hl texc-comment texv-mark tone-${reviewerTone(annotation)}${reviewState(annotation) === "done" ? " is-done" : ""}`
              + (activeId === annotation.id ? " is-active" : "") : `texc-hl texc-comment ${tint}`,
        attributes: {"data-texc": annotation.id},
      });
      if (agent) { markAgent(annotation, activeEditor); return; }
      if (reviewer) { syncReviewer(); return; }
      if (answered) { markRound(annotation, activeEditor); return; }
      if(annotation.kind!=="hl" && typeof activeEditor.setBookmark==="function") {
        const badge=doc.createElement("button");badge.type="button";
        badge.className=`atelier-annotation-number ${tint}${isAgentNote(annotation) ? " is-agent" : ""}${annotation.rstate==="busy" ? " is-busy" : ""}`;
        badge.textContent=String(numberOf(annotation));
        badge.setAttribute("aria-label",`Annotation ${badge.textContent}`);
        badge.onclick=event=>{event.stopPropagation();if(saving)return;current=annotation;show(annotation,false,badge.getBoundingClientRect());};
        badges[annotation.id]=activeEditor.setBookmark(annotation.from,{widget:badge,insertLeft:true});
        numberRoots[annotation.id]?.push(badge);
      }
    } catch { /* stale range; next anchor pass retries */ }
  };
  const clearMark = (id: string): void => {
    try { marks[id]?.clear(); } catch { /* already cleared */ }
    delete marks[id];
    badges[id]?.clear();delete badges[id];
    for (const block of roundBlocks[id] || []) { try { block.clear(); } catch { /* déjà retiré */ } }
    delete roundBlocks[id];
    for (const word of wordMarks[id] || []) { try { word.clear(); } catch { /* déjà retiré */ } }
    delete wordMarks[id];
    delete numberRoots[id];
    delete shownNumber[id];
  };
  const anchorAll = (): void => {
    const activeEditor = editor();
    if (!activeEditor) return;
    const documentText = activeEditor.getValue();
    let changed = false;
    renumber();
    for (const annotation of all) {
      clearMark(annotation.id);
      if (annotation.loose) continue;
      let exact = false;
      try { exact = activeEditor.getRange(annotation.from, annotation.to) === annotation.text; } catch { /* stale */ }
      if (!exact) {
        const range = findAnnotationRange(documentText, annotation, activeEditor);
        if (!range) continue;
        annotation.from = {...range.from};
        annotation.to = {...range.to};
        changed = true;
      }
      mark(annotation);
    }
    if (changed) save();
  };
  const syncFromMarks = (): void => {
    const activeEditor = editor();
    if (!activeEditor) return;
    let changed = false;
    for (const annotation of all) {
      if (annotation.loose) continue;
      const range = marks[annotation.id]?.find();
      if (!range) {
        const anchored = findAnnotationRange(activeEditor.getValue(), annotation, activeEditor);
        if (anchored) {
          annotation.from = {...anchored.from};
          annotation.to = {...anchored.to};
          mark(annotation);
          changed = true;
        }
        continue;
      }
      const text = activeEditor.getRange(range.from, range.to);
      if (text.trim() && (text !== annotation.text || range.from.line !== annotation.from.line
        || range.from.ch !== annotation.from.ch || range.to.ch !== annotation.to.ch)) {
        annotation.text = text;
        annotation.from = {...range.from};
        annotation.to = {...range.to};
        changed = true;
      }
    }
    if (changed) { refreshNumbers(); save(); }
  };
  // Ordre du document ; une note du PDF que rien ne situe dans la source
  // vient en dernier, par page.
  const sorted = (): LatexAnnotation[] => [...all].sort((left, right) =>
    (Number(Boolean(left.loose)) - Number(Boolean(right.loose)))
    || (left.loose && right.loose ? (left.pdf?.page || 0) - (right.pdf?.page || 0) || (left.pdf?.rects[0]?.[1] || 0) - (right.pdf?.rects[0]?.[1] || 0) : 0)
    || left.from.line - right.from.line || left.from.ch - right.from.ch);
  // ---- Rondes d'annotations -------------------------------------------
  const notes = (): LatexAnnotation[] => sorted().filter(a => a.kind !== "hl");
  // Les rondes ne portent que les notes de Thierry : l'agent ne se répond pas
  // à lui-même (ses notes ont leur propre fil, agent_notes.ts).
  const ownNotes = (): LatexAnnotation[] => notes().filter(a => !isAgentNote(a) && !isReviewerNote(a) && !a.loose);
  const reviewerNotes = (): LatexAnnotation[] => notes().filter(a => isReviewerNote(a));
  const agentNotes = (): LatexAnnotation[] => notes().filter(a => isAgentNote(a));
  const currentRound = (): RoundRef | null => ownNotes().find(a => a.round)?.round || null;
  const pending = (): LatexAnnotation[] => ownNotes().filter(a => a.round && (a.rstate === "prop" || a.rstate === "ask"));
  const firstProposal = (): string | null => pending().find(a => a.rstate === "prop")?.id || null;
  const sectionsFor = (items: readonly LatexAnnotation[]): string[] => {
    const activeEditor = editor();
    const lines = typeof activeEditor?.getValue === "function" ? activeEditor.getValue().split("\n") : [];
    return items.map(a => sectionOf(lines, a.from.line));
  };
  const refreshNumbers = (): void => {
    notes().forEach((annotation, index) => {
      annotation.number = index + 1;
      if (shownNumber[annotation.id] === index + 1) return;
      if (!marks[annotation.id] && !badges[annotation.id]) return;
      // sur place : un champ de réponse ouvert garde ce qu'on y tape
      const roots = numberRoots[annotation.id] || [];
      const rings = roots.flatMap(root => root.matches(".atelier-annotation-number") ? [root] : [...root.querySelectorAll<HTMLElement>(".atelier-annotation-number")]);
      if (!rings.length) { remark(annotation); return; }
      for (const ring of rings) {
        ring.textContent = String(index + 1);
        if (ring.hasAttribute("aria-label")) ring.setAttribute("aria-label", `Annotation ${index + 1}`);
      }
      shownNumber[annotation.id] = index + 1;
    });
    options.onNotesChanged?.();
  };

  function markRound(annotation: LatexAnnotation, activeEditor: AnnotationEditor): void {
    if (typeof activeEditor.setBookmark !== "function" || !annotation.reply) return;
    const blocks: Array<{clear(): void}> = [];
    const source = activeEditor.getValue().split("\n");
    const paragraph = paragraphOf(source, annotation.from.line, annotation.to.line);
    const header = noteHeader(doc, numberOf(annotation), annotation.comment, false);
    numberRoots[annotation.id]?.push(header);
    header.addEventListener("mousedown", event => event.preventDefault());
    header.onclick = () => { activeId = annotation.id; buildPanel(); };
    blocks.push(activeEditor.setBookmark({line: paragraph.start, ch: 0}, {widget: header, insertLeft: true, block: true}));
    const endLine = activeEditor.getLine(annotation.to.line) || "";
    const reply = annotation.reply;
    const block = reply.kind === "propose"
      ? proposalBlock(doc, {
        number: numberOf(annotation), comment: annotation.comment, passage: annotation.text, reply,
        // Le paragraphe entier tel qu'il deviendrait, sous le paragraphe actuel.
        lineBefore: [...source.slice(paragraph.start, annotation.from.line), (source[annotation.from.line] || "").slice(0, annotation.from.ch)].join("\n"),
        lineAfter: [endLine.slice(annotation.to.ch), ...source.slice(annotation.to.line + 1, paragraph.end + 1)].join("\n"),
        position: {index: pending().filter(a => a.rstate === "prop").findIndex(a => a.id === annotation.id) + 1,
          total: pending().filter(a => a.rstate === "prop").length},
      }, {
        accept: () => decide(annotation.id, "acc"),
        reject: () => decide(annotation.id, "rej"),
        again: words => ask(annotation.id, "again", words),
        move: step => move(step, annotation.id),
      })
      : questionBlock(doc, reply.question || "", reply.author || "L’agent", words => ask(annotation.id, "answer", words));
    block.dataset.texr = annotation.id;
    block.classList.toggle("is-active", activeId === annotation.id);
    block.addEventListener("mousedown", event => {
      if (!(event.target as Element | null)?.closest("input")) event.preventDefault();
      // ⌘↩ vise la proposition touchée en dernier ; une question n'en est pas une.
      if (reply.kind === "propose" && activeId !== annotation.id) { activeId = annotation.id; buildPanel(); }
    });
    const lastLine = activeEditor.getLine(paragraph.end) || "";
    blocks.push(activeEditor.setBookmark({line: paragraph.end, ch: lastLine.length}, {widget: block, block: true}));
    roundBlocks[annotation.id] = blocks;
    if (reply.kind === "propose") {
      const base = activeEditor.indexFromPos(annotation.from);
      wordMarks[annotation.id] = removedRanges(annotation.text, reply.text || "").map(([from, to]) =>
        activeEditor.markText(activeEditor.posFromIndex(base + from), activeEditor.posFromIndex(base + to), {className: "texr-del-word"}));
    }
  }
  // ---- Notes de l'agent (agent_notes.ts) ----------------------------------
  function markAgent(annotation: LatexAnnotation, activeEditor: AnnotationEditor): void {
    if (typeof activeEditor.setBookmark !== "function") return;
    const blocks: Array<{clear(): void}> = [];
    const source = activeEditor.getValue().split("\n");
    const paragraph = paragraphOf(source, annotation.from.line, annotation.to.line);
    const header = agentHeader(doc, numberOf(annotation), annotation);
    numberRoots[annotation.id]?.push(header);
    header.dataset.texa = annotation.id;
    header.addEventListener("mousedown", event => event.preventDefault());
    header.onclick = () => { activeId = annotation.id; markSeen(annotation.id); };
    blocks.push(activeEditor.setBookmark({line: paragraph.start, ch: 0}, {widget: header, insertLeft: true, block: true}));
    const endLine = activeEditor.getLine(annotation.to.line) || "";
    const block = agentBlock(doc, {
      note: annotation,
      lineBefore: [...source.slice(paragraph.start, annotation.from.line), (source[annotation.from.line] || "").slice(0, annotation.from.ch)].join("\n"),
      lineAfter: [endLine.slice(annotation.to.ch), ...source.slice(annotation.to.line + 1, paragraph.end + 1)].join("\n"),
    }, {
      accept: () => acceptAgent(annotation.id),
      reject: () => closeAgent(annotation.id, "rej"),
      resolve: () => closeAgent(annotation.id, "res"),
      remove: () => { remove(annotation.id); buildPanel(); },
      reply: words => replyAgent(annotation.id, words),
      seen: () => markSeen(annotation.id),
    });
    block.dataset.texr = annotation.id;
    block.addEventListener("mousedown", event => {
      if (!(event.target as Element | null)?.closest("input")) event.preventDefault();
      activeId = annotation.id;
    });
    const lastLine = activeEditor.getLine(paragraph.end) || "";
    blocks.push(activeEditor.setBookmark({line: paragraph.end, ch: lastLine.length}, {widget: block, block: true}));
    roundBlocks[annotation.id] = blocks;
    const suggestion = currentSuggestion(annotation);
    if (suggestion) {
      const base = activeEditor.indexFromPos(annotation.from);
      wordMarks[annotation.id] = removedRanges(annotation.text, suggestion.text).map(([from, to]) =>
        activeEditor.markText(activeEditor.posFromIndex(base + from), activeEditor.posFromIndex(base + to), {className: "texr-del-word"}));
    }
  }
  /** Résoudre, rejeter ou accepter : la note quitte la page et reste dans l'historique. */
  function closeAgent(id: string, decision: "res" | "rej" | "acc", proposal?: string): void {
    const annotation = all.find(a => a.id === id);
    if (!annotation) return;
    clearMark(id);
    all = all.filter(a => a.id !== id);
    history.push({id, round: "", n: 0, number: numberOf(annotation), comment: annotation.comment, text: annotation.text,
      decision, proposal, at: Date.now(), by: annotation.by, author: authorOf(annotation)});
    if (activeId === id) activeId = firstProposal();
    roundError = "";
    refreshNumbers();
    void save();
    void saveHistory();
    buildPanel();
  }
  function acceptAgent(id: string): void {
    const annotation = all.find(a => a.id === id);
    const activeEditor = editor();
    const suggestion = annotation ? currentSuggestion(annotation) : null;
    if (!annotation || !suggestion || !activeEditor || saving) return;
    const range = marks[id]?.find() || findAnnotationRange(activeEditor.getValue(), annotation, activeEditor);
    if (!range || activeEditor.getRange(range.from, range.to) !== annotation.text) {
      roundError = "Le passage a changé depuis la proposition : réponds sous la note pour en demander une autre.";
      togglePanel(true);
      return;
    }
    clearMark(id);
    activeEditor.replaceRange(suggestion.text, range.from, range.to, "+revision");
    closeAgent(id, "acc", suggestion.text);
  }
  function replyAgent(id: string, words: string): void {
    const annotation = all.find(a => a.id === id);
    if (!annotation) return;
    const now = Date.now();
    annotation.thread = [...(annotation.thread || []), {id: `m${now}`, by: "user", author: "Toi", text: words, at: now}];
    annotation.seen = now;
    void save().then(saved => {
      if (!saved) return;
      post(replyRequest(options.path, annotation, words));
    });
    remark(annotation);
    buildPanel();
  }
  function markSeen(id: string): void {
    const annotation = all.find(a => a.id === id);
    if (!annotation || !hasUnread(annotation)) return;
    annotation.seen = Date.now();
    // Sans reconstruire le bloc : le clic qui suit (Résoudre, Répondre…)
    // doit tomber sur le bouton encore en place.
    for (const ring of doc.querySelectorAll(".texa-head .is-unread")) {
      if ((ring.parentElement as HTMLElement | null)?.dataset.texa === id) ring.classList.remove("is-unread");
    }
    void save();
    buildPanel();
  }
  // ---- Commentaires du relecteur (reviewer_notes.ts, reviewer_overlay.ts) --
  // Maquette « annotations épurées » v8 (Thierry 2026-11-12) : rien n'est
  // inséré dans le texte. Un numéro dans la marge (un crayon pour ses
  // retouches), la couleur seule pour l'état ; la bulle du commentaire
  // ouvert flotte sous son passage.
  let composing: string | null = null;
  const drafts: Record<string, string> = {};
  /** Notes de Thierry parties au chat, le temps de la séance. */
  const sentNotes: Record<string, string> = {};
  const placedReviewer = (): LatexAnnotation[] => reviewerNotes().filter(a => !a.loose);
  const overlay = createReviewerOverlay(doc, win, {
    wrapper: () => editor()?.getWrapperElement() || null,
    items: () => placedReviewer().map(a => ({
      id: a.id, number: numberOf(a), tone: reviewerTone(a), done: reviewState(a) === "done", unread: hasUnread(a), line: a.from.line,
      edit: isEdit(a),
      title: `${reviewerState(a).label} · ${(isEdit(a) ? a.review?.edit?.after || a.comment || "" : a.comment || "").replace(/\s+/g, " ").trim().slice(0, 160)}`,
    })),
    activeId: () => activeId && placedReviewer().some(a => a.id === activeId) ? activeId : null,
    open: id => activateReviewer(id),
    bubble: id => {
      const list = placedReviewer();
      const index = list.findIndex(a => a.id === id);
      const note = list[index];
      if (!note) return null;
      const suggestion = reviewerSuggestion(note);
      const view = {note, number: numberOf(note), index: index + 1, total: list.length,
        composing: composing === id, draft: drafts[id] || "", said: sentNotes[id] || ""};
      const key = JSON.stringify([id, view.number, view.index, view.total, view.composing, view.said, reviewState(note),
        reviewerTone(note), note.comment, note.text, suggestion?.text || "", suggestion?.reason || "", note.review?.chatAt || 0,
        note.review?.refused || 0, note.review?.likely?.reason || "", note.review?.edit?.status || "", (note.thread || []).length]);
      return {key, build: () => reviewerBubble(doc, view, {
        tick: () => setReviewState(id, reviewState(note) === "done" ? "todo" : "done"),
        chat: () => { composing = id; syncReviewer(); },
        send: text => {
          composing = null;
          delete drafts[id];
          if (text.trim()) sentNotes[id] = text.trim();
          // sa retouche qui ne s'applique plus telle quelle : fusion demandée
          void discussInChat({at: id, note: text.trim(), merge: isEdit(note) && !reviewerSuggestion(note)});
          syncReviewer();
        },
        cancel: () => { composing = null; syncReviewer(); },
        draft: text => { drafts[id] = text; },
        accept: () => { acceptReviewer(id); },
        refuse: () => refuseReviewer(id),
        nav: delta => {
          const target = placedReviewer()[index + delta];
          if (!target) return;
          activateReviewer(target.id);
          reveal(target.id);
        },
        seen: () => markSeen(id),
      })};
    },
  });
  let overlayFrame = 0;
  /** Numéros et bulle repris au prochain rendu (une fois par lot de marques). */
  function syncReviewer(): void {
    if (overlayFrame || (!placedReviewer().length && !overlay.bubble() && !doc.querySelector(".texv-layer"))) return;
    if (typeof win.requestAnimationFrame !== "function") { overlay.sync(); return; }
    overlayFrame = win.requestAnimationFrame(() => { overlayFrame = 0; overlay.sync(); });
  }
  /** Ouvre la bulle d'un commentaire du relecteur (un seul à la fois). */
  function activateReviewer(id: string | null): void {
    const before = activeId ? all.find(a => a.id === activeId) : null;
    if (composing !== id) composing = null;
    activeId = id;
    if (before && isReviewerNote(before)) remark(before);
    const next = id ? all.find(a => a.id === id) : null;
    if (next) { remark(next); if (hasUnread(next)) markSeen(next.id); }
    buildPanel();
  }
  function setReviewState(id: string, next: ReviewState): void {
    const annotation = all.find(a => a.id === id);
    if (!annotation) return;
    annotation.review = {...(annotation.review || {}), state: next, stateAt: Date.now()};
    remark(annotation);
    void save().then(() => loadReviewStatus());
    buildPanel();
  }
  /** « Refuser » : la correction de Claude tombe, le commentaire reste à
   *  faire. Sur sa version d'une retouche (ou « Garder mon texte ») : la
   *  retouche est rangée, ton texte reste. */
  function refuseReviewer(id: string): void {
    const annotation = all.find(a => a.id === id);
    if (!annotation) return;
    const suggestion = reviewerSuggestion(annotation);
    if (isEdit(annotation) && (!suggestion || suggestion.his)) { keepText(annotation); return; }
    annotation.review = {...(annotation.review || {}), refused: Date.now()};
    annotation.seen = Date.now();
    clearMark(id);
    mark(annotation);
    void save();
    buildPanel();
  }
  function keepText(annotation: LatexAnnotation): void {
    const now = Date.now();
    annotation.review = {...(annotation.review || {}), state: "done", stateAt: now, refused: now};
    annotation.seen = now;
    if (activeId === annotation.id) activeId = null;
    remark(annotation);
    void save().then(() => loadReviewStatus());
    buildPanel();
  }
  /** Écrit la correction (ou sa version d'une retouche) ; rend l'erreur. */
  function acceptReviewer(id: string): string {
    const annotation = all.find(a => a.id === id);
    const activeEditor = editor();
    const suggestion = annotation ? reviewerSuggestion(annotation) : null;
    if (!annotation || !activeEditor) return "Passage introuvable dans l’éditeur.";
    if (!suggestion) return "Rien à accepter tel quel : demande d’abord à Claude de fusionner.";
    if (saving) return "Enregistrement en cours : réessaie dans un instant.";
    const range = marks[id]?.find() || findAnnotationRange(activeEditor.getValue(), annotation, activeEditor);
    if (!range || activeEditor.getRange(range.from, range.to) !== annotation.text) {
      roundError = isEdit(annotation) ? "Le passage a changé depuis : demande à Claude de fusionner sa version avec ton texte."
        : "Le passage a changé depuis la correction : demande-en une autre à Claude dans le chat.";
      togglePanel(true);
      return roundError;
    }
    clearMark(id);
    activeEditor.replaceRange(suggestion.text, range.from, range.to, "+revision");
    // Le commentaire reste, réglé, sur le passage corrigé.
    const end = activeEditor.posFromIndex(activeEditor.indexFromPos(range.from) + suggestion.text.length);
    annotation.from = {...range.from};
    annotation.to = end;
    annotation.text = suggestion.text;
    annotation.review = {...(annotation.review || {}), state: "done", stateAt: Date.now(), ...(isEdit(annotation) ? {accepted: Date.now()} : {})};
    annotation.seen = Date.now();
    history.push({id, round: "", n: 0, number: numberOf(annotation), comment: annotation.comment, text: annotation.text,
      decision: "acc", proposal: suggestion.text, at: Date.now(), by: annotation.by, author: annotation.author || reviewerName(annotation)});
    roundError = "";
    if (activeId === id && isEdit(annotation)) activeId = null;
    remark(annotation);
    void save().then(() => loadReviewStatus());
    void saveHistory();
    buildPanel();
    return "";
  }
  // ---- Revue un par un dans le chat (maquette « chat-un-par-un ») --------
  // L'éditeur envoie un commentaire au chat ; la barre du chat répond par
  // `atelier-review-action` (Réglé, À voir avec lui, Suivant) et l'éditeur
  // envoie le suivant, dans l'ordre du document, tous fichiers confondus.
  type ReviewMode = "open" | "likely" | "edit";
  const reviewNextUrl = (query: Record<string, string>): string =>
    `/review/next?${new URLSearchParams({path: options.path, ...query}).toString()}`;
  async function fetchComment(query: Record<string, string>): Promise<{note: ReviewComment | null; remaining?: number} | null> {
    try {
      const response = await win.fetch(reviewNextUrl(query));
      const payload = await response.json() as {ok?: boolean; note?: ReviewComment | null; remaining?: number; error?: string};
      if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      return {note: payload.note || null, remaining: payload.remaining};
    } catch (error) {
      roundError = `Commentaire introuvable : ${error instanceof Error ? error.message : String(error)}`;
      buildPanel();
      return null;
    }
  }
  /** État d'un commentaire, dans ce fichier (copie locale) ou ailleurs. */
  async function writeReviewState(file: string, id: string, change: {state?: ReviewState; chat?: boolean}): Promise<void> {
    const local = file === options.path ? all.find(a => a.id === id && isReviewerNote(a)) : null;
    if (local) {
      const now = Date.now();
      local.review = {...(local.review || {}), ...(change.state ? {state: change.state, stateAt: now} : {}), ...(change.chat ? {chatAt: now} : {})};
      remark(local);
      await save();
    } else {
      try {
        await win.fetch("/review/state", {method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({path: options.path, file, id, ...change})});
      } catch { /* l'état se reprend au prochain geste */ }
    }
    await loadReviewStatus();
    buildPanel();
  }
  /** Envoie un commentaire au chat (celui demandé, ou le prochain). */
  async function discussInChat(query: {at?: string; after?: string; mode?: ReviewMode; merge?: boolean; note?: string}): Promise<void> {
    const asked = query.mode || "open";
    const found = await fetchComment({...(query.at ? {at: query.at} : {}), ...(query.after ? {after: query.after} : {}), mode: asked});
    if (!found) return;
    if (!found.note) {
      options.postToHost({type: "atelier-review-comment", text: "", review: {doc: options.path, mode: asked, done: true}});
      return;
    }
    const comment = found.note;
    const edit = comment.kind === "edit";
    const note = query.at === comment.id ? query.note || "" : "";
    // une retouche ouverte depuis le texte part dans le parcours des retouches
    const mode: ReviewMode = edit ? "edit" : asked === "edit" ? "open" : asked;
    options.postToHost({type: "atelier-review-comment", text: edit ? editChatPrompt(comment, query.merge, note) : reviewChatPrompt(comment, note), review: {
      doc: options.path, mode, path: comment.path, id: comment.id, n: comment.n, total: comment.total,
      author: comment.author || "", comment: comment.comment || "", quote: comment.quote || "", now: comment.now || "",
      line: comment.line || 0, fit: comment.fit || "", kind: comment.kind || "",
      ...(comment.likely?.settled ? {likely: comment.likely.reason || ""} : {}),
      ...(edit ? {edit: comment.edit?.status || "", ready: Boolean(comment.edit?.ready)} : {}),
      ...(note ? {note} : {}),
    }});
    if (comment.path === options.path && all.some(a => a.id === comment.id)) {
      activateReviewer(comment.id);
      reveal(comment.id);
    } else if (comment.path !== options.path) {
      // son passage est dans un autre .tex : on l'y montre
      openReviewerElsewhere(comment.path, comment.id, comment.line);
    }
    await writeReviewState(comment.path, comment.id, {chat: true});
  }
  // Ses retouches dans un autre .tex : l'éditeur de ce fichier, s'il est
  // ouvert, accepte ou range lui-même (son texte et sa copie des notes
  // restent justes) ; sinon le serveur écrit le fichier (POST /review/apply).
  const doKey = "atelier.reviewDo";
  const doneKey = "atelier.reviewDone";
  function askFileEditor(path: string, id: string, action: "accept" | "keep"): Promise<{ok: boolean; error?: string} | null> {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise(resolve => {
      const finish = (answer: {ok: boolean; error?: string} | null): void => {
        win.removeEventListener("storage", listen);
        win.clearTimeout(timer);
        resolve(answer);
      };
      const listen = (event: StorageEvent): void => {
        if (event.key !== doneKey || !event.newValue) return;
        try {
          const answer = JSON.parse(event.newValue) as {token?: string; ok?: boolean; error?: string};
          if (answer.token === token) finish({ok: answer.ok === true, error: answer.error});
        } catch { /* autre réponse */ }
      };
      const timer = win.setTimeout(() => finish(null), 1200);
      win.addEventListener("storage", listen);
      try { win.localStorage.setItem(doKey, JSON.stringify({path, id, action, token, at: Date.now()})); } catch { finish(null); }
    });
  }
  win.addEventListener("storage", event => {
    if (event.key !== doKey || !event.newValue || !loaded) return;
    let wanted: {path?: string; id?: string; action?: string; token?: string; at?: number} | null = null;
    try { wanted = JSON.parse(event.newValue); } catch { return; }
    if (!wanted?.token || wanted.path !== options.path || Date.now() - (wanted.at || 0) > 5000) return;
    const annotation = all.find(a => a.id === wanted?.id && isEdit(a));
    if (!annotation) return;
    const error = wanted.action === "accept" ? acceptReviewer(annotation.id) : (keepText(annotation), "");
    try { win.localStorage.setItem(doneKey, JSON.stringify({token: wanted.token, ok: !error, error})); } catch { /* sans réponse : le serveur s'en charge */ }
  });
  /** « Accepter » ou « Refuser » une de ses retouches depuis la barre du chat. */
  async function decideEdit(file: string, id: string, action: "accept" | "keep"): Promise<string> {
    if (file === options.path && all.some(a => a.id === id)) {
      const annotation = all.find(a => a.id === id)!;
      return action === "accept" ? acceptReviewer(id) : (keepText(annotation), "");
    }
    const answer = await askFileEditor(file, id, action);
    if (answer) { await loadReviewStatus(); buildPanel(); return answer.ok ? "" : answer.error || "Refusé par l’éditeur du fichier."; }
    try {
      const response = action === "accept"
        ? await win.fetch("/review/apply", {method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({path: options.path, file, id})})
        : await win.fetch("/review/state", {method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({path: options.path, file, id, state: "done", refused: true})});
      const payload = await response.json().catch(() => ({})) as {ok?: boolean; error?: string};
      await loadReviewStatus();
      buildPanel();
      return response.ok && payload.ok ? "" : payload.error || `HTTP ${response.status}`;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  win.addEventListener("message", event => {
    const data = event.data as {type?: string; nonce?: string; action?: string; id?: string; file?: string; mode?: string} | null;
    if (data?.type !== "atelier-review-action" || event.source !== win.top || win.top === win) return;
    if (!data.nonce || data.nonce !== ((win as Window & {__atelierNonce?: string}).__atelierNonce || win.sessionStorage.getItem("atelier_nonce"))) return;
    const id = String(data.id || "");
    const file = String(data.file || "");
    const mode: ReviewMode = data.mode === "likely" ? "likely" : data.mode === "edit" ? "edit" : "open";
    void (async () => {
      if (data.action === "start") { await discussInChat({mode}); return; }
      if (!id || !file) return;
      if (data.action === "done" || data.action === "agenda") await writeReviewState(file, id, {state: data.action});
      if (data.action === "accept" || data.action === "refuse") {
        const error = await decideEdit(file, id, data.action === "accept" ? "accept" : "keep");
        if (error) {
          options.postToHost({type: "atelier-review-comment", text: "", review: {doc: options.path, mode, error}});
          return;
        }
      }
      await discussInChat({after: id, mode});
    })();
  });
  const reviewStatusUrl = (): string => `/review/status?path=${encodeURIComponent(options.path)}`;
  async function loadReviewStatus(): Promise<void> {
    try {
      const response = await win.fetch(reviewStatusUrl());
      if (!response.ok) return;
      const payload = await response.json() as ReviewStatus & {ok?: boolean};
      if (!Array.isArray(payload.notes)) return;
      const had = Boolean(reviewStatus?.rounds.length);
      reviewStatus = payload;
      if (options.panel.classList.contains("open") || (!had && payload.rounds.length && reviewerNotes().length)) buildPanel();
    } catch { /* l'avancement n'est qu'un résumé */ }
  }
  /** « Importer son retour (.docx)… » : le fichier choisi part au serveur,
   *  qui pose ses commentaires dans le store ; le panneau montre le bilan. */
  async function importReview(file: File): Promise<void> {
    togglePanel(true);
    report = {html: '<div class="texv-report-head"><span class="texr-spin"></span><span>Lecture du retour…</span></div>'};
    buildPanel();
    try {
      const bytes = await file.arrayBuffer();
      const response = await win.fetch(`/review/import?path=${encodeURIComponent(options.path)}&name=${encodeURIComponent(file.name)}`,
        {method: "POST", headers: {"Content-Type": "application/octet-stream"}, body: bytes});
      const payload = await response.json() as ImportReport & {ok?: boolean; error?: string};
      if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      report = {html: importReportHtml(payload, file.name)};
      await refreshFromStore();
      await loadReviewStatus();
      if (reviewerNotes().length || reviewStatus?.notes.length) { filter = "reviewer"; reviewFilter = "todo"; editFilter = ""; }
    } catch (error) {
      report = {html: `<div class="texv-report-head">${roundIcons.close}<span>Import impossible</span></div>`
        + `<div class="tp-error" role="status">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`
        + '<div class="texv-report-acts"><button type="button" class="texr-ghost texv-report-close">Fermer</button></div>'};
    }
    buildPanel();
  }
  const reviewInput = doc.createElement("input");
  reviewInput.type = "file";
  reviewInput.accept = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  reviewInput.hidden = true;
  reviewInput.addEventListener("change", () => {
    const file = reviewInput.files?.[0];
    reviewInput.value = "";
    if (file) void importReview(file);
  });
  doc.body.appendChild(reviewInput);
  doc.addEventListener("atelier-review-import", () => reviewInput.click());

  const nextNumber = (): number => 1 + Math.max(0, ...all.map(a => a.number || 0));

  const remark = (annotation: LatexAnnotation): void => { clearMark(annotation.id); mark(annotation); };
  // La position « k sur N » change pour toutes les propositions.
  // Seules les propositions la portent : un bloc de question garde son champ.
  const remarkRound = (): void => { for (const a of pending()) if (a.rstate === "prop") remark(a); };

  const loadHistory = async (): Promise<void> => {
    try {
      const response = await win.fetch(`/pdfannot?rel=${encodeURIComponent(roundsRel)}`);
      if (!response.ok) return;
      const payload = await response.json() as {annots?: RoundRecord[]};
      if (!Array.isArray(payload.annots)) return;
      history = payload.annots;
      history.forEach(record => historyKnown.add(String(record.id)));
    } catch { /* l'historique n'est qu'un résumé */ }
  };
  const saveHistory = async (): Promise<void> => {
    const sent = history.slice(-400);
    try {
      const response = await win.fetch("/pdfannot", {method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({rel: roundsRel, annots: sent, known: [...historyKnown]})});
      if (response.ok) sent.forEach(record => historyKnown.add(String(record.id)));
    } catch { /* gardé en mémoire, réécrit à la prochaine décision */ }
  };

  const post = (text: string): void => options.postToHost({type: "atelier-add-to-chat", direct: true, text});
  const poll = (): void => {
    if (pollTimer !== null) return;
    pollTimer = win.setInterval(() => { void fetchReplies(); }, 2000);
    void fetchReplies();
  };
  const stopPolling = (): void => { if (pollTimer !== null) win.clearInterval(pollTimer); pollTimer = null; };
  const fetchReplies = async (): Promise<void> => {
    const round = currentRound();
    if (!round || !ownNotes().some(a => a.rstate === "busy")) { stopPolling(); return; }
    let stored: StoredRevisions | null = null;
    try {
      const response = await win.fetch(`/texrevisions?path=${encodeURIComponent(options.path)}`);
      if (!response.ok) return;
      stored = ((await response.json()) as {revisions?: StoredRevisions}).revisions || null;
    } catch { return; }
    const fresh = freshReplies(stored, round.id, id => all.find(a => a.id === id)?.reply?.seq || 0);
    const answered: LatexAnnotation[] = [];
    for (const {id, reply} of fresh) {
      const annotation = all.find(a => a.id === id && a.round?.id === round.id);
      if (!annotation) continue;
      annotation.reply = reply;
      annotation.rstate = reply.kind === "propose" ? "prop" : "ask";
      answered.push(annotation);
    }
    if (!answered.length) return;
    if (!activeId || !pending().some(a => a.id === activeId && a.rstate === "prop")) activeId = firstProposal();
    remarkRound();
    for (const a of answered) if (a.rstate === "ask") remark(a);
    void save();
    buildPanel();
  };

  const startRound = (): void => {
    const open = ownNotes().filter(a => !a.round || a.rstate === undefined);
    if (!open.length) return;
    const previous = Math.max(0, ...history.map(record => record.n || 0), ...ownNotes().map(a => a.round?.n || 0));
    const round: RoundRef = {id: newRoundId(), n: previous + 1};
    // Une ronde à la fois : les notes encore en attente d'une ronde
    // précédente y entrent aussi.
    const members = ownNotes();
    for (const annotation of members) {
      annotation.round = round;
      if (annotation.rstate !== "prop" && annotation.rstate !== "ask") annotation.rstate = "busy";
      if (annotation.rstate === "busy") delete annotation.reply;
      // Les numéros de réponse repartent de 1 avec la nouvelle ronde.
      else if (annotation.reply) annotation.reply.seq = 0;
    }
    const asked = members.filter(a => a.rstate === "busy");
    roundError = "";
    void save().then(saved => {
      if (!saved) { roundError = "Notes non enregistrées : la ronde n'est pas partie."; buildPanel(); return; }
      post(roundRequest(options.path, round, asked, sectionsFor(asked)));
      for (const annotation of asked) remark(annotation);
      buildPanel();
      poll();
    });
    buildPanel();
  };
  const cancelRound = (): void => {
    for (const annotation of ownNotes()) {
      if (annotation.rstate !== "busy") continue;
      delete annotation.round; delete annotation.rstate; delete annotation.reply;
      remark(annotation);
    }
    stopPolling();
    void save();
    buildPanel();
  };
  /** Redemander, ou répondre à la question de l'agent. */
  function ask(id: string, kind: "again" | "answer", words: string): void {
    const annotation = all.find(a => a.id === id);
    if (!annotation?.round) return;
    annotation.rstate = "busy";
    post(followUp(options.path, annotation.round, {...annotation, number: numberOf(annotation)}, kind, words));
    if (activeId === id) activeId = firstProposal();
    remark(annotation);
    remarkRound();
    void save();
    buildPanel();
    poll();
  }
  /** Accepter remplace le passage, et lui seul ; Rejeter le garde. */
  function decide(id: string, decision: "acc" | "rej"): void {
    const annotation = all.find(a => a.id === id);
    const activeEditor = editor();
    if (!annotation?.round || !annotation.reply || annotation.rstate !== "prop" || !activeEditor || saving) return;
    const range = marks[id]?.find() || findAnnotationRange(activeEditor.getValue(), annotation, activeEditor);
    if (decision === "acc") {
      if (!range || activeEditor.getRange(range.from, range.to) !== annotation.text) {
        roundError = "Le passage a changé depuis la proposition : redemande-la.";
        buildPanel();
        return;
      }
    }
    const next = (() => {
      const list = pending().filter(a => a.rstate === "prop");
      const index = list.findIndex(a => a.id === id);
      return list[index + 1] || list[index - 1] || null;
    })();
    clearMark(id);
    all = all.filter(a => a.id !== id);
    if (decision === "acc" && range) activeEditor.replaceRange(annotation.reply.text || "", range.from, range.to, "+revision");
    history.push({id: annotation.id, round: annotation.round.id, n: annotation.round.n, number: numberOf(annotation),
      comment: annotation.comment, text: annotation.text, decision,
      proposal: decision === "acc" ? annotation.reply.text : undefined, at: Date.now()});
    roundError = "";
    activeId = next?.id || firstProposal();
    refreshNumbers();
    remarkRound();
    void save();
    void saveHistory();
    buildPanel();
    if (activeId) reveal(activeId);
  }
  function move(step: 1 | -1, from?: string): void {
    const list = pending().filter(a => a.rstate === "prop");
    if (!list.length) return;
    const index = list.findIndex(a => a.id === (from || activeId));
    const target = list[(index + step + list.length) % list.length];
    if (!target) return;
    activeId = target.id;
    remarkRound();
    buildPanel();
    reveal(target.id);
  }
  function reveal(id: string): void {
    const annotation = all.find(a => a.id === id);
    const activeEditor = editor();
    if (!annotation || !activeEditor) return;
    options.revealSource?.();
    activeEditor.scrollIntoView({from: annotation.from, to: {line: Math.min(annotation.to.line + 6, activeEditor.lineCount() - 1), ch: 0}}, 80);
  }
  // ⌘↩ : accepter la proposition active, d'où que vienne le focus.
  doc.addEventListener("keydown", event => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
    const target = activeId ? all.find(a => a.id === activeId && a.rstate === "prop") : null;
    const agentTarget = activeId ? all.find(a => a.id === activeId && isAgentNote(a) && currentSuggestion(a)) : null;
    const reviewerTarget = activeId ? all.find(a => a.id === activeId && isReviewerNote(a) && reviewState(a) !== "done" && reviewerSuggestion(a)) : null;
    if (!target && !agentTarget && !reviewerTarget) return;
    event.preventDefault();
    event.stopPropagation();
    if (target) decide(target.id, "acc");
    else if (agentTarget) acceptAgent(agentTarget.id);
    else if (reviewerTarget) acceptReviewer(reviewerTarget.id);
  }, true);


  // ---- Notes du PDF compilé (variante B) ----------------------------------
  // Lues dans le store du PDF, situées dans la source par SyncTeX puis par leur
  // texte, et mêlées aux notes du .tex. Leur état de ronde vit dans
  // `tex-pdfnotes:<chemin>` ; leur texte et leur teinte restent ceux du PDF.
  const pdfStateRel = `tex-pdfnotes:${options.path}`;
  let pdfRel: string | null = null;
  let pdfRaw: StoredPdfAnnotation[] = [];
  let pdfStamp = 0;
  let pdfLoading: Promise<void> | null = null;
  const pdfLines = new Map<string, number | null>();
  const pdfStateKnown = new Set<string>();
  let pdfStates: Record<string, Pick<LatexAnnotation, "round" | "rstate" | "reply">> = {};
  let pdfStatesLoaded = false;
  /** Notes du PDF présentes ici, et ce qu'on en a écrit en dernier. */
  const pdfPresent = new Map<string, {id: string; rel: string; comment: string; color: string}>();
  /** Page et hauteur SyncTeX des notes du .tex (colonne, couche du PDF). */
  const pages = new Map<string, number>();
  const texViews = new Map<string, {line: number; page: number; y: number} | null>();
  const pdfColor = (name: string): string =>
    (pdfAnnotationColors.find(color => color.name === (name === "purple" ? "violet" : name)) || pdfAnnotationColors[0]!).value;
  const fetchJson = async <T,>(url: string): Promise<T | null> => {
    try {
      const response = await win.fetch(url);
      return response.ok ? await response.json() as T : null;
    } catch { return null; }
  };
  const postStore = async (body: Record<string, unknown>): Promise<boolean> => {
    try {
      const response = await win.fetch("/pdfannot", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
      return response.ok;
    } catch { return false; }
  };
  const loadPdfStates = async (): Promise<void> => {
    if (pdfStatesLoaded) return;
    const payload = await fetchJson<{annots?: Array<{id: string} & Pick<LatexAnnotation, "round" | "rstate" | "reply">>}>(`/pdfannot?rel=${encodeURIComponent(pdfStateRel)}`);
    if (!payload) return;
    pdfStatesLoaded = true;
    pdfStates = {};
    for (const entry of payload.annots || []) {
      pdfStateKnown.add(String(entry.id));
      pdfStates[String(entry.id)] = {round: entry.round, rstate: entry.rstate, reply: entry.reply};
    }
  };
  /** Côté PDF d'une écriture : état de ronde, note retirée, texte ou teinte
   *  changés depuis l'éditeur. Une note du PDF ne s'écrit jamais en entier :
   *  seule l'entrée touchée part (`known` = elle seule), le store garde le reste. */
  async function syncPdfSide(): Promise<boolean> {
    if (!pdfPresent.size && !pdfStateKnown.size) return true;
    let ok = true;
    for (const [virtualId, ref] of [...pdfPresent]) {
      const annotation = all.find(a => a.id === virtualId);
      if (!annotation) {
        // décidée, rejetée ou supprimée ici : elle quitte aussi le PDF
        pdfPresent.delete(virtualId);
        pdfRaw = pdfRaw.filter(raw => String(raw.id) !== ref.id);
        ok = (await postStore({rel: ref.rel, removeIds: [ref.id]})) && ok;
        continue;
      }
      const color = noteColorName(annotation.color);
      if (annotation.comment === ref.comment && color === ref.color) continue;
      const fresh = await fetchJson<{annots?: StoredPdfAnnotation[]}>(`/pdfannot?rel=${encodeURIComponent(ref.rel)}`);
      const stored = fresh?.annots?.find(raw => String(raw.id) === ref.id);
      if (!stored) continue;
      const next: StoredPdfAnnotation = {...stored, color: pdfColor(color)};
      if (stored.kind === "comment") next.note = annotation.comment; else next.memo = annotation.comment;
      if (await postStore({rel: ref.rel, annots: [next], known: [ref.id]})) {
        ref.comment = annotation.comment; ref.color = color;
        pdfRaw = pdfRaw.map(raw => String(raw.id) === ref.id ? next : raw);
      } else ok = false;
    }
    const states = all.filter(a => a.src === "pdf" && a.round && a.rstate)
      .map(a => ({id: a.id, round: a.round, rstate: a.rstate, reply: a.reply}));
    if (states.length || pdfStateKnown.size) {
      if (await postStore({rel: pdfStateRel, annots: states, known: [...pdfStateKnown]})) {
        pdfStateKnown.clear();
        states.forEach(state => pdfStateKnown.add(state.id));
      } else ok = false;
    }
    return ok;
  }
  const loadPdfNotes = (fresh = false): Promise<void> => {
    if (fresh) { pdfLines.clear(); texViews.clear(); }
    pdfLoading ??= readPdfNotes().finally(() => { pdfLoading = null; });
    return pdfLoading;
  };
  async function readPdfNotes(): Promise<void> {
    const source = options.pdfNotes;
    const activeEditor = editor();
    if (!source || !activeEditor || !loaded) return;
    const rel = await source.pdfRel().catch(() => null);
    pdfRel = rel;
    if (!rel) { replacePdfNotes([]); return; }
    const stampBefore = await readStamp(rel);
    const payload = await fetchJson<{annots?: StoredPdfAnnotation[]}>(`/pdfannot?rel=${encodeURIComponent(rel)}`);
    if (!payload || !Array.isArray(payload.annots)) return;
    if (stampBefore) pdfStamp = stampBefore;
    pdfRaw = payload.annots;
    await loadPdfStates();
    const text = activeEditor.getValue();
    const next: LatexAnnotation[] = [];
    for (const raw of pdfRaw.filter(isPdfNote)) {
      const page = Number(raw.page) || 1;
      const rect = raw.rects![0]!;
      const key = `${raw.id}|${page}|${rect.join(",")}`;
      let line = pdfLines.get(key);
      if (line === undefined) {
        line = await source.sourceLine(page, (rect[0] || 0) + (rect[2] || 0) / 2, (rect[1] || 0) + (rect[3] || 0) / 2).catch(() => null);
        pdfLines.set(key, line);
      }
      const id = pdfNoteId(raw.id);
      const anchor = anchorPdfQuote(text, String(raw.text || ""), line === null ? null : line - 1);
      if (!anchor && source.ownsWholePdf && !source.ownsWholePdf()) continue;
      const state = pdfStates[id] || {};
      next.push({
        id, src: "pdf", kind: "comment",
        pdf: {id: String(raw.id), rel, page, quote: String(raw.text || ""), rects: raw.rects!, kind: raw.kind || "hl"},
        from: anchor ? anchor.from : {line: 0, ch: 0}, to: anchor ? anchor.to : {line: 0, ch: 0},
        text: anchor ? anchor.text : "", loose: !anchor || undefined,
        comment: pdfNoteText(raw), color: noteColorName(raw.color),
        by: raw.by, author: raw.author, thread: raw.thread as ThreadMessage[] | undefined,
        ...state,
      });
    }
    replacePdfNotes(next);
  }
  function replacePdfNotes(next: LatexAnnotation[]): void {
    const nextIds = new Set(next.map(a => a.id));
    let changed = false;
    for (const gone of all.filter(a => a.src === "pdf" && !nextIds.has(a.id))) {
      clearMark(gone.id);
      pdfPresent.delete(gone.id);
      changed = true;
    }
    all = all.filter(a => a.src !== "pdf" || nextIds.has(a.id));
    for (const incoming of next) {
      const local = all.find(a => a.id === incoming.id);
      pdfPresent.set(incoming.id, {id: incoming.pdf!.id, rel: incoming.pdf!.rel, comment: incoming.comment, color: noteColorName(incoming.color)});
      if (!local) {
        all.push(incoming);
        changed = true;
        continue;
      }
      // déjà ici : la source a pu bouger depuis, on garde son ancrage
      if (local.comment !== incoming.comment || local.color !== incoming.color || local.loose !== incoming.loose) changed = true;
      Object.assign(local, {comment: incoming.comment, color: incoming.color, pdf: incoming.pdf, by: incoming.by, author: incoming.author});
      if (local.loose && !incoming.loose) Object.assign(local, {from: incoming.from, to: incoming.to, text: incoming.text, loose: undefined});
    }
    if (!changed) return;
    renumber();
    for (const annotation of all) if (annotation.kind !== "hl") remark(annotation);
    options.onMutated?.();
    options.onNotesChanged?.();
    if (options.panel.classList.contains("open")) buildPanel();
    void locateTexNotes();
  }
  /** Page SyncTeX de chaque note du .tex : « p. 3 » dans la colonne, et
   *  l'endroit où la couche du PDF cherche son passage. */
  let locating = false;
  async function locateTexNotes(): Promise<void> {
    const source = options.pdfNotes;
    if (!source || locating || !pdfRel) return;
    locating = true;
    let found = false;
    try {
      for (const annotation of notes()) {
        if (annotation.src === "pdf") { pages.set(annotation.id, annotation.pdf!.page); continue; }
        const known = texViews.get(annotation.id);
        if (known !== undefined && known?.line === annotation.from.line) continue;
        const view = await source.sourceView(annotation.from.line + 1).catch(() => null);
        texViews.set(annotation.id, view ? {line: annotation.from.line, ...view} : null);
        if (view) { pages.set(annotation.id, view.page); found = true; }
      }
    } finally { locating = false; }
    if (!found) return;
    options.onNotesChanged?.();
    if (options.panel.classList.contains("open")) buildPanel();
  }
  const checkPdfStore = async (): Promise<void> => {
    if (!pdfRel) return;
    const stamp = await readStamp(pdfRel);
    if (!stamp || stamp === pdfStamp) return;
    pdfStamp = stamp;
    await loadPdfNotes();
  };
  // « Réviser avec l'agent » posé depuis l'onglet PDF (annotation_notes.ts).
  const pendingReview = (): boolean => {
    try {
      const key = reviewRequestKey(options.path);
      const at = Number(win.localStorage.getItem(key)) || 0;
      if (!at) return false;
      win.localStorage.removeItem(key);
      return Date.now() - at < 120000;
    } catch { return false; }
  };

  const reviewIconFlag = reviewIcons.flag;
  // ---- Ses commentaires dans les autres fichiers du document -------------
  // Le panneau les liste tous, fichier par fichier ; un clic ouvre le .tex où
  // est son passage, et l'éditeur de ce fichier ouvre le commentaire.
  const elsewhereKind = (n: ReviewStatusNote): boolean => kindFilter === "all" || (n.kind || "remark") === kindFilter;
  const elsewhereIn = (n: ReviewStatusNote, state: ReviewState | "likely" | "all"): boolean => state === "all"
    || (state === "likely" ? n.state === "todo" && Boolean(n.likely) : state === "todo" ? n.state === "todo" && !n.likely : n.state === state);
  // `latex: ""` : le résumé ne porte pas sa phrase, seulement qu'elle s'applique.
  const asReviewer = (n: ReviewStatusNote): ReviewerFields => ({text: n.text || "", comment: n.comment || "",
    review: {state: n.state, kind: n.kind, fit: n.fit, ...(n.likely ? {likely: {settled: true}} : {}), ...(n.chat ? {chatAt: 1} : {}),
      ...(n.kind === "edit" ? {edit: {status: n.edit as "apply" | "changed" | "done", latex: n.edit === "apply" ? "" : null},
        refused: n.refused ? 1 : 0, accepted: n.accepted ? 1 : 0} : {})}} as ReviewerFields);
  /** Sort d'une de ses retouches dans « Ses modifications ». */
  const editSort = (state: ReviewState, status: string | undefined, refused: boolean): "apply" | "changed" | "done" =>
    state === "done" ? "done" : status === "apply" && !refused ? "apply" : "changed";
  const localSort = (a: LatexAnnotation): "apply" | "changed" | "done" =>
    editSort(reviewState(a), a.review?.edit?.status, Boolean(a.review?.refused));
  const elsewhereSort = (n: ReviewStatusNote): "apply" | "changed" | "done" => editSort(n.state, n.edit, Boolean(n.refused));
  const fileLabel = (path: string): string => path.split(/[\\/]/).pop() || path;
  /** `elsewhere` : déjà filtrées (commentaires ou retouches). */
  function reviewerFiles(local: string, elsewhere: ReviewStatusNote[]): string {
    const order = reviewStatus?.rounds.at(-1)?.files || [];
    const paths = [...new Set([...order, options.path, ...elsewhere.map(n => n.path)])];
    const head = (path: string): string => `<div class="tp-sec tp-sec-file">${escapeHtml(fileLabel(path))}${path === options.path ? '<span class="tp-sec-here">ouvert</span>' : ""}</div>`;
    return paths.map(path => {
      if (path === options.path) return local ? head(path) + local : "";
      const rows = elsewhere.filter(n => n.path === path).sort((a, b) => (a.line || 0) - (b.line || 0));
      if (!rows.length) return "";
      return head(path) + rows.map((n, index) => columnItemHtml({
        id: n.id, number: n.number || index + 1, color: noteColorName(undefined), quote: "", note: n.comment || "",
        line: n.line ?? null, lineEnd: null, state: reviewerState(asReviewer(n)), src: "tex", reviewer: true, removable: false, path: n.path,
      })).join("");
    }).join("");
  }
  const focusKey = "atelier.reviewFocus";
  /** Ouvre le fichier d'un commentaire et demande à son éditeur de l'ouvrir. */
  function openReviewerElsewhere(path: string, id: string, line?: number): void {
    try { win.localStorage.setItem(focusKey, JSON.stringify({path, id, at: Date.now()})); } catch { /* l'éditeur s'ouvrira à la ligne */ }
    options.postToHost({type: "atelier-open-file", path, line: Math.max(1, line || 1)});
  }
  /** Un autre éditeur a demandé d'ouvrir un commentaire de ce fichier. */
  function takeReviewerFocus(): void {
    let wanted: {path?: string; id?: string; at?: number} | null = null;
    try { wanted = JSON.parse(win.localStorage.getItem(focusKey) || "null"); } catch { return; }
    if (!wanted?.id || wanted.path !== options.path || Date.now() - (wanted.at || 0) > 120000) return;
    const annotation = all.find(a => a.id === wanted?.id && isReviewerNote(a));
    if (!annotation) return;
    try { win.localStorage.removeItem(focusKey); } catch { /* lu une fois */ }
    filter = "reviewer";
    if (isEdit(annotation)) editFilter = localSort(annotation);
    else {
      editFilter = "";
      const shown = reviewFilter === "all" || (reviewFilter === "likely" ? likelySettled(annotation)
        : reviewFilter === "todo" ? reviewState(annotation) === "todo" && !likelySettled(annotation) : reviewState(annotation) === reviewFilter);
      if (!shown) reviewFilter = "all";
    }
    togglePanel(true);
    activateReviewer(annotation.id);
    reveal(annotation.id);
  }
  win.addEventListener("storage", event => { if (event.key === focusKey && loaded) takeReviewerFocus(); });
  const buildPanel = (): void => {
    const everything = notes();
    const fromAgent = everything.filter(a => isAgentNote(a));
    const fromAll = everything.filter(a => isReviewerNote(a));
    const fromReviewer = fromAll.filter(a => !isEdit(a));
    const fromEdits = fromAll.filter(a => isEdit(a));
    const agentName = fromAgent[0] ? authorOf(fromAgent[0]) : "Claude";
    const elsewhereAll = (reviewStatus?.notes || []).filter(n => n.path !== options.path);
    const elsewhere = elsewhereAll.filter(n => n.kind !== "edit");
    const elsewhereEdits = elsewhereAll.filter(n => n.kind === "edit");
    const hasReview = fromAll.length > 0 || elsewhereAll.length > 0;
    const editTotal = fromEdits.length + elsewhereEdits.length;
    if (!editTotal) editFilter = "";
    const reviewName = reviewerName(fromAll[0] || {author: reviewStatus?.notes[0]?.author});
    if (filter === "agent" && !fromAgent.length) filter = "all";
    if (filter === "reviewer" && !hasReview) filter = "all";
    const kindOk = (a: LatexAnnotation): boolean => kindFilter === "all" || (a.review?.kind || "remark") === kindFilter;
    // « À faire » laisse de côté ce que Claude juge déjà réglé (son filtre à lui).
    const inReviewFilter = (a: LatexAnnotation): boolean => reviewFilter === "all"
      || (reviewFilter === "likely" ? likelySettled(a) : reviewFilter === "todo" ? reviewState(a) === "todo" && !likelySettled(a) : reviewState(a) === reviewFilter);
    const items = filter === "mine" ? everything.filter(a => !isAgentNote(a) && !isReviewerNote(a))
      : filter === "agent" ? fromAgent
        : filter === "reviewer" ? (editFilter ? fromEdits.filter(a => localSort(a) === editFilter) : fromReviewer.filter(a => inReviewFilter(a) && kindOk(a)))
          : everything;
    const round = currentRound();
    const roundItems = everything.filter(a => a.round);
    const toReview = roundItems.filter(a => a.rstate === "prop" || a.rstate === "ask").length;
    const busy = roundItems.filter(a => a.rstate === "busy").length;
    const fresh = ownNotes().filter(a => !a.round);
    const title = round ? `Ronde ${round.n}` : "Annotations";
    const sub = round
      ? [`${roundItems.length} note${roundItems.length > 1 ? "s" : ""}`, toReview ? `${toReview} à revoir` : ""].filter(Boolean).join(" · ")
      : [everything.length ? `${everything.length} note${everything.length > 1 ? "s" : ""}` : "",
        fromAgent.length ? `${fromAgent.length} de ${agentName}` : "",
        fromReviewer.length ? `${fromReviewer.length} de ${reviewName}` : ""].filter(Boolean).join(" · ");
    const choices: Array<[string, string]> = [["all", "Toutes"], ["mine", "Les miennes"]];
    if (fromAgent.length) choices.push(["agent", agentName]);
    if (hasReview) choices.push(["reviewer", reviewName]);
    const filters = choices.length > 2
      ? '<div class="tp-filter" role="group" aria-label="Filtrer les notes">' + choices
        .map(([key, label]) => `<button type="button" class="tp-seg${filter === key ? " on" : ""}" data-filter="${key}" aria-pressed="${filter === key}">${escapeHtml(label)}</button>`).join("") + "</div>"
      : "";
    let review = "";
    if (filter === "reviewer") {
      const count = (state: ReviewState | "likely"): number => fromReviewer.filter(a => kindOk(a)
        && (state === "likely" ? likelySettled(a) : state === "todo" ? reviewState(a) === "todo" && !likelySettled(a) : reviewState(a) === state)).length
        + elsewhere.filter(n => elsewhereKind(n) && elsewhereIn(n, state)).length;
      const likelyHere = count("likely");
      const chip = (attr: string, key: string, label: string, on: boolean): string =>
        `<button type="button" class="tp-chip${on ? " on" : ""}" data-${attr}="${key}" aria-pressed="${on}">${escapeHtml(label)}</button>`;
      const questions = fromReviewer.filter(a => a.review?.kind === "question").length
        + elsewhere.filter(n => n.kind === "question").length;
      const reviewTotal = fromReviewer.length + elsewhere.length;
      const sortCount = (sort: "apply" | "changed" | "done"): number =>
        fromEdits.filter(a => localSort(a) === sort).length + elsewhereEdits.filter(n => elsewhereSort(n) === sort).length;
      const editRow = (sort: "apply" | "changed" | "done", icon: string, label: string): string =>
        `<button type="button" class="tp-edit-row tone-${sort}${editFilter === sort ? " on" : ""}" data-edits="${sort}" aria-pressed="${editFilter === sort}">`
        + `<span class="tp-ic">${icon}</span><span class="tp-edit-l">${escapeHtml(label)}</span><span class="tp-edit-n">${sortCount(sort)}</span></button>`;
      const openEdits = sortCount("apply") + sortCount("changed");
      const edits = editTotal
        ? `<div class="tp-edits"><div class="tp-review-top"><span>Ses modifications</span><span class="tp-review-n">${sortCount("done")} sur ${editTotal} phrases</span></div>`
          + '<div class="tp-edit-rows" role="group" aria-label="Ses modifications">'
          + editRow("apply", reviewIcons.edit, "S’appliquent telles quelles")
          + editRow("changed", reviewIcons.warn, "Ton texte a changé depuis")
          + editRow("done", roundIcons.check, "Déjà dans ton texte") + "</div>"
          + (openEdits ? `<button type="button" class="tp-edit-row tp-edit-walk">${reviewIcons.talk}<span class="tp-edit-l">Les passer en revue une par une dans le chat</span></button>` : "")
          + "</div>"
        : "";
      review = (reviewStatus?.rounds.length ? progressHtml(reviewStatus, reviewName) : "") + edits
        + (reviewTotal && !editFilter
          ? '<div class="tp-chips" role="group" aria-label="État">'
            + chip("rstate", "todo", `À faire · ${count("todo")}`, reviewFilter === "todo")
            + (likelyHere ? chip("rstate", "likely", `Sans doute réglés · ${likelyHere}`, reviewFilter === "likely") : "")
            + chip("rstate", "agenda", `À voir avec lui · ${count("agenda")}`, reviewFilter === "agenda")
            + chip("rstate", "done", `Réglés · ${count("done")}`, reviewFilter === "done")
            + chip("rstate", "all", "Tous", reviewFilter === "all") + "</div>"
            + '<div class="tp-chips" role="group" aria-label="Type">'
            + chip("kind", "all", "Tous les types", kindFilter === "all")
            + chip("kind", "question", `Questions · ${questions}`, kindFilter === "question")
            + chip("kind", "remark", `Remarques · ${reviewTotal - questions}`, kindFilter === "remark") + "</div>"
          : "");
    }
    const sections = sectionsFor(items);
    let lastSection = "";
    const list = items.map((annotation, index) => {
      const section = annotation.loose ? "Ailleurs dans le PDF" : sections[index] || "";
      const head = section !== lastSection ? (lastSection = section, `<div class="tp-sec">${escapeHtml(section)}</div>`) : "";
      const agent = isAgentNote(annotation);
      const reviewer = isReviewerNote(annotation);
      const inRound = Boolean(annotation.round && annotation.rstate);
      let state = agent && annotation.src !== "pdf" ? agentState(annotation) : inRound ? stateLabel(annotation.rstate || "note") : null;
      if (reviewer) {
        // Couleur seule (maquette v8) : le nom de l'état reste au survol.
        const changed = !isEdit(annotation) && annotation.review?.fit === "changed" && reviewState(annotation) === "todo" && !annotation.review?.chatAt
          && !likelySettled(annotation) && !reviewerSuggestion(annotation);
        state = {icon: "", label: changed ? fitNote(annotation) : reviewerState(annotation).label, tone: reviewerTone(annotation)};
      }
      const row: ColumnNote = {
        id: annotation.id, number: numberOf(annotation), color: noteColorName(annotation.color),
        quote: reviewer ? "" : annotation.pdf?.quote || annotation.text, note: annotation.comment || "",
        page: annotation.pdf?.page ?? pages.get(annotation.id) ?? null,
        line: annotation.loose ? null : annotation.from.line + 1,
        lineEnd: annotation.loose ? null : annotation.to.line + 1,
        agent: agent ? authorOf(annotation) : reviewer && filter !== "reviewer" ? reviewName : "",
        unread: (agent || reviewer) && hasUnread(annotation),
        active: activeId === annotation.id,
        state: state && (inRound || agent || reviewer) ? state : null, src: annotation.src === "pdf" ? "pdf" : "tex",
        reviewer, removable: !reviewer,
      };
      return head + columnItemHtml(row);
    }).join("");
    // Ses commentaires de tous les fichiers du document, fichier par fichier
    // dans l'ordre de lecture ; un clic ouvre le fichier sur le commentaire.
    const others = editFilter ? elsewhereEdits.filter(n => elsewhereSort(n) === editFilter)
      : elsewhere.filter(n => elsewhereKind(n) && elsewhereIn(n, reviewFilter));
    const grouped = filter === "reviewer" && (editFilter ? elsewhereEdits : elsewhere).length ? reviewerFiles(list, others) : "";
    const past = [...new Set(history.filter(record => record.n > 0).map(record => record.n))].sort((a, b) => b - a).slice(0, 3).map(n => {
      const records = history.filter(record => record.n === n);
      const accepted = records.filter(record => record.decision === "acc").length;
      const last = Math.max(...records.map(record => record.at || 0));
      return `<div class="tp-past">Ronde ${n} · ${accepted} acceptée${accepted > 1 ? "s" : ""} sur ${records.length}, ${since(last)}</div>`;
    }).join("");
    let foot = "";
    if (filter === "reviewer") {
      const points = reviewStatus ? reviewStatus.counts.agenda : fromReviewer.filter(a => reviewState(a) === "agenda").length;
      foot = `<button type="button" class="tp-link tp-agenda-open">${reviewIconFlag}Ordre du jour avec ${escapeHtml(reviewName)} · ${points} point${points > 1 ? "s" : ""}</button>`
        + '<button type="button" class="tp-link tp-import">Importer un autre retour…</button>';
    } else if (busy) {
      foot = `<div class="tp-work"><span class="texr-spin"></span><span>L’agent révise ${busy} note${busy > 1 ? "s" : ""}</span><span class="tp-gap"></span>`
        + '<button type="button" class="tp-link tp-cancel">Arrêter</button></div>';
    } else if (fresh.length) {
      foot = `<button type="button" class="tp-primary tp-review">Réviser avec l’agent</button>`;
    }
    const tools = filter !== "reviewer" && everything.some(a => !isReviewerNote(a)) && !busy
      ? '<div class="tp-tools"><button type="button" class="tp-link tp-sendall" title="Envoyer toutes les notes au chat, sans ronde">Envoyer au chat</button>'
        + '<button type="button" class="tp-link tp-delall" title="Supprimer toutes tes notes et celles de Claude">Tout supprimer</button></div>'
      : "";
    const empty = filter === "reviewer"
      ? `<div class="tp-empty">${editFilter ? "Aucune de ses modifications dans ce groupe."
        : fromReviewer.length || elsewhere.length ? "Aucun commentaire dans ce filtre." : `Aucun commentaire de ${escapeHtml(reviewName)} dans ce fichier.`}</div>`
      : '<div class="tp-empty">Sélectionne un passage puis « Annoter ». Tes notes s’ajoutent ici ; « Réviser avec l’agent » les lui envoie toutes ensemble.</div>';
    const body = agendaOpen && reviewStatus
      ? `<div class="tp-list">${agendaHtml(reviewStatus, reviewName)}</div>`
      : (report ? `<div class="texv-report-card">${report.html}</div>` : "") + review + `<div class="tp-list">${grouped || list || empty}</div>`;
    options.panel.innerHTML = `<div class="tp-head"><span class="tp-title">${title}</span><span class="tp-sub">${escapeHtml(sub)}</span><span class="tp-gap"></span>`
      + `<button type="button" class="tp-close" aria-label="Fermer le panneau" title="Fermer">${roundIcons.close}</button></div>`
      + filters
      + body
      + (roundError ? `<div class="tp-error" role="status">${escapeHtml(roundError)}</div>` : "")
      + (foot || tools || past ? `<div class="tp-foot">${foot}${tools}${past}</div>` : "");
    doc.body.classList.toggle("has-texc", everything.length > 0);
    syncReviewer();
  };
  const togglePanel = (force?: boolean): void => {
    if (deleteArmTimer !== null) win.clearTimeout(deleteArmTimer);
    deleteArmTimer = null;
    const open = force ?? !options.panel.classList.contains("open");
    options.panel.classList.toggle("open", open);
    if (open) buildPanel();
  };
  const remove = (id: string): void => {
    all = all.filter((annotation) => annotation.id !== id);
    clearMark(id);
    refreshNumbers();
    save();
    options.popover.style.display = "none";
    current = null;
  };
  const show = (annotation: LatexAnnotation, isNew: boolean, anchor?: {left:number;top:number;bottom:number}): void => {
    const activeEditor = editor();
    if (!activeEditor) return;
    noteUI.status.textContent="";
    openedAt = Date.now();
    textarea.value = annotation.comment || "";
    deleteButton.style.display = "";
    // Numéro qu'elle aura dans l'ordre du document, page (SyncTeX) et ligne.
    const number = isNew
      ? 1 + notes().filter(n => !n.loose && (n.from.line < annotation.from.line
        || (n.from.line === annotation.from.line && n.from.ch < annotation.from.ch))).length
      : numberOf(annotation);
    const page = annotation.pdf?.page ?? pages.get(annotation.id);
    noteUI.setHead({number, color: noteColorName(annotation.color), title: `Note ${number}`,
      meta: [page ? `p. ${page}` : "", annotation.loose ? "" : `ligne ${annotation.from.line + 1}`].filter(Boolean).join(" · "),
      quote: annotation.pdf?.quote || annotation.text});
    colorButtons.forEach((button) => button.classList.toggle("on", button.dataset.color === (annotation.color || "amber")));
    const coordinates = anchor || activeEditor.charCoords(annotation.to, "window");
    options.popover.style.display = "block";
    noteUI.fit(); // hauteur finale avant de placer la bulle
    const margin = 8;
    const width = options.popover.getBoundingClientRect().width;
    const maxLeft = Math.max(margin, win.innerWidth - width - margin);
    options.popover.style.left = `${Math.min(Math.max(margin, coordinates.left - width / 2), maxLeft)}px`;
    options.popover.style.top = `${Math.min(coordinates.bottom + 8, win.innerHeight - options.popover.offsetHeight - 8)}px`;
    noteUI.focus();
  };
  const open = (selection: LatexAnnotationSelection): void => {
    if(saving)return;
    current = {
      id: `c${Date.now()}`, from: {...selection.from}, to: {...selection.to},
      text: String(selection.text), comment: "", kind:"comment",
      number:1 + Math.max(0,...all.map(a=>a.number || 0)),
    };
    show(current, true, selection.anchor);
  };
  let saving = false;
  const persistCurrent = async (direct = false): Promise<void> => {
    if(!current || saving) return;
    const annotation=current;
    annotation.comment=textarea.value.trim();
    annotation.kind="comment";
    annotation.number ||= 1 + Math.max(0,...all.map(a=>a.number || 0));
    if(!all.some(a=>a.id===annotation.id)) all.push(annotation);
    clearMark(annotation.id);mark(annotation);refreshNumbers();
    saving=true;noteUI.busy(true);
    const saved=await save();
    saving=false;noteUI.busy(false);
    if(!saved) return;
    if (options.panel.classList.contains("open")) buildPanel();
    // Entrée garde la note pour la prochaine ronde ; seule la bulle « Envoyer
    // au chat » l'envoie tout de suite (le chat la retire en la consommant).
    if(direct) options.postToHost({type:"atelier-add-to-chat", direct,
      text:`${options.path} (L${annotation.from.line+1}-${annotation.to.line+1}) : « ${annotation.text} »\nCommentaire : ${annotation.comment || "(voir passage)"}`,
      pdfAnnotation:{rel:relation,id:annotation.id}});
    if(current===annotation){options.popover.style.display="none";current=null;}
  };
  // Quitter la fiche (Échap, clic à côté) garde une note changée, jamais au chat.
  const leave = (): void => {
    if(current && textarea.value.trim() && textarea.value.trim() !== (current.comment || "")) void persistCurrent();
    else {options.popover.style.display="none";current=null;}
  };
  textarea.onkeydown=event=>{
    event.stopPropagation();
    if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void persistCurrent();}
    // Échap enregistre ce qui a été écrit ; une note neuve restée vide s'en va.
    if(event.key==="Escape"){event.preventDefault();leave();}
  };
  chatButton.onclick=()=>{void persistCurrent();};
  deleteButton.onclick=async()=>{
    if(!current || saving) return;
    const annotation=current, index=all.findIndex(a=>a.id===annotation.id);
    all=all.filter(a=>a.id!==annotation.id);saving=true;noteUI.busy(true);
    const saved=await save();saving=false;noteUI.busy(false);
    if(!saved){if(index>=0)all.splice(index,0,annotation);options.onMutated?.();return;}
    clearMark(annotation.id);current=null;options.popover.style.display="none";refreshNumbers();buildPanel();
  };
  win.addEventListener("message",event=>{
    const data=event.data;
    if(event.source!==win.parent || data?.type!=="atelier-pdf-annotation-consumed" || data.rel!==relation ||
      data.nonce!==(win as Window & {__atelierNonce?:string}).__atelierNonce) return;
    all=all.filter(a=>a.id!==data.id);clearMark(data.id);refreshNumbers();
    if(current?.id===data.id){current=null;options.popover.style.display="none";}
    void save();buildPanel();
  });
  colorButtons.forEach((button) => {
    button.onclick = () => {
      if (!current) return;
      current.color = button.dataset.color;
      colorButtons.forEach((candidate) => candidate.classList.toggle("on", candidate === button));
      if (all.some((annotation) => annotation.id === current?.id)) {
        clearMark(current.id);
        mark(current);
        save();
      }
    };
  });
  doc.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const highlight = target?.closest(".texc-hl");
    if (highlight) {
      const annotation = all.find((item) => item.id === highlight.getAttribute("data-texc"));
      if (annotation && isAgentNote(annotation)) { activeId = annotation.id; markSeen(annotation.id); return; }
      if (annotation && isReviewerNote(annotation)) { if (activeId !== annotation.id) activateReviewer(annotation.id); return; }
      if (annotation && !saving) {
        current = annotation;
        show(annotation, false);
        return;
      }
    }
    // Clic ailleurs dans l'éditeur : la bulle du relecteur se referme.
    const reviewerOpen = activeId ? all.find(a => a.id === activeId && isReviewerNote(a)) : null;
    if (reviewerOpen && target && !target.closest(".texv-pop, .texv-mk") && editor()?.getWrapperElement().contains(target)) activateReviewer(null);
    if (Date.now() - openedAt < 350) return;
    if (target && !options.popover.contains(target) && !target.closest("#selPill") && current) leave();
  });
  options.button.onclick = () => togglePanel();
  options.panel.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (target?.closest(".tp-close")) { togglePanel(false); return; }
    // avant « .tp-review » : l'encart d'avancement porte aussi cette classe
    if (target?.closest(".tp-chat-review")) { void discussInChat({mode: "open"}); return; }
    if (target?.closest(".tp-likely-review")) { reviewFilter = "likely"; void discussInChat({mode: "likely"}); return; }
    if (target?.closest("button.tp-review")) { startRound(); return; }
    const seg = target?.closest<HTMLElement>(".tp-seg[data-filter]");
    if (seg) { filter = (seg.dataset.filter as typeof filter) || "all"; agendaOpen = false; buildPanel(); return; }
    if (target?.closest(".tp-edit-walk")) { void discussInChat({mode: "edit"}); return; }
    const editRow = target?.closest<HTMLElement>(".tp-edit-row[data-edits]");
    if (editRow) { const sort = editRow.dataset.edits as typeof editFilter; editFilter = editFilter === sort ? "" : sort; buildPanel(); return; }
    const stateSeg = target?.closest<HTMLElement>(".tp-chip[data-rstate]");
    if (stateSeg) { reviewFilter = (stateSeg.dataset.rstate as typeof reviewFilter) || "all"; buildPanel(); return; }
    const kindSeg = target?.closest<HTMLElement>(".tp-chip[data-kind]");
    if (kindSeg) { kindFilter = (kindSeg.dataset.kind as typeof kindFilter) || "all"; buildPanel(); return; }
    if (target?.closest(".tp-agenda-open")) { agendaOpen = true; void loadReviewStatus(); buildPanel(); return; }
    if (target?.closest(".tp-agenda-close")) { agendaOpen = false; buildPanel(); return; }
    if (target?.closest(".tp-agenda-copy") && reviewStatus) {
      const name = reviewerName(reviewerNotes()[0] || {author: reviewStatus.notes[0]?.author});
      void win.navigator.clipboard?.writeText(agendaText(reviewStatus, name)).then(() => {
        const copy = options.panel.querySelector<HTMLElement>(".tp-agenda-copy");
        if (copy) copy.textContent = "Copié";
      }).catch(() => undefined);
      return;
    }
    const point = target?.closest<HTMLElement>(".tp-agenda li[data-id]");
    if (point) {
      if (all.some(a => a.id === point.dataset.id)) { agendaOpen = false; activateReviewer(point.dataset.id || null); reveal(point.dataset.id || ""); }
      else options.postToHost({type: "atelier-open-file", path: point.dataset.path, line: Number(point.closest("li")?.querySelector(".tp-agenda-w")?.textContent?.match(/l\. (\d+)/)?.[1]) || 1});
      return;
    }
    if (target?.closest(".texv-report-close")) { report = null; buildPanel(); return; }
    if (target?.closest(".texv-report-show")) { report = null; filter = "reviewer"; reviewFilter = "todo"; editFilter = ""; buildPanel(); return; }
    if (target?.closest(".tp-import")) { reviewInput.click(); return; }
    if (target?.closest(".tp-triage") && reviewStatus) {
      const waiting = reviewStatus.notes.filter(n => n.kind !== "edit" && n.state === "todo" && n.fit === "changed" && !n.assessed);
      const name = reviewerName(reviewerNotes()[0] || {author: reviewStatus.notes[0]?.author});
      if (waiting.length) post(triageRequest(waiting, name));
      return;
    }
    const elsewhereItem = target?.closest<HTMLElement>(".tp-item[data-path]");
    if (elsewhereItem?.dataset.path && elsewhereItem.dataset.id) {
      const found = reviewStatus?.notes.find(n => n.id === elsewhereItem.dataset.id && n.path === elsewhereItem.dataset.path);
      openReviewerElsewhere(elsewhereItem.dataset.path, elsewhereItem.dataset.id, found?.line);
      return;
    }
    if (target?.closest(".tp-cancel")) { cancelRound(); return; }
    const removeButton = target?.closest<HTMLElement>(".tp-x");
    if (removeButton?.dataset.x) {
      remove(removeButton.dataset.x);
      buildPanel();
      return;
    }
    if (target?.closest(".tp-sendall")) {
      for(const annotation of ownNotes()) options.postToHost({
        type:"atelier-add-to-chat",text:`${options.path} (L${annotation.from.line+1}-${annotation.to.line+1}) : « ${annotation.text} »\nCommentaire : ${annotation.comment || "(voir passage)"}`,
        pdfAnnotation:{rel:relation,id:annotation.id}});
      togglePanel(false);
      return;
    }
    const deleteAll = target?.closest<HTMLElement>(".tp-delall");
    if (deleteAll) {
      if (deleteArmTimer !== null) {
        win.clearTimeout(deleteArmTimer);
        deleteArmTimer = null;
        // Ses commentaires restent : ils viennent de son .docx.
        for (const annotation of all) if (!isReviewerNote(annotation)) clearMark(annotation.id);
        all = all.filter(annotation => isReviewerNote(annotation));
        save();
        buildPanel();
      } else {
        deleteAll.textContent = "Confirmer ?";
        deleteArmTimer = win.setTimeout(() => {
          deleteArmTimer = null;
          buildPanel();
        }, 3000);
      }
      return;
    }
    const item = target?.closest<HTMLElement>(".tp-item[data-id]");
    const annotation = all.find((candidate) => candidate.id === item?.dataset.id);
    const activeEditor = editor();
    // Commentaire du relecteur : son bloc s'ouvre sous le passage.
    if (annotation && isReviewerNote(annotation)) {
      activateReviewer(annotation.id);
      reveal(annotation.id);
      return;
    }
    // Note de l'agent : son fil est sous le passage ; on y va, lu.
    if (annotation && isAgentNote(annotation)) {
      activeId = annotation.id;
      markSeen(annotation.id);
      reveal(annotation.id);
      buildPanel();
      return;
    }
    // Pendant une ronde, le panneau reste ouvert : on passe d'une note à l'autre.
    if (annotation?.round) {
      activeId = annotation.id;
      remarkRound();
      buildPanel();
      reveal(annotation.id);
      return;
    }
    if (annotation && activeEditor) {
      activeEditor.setCursor(annotation.from);
      activeEditor.scrollIntoView({from: annotation.from, to: annotation.to}, 80);
      activeEditor.focus();
      activeId = annotation.id;
      buildPanel();
    }
  });
  options.panel.addEventListener("keydown", (event) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(".tp-item[data-id]");
    if (!item || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    item.click();
  });
  // La colonne Annotations est fixe (variante B) : cliquer dans le texte ne la
  // ferme plus (Thierry 2026-11-09) ; seuls la croix et le bouton la ferment.

  /** Date du store (/pdfannot-stamp) à la dernière lecture : relecture en direct plus bas. */
  let storeStamp = 0;
  const load = async (): Promise<boolean> => {
    // date du store AVANT la lecture : une écriture de l'agent qui suit se verra
    const stampBefore = await readStamp();
    try {
      const response = await win.fetch(`/pdfannot?rel=${encodeURIComponent(relation)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as {annots?: LatexAnnotation[]};
      if (!Array.isArray(payload.annots)) throw new Error("réponse sans annots");
      const server = payload.annots;
      const serverIds = new Set(server.map((annotation) => String(annotation.id)));
      // posé ici avant la fin du chargement : gardé, il partira à la
      // prochaine écriture (jamais jeté, jamais à la place du stock)
      const localOnly = all.filter((annotation) => !serverIds.has(String(annotation.id)) && !knownIds.has(String(annotation.id)));
      for (const annotation of all) clearMark(annotation.id);
      all = [...server, ...localOnly];
      // Les notes de l'agent arrivent sans numéro : le suivant, une fois pour toutes.
      for (const annotation of all) if ((isAgentNote(annotation) || isReviewerNote(annotation)) && !annotation.number) annotation.number = nextNumber();
      serverIds.forEach((id) => knownIds.add(id));
      loaded = true;
      if (stampBefore) storeStamp = stampBefore;
    } catch {
      options.onError?.(LOAD_FAILED);
      return false;
    }
    await loadHistory();
    activeId = firstProposal();
    // hors du try : un ancrage qui échoue n'annule pas un chargement réussi
    try { anchorAll(); } catch { /* ancrage repris au prochain passage */ }
    options.onMutated?.();
    takeReviewerFocus();
    // Une ronde lancée avant un rechargement reprend où elle en était.
    if (all.some(a => a.rstate === "busy")) poll();
    if (currentRound()) togglePanel(true);
    options.onNotesChanged?.();
    void loadReviewStatus();
    void loadPdfNotes().then(() => {
      void locateTexNotes();
      if (pendingReview()) { togglePanel(true); startRound(); }
    });
    return true;
  };
  // ---- Relecture en direct : l'agent pose ou répond pendant que l'éditeur
  // est ouvert. Comme le lecteur PDF : la date du store (/pdfannot-stamp),
  // relue toutes les 2,5 s, puis fusion qui garde l'état local de Thierry.
  let watchTimer: number | null = null;
  const watch = (): void => {
    if (watchTimer !== null) return;
    watchTimer = win.setInterval(() => { void checkStore(); }, 2500);
  };
  async function readStamp(rel = relation): Promise<number> {
    try {
      const response = await win.fetch(`/pdfannot-stamp?rel=${encodeURIComponent(rel)}`);
      if (!response.ok) return 0;
      return Number(((await response.json()) as {stamp?: number}).stamp) || 0;
    } catch { return 0; }
  }
  const checkStore = async (): Promise<void> => {
    if (!loaded || doc.hidden) return;
    await checkPdfStore();
    const stamp = await readStamp();
    if (!stamp) return;
    if (!storeStamp) { storeStamp = stamp; return; }
    if (stamp === storeStamp) return;
    storeStamp = stamp;
    await refreshFromStore();
  };
  const refreshFromStore = async (): Promise<void> => {
    let server: LatexAnnotation[];
    try {
      const response = await win.fetch(`/pdfannot?rel=${encodeURIComponent(relation)}`);
      if (!response.ok) return;
      const payload = await response.json() as {annots?: LatexAnnotation[]};
      if (!Array.isArray(payload.annots)) return;
      server = payload.annots;
    } catch { return; }
    const activeEditor = editor();
    const serverIds = new Set(server.map(a => String(a.id)));
    let arrived = false, changed = false;
    for (const stored of server) {
      const local = all.find(a => a.id === stored.id);
      if (!local) {
        // jamais vue ici : posée ailleurs (l'agent, une autre fenêtre)
        if (knownIds.has(String(stored.id))) continue;
        knownIds.add(String(stored.id));
        if ((isAgentNote(stored) || isReviewerNote(stored)) && !stored.number) stored.number = nextNumber();
        if (activeEditor) {
          let exact = false;
          try { exact = activeEditor.getRange(stored.from, stored.to) === stored.text; } catch { /* hors du texte */ }
          if (!exact) {
            const range = findAnnotationRange(activeEditor.getValue(), stored, activeEditor);
            if (range) { stored.from = {...range.from}; stored.to = {...range.to}; }
          }
        }
        all.push(stored);
        mark(stored);
        arrived = arrived || isAgentNote(stored);
        changed = true;
        continue;
      }
      if (!isAgentNote(local) && !isReviewerNote(local)) continue;
      const thread = mergeThreads(local.thread, stored.thread);
      const reviewMoved = isReviewerNote(local) && mergeReview(local, stored);
      if (thread.length !== (local.thread || []).length || reviewMoved) {
        local.thread = thread;
        remark(local);
        changed = true;
      }
    }
    // une note de l'agent vue ici puis absente du store : il l'a retirée
    for (const local of agentNotes()) {
      if (knownIds.has(String(local.id)) && !serverIds.has(String(local.id))) {
        clearMark(local.id);
        all = all.filter(a => a.id !== local.id);
        changed = true;
      }
    }
    if (!changed) return;
    refreshNumbers();
    options.onMutated?.();
    if (arrived) togglePanel(true);
    else buildPanel();
  };

  // Relance le chargement au besoin (comme ensureLoaded de l'éditeur Markdown).
  function ensureLoaded(): Promise<boolean> {
    if (loaded) return Promise.resolve(true);
    loading ??= load().finally(() => { loading = null; });
    return loading;
  }
  const bind = (): void => {
    const activeEditor = editor();
    if (bound || !activeEditor) return;
    bound = true;
    void ensureLoaded();
    watch();
    activeEditor.on("change", (...args: unknown[]) => {
      const change = args[1] as {origin?: string} | undefined;
      if (reanchorTimer !== null) win.clearTimeout(reanchorTimer);
      reanchorTimer = win.setTimeout(change?.origin === "setValue" ? anchorAll : syncFromMarks,
        change?.origin === "setValue" ? 150 : 800);
    });
  };

  const setColor = (id: string, color: string): void => {
    const annotation = all.find((candidate) => candidate.id === id);
    if (!annotation) return;
    annotation.color = color;
    clearMark(id);
    mark(annotation);
    save();
  };
  const focus = (id: string, anchor?: {left:number;top:number;bottom:number}): void => {
    const found = all.find((annotation) => annotation.id === id);
    if (!found || saving) return;
    current = found;
    show(found, false, anchor);
  };
  return {
    highlight(selection, color){
      const annotation:LatexAnnotation={id:crypto.randomUUID(),from:{...selection.from},to:{...selection.to},text:selection.text,comment:"",kind:"hl",color};
      all.push(annotation);mark(annotation);void save();
    },
    bind,
    load: ensureLoaded,
    open,
    focus,
    anchorAll,
    syncFromMarks,
    togglePanel,
    setColor,
    drop: remove,
    annotations: () => all,
    marks: () => marks,
    refreshPdfNotes: async (fresh = false) => { await loadPdfNotes(fresh); await locateTexNotes(); },
    layerNotes: () => notes().flatMap((annotation): LatexPdfLayerNote[] => {
      const base = {id: annotation.id, number: numberOf(annotation), color: noteColorName(annotation.color),
        agent: isAgentNote(annotation), title: annotation.comment || annotation.text.slice(0, 120)};
      if (annotation.src === "pdf") return [{...base, page: annotation.pdf!.page, rects: annotation.pdf!.rects}];
      const view = texViews.get(annotation.id);
      return view ? [{...base, page: view.page, text: annotation.text, line: annotation.from.line, top: view.y}] : [];
    }),
    pdfMarks: () => pdfRaw.filter(raw => !isPdfNote(raw) && Array.isArray(raw.rects) && raw.rects.length
      && (!raw.kind || raw.kind === "hl" || raw.kind === "ul" || raw.kind === "st")),
    reveal: (id: string) => {
      const annotation = all.find(a => a.id === id);
      if (!annotation) return;
      activeId = id;
      togglePanel(true);
      if (!annotation.loose) reveal(id);
      options.panel.querySelector<HTMLElement>(`.tp-item[data-id="${id.replace(/["\\]/g, "")}"]`)?.scrollIntoView({block: "nearest"});
    },
    startRound: () => { togglePanel(true); startRound(); },
  };
}
