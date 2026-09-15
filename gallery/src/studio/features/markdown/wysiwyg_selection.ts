import {createNoteEditor, createSelectionActions} from "../annotation_ui";

type MarkdownMark = {
  id: string;
  text: string;
  page: string;
  comment: string;
  kind: "comment" | "hl";
  color: string;
  occurrence?: number;
};

type SelectionSnapshot = {
  text: string;
  page: string;
  range: Range;
  rect: DOMRect;
  occurrence: number;
};

export interface MarkdownWysiwygSelectionOptions {
  path: string;
  getMarkdown(): string;
  document?: Document;
  window?: Window;
  postToHost?(payload: Record<string, unknown>): void;
}

export interface MarkdownWysiwygSelectionController {
  refresh(): void;
  destroy(): void;
}

const MARK_COLORS: Record<string, string> = {
  amber: "rgba(255,213,74,.40)",
  green: "rgba(120,220,140,.40)",
  blue: "rgba(120,170,255,.40)",
  red: "rgba(255,140,160,.40)",
};

export function markdownSelectionPage(source: string, selection: string, occurrence = 0): string {
  const compact = (value: string): string => value
    .replace(/[#*_`>\[\]()!-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const selected = compact(selection);
  if (!selected) return "";
  const lines = source.split("\n").map(compact);
  const flattened = lines.join(" ");
  const nthIndex = (needle: string): number => {
    let found = -1, from = 0;
    for (let match = 0; match <= occurrence; match += 1) {
      found = flattened.indexOf(needle, from);
      if (found < 0) return -1;
      from = found + Math.max(1, needle.length);
    }
    return found;
  };
  let index = nthIndex(selected);
  let matchedLength = selected.length;
  if (index < 0) {
    const firstWords = selected.split(" ").slice(0, 6).join(" ");
    index = nthIndex(firstWords);
    matchedLength = firstWords.length;
  }
  if (index < 0) return "";
  const lineAt = (position: number): number => {
    let offset = 0;
    for (let line = 0; line < lines.length; line += 1) {
      const end = offset + (lines[line]?.length || 0);
      if (position <= end) return line + 1;
      offset = end + 1;
    }
    return lines.length;
  };
  const from = lineAt(index);
  const to = lineAt(index + Math.max(0, matchedLength - 1));
  return `L${from}${to > from ? `-${to}` : ""}`;
}

function findRenderedRange(root: HTMLElement, text: string, occurrence: number, doc: Document): Range | null {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let full = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    full += node.textContent || "";
  }
  let index = -1;
  for (let match = 0, from = 0; match <= occurrence; match += 1) {
    index = full.indexOf(text, from);
    if (index < 0) break;
    from = index + Math.max(1, text.length);
  }
  if (index < 0) return null;
  let startNode: Text | null = null, endNode: Text | null = null;
  let startOffset = 0, endOffset = 0, offset = 0;
  for (const node of nodes) {
    const length = node.data.length;
    if (!startNode && index <= offset + length) {
      startNode = node;
      startOffset = Math.max(0, index - offset);
    }
    if (index + text.length <= offset + length) {
      endNode = node;
      endOffset = Math.max(0, index + text.length - offset);
      break;
    }
    offset += length;
  }
  if (!startNode || !endNode) return null;
  const range = doc.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

export function createMarkdownWysiwygSelection(
  options: MarkdownWysiwygSelectionOptions,
): MarkdownWysiwygSelectionController {
  const doc = options.document || document;
  const win = options.window || window;
  const post = options.postToHost || ((payload) => win.__atelierPost?.(payload));
  const relation = `md-comments:${options.path}`;
  const actions = doc.createElement("div");
  actions.className = "markdown-selection-actions";
  actions.style.display = "none";
  const note = doc.createElement("div");
  note.className = "markdown-annotation-editor";
  note.style.display = "none";
  doc.body.append(actions, note);
  let selected: SelectionSnapshot | null = null;
  let noteSelection: SelectionSnapshot | null = null;
  let marks: MarkdownMark[] = [];
  let refreshTimer: number | null = null;
  let captureTimer: number | null = null;
  let localMutation = 0;
  let loaded: Promise<boolean>;
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  let mutationQueue: Promise<void> = Promise.resolve();

  const root = (selectedNode?: Node | null): HTMLElement | null => {
    const candidates = [
      doc.querySelector<HTMLElement>(".toastui-editor-ww-container .ProseMirror"),
      doc.querySelector<HTMLElement>(".toastui-editor-ww-container .toastui-editor-contents"),
      doc.querySelector<HTMLElement>(".toastui-editor-md-preview .toastui-editor-contents"),
    ].filter((candidate): candidate is HTMLElement => !!candidate);
    return (selectedNode ? candidates.find((candidate) => candidate.contains(selectedNode)) : null) ||
      candidates[0] || null;
  };
  const hide = (): void => { actions.style.display = "none"; };
  const clearSelection = (): void => {
    hide();
    selected = null;
    win.getSelection()?.removeAllRanges();
  };
  const place = (element: HTMLElement, rect: DOMRect): void => {
    element.style.display = "flex";
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    element.style.left = `${Math.max(8, Math.min(win.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
    const below = rect.bottom + 8;
    element.style.top = `${below + height < win.innerHeight - 8 ? below : Math.max(8, rect.top - height - 8)}px`;
  };
  const save = async (): Promise<boolean> => {
    if (!(await ensureLoaded())) return false;
    const body = JSON.stringify({rel: relation, annots: marks});
    const persist = async (): Promise<boolean> => {
      try {
        const response = await win.fetch("/pdfannot", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body,
        });
        const result = await response.json();
        return response.ok && !result.error;
      } catch { return false; }
    };
    saveQueue = saveQueue.then(persist, persist);
    return saveQueue;
  };
  const paint = (): void => {
    const highlightRegistry = ((win as Window & {CSS?: typeof CSS & {highlights?: Map<string, unknown>}}).CSS)?.highlights;
    const HighlightClass = (win as Window & {Highlight?: new (...ranges: Range[]) => unknown}).Highlight;
    const rendered = root();
    if (!highlightRegistry || !HighlightClass || !rendered) return;
    Object.keys(MARK_COLORS).forEach((color) => highlightRegistry.delete(`markdown-${color}`));
    for (const color of Object.keys(MARK_COLORS)) {
      const ranges = marks.filter((mark) => mark.color === color)
        .map((mark) => findRenderedRange(rendered, mark.text, mark.occurrence || 0, doc))
        .filter((range): range is Range => !!range);
      if (ranges.length) highlightRegistry.set(`markdown-${color}`, new HighlightClass(...ranges));
    }
  };
  const addMark = async (mark: MarkdownMark): Promise<boolean> => {
    let saved = false;
    mutationQueue = mutationQueue.then(async () => {
      if (!(await ensureLoaded())) return;
      localMutation += 1;
      marks.push(mark);
      paint();
      saved = await save();
      if (!saved) {
        marks = marks.filter((candidate) => candidate.id !== mark.id);
        paint();
      }
    });
    await mutationQueue;
    return saved;
  };
  const sendQuote = async (): Promise<void> => {
    const snapshot = selected;
    if (!snapshot) return;
    hide();
    try {
      const response = await win.fetch("/quote", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({rel: options.path, page: snapshot.page, text: snapshot.text,
          comment: "", direct: true, embed: true}),
      });
      const result = await response.json();
      if (!response.ok || result?.error || !result?.message) throw new Error("quote failed");
      post({type: "atelier-add-to-chat", text: result.message});
      clearSelection();
    } catch {
      status.textContent = "Ajout impossible. Réessaie.";
      actions.style.display = "flex";
    }
  };
  const noteUI = createNoteEditor(note, {
    onSubmit: (value) => { void submitNote(value, false); },
    onSendDirect: (value) => { void submitNote(value, true); },
    onDelete: () => { note.style.display = "none"; noteSelection = null; clearSelection(); },
    onDismiss: () => { note.style.display = "none"; noteSelection = null; },
  });
  const submitNote = async (value: string, direct: boolean): Promise<void> => {
    const snapshot = noteSelection;
    if (!snapshot) return;
    noteUI.busy(true);
    noteUI.status.textContent = "";
    const mark: MarkdownMark = {id: crypto.randomUUID(), text: snapshot.text, page: snapshot.page,
      comment: value.trim(), kind: "comment", color: "blue", occurrence: snapshot.occurrence};
    const saved = await addMark(mark);
    noteUI.busy(false);
    if (!saved) { noteUI.status.textContent = "Enregistrement impossible."; return; }
    post({type: "atelier-add-to-chat", direct,
      text: `${options.path}${snapshot.page ? ` (${snapshot.page})` : ""} : « ${snapshot.text} »\nCommentaire : ${mark.comment || "(voir passage)"}`,
      pdfAnnotation: {rel: relation, id: mark.id}});
    note.style.display = "none";
    noteSelection = null;
    clearSelection();
  };
  createSelectionActions(actions, {
    onAdd: () => { void sendQuote(); },
    onAnnotate: () => {
      if (!selected) return;
      hide();
      noteSelection = selected;
      noteUI.input.value = "";
      place(note, selected.rect);
      noteUI.focus();
    },
    onAsk: () => {
      if (!selected) return;
      post({type: "atelier-quick-ask", text: selected.text, path: options.path, page: selected.page});
      clearSelection();
    },
    onHighlight: (color) => {
      if (!selected) return;
      const snapshot = selected;
      void addMark({id: crypto.randomUUID(), text: snapshot.text, page: snapshot.page,
        comment: "", kind: "hl", color, occurrence: snapshot.occurrence}).then((saved) => {
          if (saved) clearSelection();
          else status.textContent = "Surlignage non enregistré. Réessaie.";
        });
    },
    highlightColor: "blue",
  });
  const status = doc.createElement("span");
  status.className = "markdown-selection-status";
  status.setAttribute("role", "status");
  actions.append(status);
  const capture = (): void => {
    if (note.style.display !== "none") return;
    const selection = win.getSelection();
    const rendered = root(selection?.anchorNode);
    if (!selection?.rangeCount || !rendered || !selection.anchorNode || !rendered.contains(selection.anchorNode)) {
      hide();
      return;
    }
    const text = selection.toString().trim();
    if (!text) { hide(); return; }
    const range = selection.getRangeAt(0).cloneRange();
    const renderedPrefix = doc.createRange();
    renderedPrefix.selectNodeContents(rendered);
    renderedPrefix.setEnd(range.startContainer, range.startOffset);
    const prefix = renderedPrefix.toString();
    let occurrence = 0, match = prefix.indexOf(text);
    while (match >= 0) { occurrence += 1; match = prefix.indexOf(text, match + Math.max(1, text.length)); }
    selected = {text, page: markdownSelectionPage(options.getMarkdown(), text, occurrence), range,
      rect: range.getBoundingClientRect(), occurrence};
    status.textContent = "";
    place(actions, selected.rect);
  };
  const scheduleCapture = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && (actions.contains(target) || note.contains(target))) return;
    // ToastUI/ProseMirror peut produire une longue rafale de selectionchange
    // pendant et juste après une sélection à la souris. Ces événements ne
    // doivent pas repousser indéfiniment capture(), ni remplacer le mouseup
    // final qui contient la sélection stable.
    if (event.type === "selectionchange" && captureTimer !== null) return;
    if (captureTimer !== null) win.clearTimeout(captureTimer);
    captureTimer = win.setTimeout(() => {
      captureTimer = null;
      capture();
    }, event.type === "selectionchange" ? 30 : 0);
  };
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") { hide(); note.style.display = "none"; }
  };
  doc.addEventListener("mouseup", scheduleCapture, true);
  doc.addEventListener("keyup", scheduleCapture, true);
  doc.addEventListener("selectionchange", scheduleCapture);
  doc.addEventListener("keydown", onKeydown);
  const hydrate = (): Promise<boolean> => win.fetch(`/pdfannot?rel=${encodeURIComponent(relation)}`)
    .then((response) => {
      if (!response.ok) throw new Error("annotation load failed");
      return response.json();
    }).then((payload) => {
      if (localMutation === 0) marks = Array.isArray(payload.annots) ? payload.annots : [];
      paint();
      return true;
    }).catch(() => false);
  const ensureLoaded = async (): Promise<boolean> => {
    if (await loaded) return true;
    loaded = hydrate();
    return loaded;
  };
  loaded = hydrate();
  const consumed = (event: MessageEvent): void => {
    const data = event.data;
    const nonce = (win as Window & {__atelierNonce?: string}).__atelierNonce;
    if (event.source !== win.parent || data?.type !== "atelier-pdf-annotation-consumed" ||
      data.rel !== relation || data.nonce !== nonce) return;
    mutationQueue = mutationQueue.then(async () => {
      if (!(await ensureLoaded())) return;
      const removed = marks.find((mark) => mark.id === data.id);
      if (!removed) return;
      localMutation += 1;
      marks = marks.filter((mark) => mark.id !== data.id);
      paint();
      // Le chat a déjà consommé cette annotation. Même si la persistance
      // échoue, ne pas la remettre en mémoire : une sauvegarde suivante la
      // réintroduirait alors dans le fichier d'annotations.
      await save();
    });
  };
  win.addEventListener("message", consumed);
  return {
    refresh() {
      if (refreshTimer !== null) win.clearTimeout(refreshTimer);
      refreshTimer = win.setTimeout(paint, 200);
    },
    destroy() {
      if (captureTimer !== null) win.clearTimeout(captureTimer);
      if (refreshTimer !== null) win.clearTimeout(refreshTimer);
      doc.removeEventListener("mouseup", scheduleCapture, true);
      doc.removeEventListener("keyup", scheduleCapture, true);
      doc.removeEventListener("selectionchange", scheduleCapture);
      doc.removeEventListener("keydown", onKeydown);
      win.removeEventListener("message", consumed);
      actions.remove(); note.remove();
    },
  };
}
