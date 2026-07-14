export type SyntaxTokenKind =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "type"
  | "property"
  | "operator";

export type SyntaxToken = { kind: SyntaxTokenKind; text: string };

export type SyntaxLanguage =
  | "javascript"
  | "python"
  | "shell"
  | "json"
  | "css"
  | "markup"
  | "latex"
  | "plain";

const KEYWORDS: Record<SyntaxLanguage, Set<string>> = {
  javascript: new Set("as async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof interface let new null of return static super switch this throw true try type typeof undefined var void while yield".split(" ")),
  python: new Set("and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield".split(" ")),
  shell: new Set("case do done elif else esac export fi for function if in local readonly select then time until while".split(" ")),
  json: new Set(["true", "false", "null"]),
  css: new Set("@media @supports from important inherit initial none to transparent unset var".split(" ")),
  markup: new Set(),
  latex: new Set(),
  plain: new Set(),
};

const TYPES = new Set("Array Boolean Date Error Map Number Object Promise Record Set String bigint boolean never number object string symbol unknown void".split(" "));

export function languageForFile(name: string): SyntaxLanguage {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext)) return "javascript";
  if (["py", "r", "jl"].includes(ext)) return "python";
  if (["sh", "bash", "zsh", "fish"].includes(ext)) return "shell";
  if (["json", "jsonl", "geojson"].includes(ext)) return "json";
  if (["css", "scss", "sass", "less"].includes(ext)) return "css";
  if (["html", "xml", "svg", "md"].includes(ext)) return "markup";
  if (["tex", "sty", "cls", "bib"].includes(ext)) return "latex";
  return "plain";
}

export function tokenizeLine(line: string, language: SyntaxLanguage): SyntaxToken[] {
  if (language === "plain" || !line) return [{ kind: "plain", text: line || " " }];

  const comment = language === "python" || language === "shell" ? "#" : language === "latex" ? "%" : "//";
  const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|[A-Za-z_$@\\][\w$@\\-]*|===|!==|=>|==|!=|<=|>=|&&|\|\||[{}()[\].,:;=+\-*/<>!?&|])/g;
  const tokens: SyntaxToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  const commentAt = line.indexOf(comment);
  const effectiveEnd = commentAt >= 0 ? commentAt : line.length;
  const source = line.slice(0, effectiveEnd);

  while ((match = pattern.exec(source))) {
    if (match.index > cursor) tokens.push({ kind: "plain", text: source.slice(cursor, match.index) });
    const text = match[0];
    let kind: SyntaxTokenKind = "plain";
    if (/^["'`]/.test(text)) kind = "string";
    else if (/^\d/.test(text)) kind = "number";
    else if (KEYWORDS[language].has(text)) kind = "keyword";
    else if (TYPES.has(text) || /^[A-Z][A-Za-z0-9_]+$/.test(text)) kind = "type";
    else if (/^[{}()[\].,:;=+\-*/<>!?&|]/.test(text)) kind = "operator";
    else if (language === "json" && source.slice(pattern.lastIndex).trimStart().startsWith(":")) kind = "property";
    else if ((language === "latex" && text.startsWith("\\")) || (language === "markup" && text.startsWith("@"))) kind = "keyword";
    tokens.push({ kind, text });
    cursor = pattern.lastIndex;
  }
  if (cursor < source.length) tokens.push({ kind: "plain", text: source.slice(cursor) });
  if (commentAt >= 0) tokens.push({ kind: "comment", text: line.slice(commentAt) });
  return tokens.length ? tokens : [{ kind: "plain", text: line || " " }];
}
