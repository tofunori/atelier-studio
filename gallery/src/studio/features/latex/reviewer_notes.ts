/** Commentaires d'un relecteur importés de Word (maquette v3 « allégée »,
 *  Thierry 2026-11-12) : le directeur commente le .docx tiré du .tex, Atelier
 *  pose chaque commentaire sur son passage (`POST /review/import`, Rust).
 *
 *  Ses commentaires vivent dans le panneau Annotations habituel, signés de
 *  son nom (`by: "reviewer"`). Sous chacun, Thierry discute en privé avec
 *  Claude (le fil `thread`, que le relecteur ne voit jamais) ; Claude peut y
 *  proposer une correction. Un commentaire est « à faire », « à discuter
 *  avec lui » (ordre du jour) ou « réglé ».
 *
 *  Ce module ne garde aucun état : reconnaissance, libellés, blocs affichés
 *  dans l'éditeur, message envoyé au chat, bilan d'import et ordre du jour. */

import {insertedHtml, roundIcons} from "./revision_round";
import {agentIcon, currentSuggestion, hasUnread, waitsForAgent, type AgentFields} from "./agent_notes";

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
  replies?: Array<{id?: number; author?: string; date?: string; text?: string}>;
}

export interface ReviewerFields extends AgentFields {
  review?: ReviewInfo;
}

export const isReviewerNote = (note: {by?: string} | null | undefined): boolean => note?.by === "reviewer";

/** Prénom du relecteur (« Christophe Kinnard » → « Christophe »). */
export const reviewerName = (note: {author?: string}): string => (note.author || "Relecteur").trim().split(/\s+/)[0] || "Relecteur";

export const reviewState = (note: {review?: ReviewInfo}): ReviewState => note.review?.state || "todo";

const escapeHtml = (value: string): string => String(value).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"})[c] || c);

