import type {StudioEditor} from "../../core/editor_contract";

/** Barre du bas de l'éditeur LaTeX : position du curseur, nombre de choses
 *  « à faire » et compte de mots du manuscrit (racine + ses \input). Le
 *  comptage et le relevé vivent en Rust (`/tex/manuscript`) : une seule
 *  vérité pour le manuscrit comme pour la sélection (`/tex/wordcount`).
 *
 *  Coût : rien ne se recalcule pendant une sélection (PIEGES_CONNUS §15). Le
 *  compte du manuscrit attend 1,2 s de repos après une frappe ; celui de la
 *  sélection, 200 ms de repos du curseur. Les réglages (légendes, notes,
 *  limites) et la base « aujourd'hui » vivent sur le serveur (§1). */

export interface ManuscriptSection {
  key: string;
  title: string;
  number: string | null;
  kind: string;
  words: number;
  limit: number | null;
  file: number;
  line: number;
}

export interface ManuscriptTodo {
  file: number;
  line: number;
  kind: string;
  text: string;
  section: number;
}

export interface ManuscriptFile {
  rel: string;
  path: string;
  current: boolean;
}

export interface ManuscriptStats {
  ok: boolean;
  root: string;
  total: number;
  today?: number;
  sections: Array<ManuscriptSection | null>;
  files: ManuscriptFile[];
  marks: Array<[number, number, number]>;
  todos: ManuscriptTodo[];
  captions: boolean;
  footnotes: boolean;
}

export interface ManuscriptBarOptions {
  path: string;
  host: HTMLElement;
  getEditor(): StudioEditor | null;
  revealLine(editor: StudioEditor, line: number): void;
  /** Ouvre un autre fichier du manuscrit à la ligne (1-based). */
  openFile(path: string, line: number): void;
  postToHost(payload: Record<string, unknown>): void;
  document?: Document;
  window?: Window;
  fetchImpl?: typeof fetch;
}

export interface ManuscriptBarController {
  bind(): void;
  refresh(): Promise<void>;
  noteChange(): void;
  close(): void;
  stats(): ManuscriptStats | null;
}

const NUMBER = new Intl.NumberFormat("fr-FR");
const SVG_LIST = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4l1 1 1.8-2M2.5 10l1 1 1.8-2M8 4.5h5.5M8 10.5h5.5"/></svg>';
const SVG_CHAT = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z"/></svg>';
const SVG_CHECK = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8"/></svg>';
const SVG_DONE = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M6.8 10.2l2.2 2.2 4.2-4.6"/></svg>';

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"})[c] || c);
}

/** « ajouter la réf. » se lit comme une tâche : majuscule à l'affichage. */
function sentence(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase("fr") + text.slice(1) : text;
}

export function formatWords(count: number): string {
  return NUMBER.format(Math.max(0, Math.round(count)));
}

/** Date locale AAAA-MM-JJ : le serveur ne connaît pas le fuseau. */
export function localDay(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Section où se trouve `line` (0-based) du fichier `file` : dernier
 *  changement de section relevé avant elle dans le manuscrit déplié. */
export function sectionAt(stats: ManuscriptStats, file: number, line: number): number {
  // Un fichier reprend après chacun de ses \input : ses repères sont
  // dispersés dans l'ordre déplié, mais leurs lignes restent croissantes.
  let found = -1;
  for (const [markFile, markLine, section] of stats.marks) {
    if (markFile !== file) continue;
    if (markLine > line) break;
    found = section;
  }
  return found;
}

/** Début du commentaire d'une ligne LaTeX (`%` non échappé), ou -1. */
function commentStart(line: string): number {
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== "%") continue;
    let slashes = 0;
    for (let j = i - 1; j >= 0 && line[j] === "\\"; j -= 1) slashes += 1;
    if (slashes % 2 === 0) return i;
  }
  return -1;
}

