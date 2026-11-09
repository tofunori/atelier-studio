/** Notes posées par l'agent du chat (outil `atelier_annotate`, maquette
 *  « L'agent annote lui-même », Thierry 2026-11-09).
 *
 *  L'agent laisse une note sur un passage, comme un relecteur dans les
 *  commentaires d'un document partagé : une remarque, ou une proposition de
 *  réécriture. Il ne touche jamais au fichier. Thierry lui répond sous la note
 *  (le fil reste là, et part aussi au chat), résout la note, la retire, ou
 *  accepte la proposition.
 *
 *  Ce module ne garde aucun état : reconnaissance des notes de l'agent,
 *  message envoyé au chat pour une réponse, et blocs affichés dans l'éditeur. */

import {insertedHtml, roundIcons} from "./revision_round";

/** Message du fil d'une note de l'agent. */
export interface ThreadMessage {
  id: string;
  by: "user" | "agent" | string;
  author?: string;
  text: string;
  suggest?: {text: string; reason?: string};
  at?: number;
}

export interface AgentFields {
  id: string;
  by?: string;
  author?: string;
  comment: string;
  text: string;
  suggest?: {text: string; reason?: string};
  thread?: ThreadMessage[];
  /** Dernière lecture du fil par Thierry (ms). */
  seen?: number;
  from: {line: number; ch: number};
  to: {line: number; ch: number};
}

/** `agent` : l'agent du chat ; `claude` : Claude Desktop (MCP des annotations). */
export const isAgentNote = (note: {by?: string} | null | undefined): boolean =>
  note?.by === "agent" || note?.by === "claude";

export const authorOf = (note: {author?: string}): string => note.author || "Claude";

/** Proposition en cours : la dernière du fil, sinon celle de la note. */
export function currentSuggestion(note: AgentFields): {text: string; reason?: string} | null {
  const thread = note.thread || [];
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const message = thread[index];
    if (message?.suggest?.text) return {text: message.suggest.text, reason: message.text};
  }
  return note.suggest?.text ? note.suggest : null;
}

/** L'agent a écrit dans le fil depuis la dernière lecture. */
export function hasUnread(note: AgentFields): boolean {
  const last = (note.thread || []).at(-1);
  return Boolean(last && last.by !== "user" && (last.at || 0) > (note.seen || 0));
}

/** Thierry a répondu ; l'agent n'a pas encore répondu. */
export const waitsForAgent = (note: AgentFields): boolean => (note.thread || []).at(-1)?.by === "user";

