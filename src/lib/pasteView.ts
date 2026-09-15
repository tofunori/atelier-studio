// Aperçu d'un texte collé : la boîte n'a aucun contrôle, elle choisit sa
// lecture d'après le contenu. Source (mono, numéros de ligne, sauts durs
// respectés) quand le texte porte des commandes LaTeX, du balisage Markdown
// ou une structure de code ; Texte (paragraphes fusionnés, typographie du
// fil) pour de la prose — y compris coupée à 80 colonnes par un PDF, où les
// sauts durs ne portent aucun sens.
import { t } from "./i18n";

export type PasteKind = "latex" | "markdown" | "code";

export type PasteView =
  | { mode: "source"; kind: PasteKind; lines: string[] }
  | { mode: "text"; paragraphs: string[]; words: number };

const LATEX_COMMAND = /\\[A-Za-z]+\*?(?:\[[^\]]*\])?\{/;
const MARKDOWN_LINE = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|\|)/;
const INDENTED_LINE = /^(?: {2,}|\t)\S/;
const CODE_LINE_END = /[;{}]\s*$/;

function detectKind(lines: string[]): PasteKind | null {
  const text = lines.join("\n");
  if (LATEX_COMMAND.test(text)) return "latex";
  const filled = lines.filter((line) => line.trim().length > 0);
  if (!filled.length) return null;
  if (filled.some((line) => line.trim().startsWith("```"))
    || filled.filter((line) => MARKDOWN_LINE.test(line)).length >= 2) return "markdown";
  const indented = filled.filter((line) => INDENTED_LINE.test(line)).length;
  const codeEnds = filled.filter((line) => CODE_LINE_END.test(line)).length;
  if (indented >= 2 || codeEnds / filled.length >= 0.3) return "code";
  return null;
}

/** Paragraphes d'une prose : séparés par une ligne vide, lignes recollées. */
function paragraphsOf(lines: string[]): string[] {
  const out: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const joined = current.join(" ").replace(/\s+/g, " ").trim();
    if (joined) out.push(joined);
    current = [];
  };
  for (const line of lines) {
    if (line.trim()) current.push(line);
    else flush();
  }
  flush();
  return out;
}

export function classifyPaste(text: string): PasteView {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kind = detectKind(lines);
  if (kind) return { mode: "source", kind, lines };
  const paragraphs = paragraphsOf(lines);
  const words = paragraphs.reduce((n, p) => n + (p.match(/\S+/g)?.length ?? 0), 0);
  return { mode: "text", paragraphs, words };
}

/** Compte au singulier/pluriel via deux clés i18n (« 1 ligne » / « {n} lignes »). */
function count(n: number, one: Parameters<typeof t>[0], many: Parameters<typeof t>[0]): string {
  return n === 1 ? t(one) : t(many, { n });
}

export function pasteLineCountLabel(n: number): string {
  return count(n, "chat.line-count-one", "chat.line-count");
}

/** Méta d'en-tête : « 10 lignes · LaTeX » ou « 2 paragraphes · 96 mots ». */
export function pasteMetaLabel(view: PasteView): string {
  if (view.mode === "source") {
    const kind = t(view.kind === "latex" ? "chat.paste-kind-latex"
      : view.kind === "markdown" ? "chat.paste-kind-markdown" : "chat.paste-kind-code");
    return `${pasteLineCountLabel(view.lines.length)} · ${kind}`;
  }
  return `${count(view.paragraphs.length, "chat.paragraph-count-one", "chat.paragraph-count")} · ${count(view.words, "chat.word-count-one", "chat.word-count")}`;
}
