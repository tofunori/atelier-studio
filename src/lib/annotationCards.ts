export type AnnotationCard = {
  path: string;
  name: string;
  location: string;
  line: string | null;
  page: number | null;
  quote: string;
  comment: string;
};

/** Decode the gallery's persisted text envelope only. Never rewrite provider input. */
export function annotationCards(text: string): { prompt: string; cards: AnnotationCard[] } {
  const cards: AnnotationCard[] = [];
  // Gallery annotations are appended after the typed prompt. Requiring a source,
  // quoted passage and comment marker avoids interpreting ordinary prose.
  // Markdown may omit the location when its source line cannot be recovered.
  // Word (.docx) : le repère est le paragraphe (`p12`, `p12-p14`), montré « ¶ 12 ».
  const header = /^([^\n]+\.(?:tex|pdf|md|markdown|docx))(?: \(((?:p\.)?L\d+(?:[-–]\d+)?|p\.\s*\d+|[a-z]*p\d+(?:-[a-z]*p\d+)?)\))? : « /gm;
  const matches = [...text.matchAll(header)];
  if (!matches.length) return { prompt: text, cards };
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const body = text.slice(match.index! + match[0].length, matches[i + 1]?.index ?? text.length);
    const separator = body.lastIndexOf(' »\nCommentaire : ');
    // All-or-nothing: malformed envelopes remain visible verbatim.
    if (separator < 0 || body.indexOf(' »\nCommentaire : ') !== separator) return { prompt: text, cards: [] };
    const raw = match[2] ?? '';
    const paragraphs = /^[a-z]*p\d+/.test(raw) ? raw.match(/\d+/g)! : null;
    const location = paragraphs ? `¶ ${paragraphs.join('–')}` : raw.replace(/^p\.L/, 'L');
    const comment = body.slice(separator + ' »\nCommentaire : '.length).trim();
    cards.push({
      path: match[1], name: match[1].split('/').pop()!,
      location: location.replace(/(\d)-(\d)/g, '$1–$2'),
      line: location.startsWith('L') ? location.slice(1).replace('–', '-') : null,
      page: location.startsWith('p.') ? Number(location.slice(2).trim()) : null,
      quote: body.slice(0, separator),
      comment: comment === '(voir passage)' ? '' : comment,
    });
  }
  return { prompt: text.slice(0, matches[0].index).trimEnd(), cards };
}

export function isAnnotationLabel(label: string, cards: AnnotationCard[]): boolean {
  return cards.some(card => label === card.name ||
    label === `${card.path} : « ${card.quote} »`.split('\n')[0].slice(0, 60) ||
    label === `${card.name} (lines ${card.line})` ||
    label === `${card.name} (lines ${card.page})` ||
    label === `${card.name} (lines ${card.location.slice(1)})`);
}
