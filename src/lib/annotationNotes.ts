// Notes d'une figure annotée envoyée depuis la galerie.
//
// Le serveur d'annotation (`rust/crates/atelier-gallery/src/main.rs`) construit
// un message de la forme :
//
//   annotations/<figure>_annot_<horodatage>.png
//   Annotations (badges numerotes sur l'image) :
//   1. déplacer la carte
//   2. l'axe des années déborde
//   Applique directement ces annotations : …
//
// Les notes partaient donc bien à l'agent, mais restaient invisibles à l'écran :
// le chat n'affichait que le nom du fichier généré (2026-09-04).

/** Une note = un badge numéroté dessiné sur l'image. */
export type AnnotationNote = { n: number; text: string };

/** Au-delà, la carte du fil deviendrait un pavé — le texte complet reste dans
 *  la pièce jointe envoyée à l'agent. */
const NOTE_MAX = 240;

const ENTETE = /^annotations?\b.*:\s*$/i;
const LIGNE = /^(\d{1,3})\.\s+(.+)$/;

/**
 * Extrait les notes numérotées d'un message d'annotation.
 * `undefined` si le message n'en contient pas — un simple fichier joint, une
 * citation, ou un texte libre passent donc par le chemin habituel.
 */
export function parseAnnotationNotes(text: string): AnnotationNote[] | undefined {
  if (!text) return undefined;
  const lignes = text.split("\n");
  const debut = lignes.findIndex((ligne) => ENTETE.test(ligne.trim()));
  if (debut < 0) return undefined;

  const notes: AnnotationNote[] = [];
  for (const ligne of lignes.slice(debut + 1)) {
    const m = LIGNE.exec(ligne.trim());
    // La consigne « Applique directement… » ferme le bloc, comme toute autre
    // ligne non numérotée.
    if (!m) break;
    notes.push({ n: Number(m[1]), text: m[2].trim().slice(0, NOTE_MAX) });
  }
  return notes.length ? notes : undefined;
}