/** Fin (exclue) d'un argument `{…}` ou `[…]` qui commence à `start`. */
function groupEnd(line: string, start: number, open: string, close: string): number {
  if (line[start] !== open) return -1;
  let depth = 0;
  for (let i = start; i < line.length; i += 1) {
    const c = line[i];
    if (c === "\\") { i += 1; continue; }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

export interface TodoRemoval {
  /** Colonnes à retirer de la ligne, ou toute la ligne (`whole`). */
  from: number;
  to: number;
  whole: boolean;
}

/** Ce qu'il faut retirer d'une ligne pour « marquer fait » la `nth`
 *  occurrence de `kind` (TODO, FIXME, XXX, \todo, \missingfigure). Rien si la
 *  marque a disparu entre-temps (édition, agent). */
export function todoRemoval(line: string, kind: string, nth = 0): TodoRemoval | null {
  const comment = commentStart(line);
  const code = comment >= 0 ? line.slice(0, comment) : line;
  let from = -1;
  let to = -1;
  if (kind.startsWith("\\")) {
    const pattern = new RegExp(`\\\\${kind.slice(1)}(?![A-Za-z@])`, "g");
    let match: RegExpExecArray | null;
    let index = 0;
    while ((match = pattern.exec(code))) {
      let end = match.index + match[0].length;
      while (code[end] === " ") end += 1;
      if (code[end] === "[") {
        const close = groupEnd(code, end, "[", "]");
        if (close < 0) continue;
        end = close;
        while (code[end] === " ") end += 1;
      }
      const close = groupEnd(code, end, "{", "}");
      if (close < 0) continue;
      if (index === nth) { from = match.index; to = close; break; }
      index += 1;
    }
    if (from < 0) return null;
    // une espace de part et d'autre : n'en garder qu'une
    if (line[from - 1] === " " && (line[to] === " " || to === line.length)) from -= 1;
  } else {
    if (comment < 0) return null;
    const body = line.slice(comment).replace(/^%+\s*/, "");
    if (!body.startsWith(kind)) return null;
    from = comment;
    to = line.length;
    while (from > 0 && /\s/.test(line[from - 1] || "")) from -= 1;
  }
  const rest = line.slice(0, from) + line.slice(to);
  return {from, to, whole: rest.trim() === ""};
}

export function createManuscriptBar(options: ManuscriptBarOptions): ManuscriptBarController {
  const doc = options.document || document;
  const win = options.window || window;
  const fetchImpl = options.fetchImpl || win.fetch.bind(win);
  let stats: ManuscriptStats | null = null;
  let selectionWords: number | null = null;
  let editingLimits = false;
  let bound = false;
  let changeTimer: number | null = null;
  let cursorTimer: number | null = null;
  let renderTimer: number | null = null;
  let requestSeq = 0;
  let selectionSeq = 0;

  const bar = doc.createElement("div");
  bar.id = "msBar";
  bar.className = "editonly";
  bar.innerHTML = `<span id="msPos">Ln 1, Col 1</span><span class="ms-sp"></span>`
    + `<button type="button" id="msTodo" class="ms-b" aria-expanded="false" aria-controls="msTodoPanel" title="Ce qu'il reste à faire dans le manuscrit" hidden>${SVG_LIST}<span id="msTodoTxt"></span></button>`
    + `<button type="button" id="msWords" class="ms-b" aria-expanded="false" aria-controls="msWordsCard" title="Mots du manuscrit (texte seul)" hidden><span id="msWordsTxt"></span></button>`;
  const todoPanel = doc.createElement("div");
  todoPanel.id = "msTodoPanel";
  todoPanel.setAttribute("role", "dialog");
  todoPanel.setAttribute("aria-label", "À faire");
  const wordsCard = doc.createElement("div");
  wordsCard.id = "msWordsCard";
  wordsCard.setAttribute("role", "dialog");
  wordsCard.setAttribute("aria-label", "Détail du compte de mots");
  const ticks = doc.createElement("div");
  ticks.id = "msTicks";
  ticks.setAttribute("aria-hidden", "true");

  const position = bar.querySelector("#msPos") as HTMLElement;
  const todoButton = bar.querySelector("#msTodo") as HTMLButtonElement;
  const todoText = bar.querySelector("#msTodoTxt") as HTMLElement;
  const wordsButton = bar.querySelector("#msWords") as HTMLButtonElement;
  const wordsText = bar.querySelector("#msWordsTxt") as HTMLElement;

  const currentFile = (): number => stats ? stats.files.findIndex((file) => file.current) : -1;
  const cursorLine = (): number => options.getEditor()?.getCursor().line ?? 0;
  const rootName = (): string => (stats?.root || "").split("/").pop() || "main.tex";
  const isOpen = (element: HTMLElement): boolean => element.classList.contains("open");

  const renderBar = (): void => {
    if (!stats) {
      todoButton.hidden = true;
      wordsButton.hidden = true;
      return;
    }
    const count = stats.todos.length;
    todoText.textContent = count ? `${count} à faire` : "Rien à faire";
    todoButton.hidden = false;
    wordsButton.hidden = false;
    wordsText.innerHTML = selectionWords !== null
      ? `<b>${formatWords(selectionWords)}</b> sur ${formatWords(stats.total)} mots`
      : `${formatWords(stats.total)} mot${stats.total > 1 ? "s" : ""}`;
  };

  const renderTicks = (): void => {
    const editor = options.getEditor();
    const file = currentFile();
    if (!stats || !editor || file < 0) { ticks.innerHTML = ""; return; }
    const lines = Math.max(1, editor.lineCount());
    const here = cursorLine();
    // Proportion de caractères plutôt que de lignes : une ligne de prose
    // repliée occupe plusieurs rangées à l'écran.
    const total = Math.max(1, editor.indexFromPos({line: lines - 1, ch: editor.getLine(lines - 1).length}));
    ticks.innerHTML = stats.todos
      .filter((todo) => todo.file === file && todo.line - 1 < lines)
      .map((todo) => {
        const ratio = editor.indexFromPos({line: todo.line - 1, ch: 0}) / total;
        return `<i class="${todo.line - 1 === here ? "on" : ""}" style="top:${(ratio * 100).toFixed(2)}%"></i>`;
      })
      .join("");
  };

  const renderTodo = (): void => {
    if (!stats) { todoPanel.innerHTML = ""; return; }
    const file = currentFile();
    const here = cursorLine();
    const head = `<div class="ms-head"><span class="ms-title">À faire</span><span class="ms-n">${stats.todos.length}</span></div>`;
    if (!stats.todos.length) {
      todoPanel.innerHTML = head + `<div class="ms-empty">${SVG_DONE}<div class="ms-empty-t">Rien à faire dans ce manuscrit.</div>`
        + `<div class="ms-empty-h">Écris <code>% TODO</code> ou <code>\\todo{…}</code> pour en ajouter.</div></div>`;
      return;
    }
    const groups = new Map<number, Array<{todo: ManuscriptTodo; index: number}>>();
    stats.todos.forEach((todo, index) => {
      const list = groups.get(todo.file) || [];
      list.push({todo, index});
      groups.set(todo.file, list);
    });
    let html = head;
    for (const [fileIndex, items] of groups) {
      const rel = stats.files[fileIndex]?.rel || "";
      html += `<div class="ms-group"><span>${escapeHtml(rel)}</span><span class="ms-n">${items.length}</span></div>`;
      for (const {todo, index} of items) {
        const section = todo.section >= 0 ? stats.sections[todo.section] : null;
        const where = todo.section < 0 ? "Préambule" : section?.title || "";
        const on = fileIndex === file && todo.line - 1 === here;
        const editable = fileIndex === file;
        html += `<div class="ms-item${on ? " on" : ""}" role="button" tabindex="0" data-i="${index}">`
          + `<div class="ms-text">${escapeHtml(sentence(todo.text) || "(sans texte)")}</div>`
          + `<div class="ms-meta">${escapeHtml(todo.kind)}${where ? ` · ${escapeHtml(where)}` : ""} · l. ${todo.line}</div>`
          + `<span class="ms-acts"><button type="button" class="ms-ic" data-act="chat" title="Demander à l'agent" aria-label="Demander à l'agent">${SVG_CHAT}</button>`
          + (editable ? `<button type="button" class="ms-ic" data-act="done" title="Marquer fait (retire la marque du fichier, ⌘Z annule)" aria-label="Marquer fait">${SVG_CHECK}</button>` : "")
          + `</span></div>`;
      }
    }
    html += `<div class="ms-foot">% TODO, FIXME, XXX, \\todo{} et \\missingfigure{}, dans ${escapeHtml(rootName())}${stats.files.length > 1 ? " et ses \\input" : ""}.</div>`;
    todoPanel.innerHTML = html;
  };

  const renderWords = (): void => {
    if (!stats) { wordsCard.innerHTML = ""; return; }
    const file = currentFile();
    const current = file >= 0 ? sectionAt(stats, file, cursorLine()) : -1;
    const sections = stats.sections
      .map((section, index) => ({section, index}))
      .filter((entry): entry is {section: ManuscriptSection; index: number} => entry.section !== null);
    const max = Math.max(1, ...sections.map(({section}) => section.words));
    const included = stats.files.length - 1;
    const today = stats.today ?? 0;
    let html = `<div class="ms-wtop"><span class="ms-total">${formatWords(stats.total)} mots</span>`
      + (today ? `<span class="ms-today">${today > 0 ? "+" : "−"}${formatWords(Math.abs(today))} aujourd'hui</span>` : "")
      + `</div><div class="ms-sub">${escapeHtml(rootName())}${included > 0 ? ` et ${included} fichier${included > 1 ? "s" : ""} inclus` : ""}</div>`;
    if (sections.length) html += `<div class="ms-secs">`;
    for (const {section, index} of sections) {
      const label = `${section.number ? `${escapeHtml(section.number)} ` : ""}${escapeHtml(section.title)}`;
      const width = Math.max(2, Math.round((section.words / max) * 100));
      const over = section.limit !== null && section.words > section.limit;
      const count = editingLimits
        ? `<input class="ms-limit" type="number" min="0" step="10" inputmode="numeric" data-key="${escapeHtml(section.key)}" value="${section.limit ?? ""}" placeholder="limite" aria-label="Limite de mots pour ${label}">`
        : `<span class="ms-count${over ? " over" : ""}">${formatWords(section.words)}${section.limit !== null ? ` / ${formatWords(section.limit)}` : ""}</span>`;
      html += `<div class="ms-sec${index === current ? " on" : ""}" role="button" tabindex="0" data-s="${index}">`
        + `<span class="ms-name">${label}</span><span class="ms-bar"><i style="width:${width}%"></i></span>${count}</div>`;
    }
    if (sections.length) html += `</div>`;
    const check = (on: boolean) => on ? SVG_CHECK : "";
    html += `<div class="ms-sep"></div>`
      + `<button type="button" class="ms-mi" data-pref="captions" aria-pressed="${stats.captions}"><span>Compter les légendes</span>${check(stats.captions)}</button>`
      + `<button type="button" class="ms-mi" data-pref="footnotes" aria-pressed="${stats.footnotes}"><span>Compter les notes de bas de page</span>${check(stats.footnotes)}</button>`
      + `<button type="button" class="ms-mi" data-pref="limits" aria-pressed="${editingLimits}"><span>${editingLimits ? "Terminer les limites" : "Limite de mots par section…"}</span>${check(editingLimits)}</button>`
      + `<div class="ms-foot">Sans les commandes, équations, commentaires ni la bibliographie.</div>`;
    wordsCard.innerHTML = html;
  };

  const renderOpen = (): void => {
    if (isOpen(todoPanel)) renderTodo();
    if (isOpen(wordsCard) && !editingLimits) renderWords();
    renderTicks();
  };

  const setOpen = (element: HTMLElement, button: HTMLElement, open: boolean): void => {
    element.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
    button.classList.toggle("on", open);
  };
  const close = (): void => {
    if (editingLimits) { editingLimits = false; void saveLimits(); }
    setOpen(todoPanel, todoButton, false);
    setOpen(wordsCard, wordsButton, false);
  };

  const refresh = async (): Promise<void> => {
    const editor = options.getEditor();
    const seq = ++requestSeq;
    try {
      const response = await fetchImpl("/tex/manuscript", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path: options.path, text: editor ? editor.getValue() : undefined, day: localDay()}),
      });
      const body = await response.json() as ManuscriptStats;
      if (seq !== requestSeq) return;
      stats = body?.ok ? body : null;
    } catch {
      if (seq !== requestSeq) return;
      stats = null;
    }
    renderBar();
    renderOpen();
  };

  const savePrefs = async (payload: Record<string, unknown>): Promise<void> => {
    try {
      await fetchImpl("/tex/manuscript/prefs", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path: options.path, ...payload}),
      });
    } catch { /* le compte reste celui d'avant */ }
    await refresh();
  };

  const saveLimits = async (): Promise<void> => {
    const limits: Record<string, number | null> = {};
    let changed = false;
    wordsCard.querySelectorAll<HTMLInputElement>("input.ms-limit").forEach((input) => {
      const key = input.dataset.key || "";
      const value = Number.parseInt(input.value, 10);
      const next = Number.isFinite(value) && value > 0 ? value : null;
      const previous = stats?.sections.find((section) => section?.key === key)?.limit ?? null;
      if (next !== previous) { limits[key] = next; changed = true; }
    });
    if (changed) await savePrefs({limits});
  };

  const countSelection = async (): Promise<void> => {
    const editor = options.getEditor();
    const seq = ++selectionSeq;
    const text = editor ? editor.getSelection() : "";
    if (!text.trim()) {
      if (selectionWords !== null) { selectionWords = null; renderBar(); }
      return;
    }
    try {
      const response = await fetchImpl("/tex/wordcount", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({text}),
      });
      const body = await response.json() as {ok?: boolean; words?: number};
      if (seq !== selectionSeq) return;
      selectionWords = body?.ok && typeof body.words === "number" ? body.words : null;
    } catch {
      if (seq !== selectionSeq) return;
      selectionWords = null;
    }
    renderBar();
  };

  const onCursor = (): void => {
    const editor = options.getEditor();
    if (!editor) return;
    const cursor = editor.getCursor();
    position.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
    // Le reste attend le repos du curseur (§15).
    if (cursorTimer !== null) win.clearTimeout(cursorTimer);
    cursorTimer = win.setTimeout(() => { cursorTimer = null; void countSelection(); }, 200);
    if (renderTimer !== null) win.clearTimeout(renderTimer);
    renderTimer = win.setTimeout(() => { renderTimer = null; renderOpen(); }, 160);
  };

  const noteChange = (): void => {
    if (changeTimer !== null) win.clearTimeout(changeTimer);
    changeTimer = win.setTimeout(() => { changeTimer = null; void refresh(); }, 1200);
  };

  const goToTodo = (todo: ManuscriptTodo): void => {
    const editor = options.getEditor();
    const target = stats?.files[todo.file];
    if (!stats || !target) return;
    if (target.current && editor) options.revealLine(editor, todo.line - 1);
    else options.openFile(target.path, todo.line);
  };

  const askAgent = (todo: ManuscriptTodo): void => {
    const target = stats?.files[todo.file];
    if (!target) return;
    const editor = options.getEditor();
    const lineText = target.current && editor && todo.line - 1 < editor.lineCount()
      ? editor.getLine(todo.line - 1).trim()
      : "";
    options.postToHost({
      type: "atelier-add-to-chat",
      text: `${target.path} (L${todo.line})${lineText ? ` : « ${lineText} »` : ""}\nÀ faire (${todo.kind}) : ${todo.text || "(sans texte)"}`,
    });
  };

  const markDone = (todo: ManuscriptTodo): void => {
    const editor = options.getEditor();
    if (!stats || !editor || !stats.files[todo.file]?.current) return;
    const line = todo.line - 1;
    if (line >= editor.lineCount()) return;
    // deux \todo sur la même ligne : retirer celui-ci, pas le premier venu
    const nth = stats.todos.slice(0, stats.todos.indexOf(todo))
      .filter((other) => other.file === todo.file && other.line === todo.line && other.kind === todo.kind).length;
    const removal = todoRemoval(editor.getLine(line), todo.kind, nth);
    if (!removal) { void refresh(); return; }
    if (removal.whole) {
      const last = line === editor.lineCount() - 1;
      if (last && line > 0) editor.replaceRange("", {line: line - 1, ch: editor.getLine(line - 1).length}, {line, ch: editor.getLine(line).length}, "+todo-done");
      else if (last) editor.replaceRange("", {line, ch: 0}, {line, ch: editor.getLine(line).length}, "+todo-done");
      else editor.replaceRange("", {line, ch: 0}, {line: line + 1, ch: 0}, "+todo-done");
    } else {
      editor.replaceRange("", {line, ch: removal.from}, {line, ch: removal.to}, "+todo-done");
    }
    // Retrait immédiat de la liste ; le serveur confirme au prochain compte.
    stats.todos = stats.todos.filter((other) => other !== todo)
      .map((other) => other.file === todo.file && other.line > todo.line && removal.whole
        ? {...other, line: other.line - 1}
        : other);
    renderBar();
    renderOpen();
    noteChange();
  };

  const goToSection = (section: ManuscriptSection): void => {
    const editor = options.getEditor();
    const target = stats?.files[section.file];
    if (!target) return;
    if (target.current && editor) options.revealLine(editor, section.line);
    else options.openFile(target.path, section.line + 1);
  };

  todoButton.addEventListener("click", () => {
    const open = !isOpen(todoPanel);
    close();
    setOpen(todoPanel, todoButton, open);
    if (open) { renderTodo(); void refresh(); }
  });
  wordsButton.addEventListener("click", () => {
    const open = !isOpen(wordsCard);
    close();
    setOpen(wordsCard, wordsButton, open);
    if (open) { renderWords(); void refresh(); }
  });

  todoPanel.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const item = target?.closest<HTMLElement>(".ms-item");
    const todo = item ? stats?.todos[Number(item.dataset.i)] : undefined;
    if (!todo) return;
    const action = target?.closest<HTMLElement>("[data-act]")?.dataset.act;
    if (action === "chat") { askAgent(todo); return; }
    if (action === "done") { markDone(todo); return; }
    goToTodo(todo);
  });
  todoPanel.addEventListener("keydown", (event) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(".ms-item");
    if (!item || (event.key !== "Enter" && event.key !== " ") || event.target !== item) return;
    event.preventDefault();
    const todo = stats?.todos[Number(item.dataset.i)];
    if (todo) goToTodo(todo);
  });

  wordsCard.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const pref = target?.closest<HTMLElement>("[data-pref]")?.dataset.pref;
    if (pref === "captions" && stats) { void savePrefs({captions: !stats.captions}); return; }
    if (pref === "footnotes" && stats) { void savePrefs({footnotes: !stats.footnotes}); return; }
    if (pref === "limits") {
      if (editingLimits) {
        editingLimits = false;
        void saveLimits().then(renderWords);
      } else {
        editingLimits = true;
        renderWords();
        wordsCard.querySelector<HTMLInputElement>("input.ms-limit")?.focus();
      }
      return;
    }
    if (editingLimits || target?.closest("input")) return;
    const row = target?.closest<HTMLElement>(".ms-sec");
    const section = row ? stats?.sections[Number(row.dataset.s)] : null;
    if (section) goToSection(section);
  });
  wordsCard.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches("input.ms-limit")) {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); editingLimits = false; void saveLimits().then(renderWords); }
      return;
    }
    const row = target?.closest<HTMLElement>(".ms-sec");
    if (!row || target !== row || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    const section = stats?.sections[Number(row.dataset.s)];
    if (section) goToSection(section);
  });

  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (isOpen(todoPanel) || isOpen(wordsCard))) close();
  });
  doc.addEventListener("mousedown", (event) => {
    const target = event.target as Node | null;
    if (!target || (!isOpen(todoPanel) && !isOpen(wordsCard))) return;
    if (todoPanel.contains(target) || wordsCard.contains(target) || bar.contains(target)) return;
    close();
  });
  // Un agent a pu écrire un \input pendant qu'on était ailleurs.
  win.addEventListener("focus", () => { if (bound) void refresh(); });

  const bind = (): void => {
    const editor = options.getEditor();
    if (!editor || bound) return;
    bound = true;
    options.host.append(ticks, todoPanel, wordsCard, bar);
    editor.on("cursorActivity", onCursor);
    onCursor();
    void refresh();
  };

  return {bind, refresh, noteChange, close, stats: () => stats};
}
