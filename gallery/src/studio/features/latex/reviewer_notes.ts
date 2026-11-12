/** Commentaires d'un relecteur importés de Word (maquette v3 « allégée »,
 *  Thierry 2026-11-12) : le directeur commente le .docx tiré du .tex, Atelier
 *  pose chaque commentaire sur son passage (`POST /review/import`, Rust).
 *
 *  Ses commentaires vivent dans le panneau Annotations habituel, signés de
 *  son nom (`by: "reviewer"`). Thierry en discute UN PAR UN DANS LE CHAT
 *  (maquette « chat-un-par-un », 2026-11-12) : l'éditeur envoie le
 *  commentaire au chat, la barre du chat dit Réglé / À voir avec lui /
 *  Suivant, et la correction que Claude propose revient sur le texte à
 *  accepter ou refuser. Claude peut aussi juger qu'une retouche règle déjà
 *  un commentaire (« Sans doute réglé ») : Suivant le saute.
 *
 *  Ce module ne garde aucun état : reconnaissance, libellés, blocs affichés
 *  dans l'éditeur, messages envoyés au chat, bilan d'import et ordre du jour. */

import {insertedHtml, removedRanges, roundIcons} from "./revision_round";
import {agentIcon, hasUnread, type AgentFields} from "./agent_notes";

export type ReviewState = "todo" | "agenda" | "done";

export interface ReviewInfo {
  source?: string;
  rev?: string;
  cid?: number;
  date?: string;
  initials?: string;
  /** Passage commenté, tel qu'il le voyait dans Word. */
  quote?: string;
  /** text, equation, figure, point, inserted */
  on?: string;
  /** question, remark */
  kind?: string;
  /** exact, changed, paragraph, near */
  fit?: string;
  state?: ReviewState;
  /** Date du dernier changement d'état (le chat l'écrit aussi). */
  stateAt?: number;
  /** Envoyé au chat pour en discuter. */
  chatAt?: number;
  /** Avis de Claude : la retouche de Thierry règle-t-elle déjà ce point ? */
  likely?: {settled?: boolean; reason?: string; at?: number};
  /** Correction de Claude refusée (date) : les suggestions antérieures tombent. */
  refused?: number;
  replies?: Array<{id?: number; author?: string; date?: string; text?: string}>;
  /** Numéro de sa retouche (`kind: "edit"`), dans l'ordre du document. */
  eid?: number;
  /** Sa modification suivie, une phrase (lot 2) : voir `EditInfo`. */
  edit?: EditInfo;
  /** « Accepter » a écrit sa version (ou la fusion de Claude). */
  accepted?: number;
}

/** Une de ses retouches (suivi des modifications de Word) posée sur le .tex :
 *  `apply` = le .tex n'a pas bougé, `latex` est sa phrase prête à écrire ;
 *  `changed` = Thierry a réécrit le passage depuis, à fusionner ; `done` =
 *  déjà dans le texte. `diff` : sa phrase, mots retirés (-) et ajoutés (+). */
export interface EditInfo {
  status?: "apply" | "changed" | "done";
  before?: string;
  after?: string;
  diff?: Array<[string, string]>;
  latex?: string | null;
}

export interface ReviewerFields extends AgentFields {
  review?: ReviewInfo;
}

export const isReviewerNote = (note: {by?: string} | null | undefined): boolean => note?.by === "reviewer";

/** Une de ses retouches de texte, pas un commentaire. */
export const isEdit = (note: {review?: ReviewInfo} | null | undefined): boolean => note?.review?.kind === "edit";

/** Prénom du relecteur (« Christophe Kinnard » → « Christophe »). */
export const reviewerName = (note: {author?: string}): string => (note.author || "Relecteur").trim().split(/\s+/)[0] || "Relecteur";

export const reviewState = (note: {review?: ReviewInfo}): ReviewState => note.review?.state || "todo";

/** Claude juge le commentaire déjà réglé par une retouche (à confirmer). */
export const likelySettled = (note: {review?: ReviewInfo}): boolean => reviewState(note) === "todo" && note.review?.likely?.settled === true;

/** Correction proposée par Claude dans le chat, tant qu'elle n'est pas
 *  refusée ; pour une de ses retouches prête à appliquer, sa version
 *  (`his`). Même règle côté serveur (`edit_text`, POST /review/apply). */
export function reviewerSuggestion(note: ReviewerFields): {text: string; reason?: string; his?: boolean} | null {
  const thread = note.thread || [];
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const message = thread[index];
    if (!message?.suggest?.text) continue;
    if ((note.review?.refused || 0) >= (message.at || 0)) return null;
    return {text: message.suggest.text, reason: message.text};
  }
  const edit = note.review?.edit;
  if (isEdit(note) && edit?.status === "apply" && typeof edit.latex === "string" && !note.review?.refused) return {text: edit.latex, his: true};
  return null;
}

