import type {StudioBookmark, StudioEditor} from "../../core/editor_contract";

interface GhostEditor extends StudioEditor {
  Pass: unknown;
  somethingSelected(): boolean;
  addKeyMap(map: Record<string, () => unknown>): void;
  onInput(callback: () => void): void;
}

export interface LatexGhostController {
  accept(): boolean;
  clear(): void;
  suggestion(): string;
}

const COMMANDS = [
  "abstract", "author", "begin", "bibliography", "bibliographystyle", "caption",
  "chapter", "cite", "citep", "citet", "clearpage", "cref", "documentclass",
  "emph", "end", "eqref", "figure", "footnote", "includegraphics", "item",
  "label", "maketitle", "newpage", "paragraph", "ref", "section", "subsection",
  "subsubsection", "table", "textbf", "textit", "texttt", "title", "url",
];

const ENVIRONMENTS = [
  "document", "abstract", "figure", "table", "itemize", "enumerate",
  "equation", "equation*", "align", "align*", "gather", "gather*",
  "tabular", "center", "quote", "verbatim", "thebibliography",
];

const FALLBACK_WORDS = [
  "albedo", "analysis", "approach", "background", "because", "between",
  "compared", "consistent", "decrease", "effect", "estimated", "figure",
  "however", "important", "increase", "indicates", "method", "model",
  "observed", "regional", "response", "results", "section", "significant",
  "snow", "surface", "therefore", "using", "whereas", "which",
];

const NEXT_WORDS: Readonly<Record<string, readonly string[]>> = {
  albedo: ["response", "change", "signal"],
  analysis: ["shows", "indicates", "suggests"],
  model: ["shows", "estimates", "includes"],
  our: ["results", "analysis", "model"],
  results: ["show", "suggest", "indicate"],
  surface: ["albedo", "response", "conditions"],
  the: ["model", "results", "analysis", "surface", "observed"],
  these: ["results", "patterns", "estimates"],
  this: ["suggests", "indicates", "section", "result"],
  we: ["find", "estimate", "show", "use"],
};

