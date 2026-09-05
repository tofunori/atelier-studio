import {createNoteEditor} from "../annotation_ui";
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
  document?: Document;
  window?: Window;
}

export interface LatexAnnotationsController {
  bind(): void;
  load(): Promise<void>;
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

const SWATCHES: Readonly<Record<string, string>> = {
  amber: "rgba(224,183,74,.85)", red: "rgba(240,125,115,.85)",
  blue: "rgba(91,157,255,.85)", green: "rgba(126,192,120,.85)",
  purple: "rgba(170,140,224,.85)",
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
  const noteUI = createNoteEditor(options.popover, {onSubmit(){}, onDelete(){}});
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
  let localMutation = 0;

  const editor = (): AnnotationEditor | null => options.getEditor();
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  const save = (): Promise<boolean> => {
    localMutation += 1;
    const body = JSON.stringify({rel:relation, annots:all});
    options.onMutated?.();
    saveQueue = saveQueue.then(async () => {
      try {
        const response=await win.fetch("/pdfannot",{method:"POST",headers:{"Content-Type":"application/json"},body});
        const result=await response.json();
        if(!response.ok || result.error) throw new Error("save failed");
        return true;
      } catch {noteUI.status.textContent="Enregistrement impossible. Ta note reste disponible.";return false;}
    });
    return saveQueue;
  };
  const mark = (annotation: LatexAnnotation): void => {
    const activeEditor = editor();
    if (!activeEditor) return;
    try {
      marks[annotation.id] = activeEditor.markText(annotation.from, annotation.to, {
        className: annotation.kind === "hl" ? `texc-hl texc-c-${annotation.color || "amber"}` : "texc-hl texc-comment",
        attributes: {"data-texc": annotation.id},
      });
      if(annotation.kind!=="hl" && typeof activeEditor.setBookmark==="function") {
        const badge=doc.createElement("button");badge.type="button";
        badge.className="atelier-annotation-number";
        badge.textContent=String(annotation.number || all.filter(a=>a.kind!=="hl").indexOf(annotation)+1);
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
  const buildPanel = (): void => {
    const items = sorted();
    options.panel.innerHTML = `<div class="tp-head"><span class="tp-title">Commentaires (${items.length})</span>`
      + '<button class="tp-sendall" title="Envoyer tous les commentaires au chat">Envoyer tout</button>'
      + '<button class="tp-delall" title="Supprimer tous les commentaires">Tout supprimer</button></div>'
      + (items.length ? items.map((annotation) =>
        `<div class="tp-item" data-id="${escapeHtml(annotation.id)}">`
        + `<span class="tp-dot" style="background:${SWATCHES[annotation.color || "amber"] || SWATCHES.amber}"></span>`
        + `<span class="tp-body"><span class="tp-quote">« ${escapeHtml(annotation.text.slice(0, 70))} »</span>`
        + (annotation.comment ? `<div class="tp-note">${escapeHtml(annotation.comment)}</div>` : "")
        + `</span><button class="tp-x" data-x="${escapeHtml(annotation.id)}" title="Supprimer">✕</button></div>`).join("")
        : '<div class="tp-empty">aucun commentaire</div>');
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
  const persistCurrent = async (): Promise<void> => {
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
    options.postToHost({type:"atelier-add-to-chat",
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
    if (annotation && activeEditor) {
      activeEditor.setCursor(annotation.from);
      activeEditor.scrollIntoView({from: annotation.from, to: annotation.to}, 80);
      activeEditor.focus();
      togglePanel(false);
    }
  });
  doc.addEventListener("mousedown", (event) => {
    const target = event.target as Element | null;
    if (options.panel.classList.contains("open") && target && !options.panel.contains(target) && !target.closest("#texcBtn")) {
      togglePanel(false);
    }
  });

  const load = async (): Promise<void> => {
    const mutationAtStart = localMutation;
    try {
      const response = await win.fetch(`/pdfannot?rel=${encodeURIComponent(relation)}`);
      const payload = await response.json() as {annots?: LatexAnnotation[]};
      if (localMutation !== mutationAtStart) return;
      all = Array.isArray(payload.annots) ? payload.annots : [];
      anchorAll();
      options.onMutated?.();
    } catch { /* annotations remain optional */ }
  };
  const bind = (): void => {
    const activeEditor = editor();
    if (bound || !activeEditor) return;
    bound = true;
    void load();
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
    load,
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
