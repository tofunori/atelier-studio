import { StateField, type Extension, type Range, type Text } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import hljs from "highlight.js/lib/common";

const EXTENSION_LANGUAGES: Record<string, string> = {
  bash: "bash", c: "c", cc: "cpp", cpp: "cpp", cs: "csharp", css: "css",
  go: "go", h: "c", hpp: "cpp", htm: "xml", html: "xml", java: "java",
  js: "javascript", jsx: "javascript", json: "json", jsonl: "json", kt: "kotlin",
  kts: "kotlin", less: "less", lua: "lua", m: "objectivec", md: "markdown",
  mdx: "markdown", mjs: "javascript", mts: "typescript", php: "php", pl: "perl",
  py: "python", r: "r", rb: "ruby", rs: "rust", sass: "scss", scss: "scss",
  sh: "bash", sql: "sql", swift: "swift", toml: "ini", ts: "typescript",
  tsx: "typescript", vue: "xml", wasm: "wasm", xhtml: "xml", xml: "xml",
  yaml: "yaml", yml: "yaml", zsh: "bash",
};

function languageForPath(path?: string) {
  if (!path) return null;
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (["dockerfile", "makefile"].includes(name)) return name;
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  const language = EXTENSION_LANGUAGES[extension];
  return language && hljs.getLanguage(language) ? language : null;
}

function highlightedRanges(doc: Text, language: string): DecorationSet {
  const source = doc.toString();
  if (!source) return Decoration.none;
  const html = hljs.highlight(source, { language, ignoreIllegals: true }).value;
  const template = document.createElement("template");
  template.innerHTML = html;
  const ranges: Range<Decoration>[] = [];
  let offset = 0;

  function visit(node: Node, inherited: string[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (length > 0 && inherited.length > 0) {
        ranges.push(Decoration.mark({ class: [...new Set(inherited)].join(" ") }).range(offset, offset + length));
      }
      offset += length;
      return;
    }
    const own = node instanceof HTMLElement
      ? [...node.classList].filter((className) => className.startsWith("hljs-"))
      : [];
    node.childNodes.forEach((child) => visit(child, [...inherited, ...own]));
  }

  template.content.childNodes.forEach((node) => visit(node, []));
  return Decoration.set(ranges, true);
}

/** Read-only syntax colors shared by Atelier's CodeMirror diff surfaces. */
export function codeHighlight(path?: string): Extension {
  const language = languageForPath(path);
  if (!language) return [];
  const field = StateField.define<DecorationSet>({
    create: (state) => highlightedRanges(state.doc, language),
    update: (value, transaction) => transaction.docChanged
      ? highlightedRanges(transaction.state.doc, language)
      : value,
    provide: (source) => EditorView.decorations.from(source),
  });
  return field;
}
