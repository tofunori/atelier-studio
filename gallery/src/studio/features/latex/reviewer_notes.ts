/** Commentaires d'un relecteur importés de Word (maquette v3 « allégée »,
 *  Thierry 2026-11-12) : le directeur commente le .docx tiré du .tex, Atelier
 *  pose chaque commentaire sur son passage (`POST /review/import`, Rust).
 *
 *  Dans l'éditeur (maquette « annotations épurées » v8, 2026-11-12) : rien
 *  n'est inséré dans le texte. Un numéro dans la marge par commentaire, la
 *  couleur seule dit l'état ; le commentaire ouvert flotte dans une bulle
 *  sous son passage (reviewer_overlay.ts). Une seule icône, le chat : Thierry
 *  y écrit sa note, qui part au chat avec le commentaire ; la correction que
 *  Claude propose revient sur une ligne, à accepter ou refuser. Ses
 *  retouches (suivi des modifications de Word) suivent le même modèle :
 *  un crayon dans la marge, sa version barré / ajouté dans la bulle.
 *
 *  Ce module ne garde aucun état : reconnaissance, couleurs, bulle, messages
 *  envoyés au chat, bilan d'import et ordre du jour. */

import {roundIcons, wordDiff} from "./revision_round";
import {hasUnread, type AgentFields} from "./agent_notes";

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

/** Couleur de l'état, seule marque d'état sur le texte et dans la bulle
 *  (Thierry 2026-11-12 : « trop de texte », plus aucun mot d'état) :
 *  bleu à faire, vert réglé ou sans doute réglé, ambre à voir ou passage
 *  changé depuis son retour. Le nom de l'état reste au survol. */
export type ReviewTone = "info" | "ok" | "warn";
export function reviewerTone(note: ReviewerFields): ReviewTone {
  const state = reviewState(note);
  if (state === "done" || likelySettled(note)) return "ok";
  if (state === "agenda") return "warn";
  if (reviewerSuggestion(note)) return "info";
  // Sa retouche ne s'applique plus telle quelle : à fusionner.
  if (isEdit(note)) return "warn";
  if (note.review?.chatAt) return "info";
  return note.review?.fit === "changed" ? "warn" : "info";
}

/** Avant / après sur une seule ligne : mots retirés barrés, mots ajoutés
 *  surlignés, dans l'ordre du texte. */
export function mergedDiffHtml(before: string, after: string): string {
  const {old, neu} = wordDiff(before, after);
  const piece = (tag: "del" | "ins", t: string): string => {
    const word = t.trimEnd();
    return word ? `<${tag}>${escapeHtml(word)}</${tag}>${escapeHtml(t.slice(word.length))}` : escapeHtml(t);
  };
  let html = "";
  let i = 0, j = 0;
  while (i < old.length || j < neu.length) {
    const a = old[i], b = neu[j];
    if (a?.changed) { html += piece("del", a.t); i += 1; }
    else if (b?.changed) { html += piece("ins", b.t); j += 1; }
    else { html += escapeHtml((a || b)?.t || ""); i += 1; j += 1; }
  }
  // Mots changés qui se suivent : une seule marque, espace compris.
  return html.replace(/<\/(del|ins)>([ \t]+)<\1>/g, "$2");
}

/** Ce que Claude disait de la dernière correction proposée (acceptée ou non). */
function lastSuggestionReason(note: ReviewerFields): string {
  const thread = note.thread || [];
  for (let index = thread.length - 1; index >= 0; index -= 1) if (thread[index]?.suggest?.text) return thread[index]?.text || "";
  return "";
}

export interface ReviewerBubbleView {
  note: ReviewerFields;
  number: number;
  /** Rang parmi ses commentaires de ce fichier (1…total). */
  index: number;
  total: number;
  /** Champ de note ouvert (« Discuter dans le chat »), et son brouillon. */
  composing: boolean;
  draft: string;
  /** Note de Thierry partie au chat avec le commentaire, s'il y en a une. */
  said?: string;
}

export interface ReviewerBubbleActions {
  /** Coche du numéro : réglé, ou rouvert s'il l'était. */
  tick(): void;
  chat(): void;
  send(text: string): void;
  cancel(): void;
  draft(text: string): void;
  accept(): void;
  refuse(): void;
  nav(delta: number): void;
  seen(): void;
}

const bubbleIcons = {
  up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3.5M4.5 7 8 3.5 11.5 7"/></svg>',
  prev: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.8 4.5 6.3 8l3.5 3.5"/></svg>',
  next: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.2 4.5 9.7 8l-3.5 3.5"/></svg>',
} as const;

