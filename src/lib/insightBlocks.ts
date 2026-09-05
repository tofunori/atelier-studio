/** Presentation-only recognition of the terminal-style Insight envelope.
 * The stored message is untouched. Fenced/indented code and inline-code
 * examples must remain literal, including delimiters inside an Insight. */
export type InsightBlock = {
  kind: "markdown" | "insight";
  text: string;
  start: number;
  complete: boolean;
};

type Fence = { marker: string; length: number };
const HEADER = /^[ \t]{0,3}(`?)[★✦][ \t]+Insight[ \t]+─{3,}(.*)$/u;
const CLOSER = /^[ \t]{0,3}(?:`─{3,}`|─{3,})[ \t]*$/u;
const PARTIAL_CLOSER = /^[ \t]{0,3}`?─+`?[ \t]*$/u;

export function splitInsightBlocks(text: string, streaming: boolean): InsightBlock[] {
  const blocks: InsightBlock[] = [];
  let plainStart = 0;
  let pending: { start: number; bodyStart: number } | null = null;
  let fence: Fence | null = null;
  let inlineTicks = 0;

  function markdown(start: number, end: number) {
    const value = text.slice(start, end);
    if (!value.trim()) return;
    const previous = blocks[blocks.length - 1];
    if (previous?.kind === "markdown") {
      previous.text = text.slice(previous.start, end);
    } else {
      blocks.push({ kind: "markdown", start, text: value, complete: true });
    }
  }

  function trackInlineCode(line: string) {
    for (const match of line.matchAll(/`+/g)) {
      // An escaped opener is prose; backslashes inside a code span are literal.
      const before = line.slice(0, match.index);
      const escapes = /\\+$/.exec(before)?.[0].length ?? 0;
      if (!inlineTicks && escapes % 2) continue;
      if (!inlineTicks) inlineTicks = match[0].length;
      else if (inlineTicks === match[0].length) inlineTicks = 0;
    }
  }

  for (let start = 0; start < text.length;) {
    const newline = text.indexOf("\n", start);
    const end = newline < 0 ? text.length : newline;
    const next = newline < 0 ? text.length : newline + 1;
    const line = text.slice(start, end).replace(/\r$/, "");
    const fenceMatch = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence.marker
        && fenceMatch[1].length >= fence.length && !fenceMatch[2].trim()) fence = null;
      start = next;
      continue;
    }
    // Markdown code spans cannot cross a paragraph break.
    if (!line.trim()) inlineTicks = 0;
    if (!inlineTicks && fenceMatch) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      start = next;
      continue;
    }
    if (!inlineTicks && !/^(?: {4}|\t)/.test(line)) {
      if (pending && CLOSER.test(line)) {
        blocks.push({ kind: "insight", start: pending.start,
          text: text.slice(pending.bodyStart, start), complete: true });
        pending = null;
        plainStart = next;
        start = next;
        continue;
      }
      if (pending && streaming && next === text.length && PARTIAL_CLOSER.test(line)) {
        blocks.push({ kind: "insight", start: pending.start,
          text: text.slice(pending.bodyStart, start), complete: false });
        return blocks;
      }
      const header: RegExpExecArray | null = !pending ? HEADER.exec(line) : null;
      if (header) {
        let rest: string = header[2];
        const quoted = header[1] === "`";
        const closedTitle = !quoted || rest.startsWith("`");
        if (quoted && closedTitle) rest = rest.slice(1);
        // Only the exact envelope is special, never an arbitrary code span
        // containing the word Insight. Accept an unfinished title in a stream.
        if ((closedTitle && (!rest || /^[ \t]/.test(rest)))
          || (streaming && quoted && !rest && next === text.length)) {
          markdown(plainStart, start);
          pending = { start, bodyStart: rest.trim() ? start + line.length - rest.length : next };
          trackInlineCode(rest);
          start = next;
          continue;
        }
      }
    }
    // Indented code is literal and cannot open a multiline inline-code span.
    if (!/^(?: {4}|\t)/.test(line)) trackInlineCode(line);
    start = next;
  }
  if (pending && streaming) {
    blocks.push({ kind: "insight", start: pending.start,
      text: text.slice(pending.bodyStart), complete: false });
  } else {
    // A final message without a closing delimiter is ordinary Markdown.
    markdown(pending?.start ?? plainStart, text.length);
  }
  return blocks;
}