export const reviewIcons = {
  flag: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13.5V3M4 3.2h7.2l-1.6 2.6 1.6 2.6H4"/></svg>',
  talk: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.8 4.2c0-.8.6-1.4 1.4-1.4h7.6c.8 0 1.4.6 1.4 1.4v4.6c0 .8-.6 1.4-1.4 1.4H7.2L4.4 12.6v-2.4h-.2c-.8 0-1.4-.6-1.4-1.4z"/></svg>',
  person: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="5.6" r="2.4"/><path d="M3.4 13.2c.6-2.2 2.4-3.4 4.6-3.4s4 1.2 4.6 3.4"/></svg>',
  lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.6" y="7" width="8.8" height="6.2" rx="1.4"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7"/></svg>',
  warn: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.8 13.6 12.6H2.4z"/><path d="M8 6.6v2.6M8 11v.1"/></svg>',
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

/** État affiché d'un commentaire du relecteur (panneau et en-tête). */
export function reviewerState(note: ReviewerFields): {icon: string; label: string; tone: string} {
  const state = reviewState(note);
  if (state === "done") return {icon: roundIcons.check, label: "Réglé", tone: "ok"};
  if (state === "agenda") return {icon: reviewIcons.flag, label: "À discuter avec lui", tone: "ask"};
  if (hasUnread(note)) return {icon: '<span class="texa-dot"></span>', label: "Nouvelle réponse de Claude", tone: "todo"};
  if (waitsForAgent(note)) return {icon: '<span class="texr-spin"></span>', label: "Claude lit ta réponse…", tone: "busy"};
  if (currentSuggestion(note)) return {icon: roundIcons.check, label: "Correction à valider", tone: "todo"};
  const talk = (note.thread || []).length;
  if (talk) return {icon: reviewIcons.talk, label: `En discussion avec Claude · ${talk}`, tone: "note"};
  return {icon: note.review?.kind === "question" ? roundIcons.question : roundIcons.circle,
    label: note.review?.kind === "question" ? "Question · à faire" : "À faire", tone: "todo"};
}

/** En-tête au-dessus du passage : pastille, prénom, son commentaire, état. */
export function reviewerHeader(doc: Document, number: number, note: ReviewerFields): HTMLElement {
  const root = doc.createElement("div");
  const state = reviewerState(note);
  root.className = "texr-head texa-head texv-head" + (reviewState(note) === "done" ? " is-done" : "");
  root.innerHTML = `<span class="atelier-annotation-number texr-ring is-reviewer${hasUnread(note) ? " is-unread" : ""}">${number}</span>`
    + `<span class="texa-who">${escapeHtml(reviewerName(note))}</span>`
    + `<span class="texr-note">${escapeHtml((note.comment || "").replace(/\s+/g, " "))}</span>`
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
  state(next: ReviewState): void;
  reply(words: string): void;
  chat(): void;
  seen(): void;
}

function messages(note: ReviewerFields): string {
  const name = escapeHtml(reviewerName(note));
  const his = (note.review?.replies || []).map(reply => `<div class="texa-msg texv-word"><div class="texa-msg-who">${reviewIcons.person}`
    + `${escapeHtml(reply.author || name)} · dans Word</div><div class="texa-msg-text">${escapeHtml(reply.text || "")}</div></div>`).join("");
  const thread = (note.thread || []).map(message => {
    const mine = message.by === "user";
    return `<div class="texa-msg${mine ? " is-mine" : ""}"><div class="texa-msg-who">`
      + (mine ? "Toi" : `${agentIcon}${escapeHtml(message.author || "Claude")}`)
      + `</div><div class="texa-msg-text">${escapeHtml(message.text || (message.suggest ? "Correction proposée ci-dessous." : ""))}</div></div>`;
  }).join("");
  const wait = waitsForAgent(note) ? '<div class="texa-wait"><span class="texr-spin"></span>Claude lit ta réponse…</div>' : "";
  const privacy = `<div class="texv-private">${reviewIcons.lock}Discussion privée avec Claude · ${name} ne la voit pas</div>`;
  return his + privacy + (thread || wait ? `<div class="texa-thread">${thread}${wait}</div>` : "");
}

/** Bloc sous le paragraphe du commentaire actif : son passage d'origine si
 *  le .tex a bougé, ses réponses dans Word, le fil privé avec Claude, la
 *  correction proposée, les actions. */
export function reviewerBlock(doc: Document, view: ReviewerBlockView, actions: ReviewerBlockActions): HTMLElement {
  const {note} = view;
  const suggestion = currentSuggestion(note);
  const state = reviewState(note);
  const root = doc.createElement("div");
  root.className = "texr-block texa-block texv-block" + (suggestion ? " texr-proposal" : "");
  const fit = fitNote(note);
  const quote = (note.review?.quote || "").replace(/\s+/g, " ").trim();
  const origin = fit
    ? `<div class="texv-fit">${reviewIcons.warn}<span>${escapeHtml(fit)}${quote && note.review?.on !== "figure" ? ` · il commentait « ${escapeHtml(quote.slice(0, 200))} »` : ""}</span></div>`
    : "";
  const proposal = suggestion
    ? '<div class="texv-concl">Correction proposée par Claude</div><div class="texr-new" role="group" aria-label="Correction proposée par Claude">'
      + (escapeHtml(view.lineBefore) + insertedHtml(note.text, suggestion.text) + escapeHtml(view.lineAfter)).split("\n")
        .map(line => `<div class="texr-new-line">${line || "&#8203;"}</div>`).join("") + "</div>"
    : "";
  const acts = (suggestion && state !== "done"
    ? `<button type="button" class="texr-btn texr-accept" title="Accepter la correction (⌘↩)"><span class="texr-ok">${roundIcons.check}</span>Accepter la correction<span class="texr-kbd">⌘↩</span></button>`
    : state === "done"
      ? '<button type="button" class="texr-ghost texv-reopen">Rouvrir</button>'
      : `<button type="button" class="texr-btn texv-done" title="Réglé : corrigé, rien à lui répondre">${roundIcons.check}Réglé</button>`)
    + '<button type="button" class="texr-ghost texa-answer">Discuter avec Claude…</button>'
    + (state === "agenda"
      ? '<button type="button" class="texr-ghost texv-agenda" aria-pressed="true">Retirer de l’ordre du jour</button>'
      : state === "done" ? "" : '<button type="button" class="texr-ghost texv-agenda" aria-pressed="false">À discuter avec lui</button>')
    + '<button type="button" class="texr-ghost texv-chat" title="Ouvrir ce commentaire et son passage dans le chat">Ouvrir dans le chat</button>';
  root.innerHTML = origin + messages(note) + proposal
    + `<div class="texr-foot"><div class="texr-acts">${acts}</div><div class="texr-again-row" hidden>`
    + '<div class="texr-field"><input type="text" class="texr-input" aria-label="Ta réponse à Claude" placeholder="Répondre à Claude…">'
    + `<button type="button" class="texr-send" aria-label="Envoyer" title="Envoyer (Entrée)">${roundIcons.send}</button></div>`
    + "</div></div>";
  const row = root.querySelector<HTMLElement>(".texr-again-row")!;
  const input = root.querySelector<HTMLInputElement>(".texr-input")!;
  const send = () => { const words = input.value.trim(); if (words) actions.reply(words); };
  root.querySelector<HTMLButtonElement>(".texr-accept")?.addEventListener("click", () => actions.accept());
  root.querySelector<HTMLButtonElement>(".texv-done")?.addEventListener("click", () => actions.state("done"));
  root.querySelector<HTMLButtonElement>(".texv-reopen")?.addEventListener("click", () => actions.state("todo"));
  root.querySelector<HTMLButtonElement>(".texv-agenda")?.addEventListener("click", () => actions.state(state === "agenda" ? "todo" : "agenda"));
  root.querySelector<HTMLButtonElement>(".texv-chat")?.addEventListener("click", () => actions.chat());
  root.querySelector<HTMLButtonElement>(".texa-answer")!.onclick = () => {
    row.hidden = !row.hidden;
    if (!row.hidden) input.focus();
  };
  // Le fil déjà commencé : le champ est ouvert d'emblée.
  if ((note.thread || []).length && state !== "done") row.hidden = false;
  root.querySelector<HTMLButtonElement>(".texr-send")!.onclick = send;
  input.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); send(); }
    if (event.key === "Escape") { event.preventDefault(); row.hidden = true; }
  });
  root.addEventListener("pointerdown", () => { if (hasUnread(note)) actions.seen(); });
  return root;
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() || path;
const lines = (note: AgentFields): string => note.from.line === note.to.line ? `ligne ${note.from.line + 1}` : `lignes ${note.from.line + 1}-${note.to.line + 1}`;