/** Bulle d'un commentaire du relecteur (maquette « annotations épurées » v8,
 *  choisie le 2026-11-12) : flotte sous son passage sans rien insérer dans
 *  le texte. Le numéro se coche pour dire « réglé » ; une seule icône, le
 *  chat, ouvre un champ où Thierry écrit sa note, qui part au chat avec le
 *  commentaire. La correction de Claude tient sur une ligne (barré / ajouté),
 *  ✓ l'accepte, ✕ la refuse ; un commentaire réglé garde son avant / après. */
export function reviewerBubble(doc: Document, view: ReviewerBubbleView, actions: ReviewerBubbleActions): HTMLElement {
  const {note} = view;
  const state = reviewState(note);
  const done = state === "done";
  const suggestion = done ? null : reviewerSuggestion(note);
  const likely = !suggestion && likelySettled(note);
  const tone = reviewerTone(note);
  const label = reviewerState(note).label;
  const name = reviewerName(note);
  const edit = isEdit(note);
  const fit = done || likely || edit ? "" : fitNote(note);
  // Un seul signe : le point. La place approximative se lit à son survol.
  const quote = (note.review?.quote || "").replace(/\s+/g, " ").trim();
  const now = note.text.replace(/\s+/g, " ").trim();
  const dotTitle = fit ? `${label} · ${fit}${quote && note.review?.on !== "figure" ? ` · il commentait « ${quote.slice(0, 200)} »` : ""}` : label;
  const root = doc.createElement("div");
  root.className = "texv-pop";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", `${edit ? "Modification" : "Commentaire"} ${view.number} de ${name}`);
  if (edit) root.classList.add("is-edit");
  root.dataset.texv = (note as {id?: string}).id || "";
  const tick = `<button type="button" class="texv-tick${done ? " is-done" : ""}" data-tip="${done ? "Rouvrir" : "Marquer réglé"}" aria-label="${done ? "Rouvrir" : "Marquer réglé"}">`
    + `<span class="atelier-annotation-number is-reviewer texv-ring tone-${tone}"><span class="texv-n">${done ? "" : edit ? reviewIcons.edit : view.number}</span><span class="texv-ck">${roundIcons.check}</span></span></button>`;
  // Sa retouche : ✓ applique sa version (ou la fusion de Claude), ✕ garde
  // ton texte ; à fusionner, le chat demande la fusion à Claude.
  const accept = suggestion?.his ? "Appliquer sa version" : edit ? "Accepter la fusion" : "Accepter la correction";
  const refuse = edit && (!suggestion || suggestion.his) ? "Garder mon texte" : "Refuser";
  const chat = edit ? "Demander à Claude de fusionner" : "Discuter dans le chat";
  const keep = `<button type="button" class="texv-ib texv-refuse" data-tip="${refuse}" aria-label="${refuse}">${roundIcons.cross}</button>`;
  const tools = view.composing || done ? ""
    : suggestion
      ? `<button type="button" class="texv-ib texv-accept is-ok" data-tip="${accept} · ⌘↩" aria-label="${accept}">${roundIcons.check}</button>` + keep
      : `<button type="button" class="texv-ib texv-chat" data-tip="${chat}" aria-label="${chat}">${reviewIcons.talk}</button>` + (edit ? keep : "");
  const text = edit ? `${name} ${editVerb(note)}` : (note.comment || "").trim();
  const head = `<div class="texv-pop-row">${tick}<div class="texv-pop-note">${escapeHtml(text)}</div>`
    + `<span class="texv-dot tone-${tone}" title="${escapeHtml(dotTitle)}" role="img" aria-label="${escapeHtml(dotTitle)}"></span>${tools}</div>`;
  const why = (text: string): string => text ? `<div class="texv-why">${escapeHtml(text)}</div>` : "";
  const said = view.said ? `<div class="texv-said">${escapeHtml(view.said)}</div>` : "";
  const replies = (note.review?.replies || []).map(reply =>
    `<div class="texv-said texv-word" title="${escapeHtml(reply.author || "")} · dans Word">${escapeHtml(reply.text || "")}</div>`).join("");
  // Sa version : mots retirés barrés, ajoutés en vert.
  const his = edit ? `<div class="texv-dif texv-his">${editDiffHtml(note.review?.edit?.diff, note.review?.edit?.after)}</div>` : "";
  const fusion = edit && !view.composing && suggestion && !suggestion.his
    ? `<div class="texv-dif">${mergedDiffHtml(note.text, suggestion.text)}</div>${why(suggestion.reason || "")}` : "";
  let box = "";
  if (edit) {
    box = `<div class="texv-box">${view.composing ? "" : said}${fusion || his}</div>`;
  }
  if (view.composing) {
    box += `<div class="texv-cmp"><textarea class="texv-cmp-t" rows="2" placeholder="Ta note pour Claude…" aria-label="Ta note pour Claude">${escapeHtml(view.draft)}</textarea>`
      + `<button type="button" class="texv-ib texv-send" data-tip="Envoyer au chat · Entrée" aria-label="Envoyer au chat">${bubbleIcons.up}</button></div>`;
  } else if (edit) {
    // Sa version (ou la fusion de Claude) est déjà dans la boîte.
  } else if (suggestion) {
    box = `<div class="texv-box">${said}<div class="texv-dif">${mergedDiffHtml(note.text, suggestion.text)}</div>${why(suggestion.reason || "")}</div>`;
  } else if (done || likely) {
    const reason = done ? lastSuggestionReason(note) || note.review?.likely?.reason || "" : note.review?.likely?.reason || "";
    const diff = quote && quote !== now ? `<div class="texv-dif">${mergedDiffHtml(quote, now)}</div>` : "";
    box = diff || reason ? `<div class="texv-box">${diff}${why(reason)}</div>` : "";
  } else if (said || replies) {
    box = `<div class="texv-box">${replies}${said}</div>`;
  }
  const nav = `<div class="texv-pop-nav"><span class="texv-pos">${view.index} / ${view.total}</span>`
    + `<button type="button" class="texv-ib texv-prev" aria-label="Commentaire précédent"${view.index <= 1 ? " disabled" : ""}>${bubbleIcons.prev}</button>`
    + `<button type="button" class="texv-ib texv-next" aria-label="Commentaire suivant"${view.index >= view.total ? " disabled" : ""}>${bubbleIcons.next}</button></div>`;
  root.innerHTML = head + box + nav;
  const on = (selector: string, fn: () => void): void => {
    root.querySelector<HTMLButtonElement>(selector)?.addEventListener("click", event => { event.stopPropagation(); fn(); });
  };
  on(".texv-tick", () => actions.tick());
  on(".texv-chat", () => actions.chat());
  on(".texv-accept", () => actions.accept());
  on(".texv-refuse", () => actions.refuse());
  on(".texv-prev", () => actions.nav(-1));
  on(".texv-next", () => actions.nav(1));
  const input = root.querySelector<HTMLTextAreaElement>(".texv-cmp-t");
  on(".texv-send", () => actions.send(input?.value || ""));
  input?.addEventListener("input", () => actions.draft(input.value));
  input?.addEventListener("keydown", event => {
    // Le champ garde ses touches : ni l'éditeur ni la page ne les voient,
    // sauf les raccourcis ⌘ (enregistrer…).
    if (!event.metaKey && !event.ctrlKey) event.stopPropagation();
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); actions.send(input.value); }
    else if (event.key === "Escape") { event.preventDefault(); actions.cancel(); }
  });
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
export function reviewChatPrompt(comment: ReviewComment, note = ""): string {
  const name = (comment.author || "Le relecteur").trim();
  const first = name.split(/\s+/)[0] || name;
  const before = comment.quote && clip(comment.quote, 4000) !== clip(comment.now, 4000) ? `\nCe qu'il commentait dans Word : « ${clip(comment.quote, 4000)} »` : "";
  return `Commentaire ${comment.n} sur ${comment.total} de ${name} (${fileName(comment.path)}, ligne ${comment.line || "?"}) : ${comment.comment || ""}\n`
    + `Passage aujourd'hui : « ${clip(comment.now, 4000)} »${before}\n`
    + (note.trim() ? `Ma note : « ${note.trim()} »\n` : "")
    + `\nOn en discute un par un. Donne ton avis en quelques phrases${note.trim() ? ", en tenant compte de ma note" : ""} : ${first} a-t-il raison, et que faire ? Lis le manuscrit au besoin. `
    + `Si une correction s'impose, propose-la avec atelier_annotate action reply (path « ${comment.path} », id « ${comment.id} », `
    + "text = une phrase, suggestion = le passage réécrit en LaTeX) : elle s'affiche sur le texte, à accepter ou refuser. "
    + `Ne modifie jamais le fichier toi-même. ${first} ne voit pas cette discussion.`;
}

/** Ce que Claude lit quand une de ses retouches arrive dans le chat ;
 *  `merge` : Thierry demande la fusion d'emblée. */
export function editChatPrompt(comment: ReviewComment, merge = false, note = ""): string {
  const name = (comment.author || "Le relecteur").trim();
  const first = name.split(/\s+/)[0] || name;
  const edit = comment.edit || {};
  const where = `${fileName(comment.path)}, ligne ${comment.line || "?"}`;
  const head = `Modification ${comment.n} sur ${comment.total} de ${name} (${where}), dans son suivi des modifications de Word.\n`
    + `Sa phrase d'origine : « ${clip(edit.before, 4000) || "(aucune : il ajoute une phrase)"} »\n`
    + `Sa version : « ${clip(edit.after, 4000) || "(il supprime la phrase)"} »\n`
    + (note.trim() ? `Ma note : « ${note.trim()} »\n` : "");
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
