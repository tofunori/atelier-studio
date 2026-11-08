import {createNoteEditor} from "../annotation_ui";
import {
  followUp, freshReplies, newRoundId, noteHeader, paragraphOf, proposalBlock, questionBlock, removedRanges,
  roundIcons, roundRequest, sectionOf, since, stateLabel,
  type RoundRecord, type RoundRef, type RoundReply, type RoundState, type StoredRevisions,
} from "./revision_round";
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
  // Entrée enregistre la note (elle attend la prochaine ronde) ; la bulle
  // l'envoie tout de suite au chat, comme avant (Thierry 2026-11-08).
  const noteUI = createNoteEditor(options.popover, {
    onSubmit(){}, onDelete(){}, onSendDirect(){void persistCurrent(true);}, submitLabel:"Enregistrer",
  });
  const quote = doc.createElement("div");
  const textarea = noteUI.input;
  const saveButton = options.popover.querySelector<HTMLButtonElement>(".send2")!;
  const chatButton = saveButton;
  const deleteButton = options.popover.querySelector<HTMLButtonElement>(".delete-note")!;
  const resolveButton = doc.createElement("button");
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
  let pollTimer: number | null = null;
  let roundError = "";
  const LOAD_FAILED = "Commentaires non chargés : rien n'est enregistré tant que la liste n'est pas relue. Ta note reste disponible.";

  const editor = (): AnnotationEditor | null => options.getEditor();
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  const save = (): Promise<boolean> => {
    options.onMutated?.();
    saveQueue = saveQueue.then(async () => {
      if (!(await ensureLoaded())) { noteUI.status.textContent = LOAD_FAILED; return false; }
      // instantané pris au tour de la file : l'état le plus récent part
      const sent = all.map((annotation) => ({...annotation}));
      const body = JSON.stringify({rel:relation, annots:sent, known:[...knownIds]});
      try {
        const response=await win.fetch("/pdfannot",{method:"POST",headers:{"Content-Type":"application/json"},body});
        const result=await response.json();
        if(!response.ok || result.error) throw new Error("save failed");
        sent.forEach((annotation) => knownIds.add(String(annotation.id)));
        return true;
      } catch {noteUI.status.textContent="Enregistrement impossible. Ta note reste disponible.";return false;}
    });
    return saveQueue;
  };
  const numberOf = (annotation: LatexAnnotation): number =>
    annotation.number || all.filter(a=>a.kind!=="hl").indexOf(annotation)+1;
  const mark = (annotation: LatexAnnotation): void => {
    const activeEditor = editor();
    if (!activeEditor) return;
    try {
      const answered = annotation.kind!=="hl" && (annotation.rstate==="prop" || annotation.rstate==="ask") && annotation.reply;
      marks[annotation.id] = activeEditor.markText(annotation.from, annotation.to, {
        className: annotation.kind === "hl" ? `texc-hl texc-c-${annotation.color || "amber"}`
          : annotation.rstate==="prop" ? "texc-hl texc-comment texr-old" : "texc-hl texc-comment",
        attributes: {"data-texc": annotation.id},
      });
      if (answered) { markRound(annotation, activeEditor); return; }
      if(annotation.kind!=="hl" && typeof activeEditor.setBookmark==="function") {
        const badge=doc.createElement("button");badge.type="button";
        badge.className=`atelier-annotation-number${annotation.rstate==="busy" ? " is-busy" : ""}`;
        badge.textContent=String(numberOf(annotation));
        badge.setAttribute("aria-label",`Annotation ${badge.textContent}`);
        badge.onclick=event=>{event.stopPropagation();if(saving)return;current=annotation;show(annotation,false,badge.getBoundingClientRect());};
        badges[annotation.id]=activeEditor.setBookmark(annotation.from,{widget:badge,insertLeft:true});
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
  };
  const anchorAll = (): void => {
    const activeEditor = editor();
    if (!activeEditor) return;
    const documentText = activeEditor.getValue();
    let changed = false;
    for (const annotation of all) {
      clearMark(annotation.id);
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
    if (changed) save();
  };
  const sorted = (): LatexAnnotation[] => [...all].sort((left, right) =>
    left.from.line - right.from.line || left.from.ch - right.from.ch);
  // ---- Rondes d'annotations -------------------------------------------
  const notes = (): LatexAnnotation[] => sorted().filter(a => a.kind !== "hl");
  const currentRound = (): RoundRef | null => notes().find(a => a.round)?.round || null;
  const pending = (): LatexAnnotation[] => notes().filter(a => a.round && (a.rstate === "prop" || a.rstate === "ask"));
  const firstProposal = (): string | null => pending().find(a => a.rstate === "prop")?.id || null;
  const sectionsFor = (items: readonly LatexAnnotation[]): string[] => {
    const activeEditor = editor();
    const lines = typeof activeEditor?.getValue === "function" ? activeEditor.getValue().split("\n") : [];
    return items.map(a => sectionOf(lines, a.from.line));
  };
  const locOf = (annotation: LatexAnnotation): string => annotation.from.line === annotation.to.line
    ? `ligne ${annotation.from.line + 1}` : `lignes ${annotation.from.line + 1}-${annotation.to.line + 1}`;

  function markRound(annotation: LatexAnnotation, activeEditor: AnnotationEditor): void {
    if (typeof activeEditor.setBookmark !== "function" || !annotation.reply) return;
    const blocks: Array<{clear(): void}> = [];
    const source = activeEditor.getValue().split("\n");
    const paragraph = paragraphOf(source, annotation.from.line, annotation.to.line);
    const header = noteHeader(doc, numberOf(annotation), annotation.comment, false);
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
    if (!round || !notes().some(a => a.rstate === "busy")) { stopPolling(); return; }
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
    const open = notes().filter(a => !a.round || a.rstate === undefined);
    if (!open.length) return;
    const previous = Math.max(0, ...history.map(record => record.n || 0), ...notes().map(a => a.round?.n || 0));
    const round: RoundRef = {id: newRoundId(), n: previous + 1};
    // Une ronde à la fois : les notes encore en attente d'une ronde
    // précédente y entrent aussi.
    const members = notes();
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
    for (const annotation of notes()) {
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
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    decide(target.id, "acc");
  }, true);

  const buildPanel = (): void => {
    const items = notes();
    const round = currentRound();
    const roundItems = items.filter(a => a.round);
    const toReview = roundItems.filter(a => a.rstate === "prop" || a.rstate === "ask").length;
    const busy = roundItems.filter(a => a.rstate === "busy").length;
    const fresh = items.filter(a => !a.round);
    const title = round ? `Ronde ${round.n}` : "Annotations";
    const sub = round
      ? [`${roundItems.length} note${roundItems.length > 1 ? "s" : ""}`, toReview ? `${toReview} à revoir` : ""].filter(Boolean).join(" · ")
      : items.length ? `${items.length} note${items.length > 1 ? "s" : ""}` : "";
    const sections = sectionsFor(items);
    let lastSection = "";
    const list = items.map((annotation, index) => {
      const section = sections[index] || "";
      const head = round && section !== lastSection ? (lastSection = section, `<div class="tp-sec">${escapeHtml(section)}</div>`) : "";
      const state = stateLabel(annotation.rstate || "note");
      return `${head}<div class="tp-item${activeId === annotation.id ? " is-active" : ""}" data-id="${escapeHtml(annotation.id)}" role="button" tabindex="0">`
        + `<span class="atelier-annotation-number tp-ring">${numberOf(annotation)}</span>`
        + `<span class="tp-body"><span class="tp-note">${escapeHtml(annotation.comment || annotation.text.slice(0, 90))}</span>`
        + `<span class="tp-state tone-${state.tone}"><span class="tp-ic">${state.icon}</span>${state.label}<span class="tp-loc">${locOf(annotation)}</span></span></span>`
        + `<button type="button" class="tp-x" data-x="${escapeHtml(annotation.id)}" title="Supprimer la note" aria-label="Supprimer la note">${roundIcons.close}</button></div>`;
    }).join("");
    const past = [...new Set(history.map(record => record.n))].sort((a, b) => b - a).slice(0, 3).map(n => {
      const records = history.filter(record => record.n === n);
      const accepted = records.filter(record => record.decision === "acc").length;
      const last = Math.max(...records.map(record => record.at || 0));
      return `<div class="tp-past">Ronde ${n} · ${accepted} acceptée${accepted > 1 ? "s" : ""} sur ${records.length}, ${since(last)}</div>`;
    }).join("");
    let foot = "";
    if (busy) {
      foot = `<div class="tp-work"><span class="texr-spin"></span><span>L’agent révise ${busy} note${busy > 1 ? "s" : ""}</span><span class="tp-gap"></span>`
        + '<button type="button" class="tp-link tp-cancel">Arrêter</button></div>';
    } else if (fresh.length) {
      foot = `<button type="button" class="tp-primary tp-review">Réviser avec l’agent</button>`;
    }
    const tools = items.length && !busy
      ? '<div class="tp-tools"><button type="button" class="tp-link tp-sendall" title="Envoyer toutes les notes au chat, sans ronde">Envoyer au chat</button>'
        + '<button type="button" class="tp-link tp-delall" title="Supprimer toutes les notes">Tout supprimer</button></div>'
      : "";
    options.panel.innerHTML = `<div class="tp-head"><span class="tp-title">${title}</span><span class="tp-sub">${sub}</span><span class="tp-gap"></span>`
      + `<button type="button" class="tp-close" aria-label="Fermer le panneau" title="Fermer">${roundIcons.close}</button></div>`
      + `<div class="tp-list">${list || '<div class="tp-empty">Sélectionne un passage puis « Annoter ». Tes notes s’ajoutent ici ; « Réviser avec l’agent » les lui envoie toutes ensemble.</div>'}</div>`
      + (roundError ? `<div class="tp-error" role="status">${escapeHtml(roundError)}</div>` : "")
      + (foot || tools || past ? `<div class="tp-foot">${foot}${tools}${past}</div>` : "");
    doc.body.classList.toggle("has-texc", items.length > 0);
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
    save();
    options.popover.style.display = "none";
    current = null;
  };
  const show = (annotation: LatexAnnotation, isNew: boolean, anchor?: {left:number;top:number;bottom:number}): void => {
    const activeEditor = editor();
    if (!activeEditor) return;
    noteUI.status.textContent="";
    openedAt = Date.now();
    quote.textContent = `« ${annotation.text.slice(0, 140)}${annotation.text.length > 140 ? "…" : ""} »`;
    textarea.value = annotation.comment || "";
    deleteButton.style.display = "";
    resolveButton.style.display = isNew ? "none" : "";
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
    clearMark(annotation.id);mark(annotation);
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
  textarea.onkeydown=event=>{
    event.stopPropagation();
    if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void persistCurrent();}
    if(event.key==="Escape"){event.preventDefault();options.popover.style.display="none";current=null;}
  };
  chatButton.onclick=()=>{void persistCurrent();};
  deleteButton.onclick=async()=>{
    if(!current || saving) return;
    const annotation=current, index=all.findIndex(a=>a.id===annotation.id);
    all=all.filter(a=>a.id!==annotation.id);saving=true;noteUI.busy(true);
    const saved=await save();saving=false;noteUI.busy(false);
    if(!saved){if(index>=0)all.splice(index,0,annotation);options.onMutated?.();return;}
    clearMark(annotation.id);current=null;options.popover.style.display="none";buildPanel();
  };
  win.addEventListener("message",event=>{
    const data=event.data;
    if(event.source!==win.parent || data?.type!=="atelier-pdf-annotation-consumed" || data.rel!==relation ||
      data.nonce!==(win as Window & {__atelierNonce?:string}).__atelierNonce) return;
    all=all.filter(a=>a.id!==data.id);clearMark(data.id);
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
      if (annotation && !saving) {
        current = annotation;
        show(annotation, false);
        return;
      }
    }
    if (Date.now() - openedAt < 350) return;
    if (target && !options.popover.contains(target) && !target.closest("#selPill") && current) {
      if(textarea.value.trim() && textarea.value.trim() !== (current.comment || "")) void persistCurrent();
      else {options.popover.style.display="none";current=null;}
    }
  });
  options.button.onclick = () => togglePanel();
  options.panel.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (target?.closest(".tp-close")) { togglePanel(false); return; }
    if (target?.closest(".tp-review")) { startRound(); return; }
    if (target?.closest(".tp-cancel")) { cancelRound(); return; }
    const removeButton = target?.closest<HTMLElement>(".tp-x");
    if (removeButton?.dataset.x) {
      remove(removeButton.dataset.x);
      buildPanel();
      return;
    }
    if (target?.closest(".tp-sendall")) {
      for(const annotation of sorted().filter(a=>a.kind!=="hl")) options.postToHost({
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
        Object.keys(marks).forEach(clearMark);
        all = [];
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
      togglePanel(false);
    }
  });
  options.panel.addEventListener("keydown", (event) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(".tp-item[data-id]");
    if (!item || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    item.click();
  });
  doc.addEventListener("mousedown", (event) => {
    const target = event.target as Element | null;
    if (options.panel.classList.contains("open") && target && !options.panel.contains(target) && !target.closest("#texcBtn")
      && !currentRound()) {
      togglePanel(false);
    }
  });

  const load = async (): Promise<boolean> => {
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
      serverIds.forEach((id) => knownIds.add(id));
      loaded = true;
    } catch {
      options.onError?.(LOAD_FAILED);
      return false;
    }
    await loadHistory();
    activeId = firstProposal();
    // hors du try : un ancrage qui échoue n'annule pas un chargement réussi
    try { anchorAll(); } catch { /* ancrage repris au prochain passage */ }
    options.onMutated?.();
    // Une ronde lancée avant un rechargement reprend où elle en était.
    if (all.some(a => a.rstate === "busy")) poll();
    if (currentRound()) togglePanel(true);
    return true;
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
  };
}