/** Fils fusionnés par id de message, dans l'ordre du temps (comme le serveur). */
export function mergeThreads(local: readonly ThreadMessage[] | undefined, stored: readonly ThreadMessage[] | undefined): ThreadMessage[] {
  const out = [...(local || [])];
  for (const message of stored || []) if (!out.some(m => m.id === message.id)) out.push(message);
  return out.sort((a, b) => (a.at || 0) - (b.at || 0));
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() || path;

/** Message au chat quand Thierry répond sous une note de l'agent. */
export function replyRequest(path: string, note: AgentFields, words: string): string {
  const line = note.from.line === note.to.line ? `ligne ${note.from.line + 1}` : `lignes ${note.from.line + 1}-${note.to.line + 1}`;
  return `Réponse sur ta note [${note.id}] dans ${fileName(path)} (${line}) : ${words}\n\n`
    + `Passage : « ${note.text} »\nTa note : ${note.comment || "(proposition)"}\n\n`
    + `Réponds sous la note avec l'outil atelier_annotate, action reply (path « ${path} », id « ${note.id} ») ; `
    + "ajoute suggestion si tu proposes une nouvelle réécriture du passage. Ne modifie pas le fichier toi-même.";
}

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"})[c] || c);

/** Petit robot monochrome : la marque des notes de l'agent. */
export const agentIcon = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="10" height="8" rx="2"/><path d="M8 2.5v2M6 8.2v.6M10 8.2v.6"/></svg>';

/** En-tête au-dessus du passage : pastille pleine, nom de l'agent, note. */
export function agentHeader(doc: Document, number: number, note: AgentFields): HTMLElement {
  const root = doc.createElement("div");
  root.className = "texr-head texa-head";
  root.innerHTML = `<span class="atelier-annotation-number texr-ring is-agent${hasUnread(note) ? " is-unread" : ""}">${number}</span>`
    + `<span class="texa-who">${escapeHtml(authorOf(note))}</span>`
    + `<span class="texr-note">${escapeHtml(note.comment || "Proposition de réécriture")}</span>`;
  return root;
}

export interface AgentBlockView {
  note: AgentFields;
  /** Lignes entières autour du passage, pour montrer le paragraphe réécrit. */
  lineBefore: string;
  lineAfter: string;
}

export interface AgentBlockActions {
  accept(): void;
  reject(): void;
  resolve(): void;
  remove(): void;
  reply(words: string): void;
  seen(): void;
}

function threadHtml(note: AgentFields): string {
  const thread = note.thread || [];
  if (!thread.length) return "";
  return '<div class="texa-thread">' + thread.map(message => {
    const mine = message.by === "user";
    return `<div class="texa-msg${mine ? " is-mine" : ""}"><div class="texa-msg-who">`
      + (mine ? "Toi" : `${agentIcon}${escapeHtml(message.author || authorOf(note))}`)
      + `</div><div class="texa-msg-text">${escapeHtml(message.text || (message.suggest ? "Nouvelle proposition ci-dessous." : ""))}</div></div>`;
  }).join("") + (waitsForAgent(note) ? `<div class="texa-wait"><span class="texr-spin"></span>${escapeHtml(authorOf(note))} lit ta réponse…</div>` : "") + "</div>";
}

/** Bloc sous le paragraphe : fil, proposition éventuelle, actions. */
export function agentBlock(doc: Document, view: AgentBlockView, actions: AgentBlockActions): HTMLElement {
  const {note} = view;
  const suggestion = currentSuggestion(note);
  const root = doc.createElement("div");
  root.className = "texr-block texa-block" + (suggestion ? " texr-proposal" : "");
  const proposal = suggestion
    ? '<div class="texr-new" role="group" aria-label="Proposition de l’agent">'
      + (escapeHtml(view.lineBefore) + insertedHtml(note.text, suggestion.text) + escapeHtml(view.lineAfter)).split("\n")
        .map(line => `<div class="texr-new-line">${line || "&#8203;"}</div>`).join("") + "</div>"
    : "";
  const reason = suggestion && note.suggest === suggestion && suggestion.reason
    ? `<div class="texr-why">${escapeHtml(suggestion.reason)}</div>` : "";
  const acts = suggestion
    ? `<button type="button" class="texr-btn texr-accept" title="Accepter (⌘↩)"><span class="texr-ok">${roundIcons.check}</span>Accepter<span class="texr-kbd">⌘↩</span></button>`
      + '<button type="button" class="texr-ghost texa-reject">Rejeter</button>'
    : `<button type="button" class="texr-btn texa-resolve" title="Résoudre : la note quitte la page">${roundIcons.check}Résoudre</button>`;
  root.innerHTML = threadHtml(note) + proposal
    + `<div class="texr-foot">${reason}<div class="texr-acts">${acts}`
    + '<button type="button" class="texr-ghost texa-answer">Répondre…</button>'
    + (suggestion ? "" : '<button type="button" class="texr-ghost texa-remove">Retirer</button>')
    + '</div><div class="texr-again-row" hidden>'
    + `<div class="texr-field"><input type="text" class="texr-input" aria-label="Ta réponse à ${escapeHtml(authorOf(note))}" placeholder="Répondre à ${escapeHtml(authorOf(note))}…">`
    + `<button type="button" class="texr-send" aria-label="Envoyer la réponse" title="Envoyer (Entrée)">${roundIcons.send}</button></div>`
    + "</div></div>";
  const row = root.querySelector<HTMLElement>(".texr-again-row")!;
  const input = root.querySelector<HTMLInputElement>(".texr-input")!;
  const send = () => { const words = input.value.trim(); if (words) actions.reply(words); };
  root.querySelector<HTMLButtonElement>(".texr-accept")?.addEventListener("click", () => actions.accept());
  root.querySelector<HTMLButtonElement>(".texa-reject")?.addEventListener("click", () => actions.reject());
  root.querySelector<HTMLButtonElement>(".texa-resolve")?.addEventListener("click", () => actions.resolve());
  root.querySelector<HTMLButtonElement>(".texa-remove")?.addEventListener("click", () => actions.remove());
  root.querySelector<HTMLButtonElement>(".texa-answer")!.onclick = () => {
    row.hidden = !row.hidden;
    if (!row.hidden) input.focus();
  };
  root.querySelector<HTMLButtonElement>(".texr-send")!.onclick = send;
  input.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); send(); }
    if (event.key === "Escape") { event.preventDefault(); row.hidden = true; }
  });
  root.addEventListener("pointerdown", () => { if (hasUnread(note)) actions.seen(); });
  return root;
}

/** État d'une note de l'agent dans le panneau. */
export function agentState(note: AgentFields): {icon: string; label: string; tone: string} {
  const who = authorOf(note);
  if (hasUnread(note)) return {icon: '<span class="texa-dot"></span>', label: `Nouvelle réponse de ${who}`, tone: "todo"};
  if (waitsForAgent(note)) return {icon: '<span class="texr-spin"></span>', label: `${who} lit ta réponse…`, tone: "busy"};
  return {icon: roundIcons.circle, label: currentSuggestion(note) ? `Proposition de ${who}` : `Remarque de ${who}`, tone: "note"};
}