/** Fusion avec la copie du store : chaque champ daté garde le plus récent
 *  (le chat change l'état, Claude donne son avis, pendant que l'éditeur
 *  garde sa copie). Vrai si la note locale a changé. */
export function mergeReview(local: ReviewerFields, stored: ReviewerFields): boolean {
  const mine = local.review || {};
  const theirs = stored.review || {};
  const next: ReviewInfo = {...mine};
  if ((theirs.stateAt || 0) > (mine.stateAt || 0)) { next.state = theirs.state; next.stateAt = theirs.stateAt; }
  if ((theirs.chatAt || 0) > (mine.chatAt || 0)) next.chatAt = theirs.chatAt;
  if ((theirs.likely?.at || 0) > (mine.likely?.at || 0)) next.likely = theirs.likely;
  if ((theirs.refused || 0) > (mine.refused || 0)) next.refused = theirs.refused;
  if ((theirs.accepted || 0) > (mine.accepted || 0)) next.accepted = theirs.accepted;
  const changed = next.state !== mine.state || next.chatAt !== mine.chatAt || next.likely !== mine.likely
    || next.refused !== mine.refused || next.accepted !== mine.accepted;
  if (changed) local.review = next;
  return changed;
}

const escapeHtml = (value: string): string => String(value).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"})[c] || c);

export const reviewIcons = {
  flag: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13.5V3M4 3.2h7.2l-1.6 2.6 1.6 2.6H4"/></svg>',
  talk: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.8 4.2c0-.8.6-1.4 1.4-1.4h7.6c.8 0 1.4.6 1.4 1.4v4.6c0 .8-.6 1.4-1.4 1.4H7.2L4.4 12.6v-2.4h-.2c-.8 0-1.4-.6-1.4-1.4z"/></svg>',
  person: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="5.6" r="2.4"/><path d="M3.4 13.2c.6-2.2 2.4-3.4 4.6-3.4s4 1.2 4.6 3.4"/></svg>',
  lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.6" y="7" width="8.8" height="6.2" rx="1.4"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7"/></svg>',
  warn: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.8 13.6 12.6H2.4z"/><path d="M8 6.6v2.6M8 11v.1"/></svg>',
  likely: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.4" stroke-dasharray="2 1.6"/><path d="M5.8 8.1l1.5 1.5 2.9-3"/></svg>',
  edit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12.6h3.4M9.6 3.6l2.8 2.8-6 6H3.6V9.6z"/></svg>',
  merge: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4.6" cy="3.8" r="1.4"/><circle cx="4.6" cy="12.2" r="1.4"/><circle cx="11.4" cy="8" r="1.4"/><path d="M4.6 5.2v5.6M4.6 5.2c0 2.2 2.4 2.8 5.4 2.8"/></svg>',
  download: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.8v7M5 7l3 3 3-3M3 12.8h10"/></svg>',
} as const;

/** Ce que la place trouvée dit du passage, quand elle n'est pas exacte. */
export function fitNote(note: {review?: ReviewInfo}): string {
  switch (note.review?.fit) {
    case "changed": return "Passage changé depuis son retour";
    case "paragraph": return note.review?.on === "equation" ? "Posé sur l’équation de son paragraphe"
      : note.review?.on === "inserted" ? "Sur un passage qu’il a ajouté : posé à la phrase" : "Posé à la phrase la plus proche";
    case "near": return note.review?.on === "figure" ? "Sur la figure : posé à sa légende" : "Posé au paragraphe le plus proche";
    default: return "";
  }
}

/** État d'une de ses retouches (panneau, en-tête, liste des autres fichiers). */
function editState(note: ReviewerFields): {icon: string; label: string; tone: string} {
  const state = reviewState(note);
  if (state === "done") return {icon: roundIcons.check, tone: "ok",
    label: note.review?.refused ? "Ton texte gardé" : note.review?.accepted ? "Acceptée" : "Déjà dans ton texte"};
  if (state === "agenda") return {icon: reviewIcons.flag, label: "À voir avec lui", tone: "ask"};
  const suggestion = reviewerSuggestion(note);
  if (suggestion && !suggestion.his) return {icon: hasUnread(note) ? '<span class="texa-dot"></span>' : reviewIcons.merge, label: "Fusion proposée par Claude", tone: "todo"};
  if (suggestion) return {icon: reviewIcons.edit, label: "S’applique telle quelle", tone: "todo"};
  if (note.review?.refused) return {icon: reviewIcons.warn, label: "Fusion refusée · à reprendre", tone: "ask"};
  return {icon: reviewIcons.warn, label: "Ton texte a changé · à fusionner", tone: "ask"};
}

/** Ce qu'il a fait de la phrase, pour l'en-tête. */
export function editVerb(note: ReviewerFields): string {
  const edit = note.review?.edit;
  if (!edit?.before?.trim()) return "a ajouté une phrase";
  if (!edit.after?.trim()) return "a supprimé une phrase";
  return "a modifié la phrase";
}

