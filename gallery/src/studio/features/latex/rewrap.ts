import type {StudioEditor} from "../../core/editor_contract";

interface RewrapEditor extends StudioEditor {
  somethingSelected(): boolean;
  getGutterElement(): HTMLElement;
  defaultCharWidth(): number;
}

export interface RewrapControllerOptions {
  editor: RewrapEditor;
  isTex: boolean;
  extension: string;
  getWrapValue(): string;
  setState(kind: "hint" | "ok", message: string): void;
  document?: Document;
  button?: HTMLElement | null;
}

export interface RewrapController {
  column(): number;
  paragraph(): void;
  all(): number;
}

const NO_WRAP_ENVIRONMENT = /^(verbatim|lstlisting|minted|equation|align|alignat|eqnarray|gather|multline|displaymath|math|tabular|tabularx|array|table|figure|itemize|enumerate|description|thebibliography|tikzpicture|verse|quote|quotation)\*?$/;

function pixelValue(value: string | undefined): number {
  const parsed = Number.parseFloat(value || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function rewrapColumn(editor: RewrapEditor, wrapValue: string): number {
  const numeric = Number.parseInt(wrapValue, 10);
  if (numeric) return numeric;
  const wrapper = editor.getWrapperElement();
  const gutter = editor.getGutterElement().offsetWidth;
  const charWidth = Math.max(1, editor.defaultCharWidth());
  const content = wrapper.querySelector?.<HTMLElement>(".cm-content, .CodeMirror-code") || null;
  const sampleLine = wrapper.querySelector?.<HTMLElement>(".cm-line, pre.CodeMirror-line") || null;
  const view = sampleLine?.ownerDocument.defaultView;
  const style = sampleLine && view ? view.getComputedStyle(sampleLine) : null;
  const horizontalPadding = pixelValue(style?.paddingLeft) + pixelValue(style?.paddingRight);
  // The outer editor width includes the scrollbar, gutter and line padding.
  // Ignoring those few pixels allowed a physically rewrapped source line to
  // soft-wrap again, producing a continuation row without a line number.
  const contentWidth = content?.clientWidth || Math.max(0, wrapper.clientWidth - gutter - 16);
  const safeTextWidth = Math.max(0, contentWidth - horizontalPadding - (charWidth * 2));
  return Math.max(40, Math.min(120, Math.floor(safeTextWidth / charWidth)));
}

export function createRewrapController(options: RewrapControllerOptions): RewrapController {
  const editor = options.editor;
  const prefixPattern = options.isTex ? /^\s*(%+)\s?/
    : options.extension === "md" ? null : /^\s*(#+|\/\/)\s?/;
  const prefixOf = (line: string): string => prefixPattern ? (line.match(prefixPattern)?.[1] || "") : "";
  const column = (): number => rewrapColumn(editor, options.getWrapValue());
  const wrapLines = (lines: string[], targetColumn: number): string[] => {
    const first = lines[0] || "";
    const indent = first.match(/^\s*/)?.[0] || "";
    const firstPrefix = prefixOf(first);
    const allComment = Boolean(firstPrefix) && lines.every((line) => !line.trim() || line.trim().startsWith(firstPrefix));
    const prefix = allComment ? `${indent}${firstPrefix} ` : indent;
    const strip = (line: string): string => allComment
      ? line.replace(new RegExp(`^\\s*${firstPrefix.replace(/[%/]/g, "\\$&")}\\s?`), "").trim()
      : line.trim();
    const words = lines.flatMap((line) => strip(line).split(/\s+/)).filter(Boolean);
    const output: string[] = [];
    let current = "";
    for (const word of words) {
      if (!current) current = prefix + word;
      else if (`${current} ${word}`.length <= targetColumn) current += ` ${word}`;
      else {
        output.push(current);
        current = prefix + word;
      }
    }
    if (current) output.push(current);
    return output;
  };
  const reflowable = (block: string[]): boolean => {
    const firstPrefix = prefixOf(block[0] || "");
    if (firstPrefix && block.every((line) => !line.trim() || line.trim().startsWith(firstPrefix))) return true;
    if (!options.isTex) return false;
    return !block.some((line) => line.replace(/\\./g, "  ").includes("%"));
  };
  const paragraph = (): void => {
    let from: number;
    let to: number;
    if (editor.somethingSelected()) {
      from = editor.getCursor("from").line;
      to = editor.getCursor("to").line;
    } else {
      const current = editor.getCursor().line;
      const last = editor.lineCount() - 1;
      from = current;
      while (from > 0 && editor.getLine(from - 1).trim() !== "") from -= 1;
      to = current;
      while (to < last && editor.getLine(to + 1).trim() !== "") to += 1;
    }
    const lines: string[] = [];
    for (let line = from; line <= to; line += 1) lines.push(editor.getLine(line));
    if (!reflowable(lines)) {
      options.setState("hint", "non reformaté : commentaire % au milieu du bloc (risque de fuite de texte)");
      return;
    }
    const output = wrapLines(lines, column());
    editor.replaceRange(output.join("\n"), {line: from, ch: 0}, {line: to, ch: editor.getLine(to).length});
  };
  const all = (): number => {
    const targetColumn = column();
    const last = editor.lineCount() - 1;
    const paragraphs: Array<{from: number; to: number; output: string[]}> = [];
    let line = 0;
    let environmentDepth = 0;
    while (line <= last) {
      const raw = editor.getLine(line);
      for (const match of raw.matchAll(/\\(begin|end)\{([^}]*)\}/g)) {
        if (NO_WRAP_ENVIRONMENT.test(match[2] || "")) environmentDepth += match[1] === "begin" ? 1 : -1;
      }
      if (environmentDepth > 0 || raw.trim() === "") {
        line += 1;
        continue;
      }
      let end = line;
      const block = [raw];
      while (end < last) {
        const next = editor.getLine(end + 1);
        const opening = next.match(/\\begin\{([^}]*)\}/);
        if (next.trim() === "" || opening && NO_WRAP_ENVIRONMENT.test(opening[1] || "")) break;
        block.push(next);
        end += 1;
      }
      const commandOnly = (value: string): boolean => value.trim() !== ""
        && !/[a-zà-ÿ]/i.test(value.replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})*/g, ""));
      const prose = block.some((value) => !commandOnly(value) && value.trim() !== "");
      if (prose && reflowable(block)) {
        const output: string[] = [];
        let run: string[] = [];
        const flush = (): void => {
          if (run.length) output.push(...wrapLines(run, targetColumn));
          run = [];
        };
        for (const value of block) {
          if (commandOnly(value)) {
            flush();
            output.push(value);
          } else run.push(value);
        }
        flush();
        if (output.join("\n") !== block.join("\n")) paragraphs.push({from: line, to: end, output});
      }
      line = end + 1;
    }
    if (paragraphs.length) {
      const cursor = editor.getCursor();
      editor.operation(() => {
        for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
          const item = paragraphs[index];
          if (!item) continue;
          editor.replaceRange(item.output.join("\n"), {line: item.from, ch: 0},
            {line: item.to, ch: editor.getLine(item.to).length});
        }
      });
      editor.setCursor({line: Math.min(cursor.line, editor.lineCount() - 1), ch: cursor.ch});
    }
    return paragraphs.length;
  };

  const controller = {column, paragraph, all};
  const doc = options.document || document;
  doc.addEventListener("keydown", (event) => {
    if (!event.altKey || event.metaKey || event.ctrlKey || event.code !== "KeyQ") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      const count = all();
      options.setState("ok", count ? `rewrap : ${count} paragraphe${count > 1 ? "s" : ""}` : "rien à reformater");
    } else paragraph();
    editor.focus();
  }, true);
  if (options.button) options.button.onclick = () => {
    paragraph();
    editor.focus();
  };
  return controller;
}
