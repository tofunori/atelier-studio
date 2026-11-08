/** Rondes d'annotations (maquette « couleur douce », Thierry 2026-11-08).
 *
 *  Thierry annote son .tex comme un relecteur, puis « Réviser avec l'agent »
 *  envoie toutes les notes ouvertes au chat. L'agent répond à chacune avec
 *  l'outil `atelier_revision`, sans toucher au fichier : une proposition
 *  (texte qui remplace le passage, et sa raison) ou une question. Le runtime
 *  range ces réponses dans `tex_revisions.json`, que la galerie sert sur
 *  `GET /texrevisions`. L'éditeur les montre sur place ; seul « Accepter »
 *  remplace le texte.
 *
 *  Ce module ne garde aucun état : outils purs (diff de mots, demande au
 *  chat, section d'une ligne) et fabrique des blocs affichés dans l'éditeur. */

export type RoundState = "busy" | "prop" | "ask";

export interface RoundReply {
  kind: "propose" | "ask";
  text?: string;
  reason?: string;
  question?: string;
  author?: string;
  seq: number;
}

/** Ronde à laquelle une note a été envoyée. */
export interface RoundRef {id: string; n: number}

export interface RoundNote {
  id: string;
  number?: number;
  text: string;
  comment: string;
  from: {line: number; ch: number};
  to: {line: number; ch: number};
}

/** Réponse de l'agent telle que la galerie la sert (`tex_revisions.json`). */
export interface StoredRevisions {
  round?: string;
  seq?: number;
  items?: Record<string, {kind?: string; text?: string; reason?: string; question?: string; author?: string; seq?: number}>;
}

/** Note décidée, gardée dans l'historique des rondes (`tex-rounds:<fichier>`). */
export interface RoundRecord {
  id: string;
  round: string;
  n: number;
  number?: number;
  comment: string;
  text: string;
  decision: "acc" | "rej";
  proposal?: string;
  at: number;
}

export const newRoundId = (now = Date.now()): string => `r${now}`;

/** Section qui contient la ligne `line` (0-based) : « Résumé » dans
 *  l'environnement abstract, sinon la dernière \section au-dessus, numérotée
 *  comme LaTeX la numérote (les étoilées ne comptent pas). */
export function sectionOf(lines: readonly string[], line: number): string {
  let title = "";
  let number = 0;
  let inAbstract = false;
  for (let index = 0; index <= Math.min(line, lines.length - 1); index += 1) {
    const text = lines[index] || "";
    if (/\\begin\{abstract\}/.test(text)) inAbstract = true;
    if (/\\end\{abstract\}/.test(text) && index < line) inAbstract = false;
    const match = /\\(section|chapter)(\*?)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(text);
    if (match) {
      inAbstract = false;
      const name = (match[3] || "").trim();
      if (match[2]) title = name;
      else { number += 1; title = `${number} · ${name}`; }
    }
  }
  return inAbstract ? "Résumé" : (title || "Début du document");
}

/** Lignes de début et de fin du paragraphe qui contient le passage. Le texte
 *  fluide de l'éditeur affiche un paragraphe source comme une seule ligne :
 *  les blocs de la ronde se posent avant et après lui, jamais au milieu
 *  (mêmes frontières que fluid_text.ts : ligne vide, commande, commentaire). */
export function paragraphOf(lines: readonly string[], from: number, to: number): {start: number; end: number} {
  const prose = (line: string | undefined): boolean => Boolean(line && line.trim()) && !/^\s*\\/.test(line || "") && !/(^|[^\\])%/.test(line || "");
  let start = from, end = to;
  while (start > 0 && prose(lines[start]) && prose(lines[start - 1])) start -= 1;
  while (end < lines.length - 1 && prose(lines[end]) && prose(lines[end + 1])) end += 1;
  return {start, end};
}

const lineLabel = (note: Pick<RoundNote, "from" | "to">): string =>
  note.from.line === note.to.line ? `ligne ${note.from.line + 1}` : `lignes ${note.from.line + 1}-${note.to.line + 1}`;

const fileName = (path: string): string => path.split(/[\\/]/).pop() || path;