/** État affiché d'un commentaire du relecteur (panneau et en-tête). */
export function reviewerState(note: ReviewerFields): {icon: string; label: string; tone: string} {
  if (isEdit(note)) return editState(note);
  const state = reviewState(note);
  if (state === "done") return {icon: roundIcons.check, label: "Réglé", tone: "ok"};
  if (state === "agenda") return {icon: reviewIcons.flag, label: "À voir avec lui", tone: "ask"};
  if (reviewerSuggestion(note)) return {icon: hasUnread(note) ? '<span class="texa-dot"></span>' : roundIcons.check, label: "Correction proposée", tone: "todo"};
  if (likelySettled(note)) return {icon: reviewIcons.likely, label: "Sans doute réglé", tone: "likely"};
  if (note.review?.chatAt) return {icon: reviewIcons.talk, label: "Dans le chat", tone: "note"};
  return {icon: note.review?.kind === "question" ? roundIcons.question : roundIcons.circle,
    label: note.review?.kind === "question" ? "Question · à faire" : "À faire", tone: "todo"};
}

/** En-tête au-dessus du passage : pastille, prénom, son commentaire, état. */
export function reviewerHeader(doc: Document, number: number, note: ReviewerFields): HTMLElement {
  const root = doc.createElement("div");
  const state = reviewerState(note);
  root.className = "texr-head texa-head texv-head" + (reviewState(note) === "done" ? " is-done" : "");
  const edit = isEdit(note);
  if (edit) root.classList.add("is-edit");
  root.innerHTML = (edit ? `<span class="texv-edit-ic">${reviewIcons.edit}</span>`
    : `<span class="atelier-annotation-number texr-ring is-reviewer${hasUnread(note) ? " is-unread" : ""}">${number}</span>`)
    + `<span class="texa-who">${escapeHtml(reviewerName(note))}</span>`
    + `<span class="texr-note">${escapeHtml(edit ? editVerb(note) : (note.comment || "").replace(/\s+/g, " "))}</span>`
    + `<span class="texv-state tone-${state.tone}"><span class="tp-ic">${state.icon}</span>${escapeHtml(state.label)}</span>`;
  return root;
}

export interface ReviewerBlockView {
  note: ReviewerFields;
  lineBefore: string;
  lineAfter: string;
}

export interface ReviewerBlockActions {
  accept(): void;
  refuse(): void;
  state(next: ReviewState): void;
  /** `merge` : « Demander à Claude de fusionner » (une de ses retouches). */
  chat(merge?: boolean): void;
  seen(): void;
}

/** Sa phrase, mots retirés barrés en rouge, ajoutés sur fond vert. */
export function editDiffHtml(diff: Array<[string, string]> | undefined, after = ""): string {
  if (!diff?.length) return escapeHtml(after);
  // Un mot retiré collé au mot ajouté (« AssumingThe ») : une espace entre eux.
  const word = /[\p{L}\p{N}]/u;
  const blank = /\s/;
  let last = "";
  let lastOp = "";
  return diff.map(([op, text]) => {
    const touching = Boolean(last && text) && !blank.test(last.at(-1) || "") && !blank.test(text[0] || "");
    const gap = touching && ((lastOp === "-" && op === "+") || (word.test(last.at(-1) || "") && word.test(text[0] || ""))) ? " " : "";
    last = text || last;
    lastOp = op;
    return gap + (op === "-" ? `<s>${escapeHtml(text)}</s>` : op === "+" ? `<b>${escapeHtml(text)}</b>` : escapeHtml(text));
  }).join("");
}

/** Une de ses retouches que le .tex ne prend pas telle quelle (ou réglée) :
 *  sa version, puis fusion par Claude, ton texte gardé ou le chat. */
