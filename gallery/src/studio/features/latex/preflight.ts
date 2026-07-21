export interface LatexPreflightIssue {
  line: number;
  msg: string;
}

const PREFLIGHT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\s*#{1,6}\s*\{/, "ressemble à un titre Markdown — \\section{…} / \\subsection{…} ?"],
  [/^\s*#{1,6}\s+\S/, "titre Markdown dans du LaTeX — \\section{…} ?"],
  [/^\s*```/, "clôture de code Markdown — pas du LaTeX (verbatim ?)"],
];

/** Detect common fatal Markdown/LaTeX mixups before starting latexmk. */
export function texPreflight(text: string): LatexPreflightIssue | null {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] || "";
    if (/^\s*%/.test(raw)) continue;
    const active = raw.replace(/(^|[^\\])%.*$/, "$1");
    for (const [pattern, message] of PREFLIGHT_RULES) {
      if (pattern.test(active)) {
        return {
          line: index + 1,
          msg: `« ${active.trim().slice(0, 40)} » ${message}`,
        };
      }
    }
  }
  return null;
}