/** Message envoyé au chat pour lancer une ronde : lisible par Thierry dans
 *  sa bulle, et suffisant pour que l'agent appelle `atelier_revision`. */
export function roundRequest(path: string, round: RoundRef, notes: readonly RoundNote[], sections: readonly string[]): string {
  const head = `Ronde d'annotations ${round.n} sur ${fileName(path)} : ${notes.length} note${notes.length > 1 ? "s" : ""}.`;
  const body = notes.map((note, index) => [
    `[${note.id}] ${lineLabel(note)} · ${sections[index] || ""}`.trim(),
    `Passage : « ${note.text} »`,
    `Note : ${note.comment || "(voir le passage)"}`,
  ].join("\n")).join("\n\n");
  return `${head}\n\n${body}\n\n${toolRules(path, round.id)}`;
}

/** Demande de nouvelle proposition pour une note (Redemander, ou réponse à
 *  une question de l'agent). */
export function followUp(path: string, round: RoundRef, note: RoundNote, kind: "again" | "answer", words: string): string {
  const head = kind === "answer"
    ? `Réponse à ta question sur la note [${note.id}] (ronde ${round.n}, ${fileName(path)}) : ${words}`
    : `Nouvelle proposition pour la note [${note.id}] (ronde ${round.n}, ${fileName(path)})${words ? ` : ${words}` : "."}`;
  return `${head}\n\nPassage actuel : « ${note.text} »\nNote : ${note.comment || "(voir le passage)"}\n\n${toolRules(path, round.id)}`;
}

function toolRules(path: string, round: string): string {
  return `Réponds avec l'outil atelier_revision (path « ${path} », round « ${round} », note = l'id entre crochets) : `
    + "action propose avec le passage réécrit, qui remplace exactement le passage cité, et la raison en une phrase ; "
    + "ou action ask si une information te manque. Ne modifie pas le fichier toi-même : je relis et j'accepte ou je rejette dans l'éditeur.";
}

/** Nouvelles réponses de la ronde `round`, à appliquer aux notes : celles
 *  dont le `seq` dépasse celui déjà vu. */
export function freshReplies(stored: StoredRevisions | null | undefined, round: string, seen: (id: string) => number): Array<{id: string; reply: RoundReply}> {
  if (!stored || stored.round !== round || !stored.items) return [];
  const out: Array<{id: string; reply: RoundReply}> = [];
  for (const [id, item] of Object.entries(stored.items)) {
    const seq = Number(item?.seq) || 0;
    if (seq <= seen(id)) continue;
    if (item.kind === "propose" && typeof item.text === "string") {
      out.push({id, reply: {kind: "propose", text: item.text, reason: item.reason || "", author: item.author, seq}});
    } else if (item.kind === "ask" && typeof item.question === "string") {
      out.push({id, reply: {kind: "ask", question: item.question, author: item.author, seq}});
    }
  }
  return out;
}

/** Jetons « mot + espaces qui suivent » : le diff garde la mise en page. */
export function tokens(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) || [];
}

/** Diff de mots (plus longue sous-suite commune). Rend, pour chaque côté,
 *  les jetons et s'ils changent. Les passages sont courts (une phrase, un
 *  paragraphe) ; au-delà de 600 jetons, tout est marqué changé. */
export function wordDiff(before: string, after: string): {old: Array<{t: string; changed: boolean}>; neu: Array<{t: string; changed: boolean}>} {
  const a = tokens(before), b = tokens(after);
  if (a.length * b.length > 360_000) {
    return {old: a.map(t => ({t, changed: true})), neu: b.map(t => ({t, changed: true}))};
  }
  const key = (t: string) => t.trimEnd();
  const rows = a.length + 1, cols = b.length + 1;
  const table = new Uint16Array(rows * cols);
  const at = (i: number, j: number): number => table[i * cols + j] ?? 0;
  const tokA = (i: number): string => a[i] ?? "", tokB = (j: number): string => b[j] ?? "";
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = key(tokA(i)) === key(tokB(j)) ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const old: Array<{t: string; changed: boolean}> = [], neu: Array<{t: string; changed: boolean}> = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && key(tokA(i)) === key(tokB(j))) {
      old.push({t: tokA(i), changed: false}); neu.push({t: tokB(j), changed: false}); i += 1; j += 1;
    } else if (j < b.length && (i >= a.length || at(i, j + 1) >= at(i + 1, j))) {
      neu.push({t: tokB(j), changed: true}); j += 1;
    } else {
      old.push({t: tokA(i), changed: true}); i += 1;
    }
  }
  return {old, neu};
}

