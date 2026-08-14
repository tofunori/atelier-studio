import type {StudioEditor, StudioPosition} from "../../core/editor_contract";
import {findAnnotationRange} from "./annotations";

export interface KatexRenderer {
  renderToString(source: string, options: Record<string, unknown>): string;
}

interface ReadingBlock {
  type: "h" | "p" | "list" | "env";
  line: number;
  text?: string;
  tag?: string;
  ordered?: boolean;
  items?: Array<{text: string; line: number}>;
  name?: string;
}

export interface LatexReadingOptions {
  getEditor(): StudioEditor | null;
  right: HTMLElement;
  splitButton: HTMLElement;
  popPdfButton?: HTMLElement | null;
  setPdfVisible(visible: boolean): void;
  revealLine(editor: StudioEditor, line: number): void;
  /** Prose sélectionnée en vue Lecture, déjà ramenée à ses positions source :
   *  l'hôte y branche la même pastille que dans l'éditeur (commenter, envoyer
   *  au chat). Absent = pas de sélection annotable en Lecture. */
  onProseSelection?(selection: {
    text: string;
    from: StudioPosition;
    to: StudioPosition;
    anchor: {box: DOMRect; caret: {left: number; top: number; bottom: number}};
  }): void;
  /** Appelé quand la sélection de prose disparaît, pour retirer la pastille. */
  onProseSelectionCleared?(): void;
  katex: KatexRenderer;
  document?: Document;
  window?: Window;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export interface LatexReadingController {
  bind(): void;
  render(): void;
  setRead(enabled: boolean): void;
  syncMode(): void;
  isReading(): boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderLatexReadingHtml(source: string, katex: KatexRenderer): string {
  const fullSource = String(source || "");
  const documentMatch = /\\begin\{document\}([\s\S]*?)\\end\{document\}/.exec(fullSource);
  let body = documentMatch?.[1] || fullSource;
  body = body.replace(/(^|[^\\])%.*$/gm, "$1");
  // Plomberie TeX : entre \makeatletter et \makeatother vivent des définitions
  // de macros, jamais de la prose. Sans ce retrait, un fragment sans
  // \begin{document} (chapitre inclus par un fichier racine) fait rendre son
  // préambule de chargement comme un paragraphe — « @path\@undefined@path ».
  // Vidé ligne à ligne et non supprimé : `data-line` renvoie au source, et
  // supprimer des lignes ferait sauter tous les ancrages suivants.
  body = body.replace(/\\makeatletter[\s\S]*?\\makeatother/g, (block: string) => block.replace(/[^\n]/g, ""));
  // Même famille, mais sur une ligne : chargement conditionnel d'une racine,
  // définitions et inclusions. Une ligne qui commence par l'une de ces
  // primitives ne porte pas de texte à lire.
  body = body.replace(/^[ \t]*\\(?:ifdefined|ifx|else|fi|expandafter|endinput|input|include|def|makeatletter|makeatother)\b.*$/gm, "");

  const math: Array<{source: string; display: boolean}> = [];
  const stash = (tex: string, display: boolean): string => {
    math.push({source: tex.trim(), display});
    return `\x00M${math.length - 1}\x00`;
  };
  body = body.replace(/\$\$([\s\S]+?)\$\$/g, (_match, text: string) => stash(text, true));
  body = body.replace(/\\\[([\s\S]+?)\\\]/g, (_match, text: string) => stash(text, true));
  body = body.replace(/\\begin\{(equation|align|equation\*|align\*|gather|gather\*)\}([\s\S]*?)\\end\{\1\}/g,
    (_match, _environment: string, text: string) => stash(text, true));
  body = body.replace(/\$([^$]+?)\$/g, (_match, text: string) => stash(text, false));
  body = body.replace(/\\\(([\s\S]+?)\\\)/g, (_match, text: string) => stash(text, false));

  const lines = body.split("\n");
  const blocks: ReadingBlock[] = [];
  let paragraph: string[] = [];
  let paragraphLine = 0;
  let list: ReadingBlock | null = null;
  const flushParagraph = (): void => {
    if (paragraph.length) blocks.push({type: "p", text: paragraph.join(" "), line: paragraphLine});
    paragraph = [];
  };
  const flushList = (): void => {
    if (list) blocks.push(list);
    list = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] || "").trim();
    const sourceLine = index + 1;
    let match: RegExpExecArray | null;
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    match = /^\\(title|section|subsection|subsubsection|paragraph)\*?\{([\s\S]*?)\}\s*$/.exec(line);
    if (match) {
      flushParagraph();
      flushList();
      const tags: Record<string, string> = {title: "h1", section: "h2", subsection: "h3", subsubsection: "h4", paragraph: "h5"};
      blocks.push({type: "h", tag: tags[match[1] || ""] || "h2", text: match[2] || "", line: sourceLine});
      continue;
    }
    if (/^\\(begin|end)\{(itemize|enumerate)\}/.test(line)) {
      flushParagraph();
      if (/^\\begin/.test(line)) {
        flushList();
        list = {type: "list", ordered: /enumerate/.test(line), items: [], line: sourceLine};
      } else flushList();
      continue;
    }
    match = /^\\item\s*([\s\S]*)$/.exec(line);
    if (match && list) {
      list.items?.push({text: match[1] || "", line: sourceLine});
      continue;
    }
    match = /^\\begin\{(figure|table|tabular|tikzpicture|thebibliography|abstract)\*?\}/.exec(line);
    if (match) {
      flushParagraph();
      flushList();
      const environment = match[1] || "";
      if (environment === "abstract") {
        blocks.push({type: "h", tag: "h2", text: "Abstract", line: sourceLine});
        continue;
      }
      let end = index + 1;
      while (end < lines.length && !new RegExp(`\\\\end\\{${environment}`).test(lines[end] || "")) end += 1;
      if (environment !== "thebibliography") blocks.push({type: "env", name: environment, line: sourceLine});
      index = end;
      continue;
    }
    if (/^\\end\{abstract\}/.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^\\(maketitle|newpage|clearpage|pagebreak|bibliographystyle|bibliography|input|include|tableofcontents|noindent|centering|raggedright|hline|toprule|midrule|bottomrule)\b/.test(line)) continue;
    if (!paragraph.length) paragraphLine = sourceLine;
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  const inline = (value: string): string => {
    let output = escapeHtml(value)
      .replace(/---/g, "—").replace(/--/g, "–")
      .replace(/``/g, "“").replace(/''/g, "”").replace(/`/g, "‘")
      .replace(/~/g, " ")
      .replace(/\\%/g, "%").replace(/\\&/g, "&amp;").replace(/\\_/g, "_")
      .replace(/\\#/g, "#").replace(/\\\$/g, "$").replace(/\\ /g, " ")
      .replace(/\\\\/g, "<br>").replace(/\\newline/g, "<br>")
      .replace(/\[\[([\s\S]*?)\]\]/g, '<span class="tex-todo">[[$1]]</span>')
      .replace(/\\todo\{([\s\S]*?)\}/g, '<span class="tex-todo">$1</span>')
      .replace(/\\textcolor\{[^}]*\}\{([\s\S]*?)\}/g, '<span class="tex-todo">$1</span>');
    for (let pass = 0; pass < 3; pass += 1) {
      output = output.replace(/\\textbf\{([^{}]*)\}/g, "<strong>$1</strong>")
        .replace(/\\(emph|textit|textsl)\{([^{}]*)\}/g, "<em>$2</em>")
        .replace(/\\texttt\{([^{}]*)\}/g, "<code>$1</code>")
        .replace(/\\underline\{([^{}]*)\}/g, "<u>$1</u>");
    }
    output = output.replace(/\\(cite[a-z]*|citep|citet)\{([^}]*)\}/g, '<span class="tex-cite">[$2]</span>')
      .replace(/\\(eqref|ref|autoref|cref|Cref)\{([^}]*)\}/g, '<span class="tex-ref">§$2</span>')
      .replace(/\\label\{[^}]*\}/g, "")
      .replace(/\\footnote\{([\s\S]*?)\}/g, '<sup class="tex-fn" title="$1">*</sup>')
      .replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, '<a href="$1">$2</a>')
      .replace(/\\url\{([^}]*)\}/g, '<a href="$1">$1</a>');
    for (let pass = 0; pass < 4; pass += 1) output = output.replace(/\\[a-zA-Z]+\*?\{([^{}]*)\}/g, "$1");
    return output.replace(/\\[a-zA-Z]+\*?/g, "").replace(/[{}]/g, "");
  };
  const withMath = (html: string): string => html.replace(/\x00M(\d+)\x00/g, (_match, rawIndex: string) => {
    const item = math[Number(rawIndex)];
    if (!item) return "";
    try {
      return katex.renderToString(item.source, {displayMode: item.display, throwOnError: false, errorColor: "#e0726a"});
    } catch {
      return `<span class="tex-matherr">${escapeHtml(item.source)}</span>`;
    }
  });
  return blocks.map((block) => {
    if (block.type === "h") return `<${block.tag} data-line="${block.line}">${withMath(inline(block.text || ""))}</${block.tag}>`;
    if (block.type === "p") return `<p data-line="${block.line}">${withMath(inline(block.text || ""))}</p>`;
    if (block.type === "list") {
      const tag = block.ordered ? "ol" : "ul";
      const items = (block.items || []).map((item) => `<li data-line="${item.line}">${withMath(inline(item.text))}</li>`).join("");
      return `<${tag}>${items}</${tag}>`;
    }
    return `<div class="tex-env" data-line="${block.line}">[ ${block.name} ]</div>`;
  }).join("\n");
}

export function createLatexReadingController(options: LatexReadingOptions): LatexReadingController {
  const doc = options.document || document;
  const win = options.window || window;
  const storage = options.storage || win.localStorage;
  const reading = doc.createElement("div");
  reading.id = "texread";
  options.right.appendChild(reading);
  // Trois vues, un seul segment, icônes seules : les libellés « Édition » et
  // « Split » coûtaient 114 px de barre pour redire ce que la forme montre.
  // Lecture entre dans le segment — elle n'était atteignable que par le menu.
  const glyph = (path: string): string =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45"`
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const readButton = doc.createElement("button");
  readButton.id = "readBtn";
  readButton.title = "Vue Lecture — prose rendue (KaTeX), sans le code";
  readButton.setAttribute("aria-label", "Vue Lecture");
  // Un œil, pas un troisième rectangle : « Édition » et « Lecture » dessinés
  // tous deux en panneau lignés devenaient indiscernables à 14 px.
  readButton.innerHTML = glyph('<path d="M1.4 8s2.5-4.2 6.6-4.2S14.6 8 14.6 8s-2.5 4.2-6.6 4.2S1.4 8 1.4 8Z"/>'
    + '<circle cx="8" cy="8" r="1.9"/>');
  const editButton = doc.createElement("button");
  editButton.id = "editBtn";
  editButton.title = "Éditeur seul";
  editButton.setAttribute("aria-label", "Éditeur seul");
  editButton.innerHTML = glyph('<rect x="2" y="3" width="12" height="10" rx="1.6"/>'
    + '<path d="M4.6 6.2h5M4.6 8.6h6.4M4.6 11h3.2" opacity=".75"/><path d="M2 5.4h12" opacity=".45"/>');
  if (!options.splitButton.querySelector("svg")) {
    options.splitButton.title = "Vue scindée éditeur + PDF";
    options.splitButton.setAttribute("aria-label", "Vue scindée éditeur et PDF");
    options.splitButton.innerHTML = glyph('<rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M8 3v10"/>');
  }
  const segment = doc.createElement("span");
  segment.className = "modeseg";
  options.splitButton.parentNode?.insertBefore(segment, options.splitButton);
  segment.appendChild(editButton);
  segment.appendChild(options.splitButton);
  segment.appendChild(readButton);
  let enabled = false;
  let frame = 0;
  let bound = false;

  const render = (): void => {
    frame = 0;
    try { reading.innerHTML = renderLatexReadingHtml(options.getEditor()?.getValue() || "", options.katex); }
    catch (error) { reading.innerHTML = `<p style="color:#e0726a">Rendu impossible : ${escapeHtml(String(error))}</p>`; }
  };
  const syncMode = (): void => {
    editButton.classList.toggle("on", options.right.style.display === "none" && !enabled);
    options.splitButton.classList.toggle("on", options.right.style.display !== "none" && !enabled);
  };
  const setRead = (next: boolean): void => {
    enabled = next;
    storage.setItem("texReadMode", next ? "1" : "0");
    options.right.classList.toggle("reading", next);
    readButton.classList.toggle("on", next);
    // Lecture = une vue à part entière, prose plein cadre. Le panneau droit
    // doit d'abord exister (il porte #texread) avant qu'on masque l'éditeur.
    if (next && options.right.style.display === "none") options.setPdfVisible(true);
    doc.documentElement.classList.toggle("tex-read-only", next);
    if (next) {
      options.splitButton.classList.remove("on");
      render();
    }
    win.setTimeout(() => options.getEditor()?.refresh(), 60);
    syncMode();
  };
  readButton.onclick = () => setRead(!enabled);
  editButton.onclick = () => {
    if (enabled) setRead(false);
    options.setPdfVisible(false);
    syncMode();
  };
  options.splitButton.addEventListener("click", () => { if (enabled) setRead(false); });
  options.popPdfButton?.addEventListener("click", () => { if (enabled) setRead(false); });
  reading.addEventListener("click", (event) => {
    // Une sélection en cours n'est pas un clic de navigation : sans ça, finir
    // de surligner un passage renverrait aussitôt vers la source.
    if (!win.getSelection()?.isCollapsed) return;
    const element = (event.target as Element | null)?.closest<HTMLElement>("[data-line]");
    const editor = options.getEditor();
    if (!element || !editor) return;
    const line = Number.parseInt(element.dataset.line || "", 10) - 1;
    if (Number.isFinite(line)) options.revealLine(editor, line);
  });

  // ---- sélection de prose : commenter et envoyer au chat depuis la Lecture --
  // Le rendu perd les commandes LaTeX : impossible de compter les caractères
  // pour remonter au source. On retrouve donc le passage PAR SON CONTENU, avec
  // la même primitive que le ré-ancrage des commentaires (piège connu n°6), en
  // partant de la ligne du bloc — l'ancre `data-line` sert de voisinage.
  const proseSelection = (): void => {
    const selection = win.getSelection();
    const editor = options.getEditor();
    if (!selection || !editor || !options.onProseSelection) return;
    const text = String(selection.toString() || "").trim();
    if (!text || selection.isCollapsed || selection.rangeCount === 0) {
      options.onProseSelectionCleared?.();
      return;
    }
    const range = selection.getRangeAt(0);
    if (!reading.contains(range.commonAncestorContainer)) return;
    const holder = (range.startContainer.nodeType === 1
      ? range.startContainer as Element
      : range.startContainer.parentElement)?.closest<HTMLElement>("[data-line]");
    const line = Math.max(0, Number.parseInt(holder?.dataset.line || "1", 10) - 1);
    const source = editor.getValue();
    // La prose rendue colle les lignes du source avec des espaces ; on cherche
    // d'abord tel quel, puis en tolérant les blancs (retours à la ligne).
    const found = findAnnotationRange(source, {text, from: {line, ch: 0}}, editor);
    if (!found) {
      options.onProseSelectionCleared?.();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    options.onProseSelection({
      text,
      from: found.from as StudioPosition,
      to: found.to as StudioPosition,
      anchor: {
        box: reading.getBoundingClientRect(),
        caret: {left: rect.right, top: rect.top, bottom: rect.bottom},
      },
    });
  };
  reading.addEventListener("mouseup", () => win.setTimeout(proseSelection, 0));
  reading.addEventListener("keyup", (event) => {
    if ((event as KeyboardEvent).shiftKey) win.setTimeout(proseSelection, 0);
  });
  const bind = (): void => {
    const editor = options.getEditor();
    if (bound || !editor) return;
    bound = true;
    editor.on("change", () => {
      if (enabled && !frame) frame = win.requestAnimationFrame(render);
    });
    if (storage.getItem("texReadMode") === "1") setRead(true);
  };
  syncMode();
  return {bind, render, setRead, syncMode, isReading: () => enabled};
}