/** Message au chat quand Thierry discute d'un commentaire du relecteur. */
export function reviewerRequest(path: string, note: ReviewerFields, words: string): string {
  const name = reviewerName(note);
  const quote = note.review?.quote && note.review.quote.trim() !== note.text.trim() ? `\nCe qu'il commentait dans Word : « ${note.review.quote.trim()} »` : "";
  return `Discussion sur le commentaire de ${name} [${note.id}] dans ${fileName(path)} (${lines(note)}) : ${words}\n\n`
    + `Passage : « ${note.text} »${quote}\nSon commentaire : ${note.comment}\n\n`
    + `Cette discussion est privée : ${name} ne la verra pas. Lis le manuscrit (et au besoin les articles et données) pour juger s'il a raison. `
    + `Réponds sous son commentaire avec l'outil atelier_annotate, action reply (path « ${path} », id « ${note.id} ») ; `
    + "quand vous êtes d'accord sur une correction, donne-la en suggestion (le passage réécrit en LaTeX). Ne modifie pas le fichier toi-même.";
}

/** « Ouvrir dans le chat » : le commentaire et son passage, pour un gros point. */
export function reviewerChatText(path: string, note: ReviewerFields): string {
  return `Commentaire de ${note.author || reviewerName(note)} sur ${fileName(path)} (${lines(note)}) : ${note.comment}\n`
    + `Passage : « ${note.text} »\n`
    + `(Pour conclure, réponds sous son commentaire avec atelier_annotate reply, path « ${path} », id « ${note.id} », avec la correction en suggestion.)`;
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
  on?: {equation?: number; figure?: number; inserted?: number; point?: number};
  files: Array<{path: string; notes: number}>;
}

export interface ReviewStatusNote {
  path: string;
  id: string;
  line?: number;
  comment?: string;
  author?: string;
  state: ReviewState;
  kind?: string;
  fit?: string;
  thread?: number;
}

export interface ReviewStatus {
  rounds: Array<{id?: string; source?: string; reviewer?: string; date?: string; imported?: number}>;
  notes: ReviewStatusNote[];
  counts: {total: number; todo: number; agenda: number; done: number; discussing: number};
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
  if (report.changes || report.moves) rows.push(["Ses modifications", `${report.changes} suivis de modifications${report.moves ? ` et ${report.moves} déplacements` : ""} : pas encore repris dans le .tex (prochaine étape).`]);
  rows.push(["Fichiers", report.files.map(file => `${escapeHtml(fileName(file.path))} · ${file.notes}`).join(", ")]);
  return `<div class="texv-report-head">${reviewIcons.download}<span>Retour de ${escapeHtml(first)} importé${report.date ? ` · ${escapeHtml(shortDate(report.date))}` : ""}</span></div>`
    + `<dl class="texv-report">${rows.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`).join("")}</dl>`
    + '<div class="texv-report-acts"><button type="button" class="texr-btn texv-report-show">Voir ses commentaires</button>'
    + '<button type="button" class="texr-ghost texv-report-close">Fermer</button></div>';
}

/** Encart d'avancement sous le filtre : date du retour, réglés sur le total. */
export function progressHtml(status: ReviewStatus, name: string): string {
  const {counts} = status;
  const round = status.rounds.at(-1);
  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  return `<div class="tp-review"><div class="tp-review-top"><span>Son retour${round?.date ? ` du ${escapeHtml(shortDate(round.date))}` : ""}</span>`
    + `<span class="tp-review-n">${counts.done} sur ${counts.total} réglés</span></div>`
    + `<div class="tp-bar" role="progressbar" aria-label="Commentaires de ${escapeHtml(name)} réglés" aria-valuemin="0" aria-valuemax="${counts.total}" aria-valuenow="${counts.done}"><i style="width:${pct}%"></i></div></div>`;
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
