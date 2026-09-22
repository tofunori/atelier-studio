import type { DraftAttachment } from "./chatDraftStore";
import { parseAnnotationNotes } from "./annotationNotes";

type Attachment = DraftAttachment;

// « /chemin/avec espaces/CLAUDE.md (p.L11-224) : « … » » → {name: CLAUDE.md, lines: 11-224}
export function parseAttachment(text: string): Attachment {
  const first = text.split("\n")[0].trim();
  // Figure annotée : les badges numérotés deviennent des notes affichables.
  const notes = parseAnnotationNotes(text);
  // format viewer : <chemin> (p.LX-Y|p.N) : « … »   — chemin peut contenir des espaces
  let m = /^(.+?)\s*\((?:p\.)?(L?[\d:.,\-–]+)\)\s*:?/.exec(first);
  if (m) {
    return {
      name: m[1].split("/").pop() || m[1],
      lines: m[2].replace(/^L/, ""),
      text,
    };
  }
  // format annotation image : <chemin.png> …
  if (first.includes("/")) {
    const tok = first.split(/\s+/).find((t) => t.includes("/")) ?? first;
    return { name: tok.split("/").pop() || tok, lines: null, text, ...(notes ? { notes } : {}) };
  }
  return { name: first.slice(0, 60) || "citation", lines: null, text };
}

export function addAttachment(list: Attachment[], a: Attachment): Attachment[] {
  if (a.pdfAnnotation) {
    const source = a.pdfAnnotation;
    const existing = list.findIndex(item => item.pdfAnnotation?.id === source.id &&
      item.pdfAnnotation.rel === source.rel && item.pdfAnnotation.origin === source.origin);
    return existing < 0 ? [...list, a] : list.map((item, index) => index === existing ? a : item);
  }
  return list.some((x) => x.text === a.text) ? list : [...list, a];
}