/** Plages (décalages dans `before`) des mots qui partent : marquées un ton
 *  plus fort sur l'ancien texte. Les espaces de fin restent hors marque. */
export function removedRanges(before: string, after: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let offset = 0;
  for (const piece of wordDiff(before, after).old) {
    const word = piece.t.trimEnd();
    if (piece.changed && word) {
      const last = ranges[ranges.length - 1];
      if (last && !before.slice(last[1], offset).trim()) last[1] = offset + word.length;
      else ranges.push([offset, offset + word.length]);
    }
    offset += piece.t.length;
  }
  return ranges;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"})[c] || c);

/** HTML du nouveau texte, mots changés dans `<b>`. */
export function insertedHtml(before: string, after: string): string {
  let html = "";
  for (const piece of wordDiff(before, after).neu) {
    const word = piece.t.trimEnd();
    html += piece.changed && word ? `<b>${escapeHtml(word)}</b>${escapeHtml(piece.t.slice(word.length))}` : escapeHtml(piece.t);
  }
  // Mots changés qui se suivent : un seul fond, espace compris.
  return html.replace(/<\/b>([ \t]+)<b>/g, "$1");
}

/** Icônes SVG monochromes, trait 1,4. */
export const roundIcons = {
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.4 6.6 11.4 12.5 4.8"/></svg>',
  cross: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  circle: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="8" cy="8" r="4.6"/></svg>',
  dash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M5 8h6"/></svg>',
  question: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5.6"/><path d="M6.4 6.4a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.6-.7 1.1M8 11.2v.1"/></svg>',
  up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 9.8 8 6.3l3.5 3.5"/></svg>',
  down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6.2 8 9.7l3.5-3.5"/></svg>',
  send: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
} as const;

export interface ProposalView {
  number: number;
  comment: string;
  /** Lignes entières qui contiennent le passage, avant la retouche. */
  lineBefore: string;
  lineAfter: string;
  passage: string;
  reply: RoundReply;
  position: {index: number; total: number};
}

/** Bloc sous le passage : nouvelle version, raison, actions. */
export function proposalBlock(doc: Document, view: ProposalView, actions: {
  accept(): void; reject(): void; again(words: string): void; move(step: 1 | -1): void;
}): HTMLElement {
  const root = doc.createElement("div");
  root.className = "texr-block texr-proposal";
  const replacement = view.reply.text || "";
  const lines = (escapeHtml(view.lineBefore) + insertedHtml(view.passage, replacement) + escapeHtml(view.lineAfter)).split("\n");
  root.innerHTML = '<div class="texr-new" role="group" aria-label="Proposition de l’agent">'
    + lines.map(line => `<div class="texr-new-line">${line || "&#8203;"}</div>`).join("") + "</div>"
    + '<div class="texr-foot">'
    + (view.reply.reason ? `<div class="texr-why">${escapeHtml(view.reply.reason)}</div>` : "")
    + '<div class="texr-acts">'
    + `<button type="button" class="texr-btn texr-accept" title="Accepter (⌘↩)"><span class="texr-ok">${roundIcons.check}</span>Accepter<span class="texr-kbd">⌘↩</span></button>`
    + '<button type="button" class="texr-ghost texr-reject">Rejeter</button>'
    + '<button type="button" class="texr-ghost texr-again">Redemander…</button>'
    + '<span class="texr-gap"></span>'
    + (view.position.total > 1
      ? `<span class="texr-nav"><span class="texr-count">${view.position.index} sur ${view.position.total}</span>`
        + `<button type="button" class="texr-icon texr-prev" aria-label="Proposition précédente" title="Proposition précédente">${roundIcons.up}</button>`
        + `<button type="button" class="texr-icon texr-next" aria-label="Proposition suivante" title="Proposition suivante">${roundIcons.down}</button></span>`
      : "")
    + '</div><div class="texr-again-row" hidden>'
    + '<div class="texr-field"><input type="text" class="texr-input" aria-label="Ce que l’agent doit changer" placeholder="Ce qui ne va pas, ou ce que tu veux…">'
    + `<button type="button" class="texr-send" aria-label="Redemander" title="Redemander (Entrée)">${roundIcons.send}</button></div>`
    + "</div></div>";
  const again = root.querySelector<HTMLElement>(".texr-again-row")!;
  const input = root.querySelector<HTMLInputElement>(".texr-input")!;
  const send = () => actions.again(input.value.trim());
  root.querySelector<HTMLButtonElement>(".texr-accept")!.onclick = () => actions.accept();
  root.querySelector<HTMLButtonElement>(".texr-reject")!.onclick = () => actions.reject();
  root.querySelector<HTMLButtonElement>(".texr-again")!.onclick = () => {
    again.hidden = !again.hidden;
    if (!again.hidden) input.focus();
  };
  root.querySelector<HTMLButtonElement>(".texr-send")!.onclick = send;
  root.querySelector<HTMLButtonElement>(".texr-prev")?.addEventListener("click", () => actions.move(-1));
  root.querySelector<HTMLButtonElement>(".texr-next")?.addEventListener("click", () => actions.move(1));
  input.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); send(); }
    if (event.key === "Escape") { event.preventDefault(); again.hidden = true; }
  });
  return root;
}

