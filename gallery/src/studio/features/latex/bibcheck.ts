import type {StudioBookmark, StudioEditor} from "../../core/editor_contract";

/* Panneau « Références » : vérifie les entrées de la .bib contre Crossref.
 * Le serveur (Rust, /bibcheck/*) compare et PROPOSE ; rien ne touche la
 * .bib sans un clic sur « Appliquer » (ou ⌘↩), une entrée à la fois. */

export interface BibChange {
  field: string;
  label: string;
  old: string | null;
  new: string;
}

export interface BibCheckResult {
  key: string;
  bib: string;
  kind?: string;
  line: number;
  endLine?: number;
  hash?: string;
  title?: string;
  status: "ok" | "diff" | "notfound" | "retracted" | "candidate" | "nodoi" | "error" | "missing";
  summary: string;
  doi?: string;
  changes?: BibChange[];
  old?: string;
  proposed?: string;
  crossref?: {doi: string; title: string; authors: string[]; journal: string; journalShort?: string; year: number | null; volume: string; issue: string; pages: string};
  retraction?: {kind: string; date: string};
  ignored?: boolean;
  error?: string;
  /** Clé citée absente de la .bib : où elle est citée. */
  file?: string;
  fileName?: string;
}

interface PlanEntry {key: string; kind: string; bib: string; line: number; title: string; doi: string | null; cited: boolean; ignored: boolean}
interface PlanBib {path: string; name: string; zotero: boolean; missing?: boolean}
interface BibPlan {
  bibs: PlanBib[];
  entries: PlanEntry[];
  missing: Array<{key: string; file: string; name: string; line: number}>;
  total: number;
  cited: number | null;
  contact: boolean;
}

export interface LatexBibCheckOptions {
  path: string;
  isBib: boolean;
  getEditor(): StudioEditor | null;
  panel: HTMLElement;
  button: HTMLElement | null;
  menuItem?: HTMLElement | null;
  /** Ligne 0-based dans l'éditeur courant. */
  revealLine(line: number): void;
  /** Enregistre le tampon après une correction acceptée. */
  save(): Promise<boolean>;
  /** Ouvre une .bib (ou un .tex) dans un onglet, centré sur la clé / la ligne. */
  openFile(path: string, options: {key?: string; line?: number}): void;
  notify(kind: "hint" | "err", message: string): void;
  fetch?: typeof fetch;
  document?: Document;
  window?: Window;
}

export interface LatexBibCheckController {
  toggle(force?: boolean): void;
  /** Montre l'icône quand le document a une bibliographie. */
  refreshAvailability(): Promise<boolean>;
  /** Ouvre le panneau, lance la vérification et sélectionne cette clé. */
  focusKey(key: string): void;
  results(): BibCheckResult[];
}

const CONCURRENCY = 4;

const ICON = {
  book: '<path d="M8 4.6C6.8 3.7 5 3.3 2.5 3.3v9c2.5 0 4.3.4 5.5 1.3 1.2-.9 3-1.3 5.5-1.3v-9C11 3.3 9.2 3.7 8 4.6z"/><path d="M8 4.6v9"/>',
  refresh: '<path d="M12.8 6.2A5 5 0 1 0 13 9.6"/><path d="M13 2.8v3.4H9.6"/>',
  close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  circle: '<circle cx="8" cy="8" r="4.6"/>',
  notfound: '<circle cx="8" cy="8" r="5.4"/><path d="M6 6l4 4M10 6l-4 4"/>',
  warn: '<path d="M8 2.8 14 13H2z"/><path d="M8 6.8v2.8M8 11.4v.1"/>',
  plus: '<circle cx="8" cy="8" r="5.4"/><path d="M8 5.6v4.8M5.6 8h4.8"/>',
  check: '<path d="M3.5 8.4 6.6 11.4 12.5 4.8"/>',
  ext: '<path d="M9.5 3h3.5v3.5M13 3 7.5 8.5M11.5 9.5V13H3V4.5h3.5"/>',
  up: '<path d="M4.5 9.8 8 6.3l3.5 3.5"/>',
  down: '<path d="M4.5 6.2 8 9.7l3.5-3.5"/>',
  right: '<path d="M6.2 4.5 9.7 8l-3.5 3.5"/>',
  link: '<path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.9.9"/><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.9-.9"/>',
} as const;

