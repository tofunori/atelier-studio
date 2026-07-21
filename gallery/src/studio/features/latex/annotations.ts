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
}

export interface LatexAnnotationSelection {
  from: StudioPosition;
  to: StudioPosition;
  text: string;
}

export interface LatexAnnotationsOptions {
  path: string;
  getEditor(): AnnotationEditor | null;
  popover: HTMLElement;
  panel: HTMLElement;
  button: HTMLElement;
  postToHost(payload: Record<string, unknown>): void;
  document?: Document;
  window?: Window;
}

export interface LatexAnnotationsController {
  bind(): void;
  load(): Promise<void>;
  open(selection: LatexAnnotationSelection): void;
  anchorAll(): void;
  syncFromMarks(): void;
  togglePanel(force?: boolean): void;
  annotations(): readonly LatexAnnotation[];
  marks(): Readonly<Record<string, StudioTextMarker>>;
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
  const quote = required<HTMLElement>(options.popover, ".tc-quote");
  const textarea = required<HTMLTextAreaElement>(options.popover, "textarea");
  const saveButton = required<HTMLButtonElement>(options.popover, ".tc-save");
  const deleteButton = required<HTMLButtonElement>(options.popover, ".tc-del");
  const resolveButton = required<HTMLButtonElement>(options.popover, ".tc-ok");
  const chatButton = required<HTMLButtonElement>(options.popover, ".tc-claude");
  const colorButtons = [...options.popover.querySelectorAll<HTMLButtonElement>(".tc-colors button")];
  const relation = `tex-comments:${options.path}`;
  let all: LatexAnnotation[] = [];
  let marks: Record<string, StudioTextMarker> = {};
  let current: LatexAnnotation | null = null;
  let openedAt = 0;
  let reanchorTimer: number | null = null;
  let deleteArmTimer: number | null = null;
  let bound = false;
  let localMutation = 0;

  const editor = (): AnnotationEditor | null => options.getEditor();
  const save = (): void => {
    localMutation += 1;
    void win.fetch("/pdfannot", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({rel: relation, annots: all}),
    }).catch(() => {});
  };
  const mark = (annotation: LatexAnnotation): void => {
    const activeEditor = editor();
    if (!activeEditor) return;
    try {
      marks[annotation.id] = activeEditor.markText(annotation.from, annotation.to, {
        className: `texc-hl texc-c-${annotation.color || "amber"}`,
        attributes: {"data-texc": annotation.id},
      });
    } catch { /* stale range; next anchor pass retries */ }
  };
  const clearMark = (id: string): void => {
    try { marks[id]?.clear(); } catch { /* already cleared */ }
    delete marks[id];
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
        annotation.text = text.slice(0, 300);
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
  const show = (annotation: LatexAnnotation, isNew: boolean): void => {
    const activeEditor = editor();
    if (!activeEditor) return;
    openedAt = Date.now();
    quote.textContent = `« ${annotation.text.slice(0, 140)}${annotation.text.length > 140 ? "…" : ""} »`;
    textarea.value = annotation.comment || "";
    deleteButton.style.display = isNew ? "none" : "";
    resolveButton.style.display = isNew ? "none" : "";
    colorButtons.forEach((button) => button.classList.toggle("on", button.dataset.color === (annotation.color || "amber")));
    const coordinates = activeEditor.charCoords(annotation.to, "window");
    options.popover.style.display = "block";
    const margin = 8;
    const width = options.popover.getBoundingClientRect().width;
    const maxLeft = Math.max(margin, win.innerWidth - width - margin);
    options.popover.style.left = `${Math.min(Math.max(margin, coordinates.left - width / 2), maxLeft)}px`;
    options.popover.style.top = `${Math.min(coordinates.bottom + 8, win.innerHeight - options.popover.offsetHeight - 8)}px`;
    textarea.focus();
  };
  const open = (selection: LatexAnnotationSelection): void => {
    current = {
      id: `c${Date.now()}`, from: {...selection.from}, to: {...selection.to},
      text: String(selection.text).slice(0, 300), comment: "",
    };
    show(current, true);
  };
  const persistCurrent = (): void => {
    if (!current) return;
    current.comment = textarea.value.trim();
    if (!all.some((annotation) => annotation.id === current?.id)) {
      all.push(current);
      mark(current);
    }
    save();
    options.popover.style.display = "none";
    current = null;
  };

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      saveButton.click();
    }
  });
  saveButton.onclick = persistCurrent;
  resolveButton.onclick = () => { if (current) remove(current.id); };
  deleteButton.onclick = () => { if (current) remove(current.id); };
  chatButton.onclick = () => {
    if (!current) return;
    current.comment = textarea.value.trim();
    options.postToHost({
      type: "atelier-add-to-chat",
      text: `${options.path} (L${current.from.line + 1}-${current.to.line + 1}) : « ${current.text.slice(0, 200)} »\nCommentaire : ${current.comment || "(voir passage)"}`,
    });
    persistCurrent();
  };
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
      if (annotation) {
        current = annotation;
        show(annotation, false);
        return;
      }
    }
    if (Date.now() - openedAt < 350) return;
    if (target && !options.popover.contains(target) && !target.closest("#selPill")) options.popover.style.display = "none";
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
      const items = sorted();
      if (!items.length) return;
      const text = `${options.path} — ${items.length} commentaire${items.length > 1 ? "s" : ""} :\n`
        + items.map((annotation, index) => `${index + 1}. (L${annotation.from.line + 1}`
          + `${annotation.to.line !== annotation.from.line ? `-${annotation.to.line + 1}` : ""}) « `
          + `${annotation.text.slice(0, 200)} » — Commentaire : ${annotation.comment || "(voir passage)"}`).join("\n");
      options.postToHost({type: "atelier-add-to-chat", text});
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

  return {
    bind,
    load,
    open,
    anchorAll,
    syncFromMarks,
    togglePanel,
    annotations: () => all,
    marks: () => marks,
  };
}
