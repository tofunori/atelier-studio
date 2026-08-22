// Annotations de réponse (plan « sélection annotable », 2026-08-22).
//
// Une annotation = un passage de la réponse + un commentaire FACULTATIF. Elle
// remplace les anciennes marques « hl » / « ul » : une annotation sans
// commentaire fait exactement le travail d'un surlignage, en mieux ancré.

export type Mark = { text: string; kind: "an"; note?: string };

// Les fils déjà ouverts portent des marques hl/ul dans localStorage : on les
// relit comme des annotations muettes plutôt que de les jeter.
export function migrateMarks(raw: unknown): Mark[] {
  if (!Array.isArray(raw)) return [];
  const out: Mark[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { text, note } = entry as { text?: unknown; note?: unknown };
    if (typeof text !== "string" || !text.trim()) continue;
    out.push(typeof note === "string" && note ? { text, kind: "an", note } : { text, kind: "an" });
  }
  return out;
}

// Bloc unique envoyé à l'agent, en tête du contexte du prochain message.
export function buildAnnotationBlock(marks: Mark[]): string {
  if (!marks.length) return "";
  const lines = ["Annotations sur ma réponse :"];
  marks.forEach((mark, i) => {
    lines.push(`[${i + 1}] « ${mark.text.replace(/\s+/g, " ").trim()} »`);
    lines.push(`    → ${mark.note?.trim() || "(sans commentaire)"}`);
  });
  return lines.join("\n");
}