const svg = (name: keyof typeof ICON, size = 14, stroke = 1.4): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON[name]}</svg>`;

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"})[c] || c);
}

const STATUS_ICON: Record<BibCheckResult["status"], keyof typeof ICON> = {
  ok: "check", diff: "circle", notfound: "notfound", retracted: "warn", candidate: "circle",
  nodoi: "circle", error: "notfound", missing: "plus",
};

/** Ordre de la liste « À revoir » : le plus grave d'abord. */
const REVIEW_ORDER: Partial<Record<BibCheckResult["status"], number>> = {retracted: 0, notfound: 1, missing: 2, diff: 3, candidate: 4};

export function needsReview(result: BibCheckResult): boolean {
  return !result.ignored && result.status in REVIEW_ORDER;
}

/** Phrase courte sous le diff : ce que Crossref dit, en clair. */
export function explainResult(result: BibCheckResult): string {
  if (result.status === "retracted") {
    const date = result.retraction?.date ? ` (${result.retraction.date})` : "";
    const verb = result.retraction?.kind === "retraction" ? "rétracté" : "retiré";
    return `Crossref signale cet article comme ${verb}${date}. Vérifie avant de le citer.`;
  }
  if (result.status === "notfound") return "Crossref ne connaît pas ce DOI. Une faute de frappe, peut-être ?";
  if (result.status === "candidate") return "Crossref a trouvé cet article par le titre et les auteurs.";
  if (result.status === "missing") return "Cette clé est citée dans le manuscrit mais n'existe pas dans la .bib.";
  if (result.status === "error") return result.error ? `Vérification impossible : ${result.error}.` : "Vérification impossible.";
  const changes = result.changes || [];
  const sentences: string[] = [];
  const differs = changes.filter((change) => change.old !== null);
  const missing = changes.filter((change) => change.old === null);
  const year = differs.find((change) => change.field === "year");
  if (year) sentences.push(`Publié en ${year.new}${result.crossref?.volume ? ` dans le volume ${result.crossref.volume}` : ""}.`);
  const others = differs.filter((change) => change.field !== "year").map((change) => change.label.toLowerCase());
  if (others.length) {
    const plural = others.length > 1 || others[0] === "pages" || others[0] === "auteurs";
    const named = others.map((label) => label === "pages" || label === "auteurs" ? `les ${label}` : label === "année" ? "l'année" : label === "revue" ? "la revue" : `le ${label}`);
    sentences.push(`${capitalize(listFr(named))} ${plural ? "diffèrent" : "diffère"} de la version publiée.`);
  }
  if (missing.length) {
    const labels = missing.map((change) => change.label === "DOI" ? "le DOI" : change.label === "Pages" ? "les pages" : change.label === "Auteurs" ? "les auteurs" : change.label === "Année" ? "l'année" : change.label === "Revue" ? "la revue" : change.label === "Titre" ? "le titre" : `le ${change.label.toLowerCase()}`);
    const plural = missing.length > 1 || /^les /.test(labels[0] || "");
    sentences.push(`${capitalize(listFr(labels))} ${plural ? "manquent" : "manque"} dans ta .bib.`);
  }
  return sentences.join(" ");
}

function listFr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

function fileName(path: string): string {
  return path.split("/").pop() || path;
}

/** `  field = {valeur},` — une ligne de .bib pour l'aperçu du diff. */
function bibLine(field: string, value: string, highlight: boolean): string {
  const inner = highlight ? `<b>${escapeHtml(value)}</b>` : escapeHtml(value);
  return `<span class="bc-f">  ${escapeHtml(field.padEnd(8, " "))}</span>= {${inner}},`;
}

export function createLatexBibCheckController(options: LatexBibCheckOptions): LatexBibCheckController {
  const doc = options.document || document;
  const win = options.window || window;
  const http = options.fetch || win.fetch.bind(win);
  const panel = options.panel;
  let plan: BibPlan | null = null;
  const results = new Map<string, BibCheckResult>();
  let order: string[] = [];
  let running: {done: number; total: number; stopped: boolean} | null = null;
  let checkedAt: Date | null = null;
  let citedOnly = true;
  let selected: string | null = null;
  let pendingFocus: string | null = null;
  const openGroups = new Set<string>();
  let card: StudioBookmark | null = null;
  let cardKey: string | null = null;

  const post = async <T>(url: string, body: unknown): Promise<T> => {
    const response = await http(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
    const data = await response.json() as T & {error?: string};
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };

  const editorText = (): string | undefined => options.getEditor()?.getValue();
  // `#` : interdit dans une clé BibTeX, et sûr dans un attribut HTML.
  const resultId = (bib: string, key: string): string => `${bib}#${key}`;
  const bibInfo = (bib: string): PlanBib | undefined => plan?.bibs.find((item) => item.path === bib);
  const isCurrentBib = (bib: string): boolean => options.isBib && (bib === options.path || bib.endsWith(`/${fileName(options.path)}`) && plan?.bibs.length === 1);

  const loadPlan = async (): Promise<BibPlan | null> => {
    try {
      plan = await post<BibPlan>("/bibcheck/plan", {path: options.path, text: editorText()});
    } catch (error) {
      plan = null;
      options.notify("err", `Références : ${error instanceof Error ? error.message : String(error)}`);
    }
    if (plan && plan.cited === null) citedOnly = false;
    return plan;
  };

  const refreshAvailability = async (): Promise<boolean> => {
    const available = options.isBib || Boolean((await loadPlan())?.bibs.length);
    if (options.button) options.button.style.display = available ? "inline-flex" : "none";
    if (options.menuItem) options.menuItem.style.display = available ? "flex" : "none";
    return available;
  };

  const ordered = (): BibCheckResult[] => order.map((id) => results.get(id)).filter((r): r is BibCheckResult => Boolean(r));
  const reviewList = (): BibCheckResult[] => ordered()
    .filter(needsReview)
    .sort((a, b) => (REVIEW_ORDER[a.status] ?? 9) - (REVIEW_ORDER[b.status] ?? 9));

  /* ----- rendu du panneau ----- */

  const itemHtml = (result: BibCheckResult): string => {
    const id = resultId(result.bib, result.key);
    const on = selected === id;
    const subtitle = result.status === "missing"
      ? `Citée dans ${escapeHtml(result.fileName || "")}, ligne ${result.line}`
      : escapeHtml(result.title || "");
    const detail = on && !isCurrentBib(result.bib) ? detailHtml(result, false) : "";
    return `<div class="bp-row${on ? " on" : ""}"><button type="button" class="bp-it" data-id="${escapeHtml(id)}">
      <span class="bp-key">${escapeHtml(result.key)}</span>
      ${subtitle ? `<span class="bp-sub">${subtitle}</span>` : ""}
      <span class="bp-st">${svg(STATUS_ICON[result.status], 12, 1.3)}<span>${escapeHtml(result.status === "missing" ? "Absente de la .bib" : result.summary)}</span></span>
    </button>${detail}</div>`;
  };

  const groupHtml = (name: string, label: string, list: BibCheckResult[], extra = ""): string => {
    if (!list.length) return "";
    const open = openGroups.has(name);
    return `<div class="bp-grp${open ? " open" : ""}"><button type="button" class="bp-grp-h" data-group="${name}" aria-expanded="${open}">
      <span class="bp-chev">${svg("right", 12)}</span><span>${escapeHtml(label)}</span><span class="bp-sp"></span><span class="bp-n">${list.length}</span></button>
      ${open ? `${extra}${list.map(itemHtml).join("")}` : ""}</div>`;
  };

  const introHtml = (): string => {
    if (!plan) return `<div class="bp-empty">Lecture de la bibliographie…</div>`;
    if (!plan.bibs.length) {
      return `<div class="bp-empty">Aucune bibliographie trouvée : il faut un <code>\\bibliography{…}</code> ou un <code>\\addbibresource{…}</code> dans le manuscrit.</div>`;
    }
    const names = plan.bibs.map((bib) => bib.name).join(", ");
    const cited = plan.cited !== null ? `, dont ${plan.cited} citée${plan.cited > 1 ? "s" : ""}` : "";
    const option = plan.cited !== null && plan.cited < plan.total
      ? `<label class="bp-opt"><input type="checkbox" data-act="cited"${citedOnly ? " checked" : ""}><span>Seulement les références citées</span></label>`
      : "";
    return `<div class="bp-intro">
      <div class="bp-lead">${plan.total} entrée${plan.total > 1 ? "s" : ""} dans ${escapeHtml(names)}${cited}. Atelier compare chacune à Crossref. Rien n'est modifié sans ton accord.</div>
      ${option}
      <button type="button" class="bp-btn wide" data-act="run">Vérifier avec Crossref</button>
    </div>`;
  };

  const progressHtml = (): string => {
    if (!running) return "";
    const ratio = running.total ? Math.round((running.done / running.total) * 100) : 0;
    return `<div class="bp-run">
      <div class="bp-run-h"><span class="bp-spin" aria-hidden="true"></span><span>Vérification en cours</span><span class="bp-sp"></span><span class="bp-n">${running.done} sur ${running.total}</span></div>
      <div class="bp-bar"><span style="width:${ratio}%"></span></div>
      <button type="button" class="bp-gh" data-act="stop">Arrêter</button>
    </div>`;
  };

  const render = (): void => {
    const names = plan?.bibs.map((bib) => bib.name).join(", ") || "";
    const head = `<div class="bp-head"><span class="bp-title">Références</span>${names ? `<span class="bp-meta">${escapeHtml(names)} · ${plan?.total ?? 0}</span>` : ""}<span class="bp-sp"></span>
      ${checkedAt && !running ? `<button type="button" class="bp-icon" data-act="run" title="Revérifier" aria-label="Revérifier">${svg("refresh")}</button>` : ""}
      <button type="button" class="bp-icon" data-act="close" title="Fermer" aria-label="Fermer">${svg("close")}</button></div>`;
    let body = "";
    if (!checkedAt && !running) body = introHtml();
    else {
      const all = ordered();
      const review = reviewList();
      const when = checkedAt
        ? `Vérifiées avec Crossref à ${checkedAt.toLocaleTimeString("fr-CA", {hour: "2-digit", minute: "2-digit"})}${plan?.cited !== null && citedOnly ? ` · ${plan?.cited} citées` : ""}`
        : "";
      body = `${when ? `<div class="bp-when">${escapeHtml(when)}</div>` : ""}${progressHtml()}
        ${review.length ? `<div class="bp-sec">À revoir <span class="bp-n">${review.length}</span></div>${review.map(itemHtml).join("")}`
          : running ? "" : `<div class="bp-empty">Rien à revoir. Toutes les références vérifiées correspondent à Crossref.</div>`}
        ${groupHtml("error", "Non vérifiées", all.filter((r) => r.status === "error" && !r.ignored), `<button type="button" class="bp-gh bp-retry" data-act="retry">Réessayer</button>`)}
        ${groupHtml("nodoi", "Sans DOI, non vérifiables", all.filter((r) => r.status === "nodoi" && !r.ignored))}
        ${groupHtml("ignored", "Ignorées", all.filter((r) => r.ignored))}
        ${groupHtml("ok", "Conformes", all.filter((r) => r.status === "ok" && !r.ignored))}`;
    }
    panel.innerHTML = head + `<div class="bp-body">${body}</div>`;
    const active = selected ? panel.querySelector<HTMLElement>(".bp-row.on") : null;
    active?.scrollIntoView?.({block: "nearest"});
  };

  /* ----- carte de correction ----- */

  const actionsHtml = (result: BibCheckResult, inEditor: boolean): string => {
    const bib = bibInfo(result.bib);
    const doiLink = result.doi
      ? `<a class="bp-gh" href="https://doi.org/${escapeHtml(result.doi)}" target="_blank" rel="noopener noreferrer">${svg("ext", 12)}<span>Ouvrir le DOI</span></a>`
      : "";
    const ignore = result.status === "missing" ? ""
      : result.ignored
        ? `<button type="button" class="bp-gh" data-act="unignore">Ne plus ignorer</button>`
        : `<button type="button" class="bp-gh" data-act="ignore">${result.status === "candidate" ? "Ce n'est pas le bon" : "Ignorer"}</button>`;
    const nav = inEditor ? navHtml() : "";
    if (result.status === "missing") {
      return `<div class="bc-acts"><button type="button" class="bp-btn" data-act="goto">Voir la citation</button></div>`;
    }
    const canApply = Boolean(result.proposed);
    if (!inEditor) {
      const fix = canApply ? `<button type="button" class="bp-btn" data-act="openbib">Corriger dans ${escapeHtml(fileName(result.bib))}</button>`
        : `<button type="button" class="bp-btn" data-act="openbib">Voir dans ${escapeHtml(fileName(result.bib))}</button>`;
      return `<div class="bc-acts">${fix}${ignore}${doiLink}</div>`;
    }
    if (canApply && bib?.zotero) {
      return `<div class="bc-note">${svg("link", 13, 1.3)}<span>${escapeHtml(bib.name)} est exportée par Zotero : une correction faite ici serait écrasée au prochain export. Mieux vaut corriger la fiche dans Zotero, la .bib suivra.</span></div>
        <div class="bc-acts"><button type="button" class="bp-btn" data-act="zotero">Ouvrir dans Zotero</button><button type="button" class="bp-gh" data-act="apply">Corriger la .bib quand même</button>${ignore}<span class="bp-sp"></span>${nav}</div>`;
    }
    const apply = canApply
      ? `<button type="button" class="bp-btn" data-act="apply">${svg("check", 13)}<span>${result.status === "candidate" ? "Ajouter ce DOI" : "Appliquer"}</span><span class="bp-k">⌘↩</span></button>`
      : "";
    return `<div class="bc-acts">${apply}${ignore}${doiLink}<span class="bp-sp"></span>${nav}</div>`;
  };

  const navHtml = (): string => {
    const list = reviewList();
    const index = list.findIndex((result) => resultId(result.bib, result.key) === selected);
    if (index < 0 || list.length < 2) return "";
    return `<span class="bc-nav"><span class="bp-n">${index + 1} sur ${list.length}</span>
      <button type="button" class="bp-icon sm" data-act="prev" title="Précédente" aria-label="Précédente">${svg("up", 13)}</button>
      <button type="button" class="bp-icon sm" data-act="next" title="Suivante" aria-label="Suivante">${svg("down", 13)}</button></span>`;
  };

  const detailHtml = (result: BibCheckResult, inEditor: boolean): string => {
    const changes = result.changes || [];
    const head = result.status === "candidate" && result.crossref
      ? `<div class="bc-cand"><div class="bc-ct">${escapeHtml(result.crossref.title)}</div>
          <div class="bc-cm">${escapeHtml(result.crossref.authors.slice(0, 3).join(", "))}${result.crossref.authors.length > 3 ? " et al." : ""}${result.crossref.journal ? ` · <i>${escapeHtml(result.crossref.journalShort || result.crossref.journal)}</i>` : ""}${result.crossref.volume ? ` ${escapeHtml(result.crossref.volume)}` : ""}${result.crossref.year ? `, ${result.crossref.year}` : ""}</div>
          <div class="bc-doi">${escapeHtml(result.crossref.doi)}</div></div>`
      : result.doi && result.status !== "missing"
        ? `<div class="bc-h"><span>Selon Crossref</span><span class="bc-doi">${escapeHtml(result.doi)}</span></div>`
        : "";
    const lines = result.status === "candidate" ? "" : changes.map((change) =>
      (change.old !== null ? `<div class="bc-l bc-old">${bibLine(change.field, change.old, false)}</div>` : "")
      + `<div class="bc-l bc-new">${bibLine(change.field, change.new, true)}</div>`).join("");
    const why = explainResult(result);
    return `<div class="bc-card${inEditor ? " in-editor" : ""}" data-id="${escapeHtml(resultId(result.bib, result.key))}">
      ${head}${lines ? `<div class="bc-lines">${lines}</div>` : ""}
      ${why ? `<div class="bc-why">${escapeHtml(why)}</div>` : ""}
      ${actionsHtml(result, inEditor)}</div>`;
  };

  const clearCard = (): void => {
    card?.clear();
    card = null;
    cardKey = null;
  };

  const showCard = (result: BibCheckResult): void => {
    clearCard();
    const editor = options.getEditor();
    if (!editor || !isCurrentBib(result.bib) || result.status === "missing") return;
    const text = editor.getValue();
    const at = result.old ? text.indexOf(result.old) : -1;
    const endIndex = at >= 0 ? at + (result.old || "").length : -1;
    const end = endIndex >= 0 ? editor.posFromIndex(endIndex) : {line: Math.max(0, (result.endLine || result.line) - 1), ch: 0};
    const host = doc.createElement("div");
    host.className = "bc-host";
    host.innerHTML = detailHtml(result, true);
    // Les clics de la carte ne doivent ni déplacer le curseur ni lancer une
    // sélection dans l'éditeur (la carte vit DANS le contenu de CodeMirror).
    host.addEventListener("mousedown", (event) => {
      if (!(event.target as Element | null)?.closest("a")) event.preventDefault();
      event.stopPropagation();
    });
    host.addEventListener("click", onClick);
    const position = {line: end.line, ch: editor.getLine(end.line).length};
    card = editor.setBookmark(position, {widget: host, insertLeft: false});
    cardKey = resultId(result.bib, result.key);
    const startLine = at >= 0 ? editor.posFromIndex(at).line : Math.max(0, result.line - 1);
    options.revealLine(startLine);
  };

  const select = (id: string | null): void => {
    selected = id;
    const result = id ? results.get(id) : null;
    if (!result) {
      clearCard();
      render();
      return;
    }
    if (result.status === "missing") {
      clearCard();
      render();
      return;
    }
    if (isCurrentBib(result.bib)) showCard(result);
    else clearCard();
    render();
  };

  /* ----- vérification ----- */

  const checkOne = async (bib: string, key: string): Promise<BibCheckResult> => {
    const text = isCurrentBib(bib) ? editorText() : undefined;
    try {
      return await post<BibCheckResult>("/bibcheck/entry", {path: bib, key, text});
    } catch (error) {
      return {key, bib, line: 0, status: "error", summary: "Non vérifiée", error: error instanceof Error ? error.message : String(error)};
    }
  };

  const run = async (only?: Array<{bib: string; key: string}>): Promise<void> => {
    if (running) return;
    if (!only) {
      await loadPlan();
      if (!plan) return;
      results.clear();
      order = [];
      clearCard();
      for (const missing of plan.missing) {
        const id = resultId("", missing.key);
        results.set(id, {key: missing.key, bib: "", line: missing.line, status: "missing", summary: "Absente de la .bib", file: missing.file, fileName: missing.name});
        order.push(id);
      }
    }
    const queue = only || (plan?.entries || [])
      .filter((entry) => !citedOnly || entry.cited)
      .map((entry) => ({bib: entry.bib, key: entry.key}));
    if (!only) for (const item of queue) order.push(resultId(item.bib, item.key));
    running = {done: 0, total: queue.length, stopped: false};
    const state = running;
    render();
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (!state.stopped && cursor < queue.length) {
        const item = queue[cursor++]!;
        const result = await checkOne(item.bib, item.key);
        if (state.stopped) return;
        results.set(resultId(item.bib, item.key), {...result, bib: result.bib || item.bib});
        state.done += 1;
        render();
        if (pendingFocus === item.key) {
          pendingFocus = null;
          select(resultId(item.bib, item.key));
        }
      }
    };
    await Promise.all(Array.from({length: Math.min(CONCURRENCY, queue.length)}, worker));
    if (running === state) running = null;
    checkedAt = new Date();
    if (!selected && options.isBib && !pendingFocus) {
      const first = reviewList().find((result) => isCurrentBib(result.bib));
      if (first) {
        select(resultId(first.bib, first.key));
        return;
      }
    }
    render();
  };

  const recheck = async (result: BibCheckResult): Promise<BibCheckResult> => {
    const fresh = await checkOne(result.bib, result.key);
    const merged = {...fresh, bib: fresh.bib || result.bib};
    results.set(resultId(result.bib, result.key), merged);
    return merged;
  };

  const step = (delta: number): void => {
    const list = reviewList();
    if (!list.length) return select(null);
    const index = list.findIndex((result) => resultId(result.bib, result.key) === selected);
    const next = list[(index + delta + list.length) % list.length]!;
    select(resultId(next.bib, next.key));
  };

  const apply = async (result: BibCheckResult): Promise<void> => {
    const editor = options.getEditor();
    if (!editor || !result.old || !result.proposed) return;
    const text = editor.getValue();
    const at = text.indexOf(result.old);
    if (at < 0) {
      // L'entrée a changé depuis la vérification : on revérifie, sans toucher.
      const fresh = await recheck(result);
      options.notify("hint", "L'entrée a changé depuis la vérification : revérifiée.");
      select(resultId(fresh.bib, fresh.key));
      return;
    }
    const review = reviewList();
    const index = review.findIndex((item) => item.key === result.key && item.bib === result.bib);
    clearCard();
    editor.replaceRange(result.proposed, editor.posFromIndex(at), editor.posFromIndex(at + result.old.length), "+bibcheck");
    const saved = await options.save();
    if (!saved) options.notify("err", "Correction appliquée mais pas encore enregistrée (⌘S).");
    const fresh = await recheck(result);
    const remaining = reviewList();
    if (needsReview(fresh)) select(resultId(fresh.bib, fresh.key));
    else if (remaining.length) {
      const next = remaining[Math.min(Math.max(index, 0), remaining.length - 1)]!;
      select(resultId(next.bib, next.key));
    } else select(null);
  };

  const setIgnored = async (result: BibCheckResult, ignored: boolean): Promise<void> => {
    try {
      await post("/bibcheck/ignore", {path: result.bib, key: result.key, hash: ignored ? result.hash : null});
    } catch (error) {
      options.notify("err", `Ignorer : ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const review = reviewList();
    const index = review.findIndex((item) => item.key === result.key && item.bib === result.bib);
    results.set(resultId(result.bib, result.key), {...result, ignored});
    if (ignored) {
      const remaining = reviewList();
      const next = remaining[Math.min(Math.max(index, 0), remaining.length - 1)];
      select(next ? resultId(next.bib, next.key) : null);
    } else select(resultId(result.bib, result.key));
  };

  const openZotero = async (result: BibCheckResult): Promise<void> => {
    try {
      await post("/bibcheck/zotero", {doi: result.doi || null, title: result.title || null});
    } catch (error) {
      options.notify("err", error instanceof Error ? error.message : String(error));
    }
  };

  /* ----- événements ----- */

  function onClick(event: Event): void {
    const target = event.target as Element | null;
    const item = target?.closest<HTMLElement>(".bp-it[data-id]");
    if (item) {
      const id = item.dataset.id || "";
      const result = results.get(id);
      if (result?.status === "missing") {
        selected = id;
        render();
        return;
      }
      select(selected === id && !isCurrentBib(result?.bib || "") ? null : id);
      return;
    }
    const group = target?.closest<HTMLElement>("[data-group]")?.dataset.group;
    if (group) {
      if (openGroups.has(group)) openGroups.delete(group);
      else openGroups.add(group);
      render();
      return;
    }
    const action = target?.closest<HTMLElement>("[data-act]")?.dataset.act;
    if (!action) return;
    const cardId = target?.closest<HTMLElement>(".bc-card")?.dataset.id || selected || "";
    const result = results.get(cardId);
    if (action === "close") toggle(false);
    else if (action === "run") void run();
    else if (action === "stop" && running) {
      running.stopped = true;
      running = null;
      checkedAt = new Date();
      render();
    } else if (action === "retry") {
      void run(ordered().filter((r) => r.status === "error").map((r) => ({bib: r.bib, key: r.key})));
    } else if (action === "next") step(1);
    else if (action === "prev") step(-1);
    else if (result && action === "apply") void apply(result);
    else if (result && action === "ignore") void setIgnored(result, true);
    else if (result && action === "unignore") void setIgnored(result, false);
    else if (result && action === "zotero") void openZotero(result);
    else if (result && action === "openbib") options.openFile(result.bib, {key: result.key, line: result.line});
    else if (result && action === "goto" && result.file) {
      if (result.file === options.path) options.revealLine(Math.max(0, result.line - 1));
      else options.openFile(result.file, {line: result.line});
    }
  }

  panel.addEventListener("click", onClick);
  panel.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement | null;
    if (input?.dataset.act === "cited") citedOnly = input.checked;
  });
  doc.addEventListener("keydown", (event) => {
    if (!panel.classList.contains("open")) return;
    if ((event.metaKey || event.ctrlKey) && (event.code === "Enter" || event.key === "Enter") && cardKey) {
      const result = results.get(cardKey);
      if (!result?.proposed) return;
      if (bibInfo(result.bib)?.zotero) return;
      event.preventDefault();
      event.stopPropagation();
      void apply(result);
    } else if (event.key === "Escape" && !event.defaultPrevented) {
      toggle(false);
    }
  }, true);

  const toggle = (force?: boolean): void => {
    const open = force ?? !panel.classList.contains("open");
    panel.classList.toggle("open", open);
    options.button?.setAttribute("aria-pressed", String(open));
    if (!open) {
      clearCard();
      selected = null;
      return;
    }
    render();
    if (!plan && !running) void loadPlan().then(render);
  };
  if (options.button) options.button.onclick = (event) => {
    event.stopPropagation();
    toggle();
  };

  const focusKey = (key: string): void => {
    pendingFocus = key;
    toggle(true);
    void run();
  };

  return {toggle, refreshAvailability, focusKey, results: ordered};
}
