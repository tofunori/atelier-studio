// Repérage léger des figures annotées dans le texte d'un tour (entrée de
// l'app) ; la lecture complète (notes, version) est dans `figureAnnotation.ts`,
// chargé avec la carte. Format : voir ce fichier.

export type FigureEnvelope = { preview: string; name: string; text: string };

const PREVIEW = /^(?:\.fig_thumbs\/annotation-previews|annotations)\/\S+_annot_[\w-]+\.(?:png|jpe?g|webp)$/;

export const isFigurePreview = (line: string) => PREVIEW.test(line);

/**
 * Sépare les enveloppes de figures annotées du texte tapé. Les pièces jointes
 * et le message sont joints par une ligne vide (`promptWithAttachments`,
 * `annotationDisplayText`) et une enveloppe n'en contient aucune.
 */
export function splitFigureEnvelopes(text: string): { prompt: string; figures: FigureEnvelope[] } {
  if (!text.includes("_annot_")) return { prompt: text, figures: [] };
  const figures: FigureEnvelope[] = [];
  const rest: string[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const preview = block.split("\n", 1)[0].trim();
    if (!PREVIEW.test(preview)) { rest.push(block); continue; }
    // Nom de la figure d'origine, sinon celui de l'image annotée.
    const path = /^Figure source : (.+)$/m.exec(block)?.[1].trim() ?? preview;
    figures.push({ preview, name: path.split("/").pop() || path, text: block });
  }
  return figures.length ? { prompt: rest.join("\n\n").trim(), figures } : { prompt: text, figures };
}