function editBlock(doc: Document, view: ReviewerBlockView, actions: ReviewerBlockActions): HTMLElement {
  const {note} = view;
  const state = reviewState(note);
  const edit = note.review?.edit || {};
  const root = doc.createElement("div");
  root.className = "texr-block texa-block texv-block texv-edit";
  const date = note.review?.date ? new Date(note.review.date) : null;
  const when = date && !Number.isNaN(date.getTime()) ? ` · sur le texte du ${date.getDate()} ${MONTHS[date.getMonth()]}` : "";
  const his = `<div class="texv-his"><div class="texv-his-k">Sa version<span>${escapeHtml(when)}</span></div>`
    + `<div class="texv-his-t">${editDiffHtml(edit.diff, edit.after)}</div></div>`;
  const chat = `<button type="button" class="texr-ghost texv-chat" title="Envoyer sa modification au chat et en discuter avec Claude">${reviewIcons.talk}En discuter dans le chat</button>`;
  let body: string;
  if (state === "done") {
    body = his + `<div class="texr-foot"><div class="texr-acts"><button type="button" class="texr-ghost texv-reopen">Rouvrir</button></div></div>`;
  } else {
    const since = note.review?.refused ? "Tu as refusé la fusion proposée : ton texte reste tel quel."
      : edit.status === "changed" ? "Depuis, tu as changé ce passage : sa version ne s’applique plus telle quelle."
        : "Ta version est gardée.";
    body = his + `<div class="texv-since"><div class="texv-since-t">${escapeHtml(since)}</div><div class="texr-acts">`
      + `<button type="button" class="texr-btn texv-merge" title="Claude propose une correction qui reprend ses changements dans ton texte">${reviewIcons.merge}Demander à Claude de fusionner</button>`
      + '<button type="button" class="texr-ghost texv-keep" title="Ranger sa modification en « Réglé » sans rien changer">Garder mon texte</button>'
      + chat + "</div></div>";
  }
  root.innerHTML = body;
  root.querySelector<HTMLButtonElement>(".texv-merge")?.addEventListener("click", () => actions.chat(true));
  root.querySelector<HTMLButtonElement>(".texv-keep")?.addEventListener("click", () => actions.refuse());
  root.querySelector<HTMLButtonElement>(".texv-reopen")?.addEventListener("click", () => actions.state("todo"));
  root.querySelector<HTMLButtonElement>(".texv-chat")?.addEventListener("click", () => actions.chat());
  root.addEventListener("pointerdown", () => { if (hasUnread(note)) actions.seen(); });
  return root;
}

/** Ce que Claude disait de la dernière correction proposée (acceptée ou non). */
function lastSuggestionReason(note: ReviewerFields): string {
  const thread = note.thread || [];
  for (let index = thread.length - 1; index >= 0; index -= 1) if (thread[index]?.suggest?.text) return thread[index]?.text || "";
  return "";
}

/** Ce qu'il commentait, mots disparus depuis marqués. */
function deletedHtml(before: string, after: string): string {
  let html = "";
  let at = 0;
  for (const [from, to] of removedRanges(before, after)) {
    html += escapeHtml(before.slice(at, from)) + `<s>${escapeHtml(before.slice(from, to))}</s>`;
    at = to;
  }
  return html + escapeHtml(before.slice(at));
}

/** Ses réponses déjà écrites dans Word, sous son commentaire. */
function wordReplies(note: ReviewerFields): string {
  const name = escapeHtml(reviewerName(note));
  return (note.review?.replies || []).map(reply => `<div class="texa-msg texv-word"><div class="texa-msg-who">${reviewIcons.person}`
    + `${escapeHtml(reply.author || name)} · dans Word</div><div class="texa-msg-text">${escapeHtml(reply.text || "")}</div></div>`).join("");
}

/** Bloc sous le paragraphe du commentaire actif : son passage d'origine si
 *  le .tex a bougé, ses réponses dans Word, l'avis « sans doute réglé » de
 *  Claude ou la correction qu'il propose, et trois gestes au plus. La
 *  discussion elle-même a lieu dans le chat. */