export function cleanLatexGhostText(source: string): string {
  return String(source || "")
    .replace(/(^|[^\\])%.*$/gm, "$1")
    .replace(/\\(?:begin|end|cite[a-z]*|ref|eqref|cref|label|url|includegraphics)\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, " ")
    .replace(/[{}[\]$^_~&#]/g, " ")
    .replace(/[.,;:!?()\"]/g, " ");
}

export function latexGhostTokens(source: string): string[] {
  return cleanLatexGhostText(source).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
}

export function openLatexEnvironment(context: string): string {
  const stack: string[] = [];
  const pattern = /\\(begin|end)\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(context))) {
    const kind = match[1];
    const name = match[2] || "";
    if (kind === "begin") stack.push(name);
    else {
      const index = stack.lastIndexOf(name);
      if (index >= 0) stack.splice(index, 1);
    }
  }
  return stack.at(-1) || "";
}

export function installLegacyLatexGhost(
  editor: GhostEditor,
  doc: Document = document,
): LatexGhostController {
  let mark: StudioBookmark | null = null;
  let ghostText = "";
  let timer: number | null = null;
  let hiddenUntilChange = false;
  let cachedRaw: string | null = null;
  let cachedTokens: string[] | null = null;
  let cachedLabels: string[] | null = null;

  const clear = (): void => {
    mark?.clear();
    mark = null;
    ghostText = "";
  };
  const invalidate = (): void => {
    cachedRaw = null;
    cachedTokens = null;
    cachedLabels = null;
  };
  const textBeforeCursor = (): string => {
    const cursor = editor.getCursor();
    const lines: string[] = [];
    const start = Math.max(0, cursor.line - 160);
    for (let line = start; line < cursor.line; line += 1) lines.push(editor.getLine(line));
    lines.push(editor.getLine(cursor.line).slice(0, cursor.ch));
    return lines.join("\n");
  };
  const documentTokens = (): string[] => {
    const raw = editor.getValue();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedTokens = latexGhostTokens(raw);
      cachedLabels = null;
    }
    return cachedTokens || [];
  };
  const environmentNames = (): string[] => {
    const names = [...ENVIRONMENTS];
    const pattern = /\\begin\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(editor.getValue()))) {
      const name = match[1] || "";
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  };
  const bestWord = (prefix: string): string => {
    if (prefix.length < 2) return "";
    const tokens = documentTokens();
    const score: Record<string, number> = {};
    tokens.forEach((word, index) => {
      if (word !== prefix && word.startsWith(prefix)) {
        score[word] = (score[word] || 0) + 2 + Math.min(5, index / Math.max(1, tokens.length));
      }
    });
    return Object.keys(score).sort((a, b) => (score[b] || 0) - (score[a] || 0) || a.length - b.length)[0]
      || FALLBACK_WORDS.find((word) => word.startsWith(prefix) && word !== prefix)
      || "";
  };
  const bestNext = (previous: string): string => {
    if (!previous || previous.length < 3) return "";
    const tokens = documentTokens();
    const score: Record<string, number> = {};
    for (let index = 0; index < tokens.length - 1; index += 1) {
      const next = tokens[index + 1] || "";
      if (tokens[index] === previous && next !== previous) score[next] = (score[next] || 0) + 1;
    }
    return Object.keys(score).sort((a, b) => (score[b] || 0) - (score[a] || 0) || a.length - b.length)[0]
      || NEXT_WORDS[previous]?.[0]
      || "";
  };
  const labelSuggestion = (prefix: string): string => {
    if (!cachedLabels) {
      cachedLabels = [];
      const pattern = /\\(?:label|bibitem)\{([^}]+)\}/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(editor.getValue()))) cachedLabels.push(match[1] || "");
    }
    return cachedLabels.find((label) => label.startsWith(prefix) && label !== prefix) || "";
  };
  const suggestion = (): string => {
    if (hiddenUntilChange || editor.somethingSelected()) return "";
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line) || "";
    const before = line.slice(0, cursor.ch);
    const after = line.slice(cursor.ch);
    if (/\S/.test(after.slice(0, 1)) || /^\s*%/.test(before)) return "";
    const dollars = (before.match(/(^|[^\\])\$/g) || []).length;
    if (dollars % 2) return "";

    let match = before.match(/\\(begin|end)\{([^}]*)$/);
    if (match) {
      const kind = match[1];
      const raw = match[2] || "";
      const environments = environmentNames();
      const first = kind === "end" ? openLatexEnvironment(textBeforeCursor()) : "";
      const ordered = first ? [first, ...environments.filter((name) => name !== first)] : environments;
      const hit = ordered.find((name) => name.startsWith(raw) && name !== raw);
      return hit ? `${hit.slice(raw.length)}}` : "";
    }

    match = before.match(/\\([A-Za-z]*)$/);
    if (match) {
      const raw = match[1] || "";
      if (!raw) return "";
      const hit = COMMANDS.find((command) => command.startsWith(raw) && command !== raw);
      return hit ? hit.slice(raw.length) : "";
    }

    match = before.match(/\\(?:cite[a-z]*|ref|eqref|cref|Cref)\{([^},\s]*)$/);
    if (match) {
      const raw = match[1] || "";
      const hit = labelSuggestion(raw);
      return hit ? hit.slice(raw.length) : "";
    }

    match = before.match(/([A-Za-z][A-Za-z'-]{1,})$/);
    if (match) {
      const prefix = (match[1] || "").toLowerCase();
      const hit = bestWord(prefix);
      return hit ? hit.slice(prefix.length) : "";
    }

    match = before.match(/([A-Za-z][A-Za-z'-]{2,})\s+$/);
    if (match) return bestNext((match[1] || "").toLowerCase());

    match = textBeforeCursor().match(/([A-Za-z][A-Za-z'-]{2,})\s*$/);
    if (match) {
      const hit = bestNext((match[1] || "").toLowerCase());
      return hit ? ` ${hit}` : "";
    }
    return "";
  };
  const show = (text: string): void => {
    clear();
    if (!text || !/\S/.test(text)) return;
    const span = doc.createElement("span");
    span.className = "cm-ghost-suggest";
    span.innerHTML = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
    ghostText = text;
    mark = editor.setBookmark(editor.getCursor(), {widget: span, insertLeft: true});
  };
  const update = (delay = 120): void => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => show(suggestion()), delay);
  };
  const accept = (): boolean => {
    if (!ghostText) return false;
    const text = ghostText;
    clear();
    editor.replaceRange(text, editor.getCursor(), undefined, "+ghost");
    return true;
  };

  editor.addKeyMap({
    Tab: () => accept() ? null : editor.Pass,
    Esc: () => {
      if (!ghostText) return editor.Pass;
      hiddenUntilChange = true;
      clear();
      return null;
    },
  });
  editor.onInput(() => {
    hiddenUntilChange = false;
    update(90);
  });
  editor.on("cursorActivity", () => update(120));
  editor.on("change", (...args: unknown[]) => {
    const change = args[1] as {origin?: string} | undefined;
    invalidate();
    if (change?.origin !== "+ghost") {
      hiddenUntilChange = false;
      update(140);
    }
  });
  editor.on("blur", clear);

  return {accept, clear, suggestion};
}