/** Bloc sous le passage quand l'agent pose une question. */
export function questionBlock(doc: Document, question: string, author: string, answer: (words: string) => void): HTMLElement {
  const root = doc.createElement("div");
  root.className = "texr-block texr-question";
  root.innerHTML = `<div class="texr-ask"><span class="texr-q">${roundIcons.question}</span>`
    + `<span><span class="texr-who">${escapeHtml(author || "L’agent")} : </span>${escapeHtml(question)}</span></div>`
    + '<div class="texr-field"><input type="text" class="texr-input" aria-label="Ta réponse" placeholder="Répondre…">'
    + `<button type="button" class="texr-send" aria-label="Envoyer la réponse" title="Envoyer (Entrée)">${roundIcons.send}</button></div>`;
  const input = root.querySelector<HTMLInputElement>(".texr-input")!;
  const send = () => { if (input.value.trim()) answer(input.value.trim()); };
  root.querySelector<HTMLButtonElement>(".texr-send")!.onclick = send;
  input.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); send(); }
  });
  return root;
}

/** En-tête au-dessus du passage : pastille et note de Thierry. */
export function noteHeader(doc: Document, number: number, comment: string, busy: boolean): HTMLElement {
  const root = doc.createElement("div");
  root.className = "texr-head";
  root.innerHTML = `<span class="atelier-annotation-number texr-ring${busy ? " is-busy" : ""}">${number}</span>`
    + `<span class="texr-note">${escapeHtml(comment || "(voir le passage)")}</span>`;
  return root;
}

/** Libellé et icône d'état dans le panneau (icône seule en couleur). */
export function stateLabel(state: RoundState | "note" | "acc" | "rej"): {icon: string; label: string; tone: string} {
  switch (state) {
    case "busy": return {icon: '<span class="texr-spin"></span>', label: "L’agent lit…", tone: "busy"};
    case "prop": return {icon: roundIcons.circle, label: "À revoir", tone: "todo"};
    case "ask": return {icon: roundIcons.question, label: "Question pour toi", tone: "ask"};
    case "acc": return {icon: roundIcons.check, label: "Acceptée", tone: "ok"};
    case "rej": return {icon: roundIcons.cross, label: "Rejetée", tone: "no"};
    default: return {icon: roundIcons.dash, label: "Note", tone: "note"};
  }
}

/** « il y a 5 min », « hier », « le 3 nov. » : pour l'historique des rondes. */
export function since(at: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  if (hours < 48) return "hier";
  return `le ${new Date(at).toLocaleDateString("fr-CA", {day: "numeric", month: "short"})}`;
}