export function reviewerBlock(doc: Document, view: ReviewerBlockView, actions: ReviewerBlockActions): HTMLElement {
  const {note} = view;
  const suggestion = reviewState(note) === "done" ? null : reviewerSuggestion(note);
  if (isEdit(note) && !suggestion) return editBlock(doc, view, actions);
  const state = reviewState(note);
  const likely = !suggestion && likelySettled(note);
  const root = doc.createElement("div");
  root.className = "texr-block texa-block texv-block" + (suggestion ? " texr-proposal" : "");
  const fit = fitNote(note);
  const quote = (note.review?.quote || "").replace(/\s+/g, " ").trim();
  const origin = fit && !likely && state !== "done"
    ? `<div class="texv-fit">${reviewIcons.warn}<span>${escapeHtml(fit)}${quote && note.review?.on !== "figure" ? ` · il commentait « ${escapeHtml(quote.slice(0, 200))} »` : ""}</span></div>`
    : "";
  const now = note.text.replace(/\s+/g, " ").trim();
  const diff = quote && quote !== now
    ? `<div class="texv-likely-row"><span class="texv-likely-k">Il commentait</span><span class="texv-likely-old">${deletedHtml(quote, now)}</span></div>`
      + `<div class="texv-likely-row"><span class="texv-likely-k">Maintenant</span><span class="texv-likely-now">${insertedHtml(quote, now)}</span></div>`
    : "";
  // Réglé : ce qui a changé depuis son commentaire, et pourquoi (la
  // correction acceptée ou l'avis de Claude), pour relire comment c'est réglé.
  const settledWhy = state === "done" ? (lastSuggestionReason(note) || note.review?.likely?.reason || "") : "";
  const settled = state === "done"
    ? `<div class="texv-likely is-done"><div class="texv-likely-head">${roundIcons.check}Réglé${diff ? "" : '<span class="texv-likely-by">· passage inchangé</span>'}</div>`
      + diff + (settledWhy ? `<div class="texv-likely-why">${escapeHtml(settledWhy)}</div>` : "") + "</div>"
    : "";
  const verdict = likely
    ? `<div class="texv-likely"><div class="texv-likely-head">${reviewIcons.likely}Sans doute déjà réglé par ta retouche<span class="texv-likely-by">· avis de Claude</span></div>`
      + diff
      + (note.review?.likely?.reason ? `<div class="texv-likely-why">${escapeHtml(note.review.likely.reason)}</div>` : "") + "</div>"
    : "";
  const proposal = suggestion
    ? (suggestion.his ? `<div class="texv-concl">${reviewIcons.edit}Sa version · ton texte n’a pas bougé, elle s’applique telle quelle</div>`
      : `<div class="texv-concl">${agentIcon}${isEdit(note) ? "Fusion proposée par Claude" : "Correction proposée par Claude"}</div>`)
      + (suggestion.reason ? `<div class="texv-reason">${escapeHtml(suggestion.reason)}</div>` : "")
      + `<div class="texr-new" role="group" aria-label="${suggestion.his ? "Sa version" : "Correction proposée par Claude"}">`
      + (escapeHtml(view.lineBefore) + insertedHtml(note.text, suggestion.text) + escapeHtml(view.lineAfter)).split("\n")
        .map(line => `<div class="texr-new-line">${line || "&#8203;"}</div>`).join("") + "</div>"
    : "";
  const chat = `<button type="button" class="texr-ghost texv-chat" title="Envoyer ce commentaire au chat et en discuter avec Claude">${reviewIcons.talk}Discuter dans le chat</button>`;
  const acts = suggestion && isEdit(note)
    ? `<button type="button" class="texr-btn texr-accept" title="Écrire cette version dans le .tex (⌘↩)"><span class="texr-ok">${roundIcons.check}</span>Accepter<span class="texr-kbd">⌘↩</span></button>`
      + `<button type="button" class="texr-ghost texv-refuse" title="${suggestion.his ? "Garder ton texte" : "Écarter cette fusion"}">Refuser</button>`
      + `<button type="button" class="texr-ghost texv-chat" title="Envoyer sa modification au chat et en discuter avec Claude">${reviewIcons.talk}En discuter dans le chat</button>`
    : suggestion
    ? `<button type="button" class="texr-btn texr-accept" title="Accepter la correction (⌘↩)"><span class="texr-ok">${roundIcons.check}</span>Accepter la correction<span class="texr-kbd">⌘↩</span></button>`
      + '<button type="button" class="texr-ghost texv-refuse">Refuser</button>'
    : state === "done"
      ? '<button type="button" class="texr-ghost texv-reopen">Rouvrir</button>'
      : state === "agenda"
        ? '<button type="button" class="texr-ghost texv-agenda" aria-pressed="true">Retirer de l’ordre du jour</button>' + chat
        : `<button type="button" class="texr-btn texv-done" title="${likely ? "Oui, c’est réglé" : "Réglé : corrigé, rien à lui répondre"}">${roundIcons.check}Réglé</button>`
          + `<button type="button" class="texr-ghost texv-agenda" aria-pressed="false">${reviewIcons.flag}À voir avec lui</button>` + chat;
  root.innerHTML = origin + settled + wordReplies(note) + verdict + proposal + `<div class="texr-foot"><div class="texr-acts">${acts}</div></div>`;
  root.querySelector<HTMLButtonElement>(".texr-accept")?.addEventListener("click", () => actions.accept());
  root.querySelector<HTMLButtonElement>(".texv-refuse")?.addEventListener("click", () => actions.refuse());
  root.querySelector<HTMLButtonElement>(".texv-done")?.addEventListener("click", () => actions.state("done"));
  root.querySelector<HTMLButtonElement>(".texv-reopen")?.addEventListener("click", () => actions.state("todo"));
  root.querySelector<HTMLButtonElement>(".texv-agenda")?.addEventListener("click", () => actions.state(state === "agenda" ? "todo" : "agenda"));
  root.querySelector<HTMLButtonElement>(".texv-chat")?.addEventListener("click", () => actions.chat());
  root.addEventListener("pointerdown", () => { if (hasUnread(note)) actions.seen(); });
  return root;
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() || path;

/** Un commentaire tel que le serveur le donne pour le chat (`/review/next`). */
export interface ReviewComment {
  path: string;
  id: string;
  n: number;
  total: number;
  author?: string;
  comment?: string;
  quote?: string;
  now?: string;
  line?: number;
  fit?: string;
  kind?: string;
  on?: string;
  state?: ReviewState;
  likely?: {settled?: boolean; reason?: string} | null;
  /** Une de ses retouches : sa phrase avant / après, et si elle s'applique. */
  edit?: {status?: string; before?: string; after?: string; ready?: boolean} | null;
}

const clip = (text: string | undefined, max: number): string => {
  const flat = (text || "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** Ce que Claude lit quand un commentaire arrive dans le chat. */
export function reviewChatPrompt(comment: ReviewComment): string {
  const name = (comment.author || "Le relecteur").trim();
  const first = name.split(/\s+/)[0] || name;
  const before = comment.quote && clip(comment.quote, 4000) !== clip(comment.now, 4000) ? `\nCe qu'il commentait dans Word : « ${clip(comment.quote, 4000)} »` : "";
  return `Commentaire ${comment.n} sur ${comment.total} de ${name} (${fileName(comment.path)}, ligne ${comment.line || "?"}) : ${comment.comment || ""}\n`
    + `Passage aujourd'hui : « ${clip(comment.now, 4000)} »${before}\n\n`
    + `On en discute un par un. Donne ton avis en quelques phrases : ${first} a-t-il raison, et que faire ? Lis le manuscrit au besoin. `
    + `Si une correction s'impose, propose-la avec atelier_annotate action reply (path « ${comment.path} », id « ${comment.id} », `
    + "text = une phrase, suggestion = le passage réécrit en LaTeX) : elle s'affiche sur le texte, à accepter ou refuser. "
    + `Ne modifie jamais le fichier toi-même. ${first} ne voit pas cette discussion.`;
}

/** Ce que Claude lit quand une de ses retouches arrive dans le chat ;
 *  `merge` : Thierry demande la fusion d'emblée. */
export function editChatPrompt(comment: ReviewComment, merge = false): string {
  const name = (comment.author || "Le relecteur").trim();
  const first = name.split(/\s+/)[0] || name;
  const edit = comment.edit || {};
  const where = `${fileName(comment.path)}, ligne ${comment.line || "?"}`;
  const head = `Modification ${comment.n} sur ${comment.total} de ${name} (${where}), dans son suivi des modifications de Word.\n`
    + `Sa phrase d'origine : « ${clip(edit.before, 4000) || "(aucune : il ajoute une phrase)"} »\n`
    + `Sa version : « ${clip(edit.after, 4000) || "(il supprime la phrase)"} »\n`;
  const tool = `atelier_annotate action reply (path « ${comment.path} », id « ${comment.id} », text = une phrase, suggestion = le passage réécrit en LaTeX)`;
  if (edit.ready && !merge) {
    return head + `Le .tex n'a pas bougé : sa version s'applique telle quelle, et Thierry l'accepte ou la refuse lui-même dans la barre du chat.\n\n`
      + `Dis en deux ou trois phrases si sa retouche tient (sens, anglais, chiffres). Si une variante serait meilleure, propose-la avec ${tool} : elle remplace sa version à accepter. `
      + `Ne modifie jamais le fichier toi-même. ${first} ne voit pas cette discussion.`;
  }
  return head + `Passage aujourd'hui dans le .tex : « ${clip(comment.now, 4000)} »\n`
    + `Thierry a réécrit ce passage depuis l'envoi à ${first}.\n\n`
    + (merge ? "Fusionne tout de suite" : "Dis en quelques phrases ce qui tient encore de sa retouche, puis fusionne")
    + ` : reprends ses changements qui ont encore un sens dans le texte d'aujourd'hui, garde les chiffres et les citations à jour de Thierry, et signale chaque « XX » qu'il a laissé à compléter. `
    + `Propose la fusion avec ${tool} : elle s'affiche sur le texte, à accepter ou refuser. Ne modifie jamais le fichier toi-même. ${first} ne voit pas cette discussion.`;
}

/** Demande à Claude de trier les commentaires dont le passage a changé. */
export function triageRequest(notes: ReviewStatusNote[], name: string): string {
  const list = notes.map(note => `- [${note.id}] ${note.path}, ligne ${note.line || "?"} : ${clip(note.comment, 300)}\n`
    + `  il commentait « ${clip(note.quote, 600)} »\n  maintenant « ${clip(note.text, 600)} »`).join("\n");
  return `Tri des commentaires de ${name} : depuis son retour, j'ai retouché les passages de ces ${notes.length} commentaires. `
    + "Pour chacun, juge si ma retouche règle déjà son point et appelle atelier_annotate action assess "
    + "(path = le fichier, id, settled = true ou false, reason = une phrase en français). "
    + `Ne réponds pas à ${name}, ne propose pas de correction et ne modifie rien : je confirmerai moi-même. `
    + "À la fin, dis seulement combien sont sans doute réglés.\n\n" + list;
}

// ---------------------------------------------------------------------------
// Bilan d'import, avancement, ordre du jour
// ---------------------------------------------------------------------------

export interface ImportReport {
  reviewer: string;
  date?: string;
  counts: {received: number; placed: number; exact: number; changed: number; paragraph: number; near: number; replies: number};
  added: number;
  known: number;
  changes: number;
  moves: number;
  formats: number;
  /** Ses retouches posées sur le .tex (lot 2). */
  edits?: {apply: number; changed: number; done: number; notes: number};
  on?: {equation?: number; figure?: number; inserted?: number; point?: number};
  files: Array<{path: string; notes: number}>;
}

export interface ReviewStatusNote {
  path: string;
  id: string;
  number?: number;
  line?: number;
  comment?: string;
  author?: string;
  text?: string;
  quote?: string;
  state: ReviewState;
  kind?: string;
  fit?: string;
  thread?: number;
  likely?: boolean;
  assessed?: boolean;
  chat?: boolean;
  /** Une de ses retouches : apply, changed ou done (à l'import). */
  edit?: string;
  refused?: boolean;
  accepted?: boolean;
}

export interface ReviewStatus {
  /** files : les fichiers du document dans l'ordre de lecture. */
  rounds: Array<{id?: string; source?: string; reviewer?: string; date?: string; imported?: number; files?: string[]}>;
  notes: ReviewStatusNote[];
  /** Les commentaires seulement ; `edits` compte ses retouches à part. */
  counts: {total: number; todo: number; agenda: number; done: number; discussing: number; likely?: number; unassessed?: number;
    edits?: {total: number; apply: number; changed: number; done: number; todo: number}};
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** « 11 nov. » d'une date ISO. */
export function shortDate(iso: string | undefined): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

const plural = (n: number, one: string, many = one + "s"): string => `${n} ${n > 1 ? many : one}`;

/** Bilan affiché après l'import. */
export function importReportHtml(report: ImportReport, source: string): string {
  const c = report.counts;
  const first = report.reviewer.trim().split(/\s+/)[0] || "le relecteur";
  const shifted = c.changed + c.paragraph + c.near;
  // received et placed comptent aussi les réponses déjà écrites dans Word.
  const received = Math.max(0, c.received - c.replies);
  const placed = Math.max(0, c.placed - c.replies);
  const placedLine = placed >= received ? `${received} reçus, tous placés` : `${received} reçus · ${placed} placés`;
  const detail = [`${c.exact} sur leur passage`, c.changed ? `${c.changed} sur un passage que tu as changé depuis` : "",
    c.paragraph ? `${c.paragraph} à la phrase la plus proche` : "", c.near ? `${c.near} près de l’endroit (figure, légende)` : ""]
    .filter(Boolean).join(", ");
  const extra = [report.on?.equation ? plural(report.on.equation, "sur une équation", "sur des équations") : "",
    report.on?.inserted ? plural(report.on.inserted, "sur un passage qu’il a ajouté", "sur des passages qu’il a ajoutés") : ""]
    .filter(Boolean).join(" et ");
  const rows: Array<[string, string]> = [
    ["Fichier", `<span class="texv-mono">${escapeHtml(source)}</span>`],
    ["Commentaires", `<span class="texv-ok">${escapeHtml(placedLine)}</span> : ${escapeHtml(detail)}.${extra ? ` Dont ${escapeHtml(extra)}.` : ""}`],
  ];
  if (c.replies) rows.push(["Réponses", `${plural(c.replies, "réponse déjà écrite dans Word, gardée", "réponses déjà écrites dans Word, gardées")} sous son commentaire.`]);
  if (report.known && !report.added) rows.push(["Déjà importé", "Ce fichier l’était déjà : rien n’a été ajouté."]);
  else if (report.known) rows.push(["Déjà là", `${report.known} commentaires l’étaient déjà ; ${report.added} ajoutés.`]);
  if (shifted) rows.push(["À vérifier", `${shifted} commentaires ne retrouvent pas leur passage tel quel : chacun dit, sous lui, ce qu’il commentait.`]);
  const edits = report.edits;
  const editTotal = edits ? edits.apply + edits.changed + edits.done : 0;
  if (edits && (editTotal || edits.notes)) {
    const parts = [edits.apply ? plural(edits.apply, "s’applique telle quelle", "s’appliquent telles quelles") : "",
      edits.changed ? plural(edits.changed, "touche un passage que tu as changé depuis", "touchent un passage que tu as changé depuis") : "",
      edits.done ? `${edits.done} déjà dans ton texte` : ""].filter(Boolean).join(", ");
    rows.push(["Ses modifications", `${plural(editTotal, "phrase retouchée", "phrases retouchées")}${parts ? ` : ${escapeHtml(parts)}` : ""}.`
      + (edits.notes ? ` ${plural(edits.notes, "note tapée dans le texte devient un commentaire", "notes tapées dans le texte deviennent des commentaires")}.` : "")]);
  } else if (report.changes || report.moves) rows.push(["Ses modifications", `${report.changes} suivis de modifications${report.moves ? ` et ${report.moves} déplacements` : ""}, sans phrase à reprendre dans le .tex.`]);
  rows.push(["Fichiers", report.files.map(file => `${escapeHtml(fileName(file.path))} · ${file.notes}`).join(", ")]);
  return `<div class="texv-report-head">${reviewIcons.download}<span>Retour de ${escapeHtml(first)} importé${report.date ? ` · ${escapeHtml(shortDate(report.date))}` : ""}</span></div>`
    + `<dl class="texv-report">${rows.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`).join("")}</dl>`
    + '<div class="texv-report-acts"><button type="button" class="texr-btn texv-report-show">Voir ses commentaires</button>'
    + '<button type="button" class="texr-ghost texv-report-close">Fermer</button></div>';
}

/** Encart d'avancement sous le filtre : date du retour, réglés sur le
 *  total, et l'entrée de la revue un par un dans le chat. */
export function progressHtml(status: ReviewStatus, name: string): string {
  const {counts} = status;
  const round = status.rounds.at(-1);
  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  const open = counts.todo - (counts.likely || 0);
  const go = open > 0
    ? `<button type="button" class="texr-btn tp-chat-review">${reviewIcons.talk}En discuter un par un dans le chat</button>`
    : "";
  return `<div class="tp-review"><div class="tp-review-top"><span>Son retour${round?.date ? ` du ${escapeHtml(shortDate(round.date))}` : ""}</span>`
    + `<span class="tp-review-n">${counts.done} sur ${counts.total} réglés</span></div>`
    + `<div class="tp-bar" role="progressbar" aria-label="Commentaires de ${escapeHtml(name)} réglés" aria-valuemin="0" aria-valuemax="${counts.total}" aria-valuenow="${counts.done}"><i style="width:${pct}%"></i></div>`
    + go + "</div>" + likelyHtml(status, name);
}

/** Tri de Claude : combien de commentaires sa retouche règle sans doute,
 *  et combien de passages retouchés il n'a pas encore jugés. */
export function likelyHtml(status: ReviewStatus, name: string): string {
  const likely = status.counts.likely || 0;
  const unassessed = status.counts.unassessed || 0;
  if (!likely && !unassessed) return "";
  const said = likely
    ? `Claude juge ${plural(likely, "commentaire", "commentaires")} de ${escapeHtml(name)} sans doute déjà ${likely > 1 ? "réglés" : "réglé"} par tes retouches.`
    : `${plural(unassessed, "passage commenté a", "passages commentés ont")} changé depuis son retour.`;
  const acts = (likely ? `<button type="button" class="texr-ghost tp-likely-review">Les passer en revue · ${likely}</button>` : "")
    + (unassessed ? `<button type="button" class="tp-link tp-triage">${likely ? "Faire juger les autres" : "Demander à Claude lesquels sont déjà réglés"} · ${unassessed}</button>` : "");
  return `<div class="tp-likely"><div class="tp-likely-t">${reviewIcons.likely}<span>${said}</span></div><div class="tp-likely-acts">${acts}</div></div>`;
}

/** Ordre du jour : les commentaires « à discuter avec lui », tous fichiers. */
export function agendaPoints(status: ReviewStatus): ReviewStatusNote[] {
  return status.notes.filter(note => note.state === "agenda")
    .sort((a, b) => a.path.localeCompare(b.path) || (a.line || 0) - (b.line || 0));
}

export function agendaText(status: ReviewStatus, name: string): string {
  const points = agendaPoints(status);
  return `Ordre du jour avec ${name}\n\n` + points.map((point, index) =>
    `${index + 1}. ${(point.comment || "").replace(/\s+/g, " ").trim()} (${fileName(point.path)}, ligne ${point.line || "?"})`).join("\n") + "\n";
}

export function agendaHtml(status: ReviewStatus, name: string): string {
  const points = agendaPoints(status);
  const list = points.length
    ? `<ol class="tp-agenda">${points.map(point => `<li data-path="${escapeHtml(point.path)}" data-id="${escapeHtml(point.id)}">`
      + `<span class="tp-agenda-t">${escapeHtml((point.comment || "").replace(/\s+/g, " ").trim())}</span>`
      + `<span class="tp-agenda-w">${escapeHtml(fileName(point.path))} · l. ${point.line || "?"}</span></li>`).join("")}</ol>`
    : `<div class="tp-empty">Aucun point pour l’instant. Sous un commentaire, « À discuter avec lui » l’ajoute ici.</div>`;
  return `<div class="tp-agenda-head"><span>${reviewIcons.flag}Ordre du jour avec ${escapeHtml(name)}</span><span class="tp-gap"></span>`
    + (points.length ? '<button type="button" class="tp-link tp-agenda-copy">Copier</button>' : "")
    + '<button type="button" class="tp-link tp-agenda-close">Retour</button></div>' + list;
}
