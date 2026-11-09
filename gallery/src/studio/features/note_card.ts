/** Fiche de note « annoter = enregistrer » (variante A, Thierry 2026-11-09),
 *  la même dans le lecteur PDF, le studio LaTeX et le Markdown.
 *
 *  Un seul champ : Entrée, Échap ou un clic à côté ENREGISTRENT la note, et
 *  rien ne part au chat. Seule la pilule grise « Envoyer au chat » envoie
 *  (après avoir enregistré). En tête : anneau à la teinte de la note,
 *  « Note N », « p. N · ligne L », puis le passage cité sous un filet d'encre.
 *
 *  La fiche réutilise createNoteEditor (champ, hauteur, rangée de style,
 *  corbeille) et ne fait que réarranger son pied : ce module ne vit que dans
 *  les pages de la galerie, jamais dans l'entrée de l'app (budget d'entrée). */
import {createNoteEditor} from "./annotation_ui";

export type NoteCardHead = {
  /** Numéro de la note ; absent, l'anneau se cache (simple surlignage). */
  number?: number | string | null;
  /** Nom de teinte (`noteColorName`) : amber, red, blue, green, purple, orange. */
  color?: string | null;
  title: string;
  meta?: string | null;
  /** Passage annoté, cité sous l'en-tête (deux lignes au plus). */
  quote?: string | null;
};

type NoteEditorOptions = Parameters<typeof createNoteEditor>[1];

const enterKey = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 5v7a3 3 0 0 1-3 3H6M10 11l-4 4 4 4"/></svg>';
const bubble = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12c0 4.5-4 7.8-9 7.8-1.2 0-2.4-.15-3.45-.6L3.75 21l1.5-3.9C3.9 15.75 3 13.95 3 12c0-4.5 4-7.8 9-7.8S21 7.5 21 12z"/></svg>';

export function createNoteCard(host: HTMLElement, options: {
  value?: string; placeholder?: string; head: NoteCardHead;
  /** Entrée et « Enregistrer » : garder la note, sans rien envoyer. */
  onSave(value: string): void;
  /** Pilule « Envoyer au chat » : enregistrer, puis envoyer. */
  onSend(value: string): void;
  onDismiss?(): void; onDelete(): void;
  mark?: NoteEditorOptions["mark"];
}) {
  const ui = createNoteEditor(host, {
    value: options.value, placeholder: options.placeholder || "Ta note…",
    onSubmit: options.onSave, onSendDirect: options.onSend, onDismiss: options.onDismiss, onDelete: options.onDelete,
    heading: {title: options.head.title, meta: " "}, submitLabel: "Enregistrer", mark: options.mark,
  });
  const doc = host.ownerDocument;
  host.classList.remove("is-agent");
  host.classList.add("is-card");
  const head = host.querySelector<HTMLElement>(".atelier-note-head")!;
  const title = head.querySelector<HTMLElement>(".atelier-note-title")!;
  const meta = head.querySelector<HTMLElement>(".atelier-note-meta")!;
  const ring = doc.createElement("span");
  ring.setAttribute("aria-hidden", "true");
  head.prepend(ring);
  const quote = doc.createElement("blockquote");
  quote.className = "atelier-note-quote";
  head.after(quote);
  ui.input.setAttribute("aria-label", "Note sur le passage");
  // Pied : « ↵ Enregistrer » à gauche, la pilule du chat à droite. Aucun
  // bouton plein : rien de blanc, dans aucun thème.
  const save = host.querySelector<HTMLButtonElement>(".send2")!;
  const send = host.querySelector<HTMLButtonElement>(".send-direct")!;
  host.querySelector(".atelier-note-actions")?.remove();
  send.className = "send-direct atelier-note-pill";
  send.innerHTML = bubble + "<span>Envoyer au chat</span>";
  send.title = "Enregistrer la note et l’envoyer au chat";
  send.setAttribute("aria-label", "Envoyer au chat");
  save.className = "send2 atelier-note-save";
  save.innerHTML = enterKey + "<span>Enregistrer</span>";
  save.title = "Enregistrer la note (Entrée)";
  save.setAttribute("aria-label", "Enregistrer la note");
  const foot = doc.createElement("div");
  foot.className = "atelier-note-foot";
  const gap = doc.createElement("span");
  gap.className = "atelier-note-gap";
  foot.append(save, gap, send);
  host.querySelector(".atelier-note-row")!.after(foot);
  const setHead = (next: NoteCardHead): void => {
    const shown = next.number !== null && next.number !== undefined && next.number !== "";
    // la teinte vit sur la fiche : anneau et filet de la citation la suivent
    [...host.classList].forEach(name => { if (name.startsWith("note-c-")) host.classList.remove(name); });
    host.classList.add("note-c-" + (next.color || "amber"));
    // pas `.atelier-annotation-number` : ce nom désigne les pastilles
    // cliquables de la marge, que les hôtes et les tests cherchent.
    ring.className = "atelier-note-ring";
    ring.textContent = shown ? String(next.number) : "";
    ring.hidden = !shown;
    title.textContent = next.title;
    meta.textContent = next.meta || "";
    meta.hidden = !next.meta;
    const passage = String(next.quote || "").replace(/\s+/g, " ").trim();
    quote.textContent = passage;
    quote.hidden = !passage;
  };
  setHead(options.head);
  return {...ui, setHead, foot, saveButton: save, sendButton: send};
}
