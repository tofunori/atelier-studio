// Figure annotée envoyée depuis la galerie : badges numérotés de l'enveloppe
// destinée à l'agent, pour la carte du fil.
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
// Chargé avec la carte (chunk à part) ; le découpage du texte, lui, est dans
// `figureEnvelope.ts` (entrée).
//
// La galerie l'envoie comme une note (accusé de réception), donc le fil
// l'affichait en clair dans la bulle (2026-10-20). L'agent reçoit toujours le
// texte complet ; seul l'affichage en tire une carte.

import type { AnnotationNote } from "./annotationNotes";

const NOTE_MAX = 240;
const HEADER = /^annotations?\b.*:\s*$/i;
const NOTE = /^(\d{1,3})\.\s+(.+)$/;
// Lignes de contexte connues : elles ferment la liste des notes.
const CONTEXT = /^(?:Figure source|Version affichée|Recette de la figure|Script qui l'a produite|Commande|Env conda|Applique directement ces annotations) :/;

/** Badges numérotés d'une enveloppe repérée par `splitFigureEnvelopes`. */
export function parseFigureNotes(block: string): AnnotationNote[] {
  const notes: AnnotationNote[] = [];
  let inNotes = false;
  for (const raw of block.split("\n").slice(1)) {
    const line = raw.trim();
    if (CONTEXT.test(line)) { inNotes = false; continue; }
    if (HEADER.test(line)) { inNotes = true; continue; }
    if (!inNotes) continue;
    const note = NOTE.exec(line);
    if (note) notes.push({ n: Number(note[1]), text: note[2].trim().slice(0, NOTE_MAX) });
    // Note sur plusieurs lignes : la suite rejoint le badge précédent.
    else if (line && notes.length) {
      const last = notes[notes.length - 1];
      last.text = `${last.text} ${line}`.slice(0, NOTE_MAX);
    }
  }
  return notes;
}
