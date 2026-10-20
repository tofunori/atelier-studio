// Figure annotée envoyée depuis la galerie : séparer, dans le texte d'un tour
// utilisateur, l'enveloppe destinée à l'agent de ce que Thierry a tapé.
//
// Le serveur d'annotation (`rust/crates/atelier-gallery/src/main.rs`, `/save`)
// écrit un paragraphe sans ligne vide :
//
//   .fig_thumbs/annotation-previews/<figure>_annot_<horodatage>.png
//   Annotations (badges numerotes sur l'image) :
//   1. est-ce que 2012 est une année neigeuse ?
//   Figure source : /Users/…/figures/supp/<figure>.png
//   Version affichée : v1 (SHA-256 …). La pièce jointe correspond à cette version ; …
//   Recette de la figure : … / Script qui l'a produite : … / Commande : …
//   Applique directement ces annotations : …
//
// La galerie l'envoie comme une note (accusé de réception), donc le fil
// l'affichait en clair dans la bulle (2026-10-20). L'agent reçoit toujours le
// texte complet ; seul l'affichage en tire une carte.

import type { AnnotationNote } from "./annotationNotes";

export type FigureAnnotation = {
  /** Image annotée générée, relative au projet (vignette). */
  preview: string;
  notes: AnnotationNote[];
  /** Chemin absolu de la figure d'origine. */
  source?: string;
  /** « v1 » */
  version?: string;
  hash?: string;
};

const NOTE_MAX = 240;
const PREVIEW = /^(?:\.fig_thumbs\/annotation-previews|annotations)\/\S+_annot_[\w-]+\.(?:png|jpe?g|webp)$/;
const HEADER = /^annotations?\b.*:\s*$/i;
const NOTE = /^(\d{1,3})\.\s+(.+)$/;
const SOURCE = /^Figure source : (.+)$/;
const VERSION = /^Version affichée : (v\d+)(?: \(SHA-256 ([0-9a-f]+)\))?/;
// Lignes de contexte connues : elles ferment la liste des notes.
const CONTEXT = /^(?:Figure source|Version affichée|Recette de la figure|Script qui l'a produite|Commande|Env conda|Applique directement ces annotations) :/;

function parseBlock(block: string): FigureAnnotation | null {
  const lines = block.split("\n");
  const preview = lines[0].trim();
  if (!PREVIEW.test(preview)) return null;
  const figure: FigureAnnotation = { preview, notes: [] };
  let inNotes = false;
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (HEADER.test(line) && !CONTEXT.test(line)) { inNotes = true; continue; }
    const source = SOURCE.exec(line);
    if (source) { figure.source = source[1].trim(); inNotes = false; continue; }
    const version = VERSION.exec(line);
    if (version) {
      figure.version = version[1];
      if (version[2]) figure.hash = version[2];
      inNotes = false;
      continue;
    }
    if (CONTEXT.test(line)) { inNotes = false; continue; }
    if (!inNotes) continue;
    const note = NOTE.exec(line);
    if (note) figure.notes.push({ n: Number(note[1]), text: note[2].trim().slice(0, NOTE_MAX) });
    // Note sur plusieurs lignes : la suite rejoint le badge précédent.
    else if (line && figure.notes.length) {
      const last = figure.notes[figure.notes.length - 1];
      last.text = `${last.text} ${line}`.slice(0, NOTE_MAX);
    }
  }
  return figure;
}

/**
 * Sépare les enveloppes de figures annotées du texte tapé. Les pièces jointes
 * et le message sont joints par une ligne vide (`promptWithAttachments`,
 * `annotationDisplayText`) et une enveloppe n'en contient aucune.
 */
export function splitFigureAnnotations(text: string): { prompt: string; figures: FigureAnnotation[] } {
  if (!text || !text.includes("_annot_")) return { prompt: text, figures: [] };
  const figures: FigureAnnotation[] = [];
  const rest: string[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const figure = parseBlock(block);
    if (figure) figures.push(figure);
    else rest.push(block);
  }
  return figures.length ? { prompt: rest.join("\n\n").trim(), figures } : { prompt: text, figures };
}

/** Nom de la figure d'origine, sinon celui de l'image annotée. */
export function figureName(figure: FigureAnnotation): string {
  const path = figure.source ?? figure.preview;
  return path.split("/").pop() || path;
}

/** Chemin lisible : le dossier personnel devient « ~ ». */
export function figureSourceLabel(source: string): string {
  return source.replace(/^\/Users\/[^/]+(?=\/)/, "~").replace(/^\/home\/[^/]+(?=\/)/, "~");
}
