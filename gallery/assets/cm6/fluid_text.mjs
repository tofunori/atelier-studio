import {StateField} from "@codemirror/state";
import {Decoration, EditorView, WidgetType} from "@codemirror/view";

// Conservative prose-only projection. The document, clipboard and source
// coordinates remain unchanged; only whitespace between source lines hides.
export function fluidJoins(text) {
  const lines = text.split("\n");
  const joins = [];
  const environments = [];
  let offset = 0;
  let previous = null;
  let math = null;
  let braces = 0;
  let protectedGroup = false;
  for (const line of lines) {
    const beforeEnvironment = environments.length;
    const beforeMath = math;
    const beforeProtected = protectedGroup;
    const commandLine = /^\s*\\/.test(line);
    if (commandLine && braces === 0) protectedGroup = true;
    let comment = false;
    let hardBreak = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      // Contents of literal environments cannot open math or brace groups.
      const literal = environments.at(-1);
      if (literal && /^(verbatim\*?|lstlisting|minted)$/.test(literal)) {
        const closing = `\\end{${literal}}`;
        if (line.startsWith(closing, i)) {
          environments.pop();
          i += closing.length - 1;
        }
        continue;
      }
      if (c === "%") { comment = true; break; }
      if (c === "\\") {
        const rest = line.slice(i);
        const verb = /^\\(?:verb\*?|lstinline)(?:\[[^\]]*\])?([^\w\s])/.exec(rest);
        if (verb) {
          const end = line.indexOf(verb[1], i + verb[0].length);
          hardBreak = true;
          i = end < 0 ? line.length : end;
          continue;
        }
        const env = /^\\(begin|end)\{([^}]+)\}/.exec(rest);
        if (env) {
          if (env[2] !== "document") {
            if (env[1] === "begin") environments.push(env[2]);
            else if (environments.at(-1) === env[2]) environments.pop();
          }
          i += env[0].length - 1;
          continue;
        }
        if (environments.length) { i++; continue; }
        if (line[i + 1] === "[" || line[i + 1] === "(") math = line[i + 1];
        else if ((line[i + 1] === "]" && math === "[") || (line[i + 1] === ")" && math === "(")) math = null;
        if (line[i + 1] === "\\" || /^\\(?:par|newline|linebreak)\b/.test(rest)) hardBreak = true;
        i++; // escaped %, $, braces and the first letter of a control word
        continue;
      }
      if (environments.length) continue;
      if (c === "$") {
        const delimiter = line[i + 1] === "$" ? "$$" : "$";
        if (math === delimiter) math = null;
        else if (!math) math = delimiter;
        if (delimiter === "$$") i++;
      }
      if (c === "{") braces++;
      if (c === "}") braces = Math.max(0, braces - 1);
    }
    const safe = Boolean(line.trim()) && !comment && !hardBreak && !commandLine
      && !beforeEnvironment && !environments.length && !beforeMath && !math
      && !beforeProtected && !protectedGroup;
    if (safe && previous) {
      const leading = line.length - line.trimStart().length;
      joins.push({from: previous.end, to: offset + leading});
    }
    previous = safe ? {end: offset + line.trimEnd().length} : null;
    if (!braces) protectedGroup = false;
    offset += line.length + 1;
  }
  return joins;
}

class ProseSpace extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-fluid-space";
    span.textContent = " ";
    return span;
  }
}
const space = new ProseSpace();
function decorations(doc) {
  return Decoration.set(fluidJoins(doc.toString()).map(({from, to}) =>
    Decoration.replace({widget: space, inclusive: false}).range(from, to)));
}
// Must be supplied by state, not a viewport plugin: these decorations change
// line layout, which CodeMirror must know before measuring its viewport.
export const fluidText = StateField.define({
  create: (state) => decorations(state.doc),
  update: (value, transaction) => transaction.docChanged ? decorations(transaction.newDoc) : value,
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});
