/**
 * Panneau .docx d'Atelier : lire, retoucher et réviser un document Word
 * (la copie corrigée du directeur) sans le casser pour Word.
 *
 * Le serveur (crate atelier-docx) fait foi : chaque geste devient une
 * retouche JSON (`POST /docx/op`) appliquée sur le fichier, et la réponse
 * porte le modèle à jour, d'après lequel la page se redessine. Seule la
 * frappe est montrée d'avance (« fantômes ») pour que l'écriture reste
 * fluide ; ses insertions partent groupées à la première pause.
 *
 * Positions : en caractères Unicode (points de code) du texte COURANT d'un
 * paragraphe — insertions comprises, suppressions exclues —, comme la base.
 */
(function () {
  type Seg = {
    text: string; kind: string; label?: string; change?: number; rev?: string; editable?: boolean;
    b?: boolean; i?: boolean; u?: boolean; strike?: boolean; sup?: boolean; sub?: boolean;
    font?: string; size?: number; highlight?: string; comments?: number[]; ghost?: boolean;
    number?: number; whole?: boolean; media?: string; width?: number; height?: number; alt?: string;
  };
  type Para = {
    id: string; para_id?: string; style?: string; heading?: number; list?: boolean; align?: string;
    cell?: [number, number, number]; mark_change?: number; text: string; segments: Seg[]; look?: Look;
    /** Ajouté ici : histoire du paragraphe (« » corps, n1, e1, header1…). */
    story?: string;
  };
  /** Apparence résolue par la base (styles de Word), en points. */
  type Look = {
    align?: string; before?: number; after?: number; line?: number; line_exact?: number; line_min?: number;
    left?: number; right?: number; first?: number; b?: boolean; i?: boolean; caps?: boolean;
    size?: number; font?: string; color?: string; no_ln?: boolean;
    keep_next?: boolean; keep_lines?: boolean; page_break_before?: boolean; widow_off?: boolean;
  };
  type Page = {
    width: number; height: number; top: number; right: number; bottom: number; left: number; header: number; footer: number;
    line_numbers?: { count_by: number; start: number; distance: number; restart: string; font?: string; size?: number };
  };
  type Note = { id: string; kind: string; number?: number; paragraphs: Para[] };
  type HeaderFooter = { id: string; kind: string; which: string; paragraphs: Para[] };
  type Change = { id: number; kind: string; author: string; date?: string; paragraph?: string; text: string };
  type Comment = {
    id: number; author: string; initials: string; date?: string; text: string; parent?: number;
    done: boolean; paragraph?: string; quote: string;
  };
  type Model = {
    revision: string; paragraphs: Para[]; changes: Change[]; comments: Comment[];
    authors: { name: string; changes: number; comments: number }[];
    other_parts: { part: string; changes: number }[];
    styles: { id: string; name: string; heading?: number }[];
    mtime: number; openInWord: boolean;
    notes?: Note[]; headers?: HeaderFooter[]; page?: Page;
    /** Ajouté ici : nombre de paragraphes du corps, en tête de `paragraphs`. */
    body?: number;
  };
  type Pos = { idx: number; off: number };
  type Sel = { a: Pos; b: Pos };
  /** Frappe pas encore confirmée : `sent` = confiée à la file, `flying` =
   *  requête partie, `gone` = envoyée à la fermeture du panneau. */
  type Ghost = { idx: number; at: number; text: string; sent: boolean; flying?: boolean; gone?: boolean };
  type Op = Record<string, unknown>;

  const W = window as unknown as Window & {
    __atelierPost?: (p: Record<string, unknown>) => void;
    AtelierStudioCore?: {
      requestChatAttachment?: (o: Record<string, unknown>) => Promise<void>;
      createLiveContextPublisher?: (o: {
        build: () => Record<string, unknown> | null;
        postToHost: (p: Record<string, unknown>) => void;
        timers?: Window;
      }) => { schedule(): void; repost(): void };
      onTabActivated?: (win: Window, callback: () => void) => () => void;
    };
    AtelierAnnotationUI?: {
      createSelectionActions(host: HTMLElement, o: Record<string, unknown>): void;
      createNoteEditor(host: HTMLElement, o: Record<string, unknown>): { input: HTMLTextAreaElement; status: HTMLElement; focus(): void };
    };
  };
  const Q = new URLSearchParams(location.search);
  const PATH = Q.get("path") || Q.get("file") || "";
  const NAME = PATH.split("/").pop() || "document.docx";
  const AGENT = /^(claude|codex|kimi|grok|opencode|agent)\b/i;
  const IDLE_MS = 450;
  const POLL_MS = 1500;

  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const paper = $("paper");
  const scroller = $("scroll");
  const cardsEl = $("cards");
  const foot = $("foot");
  const notice = $("notice");

  let model: Model | null = null;
  let view: "revue" | "final" | "original" = "revue";
  let tracked = true;
  let author = "";
  let page = "blanche";
  let ghosts: Ghost[] = [];
  let idleTimer = 0;
  let chain: Promise<unknown> = Promise.resolve();
  let inflight = 0;
  let structBusy = false;
  let backlog: (() => Promise<void>)[] = [];
  let focusKey = "";
  let composing: Pos | null = null;
  // Marge des commentaires à la demande (bouton « Commentaires », 2026-11-12).
  // laneOff : marge fermée par Thierry (retenu par document) ; laneOver :
  // panneau trop étroit et non élargi, la marge passe par-dessus la page ;
  // holdPt : zoom tenu pendant que l'app élargit ou resserre le panneau ;
  // widened : l'app a élargi le panneau pour la marge, à rendre en fermant.
  const LANE_KEY = `docxLaneOff:${PATH}`;
  let laneOff = (() => { try { return localStorage.getItem(LANE_KEY) === "1"; } catch { return false; } })();
  let laneOver = false;
  let holdPt = 0;
  let widened = false;
  let paneWait = 0;
  let paneAction = "";
  const cp = (s: string) => Array.from(s).length;

  // ---------------------------------------------------------------- icônes
  // Famille Lucide, trait 1,5, comme le reste d'Atelier.
  const svg = (d: string, size = 16) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  // Teintes de surlignage de Word, rendues avec celles des annotations
  // d'Atelier pour les quatre que la capsule propose.
  const HIGHLIGHT: Record<string, string> = {
    yellow: "rgba(255,213,74,.40)", green: "rgba(120,220,140,.40)", cyan: "rgba(120,170,255,.40)", magenta: "rgba(255,140,160,.40)",
    darkYellow: "color-mix(in srgb, olive 40%, transparent)", darkGreen: "color-mix(in srgb, green 40%, transparent)",
    darkCyan: "color-mix(in srgb, teal 40%, transparent)", darkMagenta: "color-mix(in srgb, purple 40%, transparent)",
    darkBlue: "color-mix(in srgb, navy 40%, transparent)", darkRed: "color-mix(in srgb, maroon 40%, transparent)",
    darkGray: "color-mix(in srgb, gray 40%, transparent)", lightGray: "color-mix(in srgb, silver 40%, transparent)",
  };
  const PATHS = {
    panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    msgPlus: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    note: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
    msgText: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
    alLeft: '<path d="M15 12H3"/><path d="M17 18H3"/><path d="M21 6H3"/>',
    alCenter: '<path d="M17 12H7"/><path d="M19 18H5"/><path d="M21 6H3"/>',
    alRight: '<path d="M21 12H9"/><path d="M21 18H7"/><path d="M21 6H3"/>',
    alBoth: '<path d="M3 12h18"/><path d="M3 18h18"/><path d="M3 6h18"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    circleCheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  };
  const ic = (k: keyof typeof PATHS, size = 16) => svg(PATHS[k], size);
  const ICON = { check: ic("check", 14), warn: ic("warn", 14) };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

  // ---------------------------------------------------------------- serveur
  async function api(url: string, body?: unknown): Promise<any> {
    const res = await fetch(url, body === undefined ? undefined : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* corps vide */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `erreur ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const enc = encodeURIComponent;

  /** Corps, puis notes, puis en-têtes et pieds dans une seule liste : un
   *  rang (`idx`) désigne n'importe quel paragraphe modifiable. */
  function normalize(m: Model): Model {
    if (m.body !== undefined) return m;
    const body: Para[] = m.paragraphs.map((p) => ({ ...p, story: "" }));
    const rest: Para[] = [];
    for (const n of m.notes || []) for (const p of n.paragraphs) rest.push({ ...p, story: n.id });
    for (const h of m.headers || []) for (const p of h.paragraphs) rest.push({ ...p, story: h.id });
    return { ...m, body: body.length, paragraphs: body.concat(rest) };
  }
  const storyAt = (idx: number) => (model && model.paragraphs[idx] ? model.paragraphs[idx].story || "" : "");
  /** Premier et dernier rang de l'histoire du paragraphe `idx`. */
  function storySpan(idx: number): [number, number] {
    const st = storyAt(idx);
    let a = idx, b = idx;
    while (a > 0 && storyAt(a - 1) === st) a--;
    while (b + 1 < model!.paragraphs.length && storyAt(b + 1) === st) b++;
    return [a, b];
  }
  /** Référence d'un paragraphe pour le moteur, par rang dans son histoire
   *  (`p3`, `n1.p0`, `header1.p0`) ; `story`/`start` pour un paragraphe
   *  qu'un lot vient de créer. */
  function refIn(story: string, start: number, idx: number): string {
    return `${story ? `${story}.` : ""}p${idx - start}`;
  }
  /** Segments « d'un bloc » (figure, note, citation, équation) : une
   *  retouche qui les touche les prend en entier. */
  function expandWhole(idx: number, s: number, e: number): [number, number] {
    const p = model!.paragraphs[idx];
    if (!p) return [s, e];
    let off = 0;
    for (const g of p.segments) {
      const len = g.rev === "del" || g.rev === "moveFrom" ? 0 : cp(g.text);
      if (g.whole && len && off < e && s < off + len) { s = Math.min(s, off); e = Math.max(e, off + len); }
      off += len;
    }
    return [s, e];
  }

  // --------------------------------------------------------------- couleurs
  // Une teinte par auteur : soi, l'agent, puis trois teintes calmes pour les
  // relecteurs. Deux jeux : sur la page (--doc-*, papier blanc ou thème) et
  // dans la marge (--ui-*, toujours au thème de l'app).
  const colorCache = new Map<string, string>();
  function authorKey(name: string): string {
    if (!name) return "none";
    if (AGENT.test(name)) return "agent";
    if (name === author) return "me";
    if (!colorCache.has(name)) colorCache.set(name, `a${(colorCache.size % 3) + 1}`);
    return colorCache.get(name) as string;
  }
  const authorColor = (name: string) => `var(--doc-${authorKey(name)})`;
  const uiColor = (name: string) => `var(--ui-${authorKey(name)})`;
  const changeById = () => new Map((model?.changes || []).map((c) => [c.id, c] as const));

  // ------------------------------------------------- paragraphe « virtuel »
  /** Segments du paragraphe avec la frappe pas encore confirmée insérée. */
  function virtualSegments(idx: number): Seg[] {
    const p = model!.paragraphs[idx];
    let segs: Seg[] = p.segments.map((s) => ({ ...s }));
    for (const g of ghosts) {
      if (g.idx !== idx) continue;
      const out: Seg[] = [];
      let off = 0;
      let done = false;
      for (const s of segs) {
        const removed = s.rev === "del" || s.rev === "moveFrom";
        const len = removed ? 0 : cp(s.text);
        // Premier segment de texte qui contient la position : en limite de
        // deux segments, celui de gauche (la frappe prend sa mise en forme).
        if (!done && !removed && s.kind === "text" && off <= g.at && g.at <= off + len) {
          const chars = Array.from(s.text);
          const k = g.at - off;
          if (k > 0) out.push({ ...s, text: chars.slice(0, k).join("") });
          out.push({ ...s, text: g.text, ghost: true, rev: "ins", change: undefined, comments: [] });
          if (k < chars.length) out.push({ ...s, text: chars.slice(k).join("") });
          done = true;
        } else {
          out.push(s);
        }
        off += len;
      }
      if (!done) out.push({ text: g.text, kind: "text", ghost: true, rev: "ins" });
      segs = out;
    }
    return segs;
  }
  const virtualLen = (idx: number) => virtualSegments(idx).reduce((n, s) => n + (s.rev === "del" || s.rev === "moveFrom" ? 0 : cp(s.text)), 0);
  const virtualText = (idx: number) => virtualSegments(idx).filter((s) => !(s.rev === "del" || s.rev === "moveFrom")).map((s) => s.text).join("");

  // ------------------------------------------------------------------ rendu
  /** Texte d'un segment avec sa mise en forme (gras, italique…). */
  function styled(s: Seg): Node {
    let inner: Node = document.createTextNode(s.text);
    const wrap = (tag: string) => { const w = document.createElement(tag); w.appendChild(inner); inner = w; };
    if (s.b) wrap("b");
    if (s.i) wrap("i");
    if (s.u) wrap("u");
    if (s.strike) wrap("s");
    if (s.sup) wrap("sup");
    if (s.sub) wrap("sub");
    return inner;
  }
  function renderPara(idx: number): HTMLElement {
    const p = model!.paragraphs[idx];
    const el = document.createElement("p");
    el.className = "d-p";
    el.dataset.idx = String(idx);
    if (p.look && model!.page) applyLook(el, p.look);
    else if (p.heading !== undefined && p.heading !== null) el.classList.add(`h${Math.min(p.heading, 3)}`);
    if (p.align && p.align !== "left") el.classList.add(`a-${p.align}`);
    if (p.list) el.classList.add("list");
    const changes = changeById();
    const mark = p.mark_change !== undefined ? changes.get(p.mark_change) : undefined;
    let changed = mark;
    if (mark) {
      el.classList.add(mark.kind === "paragraph-del" ? "mark-del" : "mark-ins");
      el.dataset.ch = String(mark.id);
    }
    let off = 0;
    let any = false;
    for (const s of virtualSegments(idx)) {
      const removed = s.rev === "del" || s.rev === "moveFrom";
      const len = removed ? 0 : cp(s.text);
      let node: HTMLElement;
      const chip = s.kind === "field" || s.kind === "object";
      if (chip) {
        node = document.createElement("span");
        const label = s.label || "";
        const isNote = label === "note" || label === "note de fin";
        node.className = "chip" + (s.kind === "object" ? (isNote ? " note" : s.media ? " fig" : " obj") : "");
        if (s.media) {
          const img = document.createElement("img");
          img.src = `/docx/media?path=${enc(PATH)}&para=${enc(p.id)}&rel=${enc(s.media)}`;
          img.alt = s.alt || "Figure";
          img.draggable = false;
          if (s.width) img.style.width = model!.page ? `calc(var(--pt) * ${s.width * 0.75})` : `${s.width}px`;
          // Hauteur réservée avant le chargement : sans elle, la coupure en pages se ferait sur une image vide.
          if (s.width && s.height) img.style.aspectRatio = `${s.width} / ${s.height}`;
          node.appendChild(img);
        } else if (s.kind === "field" && s.text) {
          // Résultat de champ (citation, bibliographie) : texte mis en forme
          // qui passe à la ligne comme le reste, mais non modifiable.
          node.classList.add(label === "zotero-bibliographie" ? "flow" : "fld");
          node.appendChild(styled(s));
        } else {
          node.textContent = isNote && s.number ? String(s.number) : s.text || (label === "image" ? "[figure]" : label === "équation" ? "[équation]" : `[${label || "objet"}]`);
        }
        node.contentEditable = "false";
        node.title = s.kind === "field" ? (label.startsWith("zotero") ? "Citation Zotero : à modifier dans Word" : `Champ ${label}`) : (isNote ? (label === "note" ? "Note de bas de page" : "Note de fin") : s.media ? (s.alt || "Figure") : label);
      } else {
        node = document.createElement("span");
        node.appendChild(styled(s));
        if (s.font) node.style.fontFamily = `"${s.font}", ${getComputedStyle(paper).fontFamily}`;
        if (s.size) node.style.fontSize = model!.page ? `calc(var(--pt) * ${s.size})` : `${s.size}pt`;
        if (s.highlight && s.highlight !== "white" && s.highlight !== "black") node.style.backgroundColor = HIGHLIGHT[s.highlight] || `color-mix(in srgb, ${s.highlight} 40%, transparent)`;
      }
      node.dataset.off = String(off);
      node.dataset.len = String(len);
      if (chip) node.dataset.chip = "1";
      if (s.kind === "field") node.dataset.field = s.label || "";
      if (s.ghost) {
        node.classList.add("ins", "pending");
        node.style.setProperty("--rev-color", authorColor(author));
      } else if (s.rev && s.change !== undefined) {
        const c = changes.get(s.change);
        node.classList.add(removed ? "del" : "ins");
        node.dataset.ch = String(s.change);
        node.style.setProperty("--rev-color", authorColor(c ? c.author : ""));
        changed = changed || c;
      }
      if (s.kind === "break" && s.label === "page") node.classList.add("pbr");
      if (removed) { node.contentEditable = "false"; node.dataset.del = "1"; }
      if (s.comments && s.comments.length) {
        node.classList.add("cmt");
        node.dataset.c = s.comments.join(" ");
      }
      el.appendChild(node);
      off += len;
      if (s.text) any = true;
    }
    // Mise en forme suivie : liseré seulement, pas de carte par segment.
    if (!changed) {
      const fmt = (model!.changes || []).find((c) => c.paragraph === p.id && c.kind === "format");
      if (fmt) changed = fmt;
    }
    if (changed) {
      el.classList.add("changed");
      el.style.setProperty("--rev-color", authorColor(changed.author));
    }
    if (!any) el.appendChild(document.createElement("br"));
    el.dataset.len = String(off);
    return el;
  }

  function renderAll() {
    if (!model) return;
    const frag = document.createDocumentFragment();
    let table: HTMLTableElement | null = null;
    let tIdx = -1;
    let row: HTMLTableRowElement | null = null;
    let rIdx = -1;
    let cell: HTMLTableCellElement | null = null;
    let cIdx = -1;
    const zones = new Map<string, HTMLElement>();
    const zone = (story: string): HTMLElement => {
      let z = zones.get(story);
      if (z) return z;
      z = document.createElement("div");
      const note = (model!.notes || []).find((n) => n.id === story);
      const hf = (model!.headers || []).find((h) => h.id === story);
      if (note) {
        z.className = "d-note";
        z.innerHTML = `<span class="d-note-n" contenteditable="false">${note.number ?? ""}</span><div class="d-note-b"></div>`;
        notesBox.appendChild(z);
        zones.set(story, z.lastElementChild as HTMLElement);
        return z.lastElementChild as HTMLElement;
      }
      z.className = `d-zone ${hf && hf.kind === "footer" ? "d-ftr" : "d-hdr"}`;
      if (hf && hf.which !== "default") {
        z.innerHTML = `<div class="d-zone-l" contenteditable="false">${hf.kind === "footer" ? "Pied de page" : "En-tête"} ${hf.which === "first" ? "de la première page" : "des pages paires"}</div>`;
      }
      // En pages, l'en-tête et le pied courants sont épinglés dans les marges
      // (et répétés sur chaque feuille) ; les particuliers suivent le texte.
      if (model!.page && hf) {
        if (hf.which === "default") { z.classList.add("pinned"); (hf.kind === "footer" ? footers : headers).appendChild(z); }
        else footers.appendChild(z);
      } else (hf && hf.kind === "footer" ? footers : headers).appendChild(z);
      zones.set(story, z);
      return z;
    };
    const headers = document.createDocumentFragment();
    const footers = document.createDocumentFragment();
    const notesBox = document.createElement("div");
    notesBox.className = "d-notes";
    model.paragraphs.forEach((p, idx) => {
      if (p.story) {
        zone(p.story).appendChild(renderPara(idx));
        return;
      }
      if (!p.cell) {
        table = null; tIdx = -1;
        frag.appendChild(renderPara(idx));
        return;
      }
      const [t, r, c] = p.cell;
      if (!table || t !== tIdx) {
        table = document.createElement("table");
        table.className = "d-t";
        frag.appendChild(table);
        tIdx = t; rIdx = -1;
      }
      if (r !== rIdx) { row = table.insertRow(); rIdx = r; cIdx = -1; }
      if (c !== cIdx) { cell = row!.insertCell(); cIdx = c; }
      cell!.appendChild(renderPara(idx));
    });
    frag.insertBefore(headers, frag.firstChild);
    if (notesBox.childElementCount) frag.appendChild(notesBox);
    frag.appendChild(footers);
    paper.replaceChildren(frag);
    paper.contentEditable = view === "original" ? "false" : "true";
    pageSetup();
  }

  // ----------------------------------------------- page à l'échelle de Word
  // La page garde ses proportions réelles (format, marges, tailles en
  // points) et suit la largeur du panneau, comme « Largeur de page » dans
  // Word : `--pt` vaut un point du document à l'échelle courante. Le texte
  // est coupé en feuilles : un intervalle (.d-gap) repousse la ligne qui
  // déborde en haut de la feuille suivante, comme le ferait Word.
  const PT = 4 / 3;
  const GAP = 24;
  const lnLayer = $("lnums");
  const sheets = $("sheets");
  let ptPx = PT;
  function pageSetup() {
    const pg = model?.page;
    paper.classList.toggle("pg", !!pg);
    if (!pg) { sheets.replaceChildren(); lnLayer.replaceChildren(); return; }
    const u = (v: number) => `calc(var(--pt) * ${v})`;
    paper.style.width = u(pg.width);
    paper.style.padding = `${u(pg.top)} ${u(pg.right)} ${u(pg.bottom)} ${u(pg.left)}`;
    document.documentElement.style.setProperty("--ml", u(pg.left));
    document.documentElement.style.setProperty("--mr", u(pg.right));
    fitPage(true);
  }
  // Zoom : `null` suit la largeur du panneau ; sinon un pourcentage de la
  // taille réelle (100 % = un point du document vaut un point à l'écran).
  const ZOOM_MIN = 30, ZOOM_MAX = 200, ZOOM_STEP = 10;
  let zoom: number | null = (() => {
    try {
      const v = Number(localStorage.getItem("docxZoom"));
      return v >= ZOOM_MIN && v <= ZOOM_MAX ? v : null;
    } catch { return null; }
  })();
  function fitPage(force = false) {
    const pg = model?.page;
    if (!pg) return;
    const cs = getComputedStyle(scroller);
    const room = scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const next = holdPt || (zoom ? PT * zoom / 100 : PT * Math.max(0.4, Math.min(1.5, room / (pg.width * PT))));
    showZoom(next);
    if (!force && Math.abs(next - ptPx) < 1e-3) { endStretch(); fitW = scroller.clientWidth; followPaper(); return; }
    // Panneau tiré par l'app (séparateur) : la page s'étire au compositeur,
    // la vraie mise en page attend la fin du geste (comme le PDF).
    const w = scroller.clientWidth;
    if (!force && zoom === null && !holdPt && fitW && w && w !== fitW && !laidOutHidden && liveWidth()) { stretchTo(next, room); return; }
    endStretch();
    fitW = w;
    ptPx = next;
    document.documentElement.style.setProperty("--pt", `${next.toFixed(4)}px`);
    scheduleLines();
  }
  function setZoom(next: number | null) {
    zoom = next === null ? null : Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(next)));
    try {
      if (zoom === null) localStorage.removeItem("docxZoom");
      else localStorage.setItem("docxZoom", String(zoom));
    } catch { /* stockage indisponible : le zoom vaut pour cette session */ }
    fitPage();
  }
  const zoomPct = () => Math.round((stretchPt || ptPx) / PT * 100);
  // Redimensionnement en direct. Refaire la coupe d'un long manuscrit à
  // chaque image coûte des centaines de ms (6 images/s sur 65 pages) : tant
  // que la largeur du panneau bouge, la page et ses calques gardent leur mise
  // en page et suivent par une transformation (zoom autour du haut visible),
  // puis la page se recoupe une fois, au lâcher du séparateur (l'app le
  // signale) ou 160 ms après le dernier changement. Un changement isolé
  // (ouverture, panneau qui apparaît) se met en page tout de suite.
  // `fitW` : largeur du panneau à la dernière mise à l'échelle réelle.
  let fitW = 0;
  let stretchTimer = 0;
  let stretchY = -1;
  let stretchPt = 0;
  let paneDragging = false;
  let widthChangedAt = -1e9;
  function liveWidth() {
    const now = performance.now();
    const burst = now - widthChangedAt < 250;
    widthChangedAt = now;
    return paneDragging || burst || stretchY >= 0;
  }
  window.addEventListener("message", (e) => {
    const d = e.data as { type?: string; on?: boolean } | null;
    if (e.source !== parent || d?.type !== "atelier-pane-resize") return;
    paneDragging = d.on === true;
    if (!paneDragging) settleStretch();
  });
  const stretchLayers = () => [paper, sheets, lnLayer, cbars];
  function stretchTo(next: number, room: number) {
    const k = next / ptPx;
    stretchPt = next;
    followPaper();
    // La page se centre dans le panneau, comme après la mise en page réelle.
    const left = parseFloat(getComputedStyle(scroller).paddingLeft) + Math.max(0, (room - paper.offsetWidth * k) / 2);
    const dx = left - paper.offsetLeft;
    if (stretchY < 0) {
      stretchY = Math.max(0, scroller.scrollTop - paper.offsetTop);
      document.body.classList.add("stretching");
    }
    for (const l of stretchLayers()) {
      l.style.transformOrigin = `0 ${stretchY}px`;
      l.style.transform = `translateX(${dx.toFixed(1)}px) scale(${k.toFixed(4)})`;
    }
    clearTimeout(stretchTimer);
    // Fin du geste : la page reprend sa taille réelle, à la largeur atteinte.
    // Le bloc en haut de l'écran y reste : la coupe refaite ne fait pas sauter la lecture.
    stretchTimer = window.setTimeout(settleStretch, paneDragging ? 1000 : 160);
  }
  function settleStretch() {
    if (stretchY < 0) return;
    fitW = 0;
    keepTop = topBlock();
    endStretch();
    layoutCards();
    if (!linesFrame) keepTop = null;
  }
  let keepTop: { el: HTMLElement; y: number } | null = null;
  function topBlock() {
    const blocks = flowBlocks();
    const top = scroller.getBoundingClientRect().top;
    let lo = 0, hi = blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (blocks[mid].getBoundingClientRect().bottom <= top) lo = mid + 1; else hi = mid;
    }
    const el = blocks[lo];
    return el ? { el, y: el.getBoundingClientRect().top - top } : null;
  }
  function endStretch() {
    if (stretchY < 0) return;
    clearTimeout(stretchTimer);
    stretchTimer = 0;
    stretchY = -1;
    stretchPt = 0;
    document.body.classList.remove("stretching");
    for (const l of stretchLayers()) { l.style.removeProperty("transform"); l.style.removeProperty("transform-origin"); }
    // Une coupe demandée pendant l'étirement (frappe, relecture) passe maintenant.
    if (dirtyAll) scheduleLines();
  }
  // Feuilles, numéros de ligne et traits de révision sont dessinés par
  // rapport au coin de la page ; leurs calques suivent la page quand elle
  // se recentre (panneau élargi ou rétréci, marge des fiches qui apparaît,
  // retour sur la surface) sans refaire la mise en page.
  let laidOutHidden = false;
  function followPaper() {
    const x = `${paper.offsetLeft}px`, y = `${paper.offsetTop}px`;
    for (const l of [sheets, lnLayer, cbars]) {
      if (l.style.left !== x) l.style.left = x;
      if (l.style.top !== y) l.style.top = y;
    }
  }
  // Barre d'état : page, mots, revue, enregistrement, signature et zoom.
  foot.innerHTML = `<span id="ftPage"></span><span id="ftWords" class="hide1"></span><span id="ftOpen" class="hide2"></span>
    <span class="sp"></span>
    <span class="sv" id="ftSave" role="status" aria-live="polite"></span>
    <button id="who" class="hide1" data-tooltip="Nom inscrit sur tes retouches et commentaires"></button>
    <span class="zoom" id="zoom" role="group" aria-label="Zoom" hidden><button class="z-step" data-z="out" aria-label="Zoom arrière" data-tooltip="Zoom arrière (⌘−)">${ic("minus", 12)}</button><button class="z-pct" data-tooltip="Ajuster à la fenêtre (⌘0)"></button><button class="z-step" data-z="in" aria-label="Zoom avant" data-tooltip="Zoom avant (⌘+)">${ic("plus", 12)}</button></span>`;
  const zoomEl = $("zoom");
  const zoomLabel = zoomEl.querySelector(".z-pct") as HTMLElement;
  function showZoom(px: number) {
    const pct = Math.round(px / PT * 100);
    zoomLabel.textContent = `${pct} %`;
    zoomLabel.classList.toggle("on", zoom === null);
  }
  zoomEl.querySelector('[data-z="out"]')!.addEventListener("click", () => setZoom(zoomPct() - ZOOM_STEP));
  zoomEl.querySelector('[data-z="in"]')!.addEventListener("click", () => setZoom(zoomPct() + ZOOM_STEP));
  zoomLabel.addEventListener("click", () => setZoom(null));
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.key === "=" || e.key === "+") { e.preventDefault(); setZoom(zoomPct() + ZOOM_STEP); }
    else if (e.key === "-") { e.preventDefault(); setZoom(zoomPct() - ZOOM_STEP); }
    else if (e.key === "0") { e.preventDefault(); setZoom(null); }
    // La surface Documents masque sa liste : le raccourci part du panneau aussi.
    else if (e.key === "\\" && parent !== window) { e.preventDefault(); parent.postMessage({ type: "atelier-docs-toggle-list" }, "*"); }
  });
  function applyLook(el: HTMLElement, l: Look) {
    const u = (v: number) => `calc(var(--pt) * ${v})`;
    el.classList.add("lk");
    const st = el.style;
    if (l.font) st.fontFamily = `"${l.font}", "Times New Roman", serif`;
    if (l.size) st.fontSize = u(l.size);
    if (l.b) st.fontWeight = "bold";
    if (l.i) st.fontStyle = "italic";
    if (l.caps) st.textTransform = "uppercase";
    if (l.color && l.color !== "000000") { el.classList.add("ink"); st.setProperty("--ink", `#${l.color}`); }
    // Word compte une ligne simple à environ 1,15 fois la taille du corps.
    if (l.line_exact) st.lineHeight = u(l.line_exact);
    else if (l.line_min) st.lineHeight = `max(1.15em, ${u(l.line_min)})`;
    else st.lineHeight = String(1.15 * (l.line ?? 1));
    // Espacements en remplissage : Word les additionne, la marge CSS les fusionnerait.
    if (l.before) st.paddingTop = u(l.before);
    if (l.after) st.paddingBottom = u(l.after);
    if (l.left) st.paddingLeft = u(l.left);
    if (l.right) st.paddingRight = u(l.right);
    if (l.first) st.textIndent = u(l.first);
    if (l.no_ln) el.dataset.noLn = "1";
    if (l.align && l.align !== "left") el.classList.add(`a-${l.align}`);
  }

  // Mise en page différée à l'image suivante. `dirtyFrom` : premier
  // paragraphe retouché ; la coupe repart une feuille avant lui, le début du
  // document garde ses coupures (la frappe ne refait pas tout le manuscrit).
  let linesFrame = 0;
  let dirtyFrom: number | null = null;
  let dirtyTo = -1;
  let dirtyAll = false;
  function scheduleLines(from?: number) {
    if (typeof from === "number") { dirtyFrom = dirtyFrom === null ? from : Math.min(dirtyFrom, from); dirtyTo = Math.max(dirtyTo, from); }
    else dirtyAll = true;
    if (linesFrame) return;
    linesFrame = requestAnimationFrame(() => {
      linesFrame = 0;
      // Page étirée : ses mesures sont faussées, la coupe attend la fin du geste.
      if (stretchY >= 0) { dirtyAll = true; return; }
      const from = dirtyAll ? null : dirtyFrom;
      const to = dirtyTo;
      dirtyAll = false;
      dirtyFrom = null;
      dirtyTo = -1;
      layoutPages(from, to);
      paintSel();
      paintNotes();
    });
  }
  /** Blocs du flux, dans l'ordre : paragraphes, lignes de tableau, notes,
   *  en-têtes et pieds particuliers ; les en-tête et pied courants sont épinglés. */
  function flowBlocks(): HTMLElement[] {
    const blocks: HTMLElement[] = [];
    for (const c of Array.from(paper.children) as HTMLElement[]) {
      if (c.classList.contains("d-p")) blocks.push(c);
      else if (c.tagName === "TABLE") blocks.push(...(Array.from((c as HTMLTableElement).rows) as HTMLElement[]));
      else if ((c.classList.contains("d-notes") || c.classList.contains("d-zone")) && !c.classList.contains("pinned")) blocks.push(...(Array.from(c.querySelectorAll(".d-p")) as HTMLElement[]));
    }
    return blocks;
  }
  function layoutPages(from: number | null = null, to = -1) {
    const pg = model?.page;
    if (!pg) return;
    // Surface masquée (autre onglet, autre surface) : rien ne se mesure, la
    // coupe attend que la page revienne à l'écran.
    if (!scroller.clientWidth || !paper.offsetWidth) { laidOutHidden = true; return; }
    laidOutHidden = false;
    const s = getSelection();
    const keep = s && s.rangeCount && paper.contains(s.anchorNode) ? readSel() : null;
    const blocks = flowBlocks();
    const stride = pg.height * ptPx + GAP;
    const o = paper.getBoundingClientRect().top;
    // Premier bloc à recouper : le premier de la feuille qui précède le paragraphe retouché.
    let start = 0;
    let page = 0;
    const el = from === null ? null : paper.querySelector(`.d-p[data-idx="${from}"]`);
    const at = el ? blocks.findIndex((b) => b === el || b.contains(el)) : -1;
    if (at > 0) {
      page = Math.max(0, Math.floor((blocks[at].getBoundingClientRect().top - o) / stride) - 1);
      const limit = page * stride - 1;
      start = blocks.findIndex((b) => b.getBoundingClientRect().top - o >= limit);
      if (start <= 0) { start = 0; page = 0; }
    }
    // Mise en page complète : toutes les coupures repartent de zéro. Sinon
    // chaque bloc retire ses propres coupures au moment d'être recoupé, et la
    // coupe s'arrête dès qu'un bloc après la retouche retombe à sa place
    // d'avant (la suite du manuscrit est alors identique).
    if (from === null) {
      for (const g of Array.from(paper.querySelectorAll(".d-gap"))) {
        const parent = g.parentNode;
        g.remove();
        parent?.normalize();
      }
      blockTops = new WeakMap();
    }
    let until = Infinity;
    if (from !== null) {
      const last = paper.querySelector(`.d-p[data-idx="${Math.max(from, to)}"]`);
      const k = last ? blocks.findIndex((b) => b === last || b.contains(last)) : -1;
      until = k >= 0 ? k : Infinity;
    }
    paper.style.minHeight = "";
    const pages = paginate(pg, blocks, start, page, until, from !== null);
    if (keep) setCaret(keep.a, collapsed(keep) ? undefined : keep.b);
    followPaper();
    if (keepTop && from === null) {
      const k = keepTop;
      keepTop = null;
      if (k.el.isConnected) scroller.scrollTop += k.el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - k.y;
    }
    drawSheets(pg, pages);
    drawLines(pg);
    pageCount = pages;
    drawBars();
    placeCards();
    spy();
    if (findOpen()) runFind(false);
  }

  type Line = { top: number; bottom: number; atom: Node; frag: number };
  /** Lignes affichées d'un paragraphe, en coordonnées de la page, sans les intervalles. */
  function linesOf(el: HTMLElement, o: number): Line[] {
    const frags: Line[] = [];
    const range = document.createRange();
    const walk = (n: Node) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          range.selectNodeContents(c);
          Array.from(range.getClientRects()).forEach((r, k) => { if (r.height > 0) frags.push({ top: r.top - o, bottom: r.bottom - o, atom: c!, frag: k }); });
        } else if (c instanceof HTMLElement) {
          if (c.classList.contains("d-gap")) continue;
          if ((c.dataset.chip && !c.classList.contains("fld") && !c.classList.contains("flow")) || c.tagName === "BR" || c.tagName === "IMG") {
            const r = c.getBoundingClientRect();
            if (r.height > 0) frags.push({ top: r.top - o, bottom: r.bottom - o, atom: c, frag: 0 });
          } else walk(c);
        }
      }
    };
    walk(el);
    const lines: Line[] = [];
    for (const f of frags) {
      const last = lines[lines.length - 1];
      if (last && f.top < last.bottom - 2) { last.bottom = Math.max(last.bottom, f.bottom); last.top = Math.min(last.top, f.top); }
      else lines.push({ ...f });
    }
    return lines;
  }
  /** Début d'une ligne : (nœud, décalage) où glisser l'intervalle. */
  function lineStart(line: Line, o: number): { node: Node; before: Node | null } {
    const a = line.atom;
    if (a.nodeType !== 3 || line.frag === 0) return { node: a.parentNode!, before: a };
    const t = a as Text;
    const r = document.createRange();
    let lo = 1, hi = t.length - 1;
    // Premier caractère dont le haut atteint la ligne.
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      r.setStart(t, mid); r.setEnd(t, mid + 1);
      const rect = r.getClientRects()[0] || r.getBoundingClientRect();
      if (rect.top - o >= line.top - 1) hi = mid; else lo = mid + 1;
    }
    const rest = t.splitText(lo);
    return { node: rest.parentNode!, before: rest };
  }
  function gapEl(inline: boolean, h: number) {
    const g = document.createElement(inline ? "span" : "div");
    g.className = "d-gap";
    g.dataset.run = String(gapRun);
    g.contentEditable = "false";
    g.style.height = `${Math.max(0, h)}px`;
    return g;
  }

  /** Haut de chaque bloc (par rapport à la page) à la dernière coupe. */
  let blockTops = new WeakMap<Element, number>();
  let gapRun = 0;
  /** Coupures laissées par une coupe précédente : avant le bloc (ou sa note) et dedans. */
  function staleGaps(el: HTMLElement, withBefore: boolean): Element[] {
    const out: Element[] = Array.from(el.querySelectorAll(".d-gap")).filter((g) => (g as HTMLElement).dataset.run !== String(gapRun));
    if (withBefore) {
      const host = el.closest(".d-note") && !el.previousElementSibling ? el.closest(".d-note") as HTMLElement : el;
      for (let p = host.previousElementSibling; p && p.classList.contains("d-gap") && (p as HTMLElement).dataset.run !== String(gapRun); p = p.previousElementSibling) out.push(p);
    }
    return out;
  }
  /** Coupe le flux en feuilles ; rend le nombre de feuilles. `until` : dernier
   *  bloc retouché ; passé lui, la coupe s'arrête au premier bloc resté en place. */
  function paginate(pg: Page, blocks: HTMLElement[], start = 0, page0 = 0, until = Infinity, partial = false): number {
    gapRun++;
    const pt = ptPx, pageH = pg.height * pt, stride = pageH + GAP;
    // Positions relues par rapport à la page à chaque mesure : WebKit
    // ancre le défilement pendant qu'on insère les intervalles (le panneau
    // défile sous la mise en page), une origine figée fausserait chaque coupe.
    const O = () => paper.getBoundingClientRect().top;
    const topOf = (k: number) => k * stride + pg.top * pt;
    const bottomOf = (k: number) => k * stride + pageH - pg.bottom * pt;
    const pageAt = (y: number) => Math.max(0, Math.floor(y / stride));
    const lookOf = (el: Element) => (el as HTMLElement).dataset.idx !== undefined ? model!.paragraphs[Number((el as HTMLElement).dataset.idx)]?.look || {} : {};
    const topOfEl = (el: Element) => el.getBoundingClientRect().top - O();
    // Intervalle avant un bloc entier ; le premier paragraphe d'une note emporte son numéro.
    const gapBefore = (el: HTMLElement, target: number) => {
      const host = el.closest(".d-note") && !el.previousElementSibling ? el.closest(".d-note") as HTMLElement : el;
      const h = target - topOfEl(host);
      if (host.tagName === "TR") {
        const tr = document.createElement("tr");
        tr.className = "d-gap";
        tr.dataset.run = String(gapRun);
        tr.innerHTML = `<td colspan="99" style="padding:0;border:0"><div style="height:${Math.max(0, h)}px"></div></td>`;
        host.before(tr);
      } else host.before(gapEl(false, h));
    };
    let page = page0;
    let forceNext = false;
    let done = blocks.length;
    for (let b = start; b < blocks.length; b++) {
      const el = blocks[b];
      if (partial) {
        // Passé la retouche, un bloc qui n'a pas bougé clôt la coupe.
        if (b > until && !forceNext) {
          const was = blockTops.get(el);
          if (was !== undefined && Math.abs(topOfEl(el) - was) < 0.5) { done = b; break; }
        }
        const stale = staleGaps(el, b > start);
        if (stale.length) {
          for (const g of stale) { const parent = g.parentNode; g.remove(); parent?.normalize(); }
        }
      }
      if (el.tagName === "TR") {
        const r = el.getBoundingClientRect();
        const top = r.top - O(), bottom = r.bottom - O();
        page = Math.max(page, pageAt(top));
        if ((forceNext || bottom > bottomOf(page) + 0.5) && top > topOf(page) + 1) { gapBefore(el, topOf(page + 1)); page++; }
        forceNext = false;
        continue;
      }
      const lk = lookOf(el);
      let lines = linesOf(el, O());
      if (!lines.length) continue;
      page = Math.max(page, pageAt(lines[0].top));
      if ((forceNext || (lk.page_break_before && b > 0)) && topOfEl(el) > topOf(page) + 1) {
        gapBefore(el, topOf(page + 1));
        page++;
        lines = linesOf(el, O());
      }
      forceNext = false;
      // Sauts de page forcés dans le paragraphe : la ligne qui suit change de feuille.
      const forced = (Array.from(el.querySelectorAll(".pbr")) as HTMLElement[]).map((x) => x.getBoundingClientRect().top - O());
      let i = 0;
      let restart = false;
      while (i < lines.length) {
        const ln = lines[i];
        page = Math.max(page, pageAt(ln.top));
        const breakHere = i > 0 && forced.some((y) => y >= lines[i - 1].top - 1 && y < ln.top - 1);
        if (!breakHere && ln.bottom <= bottomOf(page) + 0.5) { i++; continue; }
        let at = i;
        if (!breakHere) {
          if (lk.keep_lines) at = 0;
          else if (!lk.widow_off) {
            if (at === 1) at = 0; // orpheline : une seule ligne en bas de feuille
            else if (at === lines.length - 1 && at >= 2) at -= 1; // veuve : une seule ligne en haut de la suivante
          }
        }
        if (at === 0) {
          // Les paragraphes « garder avec le suivant » partent avec lui.
          const chained = (j: number) => blocks[j].classList.contains("d-p") && blocks[j].parentElement === el.parentElement && lookOf(blocks[j]).keep_next;
          let k = b;
          while (k > start && chained(k - 1) && topOfEl(blocks[k - 1]) > topOf(page) + 1) k--;
          // Comme Word, une chaîne qui ne tient pas sur une feuille (une
          // bibliographie entière, par exemple) se coupe comme du texte courant.
          if (k !== b) {
            let head = k, tail = b;
            while (head > 0 && chained(head - 1)) head--;
            while (tail + 1 < blocks.length && chained(tail) && blocks[tail + 1].parentElement === el.parentElement) tail++;
            const end = linesOf(blocks[tail], O());
            const reach = end.length ? end[Math.min(1, end.length - 1)].bottom : blocks[tail].getBoundingClientRect().bottom - O();
            if (reach - topOfEl(blocks[head]) > bottomOf(0) - topOf(0)) k = b;
          }
          const first = blocks[k];
          if (topOfEl(first) <= topOf(page) + 1) {
            // Déjà en haut de feuille : couper dans le paragraphe, ou laisser déborder.
            if (i === 0) { i++; continue; }
            at = i;
          } else {
            // Comme Word, l'espace avant disparaît en haut d'une feuille après un saut naturel.
            const before = first.classList.contains("d-p") ? parseFloat(getComputedStyle(first).paddingTop) || 0 : 0;
            gapBefore(first, topOf(page + 1) - before);
            page++;
            if (k !== b) { b = k - 1; restart = true; break; }
            lines = linesOf(el, O());
            i = 0;
            continue;
          }
        }
        const target = topOf(page + 1);
        const L = parseFloat(getComputedStyle(el).lineHeight) || (lines[at].bottom - lines[at].top);
        const lead = Math.max(0, (L - (lines[at].bottom - lines[at].top)) / 2);
        const want = lines[at].top;
        const { node, before } = lineStart(lines[at], O());
        const gap = gapEl(true, target - (want - lead));
        node.insertBefore(gap, before);
        // Ajustement : la ligne repoussée doit commencer au haut de la feuille.
        const moved = linesOf(el, O())[at];
        if (moved) gap.style.height = `${Math.max(0, parseFloat(gap.style.height) + (target + lead - moved.top))}px`;
        page++;
        lines = linesOf(el, O());
        i = at + 1;
      }
      if (restart) continue;
      // Saut de page en fin de paragraphe : le bloc suivant change de feuille.
      const lastLine = lines[lines.length - 1];
      if (forced.some((y) => y >= lastLine.top - 1)) forceNext = true;
    }
    // Positions retenues pour la prochaine coupe (lectures seules, une mise en page).
    const o = O();
    for (let b = start; b < done; b++) blockTops.set(blocks[b], blocks[b].getBoundingClientRect().top - o);
    const end = paper.scrollHeight;
    return Math.max(1, pageAt(Math.max(0, end - pg.bottom * pt - 1)) + 1);
  }

  /** Champs PAGE et NUMPAGES d'un en-tête ou d'un pied : le numéro de la feuille. */
  function pageFields(zone: HTMLElement, n: number, pages: number) {
    for (const f of Array.from(zone.querySelectorAll("[data-field]")) as HTMLElement[]) {
      const kind = f.dataset.field;
      if (kind === "page") f.textContent = String(n);
      else if (kind === "numpages" || kind === "sectionpages") f.textContent = String(pages);
    }
  }
  /** Feuilles derrière le texte, en-tête et pied de page répétés. */
  function drawSheets(pg: Page, pages: number) {
    const pt = ptPx, pageH = pg.height * pt, stride = pageH + GAP;
    paper.style.minHeight = `${pages * stride - GAP}px`;
    const pinned = Array.from(paper.querySelectorAll(":scope > .d-zone.pinned")) as HTMLElement[];
    for (const z of pinned) {
      if (z.classList.contains("d-ftr")) z.style.top = `${pageH - pg.footer * pt - z.offsetHeight}px`;
      else z.style.top = `${pg.header * pt}px`;
    }
    for (const z of pinned) pageFields(z, 1, pages);
    const frag = document.createDocumentFragment();
    for (let k = 0; k < pages; k++) {
      const sh = document.createElement("div");
      sh.className = "sheet";
      sh.style.left = "0";
      sh.style.top = `${k * stride}px`;
      sh.style.width = `${paper.offsetWidth}px`;
      sh.style.height = `${pageH}px`;
      if (k > 0) {
        for (const z of pinned) {
          const c = z.cloneNode(true) as HTMLElement;
          c.removeAttribute("contenteditable");
          c.querySelectorAll("[contenteditable]").forEach((x) => x.removeAttribute("contenteditable"));
          c.querySelectorAll("[data-idx]").forEach((x) => x.removeAttribute("data-idx"));
          pageFields(c, k + 1, pages);
          sh.appendChild(c);
        }
      }
      frag.appendChild(sh);
    }
    sheets.replaceChildren(frag);
  }

  // Numéros de ligne de Word, dans la marge de gauche, comptés ligne
  // affichée par ligne affichée sur les paragraphes du corps.
  function drawLines(pg: Page) {
    const ln = pg.line_numbers;
    if (!ln) { lnLayer.replaceChildren(); return; }
    const pt = ptPx, stride = pg.height * pt + GAP;
    const o = paper.getBoundingClientRect().top;
    const x = (pg.left - ln.distance) * pt;
    const size = (ln.size || 10) * pt;
    const frag = document.createDocumentFragment();
    let n = ln.start;
    let page = 0;
    for (const el of Array.from(paper.children) as HTMLElement[]) {
      if (!el.classList.contains("d-p") || el.dataset.noLn) continue;
      let lines = linesOf(el, o);
      if (!lines.length) {
        const top = el.getBoundingClientRect().top - o + parseFloat(getComputedStyle(el).paddingTop);
        lines = [{ top, bottom: top + size * 1.15, atom: el, frag: 0 }];
      }
      for (const line of lines) {
        const p = Math.floor(line.top / stride);
        if (p !== page) { page = p; if (ln.restart === "newPage") n = ln.start; }
        if (n % ln.count_by === 0) {
          const num = document.createElement("span");
          num.textContent = String(n);
          num.style.fontSize = `${size}px`;
          num.style.left = `${x}px`;
          num.style.top = `${line.bottom - size * 1.15}px`;
          frag.appendChild(num);
        }
        n++;
      }
    }
    if (ln.font) lnLayer.style.fontFamily = `"${ln.font}", "Times New Roman", serif`;
    lnLayer.replaceChildren(frag);
  }

  // Vue Lecture : le texte se lit comme accepté, un trait fin dans la marge
  // de gauche signale chaque groupe de lignes retouchées.
  const cbars = $("cbars");
  let pageCount = 1;
  function drawBars() {
    const pg = model?.page;
    if (view !== "final" || !pg) { if (cbars.firstChild) cbars.replaceChildren(); return; }
    const o = paper.getBoundingClientRect().top;
    const spans: [number, number][] = [];
    const push = (r: DOMRect | undefined) => { if (r && r.height > 2 && r.height < 120) spans.push([r.top - o, r.bottom - o]); };
    for (const el of Array.from(paper.querySelectorAll<HTMLElement>(".ins[data-ch]"))) for (const r of Array.from(el.getClientRects())) push(r);
    // Une suppression masquée tombe sur la ligne du texte qui l'entoure.
    for (const el of Array.from(paper.querySelectorAll<HTMLElement>(".del[data-ch]"))) {
      const prev = el.previousElementSibling, next = el.nextElementSibling;
      const pr = prev ? Array.from(prev.getClientRects()) : [];
      push(pr.length ? pr[pr.length - 1] : next ? next.getClientRects()[0] : undefined);
    }
    // Mise en forme ou marque de paragraphe : tout le paragraphe.
    for (const el of Array.from(paper.querySelectorAll<HTMLElement>(".d-p.changed"))) {
      if (el.querySelector(".ins[data-ch],.del[data-ch]")) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      spans.push([r.top - o + (parseFloat(cs.paddingTop) || 0), r.bottom - o - (parseFloat(cs.paddingBottom) || 0)]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1] + 6) last[1] = Math.max(last[1], s[1]);
      else merged.push([s[0], s[1]]);
    }
    const x = (pg.left - 9) * ptPx;
    const frag = document.createDocumentFragment();
    for (const [a, b] of merged) {
      const i = document.createElement("i");
      i.style.left = `${x}px`;
      i.style.top = `${a - 2}px`;
      i.style.height = `${b - a + 4}px`;
      frag.appendChild(i);
    }
    cbars.replaceChildren(frag);
  }

  function repaint(idx: number) {
    const old = paper.querySelector(`.d-p[data-idx="${idx}"]`) as HTMLElement | null;
    if (!old) { scheduleLines(); return; }
    // Hauteur inchangée et pas de coupure dedans : rien ne bouge en dessous,
    // la mise en page reste valable (le cas de presque toutes les frappes).
    const same = model?.page && !old.querySelector(".d-gap") ? old.offsetHeight : -1;
    const next = renderPara(idx);
    old.replaceWith(next);
    if (same >= 0 && next.offsetHeight === same) return;
    scheduleLines(idx);
  }

  // ------------------------------------------------ positions ↔ DOM
  const paraEl = (n: Node | null): HTMLElement | null => {
    const el = n ? (n.nodeType === 3 ? n.parentElement : (n as Element)) : null;
    return el ? (el.closest(".d-p") as HTMLElement | null) : null;
  };

  function posOf(node: Node, offset: number): Pos | null {
    let p = paraEl(node);
    if (!p && node instanceof Element && (node === paper || paper.contains(node))) {
      // Sélection posée entre des paragraphes (⌘A, tableau) : début du
      // paragraphe qui suit, ou fin du dernier.
      const child = node.childNodes[offset] as Node | undefined;
      const after = child ? (child instanceof Element ? (child.matches(".d-p") ? child : child.querySelector(".d-p")) : null) : null;
      if (after) return { idx: Number((after as HTMLElement).dataset.idx), off: 0 };
      const all = Array.from(node.querySelectorAll(".d-p")) as HTMLElement[];
      const before = all.length ? all[all.length - 1] : (Array.from(paper.querySelectorAll(".d-p")) as HTMLElement[]).pop();
      return before ? { idx: Number(before.dataset.idx), off: Number(before.dataset.len) } : null;
    }
    if (!p || !paper.contains(p)) return null;
    const idx = Number(p.dataset.idx);
    if (node === p) {
      const child = p.childNodes[offset] as HTMLElement | undefined;
      return { idx, off: child && child.dataset && child.dataset.off !== undefined ? Number(child.dataset.off) : Number(p.dataset.len) };
    }
    const el = node.nodeType === 3 ? node.parentElement! : (node as HTMLElement);
    const span = el.closest("[data-off]") as HTMLElement | null;
    if (!span || !p.contains(span)) return { idx, off: Number(p.dataset.len) };
    const base = Number(span.dataset.off);
    const len = Number(span.dataset.len);
    if (span.dataset.chip || span.dataset.del) {
      return { idx, off: base + (span.dataset.del ? 0 : offset > 0 || node !== span ? len : 0) };
    }
    const r = document.createRange();
    r.selectNodeContents(span);
    try { r.setEnd(node, offset); } catch { return { idx, off: base }; }
    return { idx, off: base + Math.min(len, cp(r.toString())) };
  }

  function domOf(pos: Pos): { node: Node; offset: number } | null {
    const p = paper.querySelector(`.d-p[data-idx="${pos.idx}"]`) as HTMLElement | null;
    if (!p) return null;
    const spans = Array.from(p.querySelectorAll(":scope > [data-off]")) as HTMLElement[];
    for (const s of spans) {
      if (s.dataset.del) continue;
      const so = Number(s.dataset.off);
      const len = Number(s.dataset.len);
      if (pos.off < so || pos.off > so + len) continue;
      if (s.dataset.chip) {
        if (pos.off === so) return { node: p, offset: Array.prototype.indexOf.call(p.childNodes, s) };
        continue;
      }
      // Fin d'un segment suivi d'un autre : préférer le début du suivant
      // seulement s'il est du texte (la frappe prolonge le segment courant).
      let left = pos.off - so;
      const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
      let t = walker.nextNode() as Text | null;
      while (t) {
        const n = cp(t.data);
        if (left <= n) return { node: t, offset: Array.from(t.data).slice(0, left).join("").length };
        left -= n;
        t = walker.nextNode() as Text | null;
      }
    }
    const last = spans.filter((s) => !s.dataset.del).pop();
    if (last && pos.off >= Number(p.dataset.len)) return { node: p, offset: Array.prototype.indexOf.call(p.childNodes, last) + 1 };
    return { node: p, offset: 0 };
  }

  function readSel(): Sel | null {
    const s = getSelection();
    if (!s || !s.rangeCount) return null;
    const r = s.getRangeAt(0);
    const a = posOf(r.startContainer, r.startOffset);
    const b = posOf(r.endContainer, r.endOffset);
    if (!a || !b) return null;
    // Une sélection reste dans son histoire (corps, une note, un en-tête).
    if (model && storyAt(a.idx) !== storyAt(b.idx)) {
      const last = storySpan(a.idx)[1];
      return { a, b: { idx: last, off: cp(model.paragraphs[last].text) } };
    }
    return { a, b };
  }
  const collapsed = (s: Sel) => s.a.idx === s.b.idx && s.a.off === s.b.off;

  function setCaret(pos: Pos, end?: Pos) {
    const a = domOf(pos);
    if (!a) return;
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    const b = end ? domOf(end) : null;
    if (b) r.setEnd(b.node, b.offset); else r.collapse(true);
    const s = getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  }

  // --------------------------------------------------------- application
  /** Paragraphe par rang : dans un lot, les jointures (du dernier au
   *  premier) et les coupes gardent valides les rangs qu'on vise ensuite. */
  const ref = (idx: number) => refIn(storyAt(idx), storySpan(idx)[0], idx);

  function applyModel(next: Model, caret?: Sel | null) {
    next = normalize(next);
    const prev = model;
    model = next;
    const sameShape = prev && prev.paragraphs.length === next.paragraphs.length && paper.querySelector(".d-p")
      && prev.paragraphs.every((p, i) => p.story === next.paragraphs[i].story && JSON.stringify(p.cell) === JSON.stringify(next.paragraphs[i].cell))
      && JSON.stringify((prev.notes || []).map((n) => n.number)) === JSON.stringify((next.notes || []).map((n) => n.number));
    if (sameShape) {
      next.paragraphs.forEach((p, i) => {
        if (JSON.stringify(p) !== JSON.stringify(prev!.paragraphs[i]) || ghosts.some((g) => g.idx === i)) repaint(i);
      });
    } else {
      renderAll();
    }
    if (caret) setCaret(caret.a, collapsed(caret) ? undefined : caret.b);
    rebaseDraft();
    renderCards();
    renderStatus();
    syncToolbar();
    if (findOpen()) runFind(false);
    notice.classList.toggle("show", next.openInWord);
    if (next.openInWord) {
      notice.innerHTML = `${ICON.warn}<span>Ce document est aussi ouvert dans Word. Ferme-le dans Word avant de le retoucher ici : Word écraserait ces retouches à son prochain enregistrement.</span>`;
    }
  }

  /** État d'enregistrement dans le pied ; tout autre message passe en toast. */
  const SAVING = "Enregistrement…";
  const SAVED = "Enregistré dans le .docx";
  function status(text: string, err = false) {
    const sv = $("ftSave");
    if (text === SAVING || text === SAVED) {
      const busy = text === SAVING;
      sv.classList.toggle("busy", busy);
      sv.innerHTML = busy ? "Enregistrement…" : `${ic("check", 12)}Enregistré`;
      sv.dataset.tooltip = busy ? "Écriture dans le .docx" : SAVED;
      return;
    }
    toast(text, err);
  }
  const toastEl = $("toast");
  let toastTimer = 0;
  function toast(text: string, err = false, ms?: number) {
    toastEl.textContent = text;
    toastEl.classList.toggle("err", err);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), ms ?? (err ? 4200 : 2200));
  }

  const sentence = (m: string) => (/[.!?…]$/.test(m.trim()) ? m.trim() : `${m.trim()}.`);
  /** Une saisie qu'on n'a pas pu poser : jamais perdue en silence. Elle
   *  reste lisible dans le message et part dans le presse-papiers. */
  function rescue(texts: string[], why: string) {
    const text = texts.join("");
    if (!text.trim()) return;
    const shown = clip(oneLine(text), 120);
    const say = (copied: boolean) => toast(`${why} Ta saisie « ${shown} » ${copied ? "est copiée dans le presse-papiers : colle-la où il faut." : "n'a pas été enregistrée : recopie-la."}`, true, 9000);
    try {
      navigator.clipboard.writeText(text).then(() => say(true), () => say(false));
    } catch {
      say(false);
    }
  }

  /** Après un changement venu d'ailleurs (Word, l'agent), replace la frappe
   *  en attente dans la nouvelle version : même paragraphe s'il n'a pas
   *  bougé, sinon le paragraphe identique, sinon le passage autour du
   *  curseur s'il est unique. Rend le texte qu'on n'a pas su replacer. */
  function remapGhosts(old: Model, fresh: Model): string[] {
    const lost: string[] = [];
    const chars = (s: string) => Array.from(s);
    const placed: { g: Ghost; realAt: number }[] = [];
    const keep: Ghost[] = [];
    ghosts.forEach((g, i) => {
      if (g.gone) return;
      // Position dans le texte réel d'avant (sans les frappes en attente qui précèdent).
      const earlier = ghosts.slice(0, i).filter((h) => !h.gone && h.idx === g.idx && h.at <= g.at).reduce((n, h) => n + cp(h.text), 0);
      const realAt = g.at - earlier;
      const oldText = old.paragraphs[g.idx] ? old.paragraphs[g.idx].text : "";
      let idx = -1;
      let at = realAt;
      if (fresh.paragraphs[g.idx] && fresh.paragraphs[g.idx].text === oldText) {
        idx = g.idx;
      } else {
        const same = fresh.paragraphs.map((p, k) => (p.text === oldText ? k : -1)).filter((k) => k >= 0);
        if (same.length === 1 && oldText) {
          idx = same[0];
        } else {
          const c = chars(oldText);
          const left = c.slice(Math.max(0, realAt - 24), realAt).join("");
          const right = c.slice(realAt, realAt + 24).join("");
          const key = left + right;
          if (cp(key) >= 6) {
            const found: { k: number; at: number }[] = [];
            fresh.paragraphs.forEach((p, k) => {
              let from = 0;
              for (;;) {
                const b = p.text.indexOf(key, from);
                if (b < 0) break;
                found.push({ k, at: cp(p.text.slice(0, b)) + cp(left) });
                from = b + 1;
              }
            });
            if (found.length === 1) { idx = found[0].k; at = found[0].at; }
          }
        }
      }
      if (idx < 0) { lost.push(g.text); return; }
      const before = placed.filter((x) => x.g.idx === idx && x.realAt <= at).reduce((n, x) => n + cp(x.g.text), 0);
      g.idx = idx;
      g.at = at + before;
      placed.push({ g, realAt: at });
      keep.push(g);
    });
    ghosts = keep;
    return lost;
  }

  /** File d'attente : une retouche à la fois, dans l'ordre des gestes. */
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  }

  async function sendOp(op: Op, caret?: (m: Model, result: any) => Sel | null, expectIdx?: number): Promise<boolean> {
    return enqueue(async () => {
      inflight++;
      status("Enregistrement…");
      const expectText = expectIdx !== undefined && model ? virtualTextReal(expectIdx) : null;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await api("/docx/op", { path: PATH, revision: model!.revision, author, tracked, op });
            const fresh = normalize(r.model);
            const sel = caret ? caret(fresh, r.result) : readSel();
            applyModel(fresh, sel);
            status("Enregistré dans le .docx");
            return true;
          } catch (e: any) {
            if (e.status === 409 && attempt === 0) {
              // Word ou l'agent a écrit entre-temps : relire, et refaire le
              // geste si son paragraphe n'a pas bougé.
              const fresh: Model = normalize(await api(`/docx/model?path=${enc(PATH)}`));
              const same = expectIdx !== undefined && fresh.paragraphs[expectIdx] && fresh.paragraphs[expectIdx].text === expectText;
              const sel = readSel();
              const lost = remapGhosts(model!, fresh);
              applyModel(fresh, sel);
              if (lost.length) rescue(lost, "Le document a changé pendant la frappe.");
              if (same) continue;
              status("Le document a changé pendant ce geste : refais-le sur la version à jour.", true);
              return false;
            }
            throw e;
          }
        }
        return false;
      } catch (e: any) {
        const pending = ghosts.filter((x) => !x.gone && !x.flying).map((x) => x.text);
        ghosts = [];
        if (pending.length) rescue(pending, sentence(e.message || String(e)));
        else status(e.message || String(e), true);
        try { applyModel(await api(`/docx/model?path=${enc(PATH)}`), readSel()); } catch { /* le message reste */ }
        return false;
      } finally {
        inflight--;
      }
    });
  }
  const virtualTextReal = (idx: number) => model!.paragraphs[idx] ? model!.paragraphs[idx].text : "";

  // ------------------------------------------------------------- frappe
  function typeText(text: string) {
    const sel = readSel();
    if (!sel || !model) return;
    if (!collapsed(sel)) {
      structural(async () => { await replaceSel(sel, text); });
      return;
    }
    const last = ghosts[ghosts.length - 1];
    if (last && !last.sent && last.idx === sel.a.idx && sel.a.off === last.at + cp(last.text)) {
      last.text += text;
    } else {
      ghosts.push({ idx: sel.a.idx, at: sel.a.off, text, sent: false });
    }
    repaint(sel.a.idx);
    setCaret({ idx: sel.a.idx, off: sel.a.off + cp(text) });
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(flushGhosts, IDLE_MS);
  }

  /** Envoie la frappe en attente ; rend la promesse de sa confirmation. */
  function flushGhosts(): Promise<unknown> {
    clearTimeout(idleTimer);
    const todo = ghosts.filter((g) => !g.sent);
    for (const g of todo) {
      g.sent = true;
      enqueue(async () => {
        if (g.gone || !ghosts.includes(g)) return;
        inflight++;
        status("Enregistrement…");
        const send = () => {
          g.flying = true;
          return api("/docx/op", { path: PATH, revision: model!.revision, author, tracked, op: { op: "insert", paragraph: ref(g.idx), at: g.at, with: g.text } });
        };
        try {
          let r: any;
          try {
            r = await send();
          } catch (e: any) {
            if (e.status !== 409) throw e;
            // Word ou l'agent a écrit entre-temps : relire, replacer la frappe
            // en attente dans la nouvelle version, et renvoyer celle-ci.
            const old = model!;
            const fresh: Model = normalize(await api(`/docx/model?path=${enc(PATH)}`));
            const lost = remapGhosts(old, fresh);
            applyModel(fresh, readSel());
            if (lost.length) rescue(lost, "Le document a changé pendant la frappe.");
            if (!ghosts.includes(g)) return;
            r = await send();
          }
          const sel = readSel();
          ghosts = ghosts.filter((x) => x !== g);
          applyModel(r.model, sel);
          status("Enregistré dans le .docx");
        } catch (e: any) {
          // Retouche refusée (Word ouvert, passage intouchable…) : la frappe
          // en attente n'a plus de place sûre, elle est rendue à l'utilisateur.
          const pending = ghosts.filter((x) => !x.gone).map((x) => x.text);
          ghosts = [];
          rescue(pending, e.status === 409 ? "Le document a changé pendant la frappe." : sentence(e.message || String(e)));
          try { applyModel(await api(`/docx/model?path=${enc(PATH)}`), readSel()); } catch { /* le message reste */ }
        } finally {
          g.flying = false;
          inflight--;
        }
      });
    }
    return chain;
  }

  /** Fermeture du panneau : la file ne tournera plus. Toute frappe qui n'est
   *  pas déjà partie s'envoie d'un seul geste, en `keepalive` pour survivre
   *  au déchargement de la page. */
  function flushOnExit() {
    clearTimeout(idleTimer);
    const todo = ghosts.filter((g) => !g.flying && !g.gone);
    if (!todo.length || !model) return;
    for (const g of todo) g.gone = true;
    const ops = todo.map((g) => ({ op: "insert", paragraph: ref(g.idx), at: g.at, with: g.text }));
    const op = ops.length === 1 ? ops[0] : { op: "batch", ops };
    // Une retouche est encore en vol : sa révision n'est pas connue ici, on
    // laisse alors le serveur appliquer à la suite sans contrôle.
    const body = JSON.stringify({ path: PATH, revision: inflight ? undefined : model.revision, author, tracked, op });
    try {
      void fetch("/docx/op", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60000 }).catch(() => undefined);
    } catch { /* page déjà déchargée */ }
  }

  /** Un geste qui change la structure : la frappe part d'abord, et les gestes
   *  suivants attendent son résultat (les positions en dépendent). */
  function structural(fn: () => Promise<void>) {
    if (structBusy) { backlog.push(fn); return; }
    structBusy = true;
    (async () => {
      try {
        await flushGhosts();
        await fn();
        await chain;
      } finally {
        structBusy = false;
        const next = backlog.shift();
        if (next) structural(next);
      }
    })();
  }

  /** Ops qui effacent la sélection [a, b) (du dernier paragraphe au premier). */
  function deleteOps(sel: Sel): Op[] {
    const { a, b } = sel;
    if (a.idx === b.idx) {
      if (a.off === b.off) return [];
      const [s, e] = expandWhole(a.idx, a.off, b.off);
      return [{ op: "replace_range", paragraph: ref(a.idx), start: s, end: e, with: "" }];
    }
    const ops: Op[] = [];
    if (b.off > 0) ops.push({ op: "replace_range", paragraph: ref(b.idx), start: 0, end: expandWhole(b.idx, 0, b.off)[1], with: "" });
    for (let k = b.idx; k > a.idx; k--) {
      if (k < b.idx) {
        const len = model!.paragraphs[k].text.length ? cp(model!.paragraphs[k].text) : 0;
        if (len) ops.push({ op: "replace_range", paragraph: ref(k), start: 0, end: len, with: "" });
      }
      ops.push({ op: "join", paragraph: ref(k) });
    }
    const lenA = cp(model!.paragraphs[a.idx].text);
    if (lenA > a.off) ops.push({ op: "replace_range", paragraph: ref(a.idx), start: expandWhole(a.idx, a.off, lenA)[0], end: lenA, with: "" });
    return ops;
  }

  async function replaceSel(sel: Sel, text: string) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const ops = deleteOps(sel);
    const story = storyAt(sel.a.idx);
    const start = storySpan(sel.a.idx)[0];
    let idx = sel.a.idx;
    let at = sel.a.off;
    // Après une jointure suivie, les paragraphes restent séparés (marque
    // supprimée) : on écrit dans le premier, à la position de départ.
    lines.forEach((line, k) => {
      if (k > 0) {
        ops.push({ op: "split", paragraph: refIn(story, start, idx), at });
        idx += 1;
        at = 0;
      }
      if (line) {
        ops.push({ op: "insert", paragraph: refIn(story, start, idx), at, with: line });
        at += cp(line);
      }
    });
    if (!ops.length) return;
    const op = ops.length === 1 ? ops[0] : { op: "batch", ops };
    await sendOp(op, () => ({ a: { idx, off: at }, b: { idx, off: at } }), sel.a.idx);
  }

  function wordBounds(text: string, off: number): [number, number] {
    const chars = Array.from(text);
    let s = off, e = off;
    const w = (c: string) => /[\p{L}\p{N}'’-]/u.test(c);
    while (s > 0 && w(chars[s - 1])) s--;
    while (e < chars.length && w(chars[e])) e++;
    return [s, e];
  }

  function deleteKey(kind: string) {
    const sel = readSel();
    if (!sel || !model) return;
    structural(async () => {
      if (!collapsed(sel)) { await replaceSel(sel, ""); return; }
      const { idx, off } = sel.a;
      const text = Array.from(virtualText(idx));
      const len = text.length;
      const back = kind.endsWith("Backward");
      if (back && off === 0) {
        if (idx === storySpan(idx)[0]) return;
        const prevLen = cp(model!.paragraphs[idx - 1].text);
        await sendOp({ op: "join", paragraph: ref(idx) }, () => ({ a: { idx: idx - 1, off: prevLen }, b: { idx: idx - 1, off: prevLen } }));
        return;
      }
      if (!back && off >= len) {
        if (idx === storySpan(idx)[1]) return;
        await sendOp({ op: "join", paragraph: ref(idx + 1) }, () => ({ a: { idx, off }, b: { idx, off } }));
        return;
      }
      let s = off, e = off;
      if (kind === "deleteContentBackward") s = off - 1;
      else if (kind === "deleteContentForward") e = off + 1;
      else if (kind === "deleteWordBackward") {
        const before = text.slice(0, off).join("");
        const m = before.match(/[\p{L}\p{N}'’-]*[^\p{L}\p{N}'’-]*$/u);
        s = off - (m && m[0] ? cp(m[0]) : 1);
      } else if (kind === "deleteWordForward") {
        const after = text.slice(off).join("");
        const m = after.match(/^[^\p{L}\p{N}'’-]*[\p{L}\p{N}'’-]*/u);
        e = off + (m && m[0] ? cp(m[0]) : 1);
      } else if (kind.includes("LineBackward")) s = 0;
      else if (kind.includes("LineForward")) e = len;
      s = Math.max(0, s); e = Math.min(len, e);
      if (s === e) return;
      [s, e] = expandWhole(idx, s, e);
      await sendOp({ op: "replace_range", paragraph: ref(idx), start: s, end: e, with: "" }, () => ({ a: { idx, off: s }, b: { idx, off: s } }), idx);
    });
  }

  function enterKey() {
    const sel = readSel();
    if (!sel || !model) return;
    structural(async () => {
      if (!collapsed(sel)) {
        await replaceSel(sel, "\n");
        return;
      }
      await sendOp({ op: "split", paragraph: ref(sel.a.idx), at: sel.a.off }, () => ({ a: { idx: sel.a.idx + 1, off: 0 }, b: { idx: sel.a.idx + 1, off: 0 } }), sel.a.idx);
    });
  }

  paper.addEventListener("beforeinput", (e: InputEvent) => {
    if (view === "original") { e.preventDefault(); return; }
    const t = e.inputType;
    if (t === "insertCompositionText") return; // l'IME écrit, on reprend à compositionend
    e.preventDefault();
    if (t === "insertText" || t === "insertReplacementText") {
      const data = e.data ?? e.dataTransfer?.getData("text/plain") ?? "";
      if (!data) return;
      if (structBusy) { backlog.push(async () => { typeText(data); }); return; }
      if (t === "insertReplacementText") { const sel = readSel(); if (sel) structural(() => replaceSel(sel, data)); return; }
      typeText(data);
    } else if (t === "insertParagraph") {
      enterKey();
    } else if (t === "insertLineBreak") {
      if (structBusy) { backlog.push(async () => { typeText("\n"); }); return; }
      typeText("\n");
    } else if (t === "insertFromPaste" || t === "insertFromDrop" || t === "insertFromYank") {
      const data = e.dataTransfer?.getData("text/plain") || "";
      const sel = readSel();
      if (data && sel) structural(() => replaceSel(sel, data));
    } else if (t.startsWith("delete")) {
      deleteKey(t === "deleteByCut" || t === "deleteByDrag" ? "deleteContentBackward" : t);
    } else if (t === "historyUndo") {
      undo(false);
    } else if (t === "historyRedo") {
      undo(true);
    } else if (t === "formatBold") toggleRun("b");
    else if (t === "formatItalic") toggleRun("i");
    else if (t === "formatUnderline") toggleRun("u");
    else if (t === "formatStrikeThrough") toggleRun("strike");
    else if (t === "formatSuperscript") toggleRun("sup");
    else if (t === "formatSubscript") toggleRun("sub");
  });

  paper.addEventListener("compositionstart", () => { composing = readSel()?.a || null; });
  paper.addEventListener("compositionend", (e: CompositionEvent) => {
    const at = composing;
    composing = null;
    if (!at || !model) return;
    const data = e.data || "";
    // Effacer ce que l'IME a écrit directement dans la page.
    repaint(at.idx);
    setCaret(at);
    if (data) typeText(data);
  });

  paper.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); undo(e.shiftKey); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); undo(true); return; }
    if (mod && !e.altKey && ["b", "i", "u"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      toggleRun(({ b: "b", i: "i", u: "u" } as Record<string, string>)[e.key.toLowerCase()]);
      return;
    }
    if (e.key === "Tab" && !mod) { e.preventDefault(); if (view !== "original") typeText("\t"); }
  });

  paper.addEventListener("copy", (e: ClipboardEvent) => {
    const sel = readSel();
    if (!sel || collapsed(sel) || !model) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", selectionText(sel));
  });
  paper.addEventListener("cut", (e: ClipboardEvent) => {
    const sel = readSel();
    if (!sel || collapsed(sel) || !model) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", selectionText(sel));
    if (view !== "original") structural(() => replaceSel(sel, ""));
  });
  // Pas de glisser-déposer du texte (un dépôt accidentel déplace la thèse).
  paper.addEventListener("dragstart", (e) => e.preventDefault());
  paper.addEventListener("drop", (e) => e.preventDefault());

  function selectionText(sel: Sel): string {
    const out: string[] = [];
    for (let k = sel.a.idx; k <= sel.b.idx; k++) {
      const chars = Array.from(virtualText(k));
      out.push(chars.slice(k === sel.a.idx ? sel.a.off : 0, k === sel.b.idx ? sel.b.off : chars.length).join(""));
    }
    return out.join("\n");
  }

  async function undo(redo: boolean) {
    structural(async () => {
      await enqueue(async () => {
        try {
          const r = await api("/docx/undo", { path: PATH, revision: model!.revision, redo });
          applyModel(r.model, readSel());
          status(r.label ? `${redo ? "Rétabli" : "Annulé"} : ${r.label}` : redo ? "Rétabli" : "Annulé");
        } catch (e: any) {
          status(e.message || String(e), true);
        }
      });
    });
  }

  // ------------------------------------------------------ mise en forme
  function segAt(pos: Pos): Seg | null {
    if (!model || !model.paragraphs[pos.idx]) return null;
    let off = 0;
    let found: Seg | null = null;
    for (const s of virtualSegments(pos.idx)) {
      if (s.rev === "del" || s.rev === "moveFrom") continue;
      const len = cp(s.text);
      if (s.kind === "text" && pos.off >= off && pos.off <= off + len) {
        found = s;
        if (pos.off < off + len) break;
      }
      off += len;
    }
    return found;
  }

  function runRanges(sel: Sel): Op[] {
    const ops: Op[] = [];
    for (let k = sel.a.idx; k <= sel.b.idx; k++) {
      const len = cp(model!.paragraphs[k].text);
      const s = k === sel.a.idx ? sel.a.off : 0;
      const e = k === sel.b.idx ? sel.b.off : len;
      if (e > s) ops.push({ paragraph: ref(k), start: s, end: e });
    }
    return ops;
  }

  function applyRun(props: Record<string, unknown>) {
    let sel = readSel();
    if (!sel || !model || view === "original") return;
    if (collapsed(sel)) {
      // Comme Word : sans sélection, le mot sous le curseur.
      const [s, e] = wordBounds(virtualText(sel.a.idx), sel.a.off);
      if (s === e) return;
      sel = { a: { idx: sel.a.idx, off: s }, b: { idx: sel.a.idx, off: e } };
    }
    const keep = sel;
    structural(async () => {
      const ranges = runRanges(keep).map((r) => ({ op: "format_range", ...r, props }));
      if (!ranges.length) return;
      await sendOp(ranges.length === 1 ? ranges[0] : { op: "batch", ops: ranges }, () => keep);
    });
  }

  function toggleRun(key: string) {
    const sel = readSel();
    if (!sel) return;
    const seg = segAt(sel.a.off === sel.b.off || sel.a.idx !== sel.b.idx ? sel.a : { idx: sel.a.idx, off: sel.a.off + 1 });
    const on = !!(seg && (seg as Record<string, unknown>)[key]);
    const props: Record<string, unknown> = { [key]: !on };
    if (key === "sup" && !on) props.sub = false;
    if (key === "sub" && !on) props.sup = false;
    applyRun(props);
  }

  function applyPara(props: Record<string, unknown>) {
    const sel = readSel();
    if (!sel || !model || view === "original") return;
    structural(async () => {
      const ops: Op[] = [];
      for (let k = sel.a.idx; k <= sel.b.idx; k++) ops.push({ op: "format_paragraph", paragraph: ref(k), props });
      await sendOp(ops.length === 1 ? ops[0] : { op: "batch", ops }, () => sel);
    });
  }

  // ------------------------------------------------------------ menus
  let openMenu: HTMLElement | null = null;
  let openTrigger: HTMLElement | null = null;
  /** Dernier geste au clavier : un menu ouvert ainsi prend le focus. */
  let keyboardLast = false;
  document.addEventListener("keydown", () => { keyboardLast = true; }, true);
  document.addEventListener("pointerdown", () => { keyboardLast = false; }, true);
  function closeMenu(refocus = false) {
    if (openMenu) { openMenu.classList.remove("show"); const m = openMenu; setTimeout(() => m.remove(), 150); }
    openTrigger?.classList.remove("open");
    openTrigger?.setAttribute("aria-expanded", "false");
    if (refocus) openTrigger?.focus();
    openMenu = null;
    openTrigger = null;
  }
  type Item = { label: string; html?: string; on?: boolean; danger?: boolean; sep?: boolean; head?: boolean; disabled?: boolean; run?: () => void };
  function showMenu(trigger: HTMLElement, items: Item[], alignRight = false) {
    if (openTrigger === trigger) { closeMenu(); return; }
    closeMenu();
    const m = document.createElement("div");
    m.className = "menu";
    m.setAttribute("role", "menu");
    for (const it of items) {
      if (it.sep) { const s = document.createElement("div"); s.className = "mi-sep"; m.appendChild(s); continue; }
      if (it.head) { const h = document.createElement("div"); h.className = "mi-head"; h.textContent = it.label; m.appendChild(h); continue; }
      const b = document.createElement("button");
      b.className = "mi" + (it.danger ? " danger" : "");
      b.setAttribute("role", "menuitem");
      b.disabled = !!it.disabled;
      b.innerHTML = `${it.html || `<span>${esc(it.label)}</span>`}${it.on ? ICON.check : ""}`;
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => { closeMenu(); it.run?.(); });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = trigger.getBoundingClientRect();
    const w = m.offsetWidth;
    m.style.top = `${r.bottom + 4}px`;
    m.style.left = `${Math.max(8, alignRight ? r.right - w : r.left)}px`;
    requestAnimationFrame(() => m.classList.add("show"));
    trigger.classList.add("open");
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "true");
    openMenu = m;
    openTrigger = trigger;
    // Flèches, Début, Fin ; Échap rend le focus au bouton, Tab ferme.
    const focusable = () => Array.from(m.querySelectorAll<HTMLButtonElement>(".mi:not(:disabled)"));
    m.addEventListener("keydown", (e) => {
      const l = focusable();
      const k = l.indexOf(document.activeElement as HTMLButtonElement);
      const go = (i: number) => { e.preventDefault(); l[(i + l.length) % l.length]?.focus(); };
      if (e.key === "ArrowDown") go(k + 1);
      else if (e.key === "ArrowUp") go(k < 0 ? l.length - 1 : k - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(l.length - 1);
      else if (e.key === "Tab") closeMenu();
    });
    if (keyboardLast) focusable()[0]?.focus({ preventScroll: true });
  }
  document.addEventListener("mousedown", (e) => {
    if (openMenu && !openMenu.contains(e.target as Node) && !(openTrigger && openTrigger.contains(e.target as Node))) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // Un seul appui ferme une seule chose : le menu d'abord.
    if (openMenu) { e.preventDefault(); closeMenu(true); return; }
    hidePop();
  });

  // ---------------------------------------------------------- barres
  const fmtbar = $("fmtbar");
  const FONTS = ["Times New Roman", "Calibri", "Cambria", "Arial", "Helvetica", "Georgia", "Garamond", "Palatino"];
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36];
  // Une seule barre (piste A choisie par Thierry le 2026-10-20) : mise en
  // forme à gauche, revue et suivi à droite ; le reste vit dans des menus.
  fmtbar.innerHTML = `
    <button class="ib on" id="btnNav" aria-label="Plan et commentaires" aria-pressed="true" data-tooltip="Plan et commentaires">${ic("panel")}</button>
    <span class="vs"></span>
    <button class="dd w-style hide3" id="ddStyle" data-tooltip="Style du paragraphe"><span>Normal</span>${ic("down", 12)}</button>
    <button class="dd w-font hide1" id="ddFont" data-tooltip="Police"><span>Police</span>${ic("down", 12)}</button>
    <button class="dd w-size hide1" id="ddSize" data-tooltip="Taille"><span>12</span>${ic("down", 12)}</button>
    <span class="vs hide3"></span>
    <button class="ib hide3" data-run="b" aria-label="Gras" data-tooltip="Gras (⌘B)"><span class="g">G</span></button>
    <button class="ib hide3" data-run="i" aria-label="Italique" data-tooltip="Italique (⌘I)"><span class="g i">I</span></button>
    <button class="ib hide3" data-run="u" aria-label="Souligné" data-tooltip="Souligné (⌘U)"><span class="g u">S</span></button>
    <button class="ib hide2" id="btnMore" aria-label="Autres mises en forme" data-tooltip="Barré, exposant, indice">${ic("more")}</button>
    <span class="vs hide2"></span>
    <button class="ib hide2" id="btnAlign" aria-label="Alignement" data-tooltip="Alignement"><span class="ic">${ic("alLeft")}</span><span class="chev">${ic("down", 12)}</span></button>
    <button class="ib hide2" id="btnList" aria-label="Listes" data-tooltip="Listes">${ic("list")}<span class="chev">${ic("down", 12)}</span></button>
    <span class="vs hide2"></span>
    <button class="ib hide3" id="btnComment" aria-label="Commenter" data-tooltip="Commenter la sélection">${ic("msgPlus")}</button>
    <button class="ib hide2" id="btnInsert" aria-label="Insérer" data-tooltip="Insérer une note, une figure ou une ligne de tableau">${ic("plus")}<span class="chev">${ic("down", 12)}</span></button>
    <span class="vs hide2"></span>
    <button class="ib" id="btnUndo" aria-label="Annuler" data-tooltip="Annuler (⌘Z)">${ic("undo")}</button>
    <button class="ib hide3" id="btnRedo" aria-label="Rétablir" data-tooltip="Rétablir (⌘⇧Z)">${ic("redo")}</button>
    <span class="sp"></span>
    <button class="ib" id="btnFind" aria-label="Rechercher" data-tooltip="Rechercher et remplacer (⌘F)">${ic("search")}</button>
    <span class="seg" role="group" aria-label="Affichage"><button id="vReview" aria-pressed="true" data-tooltip="Modifications et commentaires visibles">Révision</button><button id="vRead" aria-pressed="false" data-tooltip="Le texte comme si tout était accepté">Lecture</button></span>
    <span class="navc hide2"><button class="ib" id="navPrev" aria-label="Commentaire précédent" data-tooltip="Commentaire précédent">${ic("left")}</button><span class="lbl" id="navLbl"></span><button class="ib" id="navNext" aria-label="Commentaire suivant" data-tooltip="Commentaire suivant">${ic("right")}</button></span>
    <button class="ib lanebtn" id="btnLane" aria-label="Commentaires" aria-pressed="false" data-tooltip="Afficher les commentaires (⇧⌘M)">${ic("msgText")}<span class="n" id="laneN"></span></button>
    <button class="track on" id="btnTrack" aria-pressed="true" data-tooltip="Suivi des modifications : chaque retouche reste visible dans Word"><span class="sw"><i></i></span>Suivi</button>`;

  // Les boutons ne prennent pas le focus : la sélection reste dans la page.
  for (const b of Array.from(document.querySelectorAll("#fmtbar button"))) {
    b.addEventListener("mousedown", (e) => e.preventDefault());
  }
  fmtbar.querySelectorAll<HTMLElement>("[data-run]").forEach((b) => b.addEventListener("click", () => toggleRun(b.dataset.run!)));
  fmtbar.querySelectorAll<HTMLElement>("[data-align]").forEach((b) => b.addEventListener("click", () => applyPara({ align: b.dataset.align })));
  // Word range ses styles intégrés sous un nom anglais (« heading 1 ») et
  // les affiche traduits : on fait pareil.
  const BUILTIN: Record<string, string> = {
    "normal": "Normal", "title": "Titre", "subtitle": "Sous-titre", "caption": "Légende", "quote": "Citation",
    "intense quote": "Citation intense", "list paragraph": "Paragraphe de liste", "list bullet": "Liste à puces",
    "list number": "Liste numérotée", "no spacing": "Sans interligne", "bibliography": "Bibliographie",
    "toc heading": "En-tête de table des matières", "footnote text": "Note de bas de page", "endnote text": "Note de fin",
    "annotation text": "Commentaire", "header": "En-tête", "footer": "Pied de page", "block text": "Normal (retrait)",
  };
  function styleLabel(name: string): string {
    const k = name.toLowerCase();
    const h = k.match(/^heading (\d)$/);
    if (h) return `Titre ${h[1]}`;
    const toc = k.match(/^toc (\d)$/);
    if (toc) return `TM ${toc[1]}`;
    return BUILTIN[k] || name;
  }
  /** Styles de service que Word ne propose pas non plus dans sa galerie. */
  const HIDDEN_STYLES = /^(annotation (text|subject|reference)|footnote (text|reference)|endnote (text|reference)|header|footer|balloon text|page number|line number|hyperlink|followedhyperlink|toc \d|table of figures|default paragraph font|no list|normal table|table grid|placeholder text)$/i;
  $("btnUndo").addEventListener("click", () => undo(false));
  $("btnRedo").addEventListener("click", () => undo(true));
  $("btnTrack").addEventListener("click", () => {
    tracked = !tracked;
    $("btnTrack").classList.toggle("on", tracked);
    $("btnTrack").setAttribute("aria-pressed", String(tracked));
    status(tracked ? "Suivi activé : tes retouches sont signées" : "Suivi désactivé : tes retouches s'écrivent sans trace");
  });
  $("ddStyle").addEventListener("click", (e) => {
    const cur = currentPara();
    const shown = (model?.styles || []).filter((s) => !HIDDEN_STYLES.test(s.name) || (cur?.style || "Normal") === s.id);
    showMenu(e.currentTarget as HTMLElement, shown.map((s) => ({
      label: styleLabel(s.name),
      html: `<span class="${s.heading === 1 || s.heading === 0 ? "mi-h1" : s.heading === 2 ? "mi-h2" : s.heading === 3 ? "mi-h3" : ""}">${esc(styleLabel(s.name))}</span>`,
      on: (cur?.style || "Normal") === s.id,
      run: () => applyPara({ style: s.id }),
    })));
  });
  $("ddFont").addEventListener("click", (e) => {
    const sel = readSel();
    const cur = sel ? segAt(sel.a)?.font : undefined;
    const used = new Set<string>(FONTS);
    model?.paragraphs.forEach((p) => p.segments.forEach((s) => { if (s.font) used.add(s.font); }));
    showMenu(e.currentTarget as HTMLElement, Array.from(used).sort().map((f) => ({
      label: f, html: `<span style="font-family:'${f.replace(/'/g, "")}'">${esc(f)}</span>`, on: f === cur, run: () => applyRun({ font: f }),
    })));
  });
  $("ddSize").addEventListener("click", (e) => {
    const sel = readSel();
    const cur = sel ? segAt(sel.a)?.size : undefined;
    showMenu(e.currentTarget as HTMLElement, SIZES.map((n) => ({ label: String(n).replace(".", ","), on: n === cur, run: () => applyRun({ size: n }) })));
  });
  const listStyle = (re: RegExp) => (model?.styles || []).find((s) => re.test(s.name) || re.test(s.id));
  $("btnList").addEventListener("click", (e) => {
    const bullets = listStyle(/puce|bullet/i), numbers = listStyle(/num[ée]ro|number/i);
    const style = currentPara()?.style;
    showMenu(e.currentTarget as HTMLElement, [
      { label: "Liste à puces", disabled: !bullets, on: !!bullets && style === bullets.id, run: () => bullets && applyPara({ style: bullets.id }) },
      { label: "Liste numérotée", disabled: !numbers, on: !!numbers && style === numbers.id, run: () => numbers && applyPara({ style: numbers.id }) },
    ]);
  });
  const ALIGN: [string, string, string][] = [["left", "Aligner à gauche", ic("alLeft")], ["center", "Centrer", ic("alCenter")], ["right", "Aligner à droite", ic("alRight")], ["both", "Justifier", ic("alBoth")]];
  $("btnAlign").addEventListener("click", (e) => {
    const cur = currentPara()?.align || "left";
    showMenu(e.currentTarget as HTMLElement, ALIGN.map(([a, label]) => ({ label, on: cur === a, run: () => applyPara({ align: a }) })));
  });
  $("btnMore").addEventListener("click", (e) => {
    const seg = currentSeg() as Record<string, unknown> | null;
    showMenu(e.currentTarget as HTMLElement, [["strike", "Barré"], ["sup", "Exposant"], ["sub", "Indice"]].map(([k, label]) => ({
      label, on: !!(seg && seg[k]), run: () => toggleRun(k),
    })));
  });
  $("btnComment").addEventListener("click", () => askComment());
  function insertNote() {
    const sel = readSel();
    if (!sel || !model || view === "original") return;
    if (storyAt(sel.a.idx)) { status("Une note s'appelle depuis le corps du texte.", true); return; }
    const at = collapsed(sel) ? sel.a : sel.b;
    structural(async () => {
      // Le curseur passe dans la nouvelle note, prête à écrire.
      await sendOp({ op: "insert_note", paragraph: ref(at.idx), at: at.off, text: "" }, (m, r) => {
        const k = m.paragraphs.findIndex((p) => p.id === `${r && r.id}.p0`);
        return k >= 0 ? { a: { idx: k, off: cp(m.paragraphs[k].text) }, b: { idx: k, off: cp(m.paragraphs[k].text) } } : null;
      });
    });
  }
  /** Lignes et colonnes du tableau sous le curseur (vide hors tableau). */
  function tableItems(): Item[] {
    const sel = readSel();
    const p = sel && model ? model.paragraphs[sel.a.idx] : null;
    if (!sel || !p || !p.cell || view === "original") return [];
    const [t, r, c] = p.cell;
    const story = p.story || "";
    // Curseur dans la première cellule de la ligne voulue, après le geste.
    const toCell = (row: number, col: number) => (m: Model) => {
      const k = m.paragraphs.findIndex((q) => (q.story || "") === story && q.cell && q.cell[0] === t && q.cell[1] === row && q.cell[2] === col);
      return k >= 0 ? { a: { idx: k, off: 0 }, b: { idx: k, off: 0 } } : null;
    };
    const run = (op: Op, caret: ((m: Model) => Sel | null) | undefined, note?: string) => structural(async () => {
      const ok = await sendOp(op, caret);
      if (ok && note) status(note);
    });
    const direct = tracked ? "sans suivi : Word ne suit pas les colonnes" : "";
    return [
      { label: "Insérer une ligne au-dessus", run: () => run({ op: "insert_row", paragraph: ref(sel.a.idx), above: true }, toCell(r, 0)) },
      { label: "Insérer une ligne en dessous", run: () => run({ op: "insert_row", paragraph: ref(sel.a.idx) }, toCell(r + 1, 0)) },
      { label: "Insérer une colonne à gauche", run: () => run({ op: "insert_column", paragraph: ref(sel.a.idx), left: true }, toCell(r, c), direct && `Colonne ajoutée ${direct}`) },
      { label: "Insérer une colonne à droite", run: () => run({ op: "insert_column", paragraph: ref(sel.a.idx) }, toCell(r, c + 1), direct && `Colonne ajoutée ${direct}`) },
      { label: "", sep: true },
      { label: "Supprimer la ligne", danger: true, run: () => run({ op: "delete_row", paragraph: ref(sel.a.idx) }, () => null) },
      { label: "Supprimer la colonne", danger: true, run: () => run({ op: "delete_column", paragraph: ref(sel.a.idx) }, () => null, direct && `Colonne supprimée ${direct}`) },
    ];
  }
  async function figureMenu(trigger: HTMLElement) {
    const sel = readSel();
    if (!sel || !model || view === "original") return;
    let list: { path: string }[] = [];
    try { list = (await api("/docx/figures")).figures || []; } catch (err: any) { status(err.message || String(err), true); return; }
    const at = collapsed(sel) ? sel.a : sel.b;
    const items: Item[] = list.length
      ? list.map((f) => ({
        label: f.path,
        html: `<span class="mi-fig"><img src="/${f.path.split("/").map(enc).join("/")}" alt="" loading="lazy"><span>${esc(f.path)}</span></span>`,
        run: () => structural(async () => { await sendOp({ op: "insert_image", paragraph: ref(at.idx), at: at.off, path: f.path }, () => ({ a: { idx: at.idx, off: at.off + 1 }, b: { idx: at.idx, off: at.off + 1 } })); }),
      }))
      : [{ label: "Aucune image PNG, JPEG ou GIF dans le projet" }];
    showMenu(trigger, items);
  }
  $("btnInsert").addEventListener("click", (e) => {
    const trigger = e.currentTarget as HTMLElement;
    const sel = readSel();
    const p = currentPara();
    const off = !sel || view === "original";
    const rows = tableItems();
    showMenu(trigger, [
      { label: "Note de bas de page", disabled: off || !!(p && p.story), run: insertNote },
      { label: "Figure du projet…", disabled: off, run: () => void figureMenu(trigger) },
      ...(rows.length ? [{ label: "Tableau", head: true }, ...rows] : []),
    ]);
  });

  type View = "revue" | "final" | "original";
  function setView(next: View) {
    view = next;
    document.body.classList.remove("v-revue", "v-final", "v-original");
    document.body.classList.add(`v-${view}`);
    $("vReview").setAttribute("aria-pressed", String(view === "revue"));
    $("vRead").setAttribute("aria-pressed", String(view === "final"));
    paper.contentEditable = view === "original" ? "false" : "true";
    hideBubble();
    renderCards();
    scheduleLines();
  }
  function setPage(next: string, save: boolean) {
    page = next;
    document.body.classList.toggle("blanche", page === "blanche");
    if (save) api("/docx/prefs", { page }).catch(() => undefined);
  }
  $("vReview").addEventListener("click", () => setView("revue"));
  $("vRead").addEventListener("click", () => setView("final"));
  /** Ouvre un autre .docx : nouvel onglet dans Atelier, sinon sur place. */
  function openDocx(path: string) {
    if (parent !== window) parent.postMessage({ type: "atelier-open-file", nonce: LANE_NONCE, path }, "*");
    else location.href = `${location.pathname}?path=${encodeURIComponent(path)}`;
  }
  const baseName = (p: string) => p.split(/[\\/]/).pop() || p;
  /** Copie à côté du document : nouvelle version ou version reçue. */
  async function copyAside(kind: "new" | "received") {
    try {
      const r = await api("/docx/version", { path: PATH, kind });
      const name = baseName(r.path);
      status(kind === "new"
        ? `Nouvelle version enregistrée : ${name}. ${baseName(PATH)} reste tel quel.`
        : `Version reçue rouverte en copie : ${name}.`);
      openDocx(r.path);
    } catch (e) {
      status(`Copie impossible : ${(e as Error).message}`, true);
    }
  }
  /** Menu de la révision : décisions d'ensemble, versions, affichage et page. */
  async function reviewMenu(trigger: HTMLElement) {
    if (!model) return;
    // Ce que l'historique sait (version reçue, prochain nom) ; jamais bloquant.
    const hist: { received?: { at: string } | null; nextVersion?: string | null } | null = openTrigger === trigger
      ? null : await fetch(`/docx/history?path=${enc(PATH)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const items: Item[] = [
      { label: "Tout accepter", run: () => decideAll("accept_all") },
      { label: "Tout refuser", run: () => decideAll("reject_all") },
    ];
    const names = model.authors.filter((a) => a.changes > 0);
    if (names.length > 1) {
      items.push({ label: "", sep: true });
      for (const a of names) {
        items.push({ label: `Accepter celles de ${a.name}`, run: () => decideAll("accept_all", a.name) });
        items.push({ label: `Refuser celles de ${a.name}`, run: () => decideAll("reject_all", a.name) });
      }
    }
    const hint = (text: string) => `<span class="mi-k">${esc(text)}</span>`;
    const who = reviewer();
    items.push(
      { label: "", sep: true },
      { label: "Versions", head: true },
      { label: "Enregistrer une nouvelle version", html: `<span>Enregistrer une nouvelle version</span>${hist?.nextVersion ? hint(hist.nextVersion.replace(/^.*(_v\d+\.docx)$/, "…$1")) : ""}`, run: () => copyAside("new") },
    );
    if (hist?.received) {
      const label = `Ouvrir la version reçue${who ? ` de ${firstName(who)}` : ""}`;
      items.push({ label, html: `<span>${esc(label)}</span>${hint(dateFr(hist.received.at))}`, run: () => copyAside("received") });
    }
    items.push(
      { label: "", sep: true },
      { label: "Affichage", head: true },
      { label: "Révision", on: view === "revue", run: () => setView("revue") },
      { label: "Lecture", on: view === "final", run: () => setView("final") },
      { label: "Original", on: view === "original", run: () => setView("original") },
      { label: "", sep: true },
      { label: "Page", head: true },
      { label: "Blanche", on: page === "blanche", run: () => setPage("blanche", true) },
      { label: "Thème de l'app", on: page !== "blanche", run: () => setPage("theme", true) },
    );
    showMenu(trigger, items);
  }
  $("revMenu").addEventListener("click", (e) => reviewMenu(e.currentTarget as HTMLElement));
  $("navPrev").addEventListener("click", () => step(-1));
  $("navNext").addEventListener("click", () => step(1));

  // Plan et commentaires à gauche, marge de revue à droite : ils se replient
  // quand le panneau rétrécit ; le bouton de la barre garde le choix.
  let sidePref: string | null = (() => { try { return localStorage.getItem("docxSide"); } catch { return null; } })();
  function responsive() {
    const w = innerWidth;
    const b = document.body.classList;
    const side = sidePref === "1" ? true : sidePref === "0" ? false : w >= 1280;
    b.toggle("no-side", !side);
    $("btnNav").classList.toggle("on", side);
    $("btnNav").setAttribute("aria-pressed", String(side));
    // La barre se replie par paliers tant qu'elle déborde.
    b.toggle("w1", w < 1320);
    b.toggle("w2", w < 1040);
    b.toggle("w3", w < 720);
    const over = () => fmtbar.scrollWidth > fmtbar.clientWidth + 1;
    if (!b.contains("w1") && over()) b.add("w1");
    if (!b.contains("w2") && over()) b.add("w2");
    if (!b.contains("w3") && over()) b.add("w3");
  }
  $("btnNav").addEventListener("click", () => {
    sidePref = document.body.classList.contains("no-side") ? "1" : "0";
    try { localStorage.setItem("docxSide", sidePref); } catch { /* choix gardé pour la session */ }
    responsive();
    renderSide();
    layoutCards();
  });
  responsive();

  function currentPara(): Para | null {
    const sel = readSel();
    return sel && model ? model.paragraphs[sel.a.idx] || null : null;
  }
  /** Mise en forme sous le curseur, ou du premier caractère sélectionné. */
  function currentSeg() {
    const sel = readSel();
    return sel ? segAt(sel.a.off === sel.b.off || sel.a.idx !== sel.b.idx ? sel.a : { idx: sel.a.idx, off: sel.a.off + 1 }) : null;
  }

  function syncToolbar() {
    if (!model) return;
    const sel = readSel();
    const p = sel ? model.paragraphs[sel.a.idx] : null;
    const seg = currentSeg();
    const style = model.styles.find((s) => s.id === (p?.style || "Normal"));
    // Police et taille du passage, sinon celles que le style donne au paragraphe.
    const label = (id: string, name: string, v: string) => { ($(id).firstElementChild as HTMLElement).textContent = v; $(id).setAttribute("aria-label", `${name} : ${v}`); };
    const size = seg?.size || p?.look?.size;
    label("ddStyle", "Style", styleLabel(style ? style.name : (p?.style || "Normal")));
    label("ddFont", "Police", seg?.font || p?.look?.font || "Police du style");
    label("ddSize", "Taille", size ? String(size).replace(".", ",") : "–");
    fmtbar.querySelectorAll<HTMLElement>("[data-run]").forEach((b) => {
      const on = !!(seg && (seg as Record<string, unknown>)[b.dataset.run!]);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const al = ALIGN.find(([a]) => a === (p?.align || "left")) || ALIGN[0];
    const alIcon = $("btnAlign").firstElementChild as HTMLElement;
    if (alIcon.dataset.al !== al[0]) { alIcon.dataset.al = al[0]; alIcon.innerHTML = al[2]; }
  }

  async function decideAll(op: string, who?: string) {
    structural(async () => {
      const ok = await sendOp({ op, author: who ?? null });
      if (ok) status(op === "accept_all" ? "Modifications acceptées" : "Modifications refusées");
    });
  }

  // ------------------------------------------------------- marge de revue
  // À droite de la page : une fiche par commentaire, alignée sur son passage,
  // et une rangée par paragraphe retouché, qui s'ouvre sur ses modifications.
  type LaneItem = { key: string; kind: "chip" | "comment" | "draft"; idx: number; anchor: HTMLElement | null; ids: number[]; author: string; done?: boolean };
  let lane: LaneItem[] = [];
  let navOrder: string[] = [];
  let changeMap = new Map<number, Change>();
  let commentMap = new Map<number, Comment>();
  const openChips = new Set<string>();
  /** Commentaire en cours d'écriture, sur un passage d'un paragraphe. */
  let draft: { idx: number; s: number; e: number; quote: string; pid: string; lost?: boolean } | null = null;
  /** Réponses en cours d'écriture, par fiche : un redessin ou Échap ne les perd pas. */
  const replyDrafts = new Map<string, string>();
  // Brouillons de réponse de l'agent (Thierry, 2026-11-12 : « Brouillon,
  // signé Thierry ») : « Proposer » demande au chat une réponse que l'agent
  // pose hors du document (atelier_docx draft_reply) ; le sondage la verse
  // dans le champ, l'utilisateur la relit et l'envoie sous son nom.
  type AgentDraft = { text: string; author: string; at: number };
  let agentDrafts: Record<string, AgentDraft> = {};
  let agentDraftsSig = "";
  /** Commentaires dont on attend le brouillon, et depuis quand. */
  const asking = new Map<number, number>();
  /** Brouillons écartés par « Arrêter » jusqu'à la prochaine demande. */
  const muted = new Set<number>();
  /** Suivis connus au moment de la demande : les nouveaux de l'agent sont ses corrections. */
  const fixBase = new Map<number, Set<number>>();
  const ASK_TIMEOUT_MS = 4 * 60_000;
  /** Suivis en cours de décision : un double-clic n'envoie pas deux fois. */
  const deciding = new Set<number>();
  const leader = $("leader");

  const KIND: Record<string, string> = {
    ins: "Insertion", del: "Suppression", moveTo: "Déplacé ici", moveFrom: "Déplacement", "paragraph-ins": "Paragraphe ajouté",
    "paragraph-del": "Paragraphes fusionnés", "row-ins": "Ligne ajoutée", "row-del": "Ligne supprimée", format: "Mise en forme", cell: "Cellule",
  };
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juill.", "août", "sept.", "oct.", "nov.", "déc."];
  // Word inscrit l'heure locale suivie de « Z » : on la lit telle quelle.
  const when = (d?: string) => { const x = d ? new Date(d) : null; return x && !isNaN(+x) ? x : null; };
  const dateFr = (d?: string) => { const x = when(d); return x ? `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}` : ""; };
  const timeFr = (d?: string) => { const x = when(d); return x ? `${x.getUTCHours()} h ${String(x.getUTCMinutes()).padStart(2, "0")}` : ""; };
  const nf = (n: number) => n.toLocaleString("fr-CA");
  const pl = (n: number, one: string, many: string) => `${nf(n)} ${n > 1 ? many : one}`;
  const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
  const clip = (s: string, n = 140) => (cp(s) > n ? Array.from(s).slice(0, n).join("") + "…" : s);
  const firstName = (s: string) => (s || "Inconnu").split(/\s+/)[0];
  const initialsOf = (s: string) => s.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase() || "?";
  const isTop = (c: Comment) => c.parent === undefined || c.parent === null;
  const avatar = (name: string, small = false, initials?: string) =>
    `<span class="av${small ? " s" : ""}" style="--who:${uiColor(name)}">${esc(initials || initialsOf(name || "?"))}</span>`;
  const kindLabel = (c: Change) => (c.kind === "ins" ? "Insertion" : c.kind === "del" ? "Suppression" : c.kind.startsWith("move") ? "Déplacement" : KIND[c.kind] || c.kind);

  function collectLane(): LaneItem[] {
    if (!model) return [];
    const m = model;
    const items: LaneItem[] = [];
    const nodes = new Map((Array.from(paper.querySelectorAll<HTMLElement>(".d-p[data-idx]"))).map((el) => [Number(el.dataset.idx), el] as const));
    const idxOf = new Map<string, number>();
    m.paragraphs.forEach((p, i) => { if (!idxOf.has(p.id)) idxOf.set(p.id, i); });
    // Modifications groupées par paragraphe, dans l'ordre du texte.
    const per = new Map<number, number[]>();
    const seen = new Set<number>();
    const add = (idx: number, id: number) => {
      if (seen.has(id) || !changeMap.has(id)) return;
      seen.add(id);
      const l = per.get(idx);
      if (l) l.push(id); else per.set(idx, [id]);
    };
    m.paragraphs.forEach((p, idx) => {
      if (p.mark_change !== undefined) add(idx, p.mark_change);
      for (const s of p.segments) if (s.change !== undefined) add(idx, s.change);
    });
    const loose: number[] = [];
    for (const c of m.changes) {
      if (seen.has(c.id)) continue;
      const idx = c.paragraph ? idxOf.get(c.paragraph) : undefined;
      if (idx !== undefined) add(idx, c.id);
      else { seen.add(c.id); loose.push(c.id); }
    }
    for (const [idx, ids] of per) {
      const p = m.paragraphs[idx];
      items.push({ key: `p${p.para_id || p.id}`, kind: "chip", idx, anchor: nodes.get(idx) || null, ids, author: changeMap.get(ids[0])?.author ?? "" });
    }
    if (loose.length) items.push({ key: "loose", kind: "chip", idx: 1e9, anchor: null, ids: loose, author: changeMap.get(loose[0])?.author ?? "" });
    // Fiches de commentaire : ancrées au premier passage surligné.
    const first = new Map<number, HTMLElement>();
    for (const el of Array.from(paper.querySelectorAll<HTMLElement>(".cmt[data-c]"))) {
      for (const id of el.dataset.c!.split(" ")) if (!first.has(Number(id))) first.set(Number(id), el);
    }
    for (const c of m.comments) {
      if (!isTop(c)) continue;
      const idx = c.paragraph ? idxOf.get(c.paragraph) ?? -1 : -1;
      items.push({ key: `c${c.id}`, kind: "comment", idx: idx >= 0 ? idx : 1e9, anchor: first.get(c.id) || (idx >= 0 ? nodes.get(idx) || null : null), ids: [c.id], author: c.author, done: c.done });
    }
    if (draft) items.push({ key: "draft", kind: "draft", idx: draft.idx, anchor: nodes.get(draft.idx) || null, ids: [], author });
    return items;
  }

  function commentHTML(c: Comment, on: boolean): string {
    if (c.done && !on) return `<div class="cc dn" role="button" tabindex="0">${ic("circleCheck", 14)}<span>Réglé · ${esc(oneLine(c.text))}</span></div>`;
    const head = (who: string, ini: string, d: string) =>
      `<div class="hd">${avatar(who, false, ini)}<span class="nm">${esc(firstName(who))}</span><span class="dt">${d}</span></div>`;
    const replies = model!.comments.filter((r) => r.parent === c.id);
    // Rappel du passage commenté : la fiche se rattache au texte d'un coup d'œil.
    const q = oneLine(c.quote || "");
    let h = q ? `<div class="qt" style="--who:${uiColor(c.author)}"><i></i><span>« ${esc(clip(q, 120))} »</span></div>` : "";
    h += head(c.author, c.initials, dateFr(c.date));
    h += `<p class="tx">${esc(c.text.trim())}</p>`;
    if (on) for (const r of replies) h += `<div class="rp">${head(r.author, r.initials, dateFr(r.date) || "À l'instant")}<p class="tx">${esc(r.text.trim())}</p></div>`;
    else if (replies.length) h += `<div class="meta">${pl(replies.length, "réponse", "réponses")}</div>`;
    if (on) {
      const field = `<textarea class="c-input" rows="1" placeholder="Répondre…" aria-label="Répondre à ${esc(firstName(c.author))}"></textarea>`;
      const ad = c.done || muted.has(c.id) ? null : agentDrafts[String(c.id)] || null;
      const waiting = !c.done && asking.has(c.id);
      if (waiting) {
        h += `<div class="c-wait" role="status">${ic("bot", 14)}<span>Rédaction du brouillon</span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><button class="btn q in" data-act="stop">Arrêter</button></div>`;
      } else if (ad) {
        h += `<div class="c-by">${ic("bot", 12)}<span>Brouillon de ${esc(firstName(ad.author))}, à relire</span><button class="lk" data-act="redo" data-tooltip="Demander une autre formulation">Refaire</button></div><div class="c-field">${field}</div>`;
      } else if (!c.done) {
        h += `<div class="c-field ask">${field}<button class="btn q in" data-act="propose" data-tooltip="L'agent du chat rédige une réponse que tu relis avant d'envoyer">${ic("bot", 14)}Proposer</button></div>`;
      } else h += field;
      // Un remplacement = un retrait et un ajout : on compte les passages touchés.
      const fixed = new Set(agentFixes(c.id).map((id) => changeMap.get(id)?.paragraph ?? `#${id}`)).size;
      if (fixed) h += `<div class="c-fix"><span>Et ${fixed === 1 ? "<b>1 correction</b>" : `<b>${fixed} corrections</b>`} en suivi dans le texte</span><button class="lk" data-act="see-fix">Voir</button></div>`;
      h += `<div class="ac"><button class="btn q" data-act="resolve">${c.done ? "Rouvrir" : `${ic("check", 14)}Résoudre`}</button>
        <button class="mini" data-act="ask" aria-label="Envoyer au chat" data-tooltip="Envoyer au chat">${ic("chat", 14)}</button>
        <button class="mini no" data-act="delete" aria-label="Supprimer le commentaire" data-tooltip="Supprimer le commentaire et ses réponses">${ic("trash", 14)}</button>
        <button class="btn p" data-act="reply"${!c.done && asking.has(c.id) ? " disabled" : ""}>Répondre</button></div>`;
    }
    return on ? `<div class="cc">${h}</div>` : `<div class="cc" role="button" tabindex="0" aria-label="Commentaire de ${esc(firstName(c.author))} : ${esc(clip(oneLine(c.text), 80))}">${h}</div>`;
  }
  function draftHTML(): string {
    return `<div class="cc"><div class="hd">${avatar(author)}<span class="nm">${esc(firstName(author))}</span><span class="dt">Brouillon</span></div>
      <textarea class="c-input" rows="2" placeholder="Écrire un commentaire…" aria-label="Commentaire"></textarea>
      <div class="ac"><button class="btn q" data-act="cancel">Annuler</button><button class="mini" data-act="ask" aria-label="Envoyer au chat" data-tooltip="Envoyer le passage et la note au chat">${ic("chat", 14)}</button><button class="btn p" data-act="post">Commenter</button></div></div>`;
  }
  function chipHTML(it: LaneItem, open: boolean): string {
    const list = it.ids.map((id) => changeMap.get(id)).filter(Boolean) as Change[];
    const n = list.length;
    // Fermée, la rangée est un seul arrêt du clavier ; ouverte, ses boutons aussi.
    const tab = open ? "" : ' tabindex="-1"';
    let h = `<div class="row" data-act="toggle" role="button" tabindex="0" aria-expanded="${open}">${avatar(it.author, true)}<span class="lbl"><b>${nf(n)}</b> ${n > 1 ? "modifications" : "modification"}${it.key === "loose" ? " hors du texte" : ""}</span>
      <span class="gr"><button class="mini no" data-act="rejectAll"${tab} aria-label="Tout refuser dans ce paragraphe" data-tooltip="Tout refuser ici">${ic("x", 14)}</button><button class="mini ok" data-act="acceptAll"${tab} aria-label="Tout accepter dans ce paragraphe" data-tooltip="Tout accepter ici">${ic("check", 14)}</button></span>
      <span class="cv">${ic("down", 14)}</span></div>`;
    if (open) {
      h += `<div class="lst">${list.map((c) => {
        const del = c.kind === "del" || c.kind === "moveFrom";
        const sign = c.kind === "ins" || c.kind === "moveTo" ? "+" : del ? "−" : "¶";
        const label = sign === "¶" ? `${KIND[c.kind] || c.kind}${c.text ? ` · ${clip(oneLine(c.text), 80)}` : ""}` : (oneLine(c.text) || (c.kind.startsWith("move") ? "Déplacement" : "Espace"));
        const tip = `${c.author} · ${kindLabel(c)}${c.date ? ` · ${dateFr(c.date)}, ${timeFr(c.date)}` : ""}`;
        return `<div class="cr${del ? " d" : ""}" data-ch="${c.id}" data-act="show" data-tooltip="${esc(tip)}"><span class="k" style="--who:${uiColor(c.author)}">${sign}</span><span class="t">${esc(clip(label, 120))}</span><span class="gr"><button class="mini no" data-act="reject" aria-label="Refuser : ${esc(clip(label, 60))}">${ic("x", 14)}</button><button class="mini ok" data-act="accept" aria-label="Accepter : ${esc(clip(label, 60))}">${ic("check", 14)}</button></span></div>`;
      }).join("")}</div>`;
    }
    return `<div class="ch${open ? " open" : ""}">${h}</div>`;
  }

  /** Avant/après dans le document, pour ordonner fiches et navigation. */
  function byPosition(a: LaneItem, b: LaneItem) {
    if (a.anchor && b.anchor && a.anchor !== b.anchor) return a.anchor.compareDocumentPosition(b.anchor) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    return a.idx - b.idx || (a.ids[0] ?? 0) - (b.ids[0] ?? 0);
  }

  function renderCards() {
    if (!model) return;
    changeMap = changeById();
    commentMap = new Map(model.comments.map((c) => [c.id, c] as const));
    lane = collectLane();
    navOrder = lane.filter((it) => it.kind === "comment" && !it.done).sort(byPosition).map((it) => it.key);
    if (focusKey && !lane.some((it) => it.key === focusKey)) focusKey = "";
    // Les fiches inchangées gardent leur élément (et leur hauteur mesurée) :
    // une réponse du disque ne reconstruit que ce qui a bougé.
    const prev = new Map((Array.from(cardsEl.children) as HTMLElement[]).map((el) => [el.dataset.key!, el]));
    // Ce que la marge tient en main avant le redessin : réponses en cours,
    // focus et sélection dans une zone de saisie, défilement des listes.
    for (const [key, el] of prev) {
      const ta = el.querySelector("textarea");
      if (ta && key !== "draft") { if (ta.value) replyDrafts.set(key, ta.value); else replyDrafts.delete(key); }
    }
    const act = document.activeElement as HTMLElement | null;
    const keep = act && cardsEl.contains(act) ? { key: (act.closest(".it") as HTMLElement | null)?.dataset.key, ta: act.tagName === "TEXTAREA", s: (act as HTMLTextAreaElement).selectionStart, e: (act as HTMLTextAreaElement).selectionEnd } : null;
    const lists = new Map<string, number>();
    for (const [key, el] of prev) { const l = el.querySelector(".lst"); if (l && l.scrollTop) lists.set(key, l.scrollTop); }
    const frag = document.createDocumentFragment();
    for (const it of lane) {
      if (it.kind === "chip" && view !== "revue") continue;
      const on = it.key === focusKey;
      const html = it.kind === "chip" ? chipHTML(it, openChips.has(it.key)) : it.kind === "draft" ? draftHTML() : commentHTML(commentMap.get(it.ids[0])!, on);
      let el = prev.get(it.key);
      if (!el) {
        el = document.createElement("div");
        el.className = "it";
        el.dataset.key = it.key;
      }
      if (el.dataset.html !== html) {
        const ta = el.querySelector("textarea");
        const was = ta ? ta.value : "";
        el.innerHTML = html;
        el.dataset.html = html;
        const next = el.querySelector("textarea");
        const back = it.kind === "draft" ? was : replyDrafts.get(it.key) || "";
        if (next && back) next.value = back;
        if (next) fitInput(next);
      }
      el.classList.toggle("on", on);
      el.classList.toggle("grp", it.kind === "chip");
      if (it.kind === "chip") el.dataset.ids = it.ids.join(" ");
      frag.appendChild(el);
    }
    cardsEl.replaceChildren(frag);
    for (const [key, top] of lists) { const l = cardsEl.querySelector(`[data-key="${key}"] .lst`); if (l) l.scrollTop = top; }
    if (keep?.key) {
      const host = cardsEl.querySelector(`[data-key="${keep.key}"]`);
      const t = keep.ta ? host?.querySelector("textarea") : null;
      if (t) { t.focus({ preventScroll: true }); try { t.setSelectionRange(keep.s, keep.e); } catch { /* zone remplacée */ } }
    }
    // Passages commentés : actif en évidence, réglés sans fond.
    const active = focusKey.startsWith("c") ? Number(focusKey.slice(1)) : -1;
    for (const el of Array.from(paper.querySelectorAll<HTMLElement>(".cmt[data-c]"))) {
      const ids = el.dataset.c!.split(" ").map(Number);
      el.classList.toggle("done", ids.every((id) => commentMap.get(id)?.done !== false));
      el.classList.toggle("on", ids.includes(active));
    }
    paintDraft();
    layoutCards();
    renderSide();
    paintNotes();
  }

  function layoutCards() {
    const b = document.body.classList;
    // La marge prend 360 px : si la page doit alors tomber sous 75 %, les
    // fiches passent en fenêtre et la page garde sa taille.
    // Le bouton « Commentaires » peut la fermer (laneOff) ou, faute de place,
    // la poser par-dessus la page (lane-over) ; pendant que l'app élargit le
    // panneau (holdPt), elle reste ouverte et se dévoile avec lui.
    const pg = model?.page;
    const room = scroller.clientWidth - 24 - 360;
    const narrow = !holdPt && (innerWidth < 760 || (!!pg && zoom === null && room < pg.width * PT * 0.75));
    if (!narrow) laneOver = false;
    b.toggle("no-lane", laneOff || (narrow && !laneOver));
    b.toggle("lane-over", !laneOff && narrow && laneOver);
    if (!b.contains("no-lane")) { b.remove("lane-pop"); cardsEl.style.removeProperty("width"); cardsEl.style.removeProperty("top"); }
    // Sans fiche à montrer, la marge disparaît : la page reprend la largeur du panneau.
    b.toggle("no-margin", !cardsEl.childElementCount || b.contains("no-lane"));
    syncLaneBtn();
    fitPage();
    placeCards();
  }

  /** Rectangle du passage d'une fiche ; l'ancrage est retrouvé si la frappe a
   *  redessiné son paragraphe, et le paragraphe sert de repli quand le passage
   *  est masqué (Lecture, Original). */
  function anchorRect(it: LaneItem, line = false): DOMRect | null {
    let a = it.anchor;
    if (a && !a.isConnected) {
      a = (it.kind === "comment" ? paper.querySelector<HTMLElement>(`.cmt[data-c~="${it.ids[0]}"]`) : null) || paper.querySelector<HTMLElement>(`.d-p[data-idx="${it.idx}"]`);
      it.anchor = a;
    }
    if (!a) return null;
    if (!line) { const q = a.getClientRects()[0]; if (q) return q; }
    const p = line ? a : (a.closest(".d-p") as HTMLElement | null);
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return r.height ? r : null;
  }

  function placeCards() {
    updateNav();
    if (document.body.classList.contains("no-lane")) { placePop(); return; }
    if (document.body.classList.contains("no-margin")) { leader.classList.remove("on"); return; }
    const els = Array.from(cardsEl.children) as HTMLElement[];
    // La marge reste fixée au bord droit du panneau : seul le document zoome.
    // Elle ne suit la page que si celle-ci, agrandie, déborde jusque-là.
    const left = `${Math.max(paper.offsetLeft + paper.offsetWidth + 24, scroller.clientWidth - 24 - cardsEl.offsetWidth)}px`;
    if (cardsEl.style.left !== left) cardsEl.style.left = left;
    // Lectures d'abord, puis toutes les écritures : une seule mise en page
    // pour toute la marge (des centaines de fiches sur une copie révisée).
    const base = cardsEl.getBoundingClientRect().top;
    const byKey = new Map(lane.map((c) => [c.key, c]));
    const dr = draft ? draftRange() : null;
    const rows = els.map((el) => {
      const it = byKey.get(el.dataset.key!)!;
      let y = 1e6;
      if (it.kind === "draft" && dr) {
        const q = dr.getClientRects()[0] || dr.getBoundingClientRect();
        y = q.top + q.height / 2 - base - 22;
      } else if (it.kind === "chip") {
        // Rangée centrée sur la première ligne du paragraphe.
        const r = anchorRect(it, true);
        if (r) {
          const cs = getComputedStyle(it.anchor!);
          const line = parseFloat(cs.lineHeight) || 20;
          y = r.top + (parseFloat(cs.paddingTop) || 0) + line / 2 - base - 16;
        }
      } else {
        const q = anchorRect(it);
        if (q) y = q.top + Math.min(q.height, 24) / 2 - base - 22;
      }
      return { el, it, y, h: el.offsetHeight, pos: 0 };
    });
    rows.sort((a, b) => a.y - b.y || (a.it.kind === "chip" ? -1 : 1) - (b.it.kind === "chip" ? -1 : 1));
    const GAP_Y = 8;
    const k = rows.findIndex((r) => r.it.key === focusKey);
    if (k < 0) {
      let bottom = 0;
      for (const r of rows) { r.pos = Math.max(r.y === 1e6 ? bottom : r.y, bottom); bottom = r.pos + r.h + GAP_Y; }
    } else {
      // La fiche active reste en face de son passage ; les autres s'écartent.
      rows[k].pos = Math.max(0, rows[k].y === 1e6 ? 0 : rows[k].y);
      let bottom = rows[k].pos + rows[k].h + GAP_Y;
      for (let i = k + 1; i < rows.length; i++) { rows[i].pos = Math.max(rows[i].y === 1e6 ? bottom : rows[i].y, bottom); bottom = rows[i].pos + rows[i].h + GAP_Y; }
      let top = rows[k].pos - GAP_Y;
      for (let i = k - 1; i >= 0; i--) { rows[i].pos = Math.min(rows[i].y, top - rows[i].h); top = rows[i].pos - GAP_Y; }
    }
    let end = 0;
    rows.forEach((r, i) => {
      const t = `translate(${i === k && r.it.kind !== "chip" ? -8 : 0}px, ${Math.round(r.pos)}px)`;
      if (r.el.style.transform !== t) r.el.style.transform = t;
      end = Math.max(end, r.pos + r.h);
    });
    cardsEl.style.height = `${Math.max(0, end)}px`;
    // Trait de rappel entre le passage et la fiche active.
    const pg = model?.page;
    if (k >= 0 && rows[k].it.kind !== "chip" && rows[k].y !== 1e6) {
      const x0 = paper.offsetLeft + paper.offsetWidth - (pg ? pg.right * ptPx : 64) + 8;
      const x1 = cardsEl.offsetLeft - 12;
      leader.style.left = `${x0}px`;
      leader.style.width = `${Math.max(0, x1 - x0)}px`;
      leader.style.top = `${cardsEl.offsetTop + rows[k].pos + 22}px`;
      leader.classList.add("on");
    } else leader.classList.remove("on");
  }

  /** Panneau étroit : la fiche active s'ouvre en fenêtre sous son passage. */
  function placePop() {
    const el = cardsEl.querySelector<HTMLElement>(".it.on");
    const it = el ? lane.find((c) => c.key === el.dataset.key) : null;
    const dr = it?.kind === "draft" ? draftRange() : null;
    const q = dr ? dr.getClientRects()[0] || dr.getBoundingClientRect() : it ? anchorRect(it) : null;
    const sr = scroller.getBoundingClientRect();
    const on = !!(el && q && q.bottom > sr.top && q.top < sr.bottom);
    document.body.classList.toggle("lane-pop", on);
    if (!on) return;
    const w = Math.min(312, innerWidth - 32);
    const h = cardsEl.offsetHeight;
    let y = q!.bottom + 8;
    if (y + h > sr.bottom - 8 && q!.top - h - 8 > sr.top) y = q!.top - h - 8;
    cardsEl.style.width = `${w}px`;
    cardsEl.style.left = `${Math.max(16, Math.min(innerWidth - w - 16, q!.left + q!.width / 2 - w / 2))}px`;
    cardsEl.style.top = `${Math.max(sr.top + 8, y)}px`;
  }

  // ------------------------------------------- bouton « Commentaires »
  // Ouvrir la marge quand le panneau est trop étroit : l'app élargit le
  // panneau d'exactement la place qui manque (la page garde sa taille, ou
  // atteint les 75 % sous lesquels la marge ne tient pas) ; sans app ou sans
  // place, la marge s'ouvre par-dessus le bord de la page. La fermer rend au
  // panneau sa largeur d'avant.
  const LANE_NONCE = (() => {
    try { const m = location.hash.match(/atelier_nonce=([\w-]+)/); return m ? m[1] : sessionStorage.getItem("atelier_nonce") || ""; }
    catch { return ""; }
  })();
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function syncLaneBtn() {
    const laneBtn = $("btnLane");
    const any = cardsEl.childElementCount > 0;
    const on = any && !document.body.classList.contains("no-lane");
    laneBtn.classList.toggle("on", on);
    laneBtn.setAttribute("aria-pressed", String(on));
    (laneBtn as HTMLButtonElement).disabled = !any;
    laneBtn.dataset.tooltip = !any ? "Aucun commentaire ni modification"
      : on ? "Masquer les commentaires (⇧⌘M)" : "Afficher les commentaires (⇧⌘M)";
  }
  function askPane(action: "widen" | "restore", px: number) {
    clearTimeout(paneWait);
    paneAction = action;
    parent.postMessage({ type: "atelier-docx-pane", action, px, nonce: LANE_NONCE }, "*");
    // Sans réponse (galerie seule, banc d'essai), on n'attend pas plus.
    paneWait = window.setTimeout(() => paneDone(action, false), 700);
  }
  function paneDone(action: string, ok: boolean) {
    clearTimeout(paneWait);
    paneWait = 0;
    paneAction = "";
    holdPt = 0;
    document.body.classList.remove("lane-in");
    if (action === "widen") { widened = ok; laneOver = true; }
    layoutCards();
  }
  window.addEventListener("message", (e) => {
    const d = e.data as { type?: string; action?: string; ok?: boolean } | null;
    if (e.source !== parent || d?.type !== "atelier-docx-pane-done") return;
    if (paneWait && d.action === paneAction) paneDone(d.action, d.ok === true);
    // Réponse arrivée après l'attente : le panneau a quand même été élargi,
    // il faudra le rendre en fermant la marge.
    else if (!paneWait && d.action === "widen" && d.ok === true && !laneOff) { widened = true; layoutCards(); }
  });
  function closeLane() {
    settleStretch();
    const b = document.body.classList;
    const finish = () => {
      b.remove("lane-out");
      laneOff = true;
      laneOver = false;
      try { localStorage.setItem(LANE_KEY, "1"); } catch { /* choix gardé pour la session */ }
      if (widened && parent !== window) { widened = false; holdPt = ptPx; askPane("restore", 0); }
      layoutCards();
    };
    if (reduced()) { finish(); return; }
    b.add("lane-out");
    window.setTimeout(finish, 120);
  }
  function openLane() {
    settleStretch();
    const b = document.body.classList;
    laneOff = false;
    try { localStorage.removeItem(LANE_KEY); } catch { /* choix gardé pour la session */ }
    const pg = model?.page;
    let need = Math.max(0, 760 - innerWidth);
    if (pg && zoom === null) need = Math.max(need, Math.max(ptPx, PT * 0.75) * pg.width + 24 + 360 - scroller.clientWidth);
    need = Math.ceil(need);
    if (need > 0 && parent === window) laneOver = true;
    else if (need > 0) {
      holdPt = zoom === null ? Math.max(ptPx, PT * 0.75) : 0;
      if (!reduced()) b.add("lane-in");
      askPane("widen", need);
    }
    layoutCards();
  }
  const laneBtn = $("btnLane");
  laneBtn.addEventListener("click", () => {
    if (paneWait || document.body.classList.contains("lane-out")) return;
    if (document.body.classList.contains("no-lane")) openLane(); else closeLane();
  });
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey || e.code !== "KeyM") return;
    e.preventDefault();
    if (!(laneBtn as HTMLButtonElement).disabled) laneBtn.click();
  });

  function updateNav() {
    const n = navOrder.indexOf(focusKey);
    $("navLbl").innerHTML = !navOrder.length ? "Aucun commentaire"
      : n >= 0 ? `Commentaire <b>${n + 1}</b> sur ${nf(navOrder.length)}` : pl(navOrder.length, "commentaire", "commentaires");
  }

  const smooth = (): ScrollBehavior => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
  /** Amène un passage dans la vue s'il en est sorti. */
  function reveal(el: Element | Range | null) {
    if (!el) return;
    // Passage masqué (Lecture, Original) : son paragraphe.
    if (el instanceof Element && !el.getClientRects().length) el = el.closest(".d-p");
    if (!el || !el.getClientRects().length) return;
    const q = el.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
    if (q.top < sr.top + 80 || q.bottom > sr.bottom - 160) scroller.scrollBy({ top: q.top - sr.top - sr.height / 3, behavior: smooth() });
  }

  function focusCard(key: string, scroll: boolean) {
    focusKey = key;
    hideBubble();
    renderCards();
    const it = lane.find((c) => c.key === key);
    if (it && scroll) reveal(it.anchor);
  }

  function step(dir: number) {
    if (!navOrder.length) return;
    const n = navOrder.indexOf(focusKey);
    focusCard(navOrder[n < 0 ? (dir > 0 ? 0 : navOrder.length - 1) : (n + dir + navOrder.length) % navOrder.length], true);
  }

  function decide(ids: number[], act: "accept" | "reject", note?: string) {
    ids = ids.filter((id) => !deciding.has(id));
    if (!ids.length) return;
    ids.forEach((id) => deciding.add(id));
    hideBubble();
    structural(async () => {
      try {
        const ops = ids.map((id) => ({ op: act, id }));
        const ok = await sendOp(ops.length === 1 ? ops[0] : { op: "batch", ops });
        if (ok && note) status(note);
      } finally { ids.forEach((id) => deciding.delete(id)); }
    });
  }

  /** Le champ de réponse grandit avec son texte (un brouillon tient sur plusieurs lignes). */
  function fitInput(ta: HTMLTextAreaElement) {
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight + 2, 240)}px`;
  }

  /** Suivis posés par l'agent depuis la demande de brouillon. */
  function agentFixes(id: number): number[] {
    const base = fixBase.get(id);
    if (!base || !model) return [];
    return model.changes.filter((ch) => !base.has(ch.id) && AGENT.test(ch.author)).map((ch) => ch.id);
  }

  /** Ce que l'agent lit : le commentaire, son fil, et la consigne. */
  function replyPrompt(c: Comment, previous?: string): string {
    const replies = model!.comments.filter((r) => r.parent === c.id).map((r) => `\n  ↳ ${r.author} : ${r.text}`).join("");
    const who = firstName(c.author);
    return `${PATH} (commentaire c${c.id}${c.paragraph ? `, ${c.paragraph}` : ""}) — ${c.author} sur « ${c.quote} » : ${c.text}${replies}\n\n`
      + `Propose-moi une réponse à ${who} : courte, en français, que je relirai et enverrai sous mon nom. `
      + `Pose-la avec atelier_docx action=draft_reply (comment=${c.id}), jamais reply. `
      + `Si le passage mérite une correction, pose-la aussi en suivi (action=edit).`
      + (previous ? ` Une autre formulation que celle-ci : « ${previous} ».` : "");
  }

  function proposeReply(c: Comment, previous?: string) {
    const core = W.AtelierStudioCore;
    if (!W.__atelierPost || !core || !core.requestChatAttachment) {
      status("Le chat d'Atelier n'est pas joignable depuis cette page.", true);
      return;
    }
    muted.delete(c.id);
    asking.set(c.id, Date.now());
    fixBase.set(c.id, new Set(model!.changes.map((ch) => ch.id)));
    renderCards();
    core.requestChatAttachment({ postToHost: W.__atelierPost, payload: { type: "atelier-add-to-chat", text: replyPrompt(c, previous), path: PATH, name: NAME, direct: true } })
      .then(() => status("Demandé au chat : le brouillon arrive dans la carte"))
      .catch((e: Error) => { asking.delete(c.id); renderCards(); status(e.message, true); });
  }

  function clearAgentDraft(id: number) {
    if (!agentDrafts[String(id)]) return;
    delete agentDrafts[String(id)];
    api("/docx/draft/clear", { path: PATH, comment: id }).catch(() => { /* il sera écrasé au prochain brouillon */ });
  }

  /** Brouillons lus au sondage : versés dans le champ s'il est vide (ou porte
   *  encore le brouillon précédent), sans jamais écraser ce que l'utilisateur tape. */
  function takeAgentDrafts(next: Record<string, AgentDraft>) {
    let fresh = "";
    for (const [key, d] of Object.entries(next)) {
      const id = Number(key);
      const prev = agentDrafts[key];
      if (prev && prev.at === d.at) continue;
      if (muted.has(id)) continue;
      asking.delete(id);
      const card = `c${id}`;
      const ta = cardsEl.querySelector<HTMLTextAreaElement>(`[data-key="${card}"] textarea`);
      const typed = ta ? ta.value : replyDrafts.get(card) || "";
      if (!typed.trim() || (prev && typed === prev.text)) {
        replyDrafts.set(card, d.text);
        if (ta) ta.value = d.text;
      }
      fresh = d.author;
    }
    agentDrafts = next;
    renderCards();
    if (fresh) status(`Brouillon de ${firstName(fresh)} prêt dans la carte`);
  }

  /** Montre une modification dans la page, et la sélectionne de l'œil. */
  function showChange(id: number) {
    const els = Array.from(paper.querySelectorAll<HTMLElement>(`.ins[data-ch="${id}"],.del[data-ch="${id}"]`));
    paper.querySelectorAll(".ins.sel,.del.sel").forEach((x) => x.classList.remove("sel"));
    els.forEach((x) => x.classList.add("sel"));
    reveal(els[0] || paper.querySelector(`.d-p[data-ch="${id}"]`));
  }

  // Les boutons de la marge ne volent pas la sélection de la page.
  cardsEl.addEventListener("mousedown", (e) => {
    if (!(e.target as HTMLElement).closest("textarea")) e.preventDefault();
  });
  cardsEl.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const host = t.closest(".it") as HTMLElement | null;
    if (!host) return;
    const it = lane.find((c) => c.key === host.dataset.key);
    if (!it) return;
    const act = (t.closest("[data-act]") as HTMLElement | null)?.dataset.act;
    if (it.kind === "chip") {
      const row = t.closest(".cr") as HTMLElement | null;
      if (act === "acceptAll" || act === "rejectAll") {
        openChips.delete(it.key);
        decide(it.ids, act === "acceptAll" ? "accept" : "reject", act === "acceptAll" ? "Paragraphe accepté" : "Paragraphe refusé");
      } else if ((act === "accept" || act === "reject") && row) decide([Number(row.dataset.ch)], act);
      else if (act === "show" && row) showChange(Number(row.dataset.ch));
      else {
        if (openChips.has(it.key)) openChips.delete(it.key); else openChips.add(it.key);
        renderCards();
      }
      return;
    }
    if (it.kind === "draft") {
      if (act === "cancel") cancelDraft();
      else if (act === "post") postDraft();
      else if (act === "ask" && draft) {
        const note = (host.querySelector("textarea") as HTMLTextAreaElement | null)?.value.trim() || "";
        const q = `${PATH} (${model!.paragraphs[draft.idx]?.id ?? draft.pid}) : « ${draft.quote} »`;
        toChat(note ? `${q}\n${note}` : q);
        cancelDraft();
      }
      return;
    }
    const c = commentMap.get(it.ids[0]);
    if (!c) return;
    const ta = host.querySelector("textarea");
    if (act === "propose") { proposeReply(c); return; }
    if (act === "stop") { asking.delete(c.id); muted.add(c.id); renderCards(); status("Brouillon abandonné"); return; }
    if (act === "redo") {
      const previous = agentDrafts[String(c.id)]?.text;
      if (ta && previous && ta.value === previous) ta.value = "";
      replyDrafts.delete(it.key);
      clearAgentDraft(c.id);
      proposeReply(c, previous);
      return;
    }
    if (act === "see-fix") { const f = agentFixes(c.id); if (f.length) showChange(f[0]); return; }
    if (act === "resolve") {
      structural(async () => {
        const ok = await sendOp({ op: "resolve", id: c.id, done: !c.done });
        if (ok && !c.done) { if (focusKey === it.key) { focusKey = ""; renderCards(); } status("Commentaire réglé"); }
      });
    } else if (act === "reply") {
      const text = ta ? ta.value.trim() : "";
      if (!text) { ta?.focus(); return; }
      ta!.value = "";
      replyDrafts.delete(it.key);
      structural(async () => {
        const ok = await sendOp({ op: "reply", parent: c.id, text });
        if (ok) { clearAgentDraft(c.id); fixBase.delete(c.id); asking.delete(c.id); renderCards(); }
        if (!ok) { const again = cardsEl.querySelector(`[data-key="${it.key}"] textarea`) as HTMLTextAreaElement | null; if (again && !again.value) again.value = text; }
      });
    } else if (act === "delete") {
      structural(async () => { await sendOp({ op: "delete_comment", id: c.id }); });
    } else if (act === "ask") {
      const replies = model!.comments.filter((r) => r.parent === c.id).map((r) => `\n  ↳ ${r.author} : ${r.text}`).join("");
      toChat(`${PATH} (commentaire c${c.id}${c.paragraph ? `, ${c.paragraph}` : ""}) — ${c.author} sur « ${c.quote} » : ${c.text}${replies}`);
    } else if (focusKey !== it.key) focusCard(it.key, true);
  });
  cardsEl.addEventListener("input", (e) => {
    const ta = e.target as HTMLElement;
    if (ta.classList.contains("c-input")) fitInput(ta as HTMLTextAreaElement);
  });
  cardsEl.addEventListener("keydown", (e) => {
    const ta = e.target as HTMLElement;
    if ((e.key === "Enter" || e.key === " ") && ta.getAttribute("role") === "button") { e.preventDefault(); ta.click(); return; }
    if (ta.tagName !== "TEXTAREA") return;
    const host = ta.closest(".it") as HTMLElement | null;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      host?.querySelector<HTMLElement>(host.dataset.key === "draft" ? '[data-act="post"]' : '[data-act="reply"]')?.click();
    } else if (e.key === "Escape" && host?.dataset.key === "draft") { e.preventDefault(); cancelDraft(); }
  });
  window.addEventListener("resize", () => { responsive(); layoutCards(); });
  // Le panneau change de taille sans que la fenêtre le sache (marge des
  // fiches, liste du document, iframe ré-affichée) : la page se recentre,
  // les calques la suivent ; une coupe faite à l'aveugle est refaite.
  let reflowFrame = 0;
  new ResizeObserver(() => {
    if (reflowFrame) return;
    reflowFrame = requestAnimationFrame(() => {
      reflowFrame = 0;
      if (!scroller.clientWidth) return;
      layoutCards();
      if (laidOutHidden) scheduleLines();
    });
  }).observe(scroller);

  // ---------------------------------------------- commentaire en brouillon
  const HL = typeof CSS !== "undefined" && "highlights" in CSS && typeof (window as unknown as { Highlight?: unknown }).Highlight === "function";
  type Highlights = { set(name: string, h: unknown): void; delete(name: string): void };
  const highlights = () => (CSS as unknown as { highlights: Highlights }).highlights;
  const makeHighlight = (ranges: Range[]) => new (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight(...ranges);
  /** Plage DOM d'un passage (paragraphe, début, fin en caractères). */
  function rangeAt(idx: number, s: number, e: number): Range | null {
    const a = domOf({ idx, off: s }), b = domOf({ idx, off: e });
    if (!a || !b) return null;
    const r = document.createRange();
    try { r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset); } catch { return null; }
    return r;
  }
  const draftRange = () => (draft && !draft.lost ? rangeAt(draft.idx, draft.s, draft.e) : null);
  /** Après une relecture du fichier, le brouillon retrouve son passage (le
   *  texte a pu bouger dans le paragraphe, ou le paragraphe changer de rang). */
  function rebaseDraft() {
    if (!draft || !model) return;
    const d = draft;
    let idx = d.idx;
    const pidOf = (q: Para) => q.para_id || q.id;
    if (!model.paragraphs[idx] || pidOf(model.paragraphs[idx]) !== d.pid) idx = model.paragraphs.findIndex((q) => pidOf(q) === d.pid);
    if (idx < 0) { d.lost = true; return; }
    const text = virtualText(idx);
    const n = cp(d.quote);
    let best = -1;
    if (d.quote) {
      for (let i = text.indexOf(d.quote); i >= 0; i = text.indexOf(d.quote, i + 1)) {
        const at = cp(text.slice(0, i));
        if (best < 0 || Math.abs(at - d.s) < Math.abs(best - d.s)) best = at;
      }
    }
    if (best < 0) { d.lost = true; return; }
    d.idx = idx; d.s = best; d.e = best + n; d.lost = false;
  }
  function paintDraft() {
    if (!HL) return;
    const r = draftRange();
    if (r) highlights().set("docx-draft", makeHighlight([r])); else highlights().delete("docx-draft");
  }
  function cancelDraft() {
    draft = null;
    if (focusKey === "draft") focusKey = "";
    renderCards();
  }
  function postDraft() {
    const ta = cardsEl.querySelector('[data-key="draft"] textarea') as HTMLTextAreaElement | null;
    const text = ta ? ta.value.trim() : "";
    if (!draft || !text) { ta?.focus(); return; }
    if (draft.lost) { status("Le passage a changé : sélectionne-le de nouveau pour commenter.", true); return; }
    const d = draft;
    const before = new Set(model!.comments.map((c) => c.id));
    structural(async () => {
      const ok = await sendOp({ op: "comment_range", paragraph: ref(d.idx), start: d.s, end: d.e, text }, () => null);
      if (!ok) return;
      draft = null;
      const made = model!.comments.find((c) => !before.has(c.id) && isTop(c));
      focusKey = made ? `c${made.id}` : "";
      renderCards();
    });
  }

  // ------------------------------------------------- bulle d'une modification
  const bub = $("bub");
  function hideBubble() {
    bubAnchor = null;
    bub.classList.remove("show");
    paper.querySelectorAll(".ins.sel,.del.sel").forEach((x) => x.classList.remove("sel"));
  }
  function changeBubble(el: HTMLElement) {
    const id = Number(el.dataset.ch);
    const c = changeMap.get(id);
    if (!c) return;
    const mine = c.author === author;
    showChange(id);
    const at = c.date ? `${dateFr(c.date)}, ${timeFr(c.date)}` : "";
    const acts = mine
      ? `<button class="mini no" data-act="reject" aria-label="Retirer ma retouche" data-tooltip="Retirer">${ic("x", 14)}</button>`
      : `<button class="mini no" data-act="reject" aria-label="Refuser" data-tooltip="Refuser">${ic("x", 14)}</button><button class="mini ok" data-act="accept" aria-label="Accepter" data-tooltip="Accepter">${ic("check", 14)}</button>`;
    bub.innerHTML = `${avatar(c.author, true)}<span class="w"><b>${esc(mine ? "Toi" : firstName(c.author))}</b> · ${kindLabel(c)}${at ? `<small>${at}</small>` : ""}</span>${acts}`;
    bub.dataset.ch = String(id);
    bubAnchor = el;
    bub.classList.add("show");
    placeBubble();
  }
  /** La bulle suit son passage quand la page défile ; elle part quand il sort. */
  let bubAnchor: HTMLElement | null = null;
  function placeBubble() {
    const el = bubAnchor;
    if (!el || !el.isConnected) { hideBubble(); return; }
    const q = el.getClientRects()[0] || el.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    if (q.bottom < sr.top || q.top > sr.bottom) { hideBubble(); return; }
    const w = bub.offsetWidth, h = bub.offsetHeight;
    let y = q.top - h - 6;
    if (y < sr.top + 8) y = q.bottom + 6;
    bub.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, q.left + q.width / 2 - w / 2))}px`;
    bub.style.top = `${y}px`;
  }
  bub.addEventListener("mousedown", (e) => e.preventDefault());
  bub.addEventListener("click", (e) => {
    const act = ((e.target as HTMLElement).closest("[data-act]") as HTMLElement | null)?.dataset.act;
    if (act === "accept" || act === "reject") decide([Number(bub.dataset.ch)], act);
  });
  document.addEventListener("mousedown", (e) => {
    const t = e.target as HTMLElement;
    if (bub.classList.contains("show") && !t.closest("#bub") && !t.closest(".ins[data-ch],.del[data-ch]")) hideBubble();
  });

  paper.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const s = getSelection();
    if (s && !s.isCollapsed) return;
    const ch = view === "revue" ? t.closest(".ins[data-ch],.del[data-ch]") as HTMLElement | null : null;
    if (ch) changeBubble(ch); else hideBubble();
    const cm = t.closest(".cmt[data-c]") as HTMLElement | null;
    if (cm) {
      const ids = cm.dataset.c!.split(" ").map(Number);
      const id = ids.find((x) => commentMap.get(x)?.done === false) ?? ids[0];
      if (focusKey !== `c${id}`) focusCard(`c${id}`, false);
    } else if (!ch && focusKey && focusKey !== "draft") {
      focusKey = "";
      renderCards();
    }
  });

  // ------------------------------------------------- plan et commentaires
  let tab: "plan" | "com" = "plan";
  const pane = $("pane");
  type Head = { idx: number; text: string; lvl: number };
  let heads: Head[] = [];
  /** Relecteur principal : l'auteur qui a le plus retouché ou commenté. */
  function reviewer(): string {
    if (!model) return "";
    let best = "", score = 0;
    for (const a of model.authors) {
      if (a.name === author || AGENT.test(a.name)) continue;
      if (a.changes + a.comments > score) { score = a.changes + a.comments; best = a.name; }
    }
    return best;
  }
  /** Section (titre de niveau 1) d'un paragraphe du corps. */
  function sectionOf(idx: number): string {
    let s = "";
    for (const h of heads) { if (h.idx > idx) break; if (h.lvl === 1) s = h.text; }
    return s;
  }
  function renderSide() {
    if (!model) return;
    const tops = model.comments.filter(isTop);
    const done = tops.filter((c) => c.done).length;
    const who = reviewer();
    const head = `${who ? avatar(who) : ""}<span>${who ? `Révision de ${esc(firstName(who))}` : "Révision"}</span>${ic("down", 12)}`;
    const rm = $("revMenu");
    if (rm.dataset.html !== head) { rm.innerHTML = head; rm.dataset.html = head; }
    ($("revBar") as HTMLElement).style.width = `${tops.length ? (100 * done / tops.length).toFixed(1) : 0}%`;
    $("revDone").textContent = tops.length ? `${nf(done)} réglé${done > 1 ? "s" : ""} sur ${nf(tops.length)}` : "Aucun commentaire";
    $("revCh").textContent = pl(model.changes.length, "modif", "modifs");
    $("tabComN").textContent = String(tops.length - done);
    heads = [];
    model.paragraphs.forEach((p, idx) => {
      // Le titre du document (niveau 0) n'est pas une section du plan.
      if (p.story || p.heading === undefined || p.heading === null || p.heading < 1) return;
      const text = oneLine(virtualText(idx));
      if (text) heads.push({ idx, text, lvl: p.heading <= 1 ? 1 : 2 });
    });
    if (document.body.classList.contains("no-side")) return;
    const idxOf = new Map<string, number>();
    model.paragraphs.forEach((p, i) => { if (!idxOf.has(p.id)) idxOf.set(p.id, i); });
    const cIdx = (c: Comment) => (c.paragraph ? idxOf.get(c.paragraph) ?? 1e9 : 1e9);
    let html = "";
    if (tab === "plan") {
      const open = tops.filter((c) => !c.done).map(cIdx).sort((a, b) => a - b);
      html = heads.length ? heads.map((h, k) => {
        // Une section compte aussi ses sous-sections.
        const nx = heads.findIndex((x, j) => j > k && x.lvl <= h.lvl);
        const end = nx >= 0 ? heads[nx].idx : model!.body ?? 1e9;
        const n = open.filter((i) => i >= h.idx && i < end).length;
        return `<button class="ol${h.lvl === 2 ? " l2" : ""}" data-i="${h.idx}"><span>${esc(h.text)}</span>${n ? `<i>${nf(n)}</i>` : ""}</button>`;
      }).join("") : `<div class="more">Aucun titre dans ce document.</div>`;
    } else {
      let sec: string | null = null;
      const items = lane.filter((it) => it.kind === "comment").sort(byPosition);
      for (const it of items) {
        const c = commentMap.get(it.ids[0])!;
        const s = it.idx < 1e9 ? sectionOf(it.idx) : "Hors du texte";
        if (s !== sec) { sec = s; if (s) html += `<div class="sect">${esc(s)}</div>`; }
        const replies = model.comments.filter((r) => r.parent === c.id).length;
        html += `<button class="cl${c.done ? " done" : ""}${focusKey === it.key ? " on" : ""}" data-key="${it.key}">${avatar(c.author, true, c.initials)}<span class="x"><p>${esc(oneLine(c.text))}</p><small>${dateFr(c.date)}${replies ? ` · ${pl(replies, "réponse", "réponses")}` : ""}</small></span></button>`;
      }
      if (!items.length) html = `<div class="more">Aucun commentaire dans ce document.</div>`;
    }
    if (pane.dataset.html !== html) { pane.innerHTML = html; pane.dataset.html = html; spyCur = -2; }
    if (tab === "com" && focusKey !== sideKey) { sideKey = focusKey; keepInPane(pane.querySelector<HTMLElement>(".cl.on")); }
    spy();
  }
  function setTab(next: "plan" | "com") {
    tab = next;
    $("tabPlan").setAttribute("aria-selected", String(tab === "plan"));
    $("tabCom").setAttribute("aria-selected", String(tab === "com"));
    $("tabPlan").tabIndex = tab === "plan" ? 0 : -1;
    $("tabCom").tabIndex = tab === "com" ? 0 : -1;
    pane.setAttribute("aria-labelledby", tab === "plan" ? "tabPlan" : "tabCom");
    renderSide();
  }
  $("tabPlan").addEventListener("click", () => setTab("plan"));
  $("tabCom").addEventListener("click", () => setTab("com"));
  // Flèches entre les deux onglets.
  for (const id of ["tabPlan", "tabCom"]) $(id).addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setTab(tab === "plan" ? "com" : "plan");
    $(tab === "plan" ? "tabPlan" : "tabCom").focus();
  });
  pane.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const o = t.closest(".ol") as HTMLElement | null;
    const c = t.closest(".cl") as HTMLElement | null;
    if (o) {
      const el = paper.querySelector(`.d-p[data-idx="${o.dataset.i}"]`);
      if (el) scroller.scrollBy({ top: el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 32, behavior: smooth() });
    } else if (c) focusCard(c.dataset.key!, true);
  });
  /** Section en cours dans le plan, page en cours dans le pied. */
  /** Garde l'entrée courante du panneau dans sa vue, sans faire défiler la page. */
  function keepInPane(el: HTMLElement | null) {
    if (!el) return;
    const r = el.getBoundingClientRect(), pr = pane.getBoundingClientRect();
    if (r.top < pr.top) pane.scrollTop += r.top - pr.top - 8;
    else if (r.bottom > pr.bottom) pane.scrollTop += r.bottom - pr.bottom + 8;
  }
  let spyCur = -2, sideKey = "";
  function spy() {
    if (!model) return;
    const sr = scroller.getBoundingClientRect();
    if (tab === "plan" && !document.body.classList.contains("no-side")) {
      let cur = -1;
      for (const h of heads) {
        const el = paper.querySelector(`.d-p[data-idx="${h.idx}"]`);
        if (el && el.getBoundingClientRect().top - sr.top < 140) cur = h.idx; else if (el) break;
      }
      if (cur !== spyCur) {
        spyCur = cur;
        for (const b of Array.from(pane.querySelectorAll<HTMLElement>(".ol"))) b.classList.toggle("cur", Number(b.dataset.i) === cur);
        keepInPane(pane.querySelector<HTMLElement>(".ol.cur"));
      }
    }
    const pg = model.page;
    if (pg) {
      const stride = pg.height * ptPx + GAP;
      const y = sr.top + sr.height / 2 - paper.getBoundingClientRect().top;
      $("ftPage").textContent = `Page ${nf(Math.min(pageCount, Math.max(1, Math.floor(y / stride) + 1)))} sur ${nf(pageCount)}`;
    } else $("ftPage").textContent = "";
  }
  let spyFrame = 0;
  scroller.addEventListener("scroll", () => {
    if (bub.classList.contains("show")) placeBubble();
    if (document.body.classList.contains("no-lane")) placePop();
    cancelAnimationFrame(spyFrame);
    spyFrame = requestAnimationFrame(spy);
  }, { passive: true });

  // ---------------------------------------------- chat, commentaire, signature
  function toChat(text: string) {
    const core = W.AtelierStudioCore;
    if (!W.__atelierPost || !core || !core.requestChatAttachment) {
      status("Le chat d'Atelier n'est pas joignable depuis cette page.", true);
      return;
    }
    core.requestChatAttachment({ postToHost: W.__atelierPost, payload: { type: "atelier-add-to-chat", text, path: PATH, name: NAME } })
      .then(() => status("Ajouté au chat"))
      .catch((e: Error) => status(e.message, true));
  }

  const pop = document.createElement("div");
  pop.className = "pop";
  document.body.appendChild(pop);
  function hidePop() { pop.classList.remove("show"); }
  function showPopAt(rect: DOMRect, html: string) {
    pop.innerHTML = html;
    pop.classList.add("show");
    pop.style.top = `${Math.min(innerHeight - pop.offsetHeight - 8, rect.bottom + 8)}px`;
    pop.style.left = `${Math.max(8, Math.min(innerWidth - 308, rect.left))}px`;
  }

  const UI = W.AtelierAnnotationUI;
  function quoteOf(sel: Sel) {
    return `${PATH} (${model!.paragraphs[sel.a.idx].id}${sel.b.idx !== sel.a.idx ? `-${model!.paragraphs[sel.b.idx].id}` : ""}) : « ${selectionText(sel)} »`;
  }
  // Commenter : un brouillon s'ouvre dans la marge (ou en fenêtre sous le
  // passage quand le panneau est étroit) ; il peut aussi partir au chat.
  function askComment() {
    const sel = readSel();
    if (!sel || collapsed(sel) || !model) { status("Sélectionne d'abord le passage à commenter."); return; }
    if (view === "original") return;
    {
      // Brouillon dans la marge, en face du passage (un seul paragraphe :
      // un commentaire Word ne couvre pas plus).
      const end = sel.a.idx === sel.b.idx ? sel.b.off : cp(virtualText(sel.a.idx));
      const p = model.paragraphs[sel.a.idx];
      draft = { idx: sel.a.idx, s: sel.a.off, e: end, quote: Array.from(virtualText(sel.a.idx)).slice(sel.a.off, end).join(""), pid: p.para_id || p.id };
      // Un nouveau brouillon part d'une zone vide.
      const old = cardsEl.querySelector('[data-key="draft"] textarea') as HTMLTextAreaElement | null;
      if (old) old.value = "";
      selbar.classList.remove("show");
      getSelection()?.removeAllRanges();
      focusKey = "draft";
      renderCards();
      requestAnimationFrame(() => (cardsEl.querySelector('[data-key="draft"] textarea') as HTMLTextAreaElement | null)?.focus());
      return;
    }
  }

  // Capsule de sélection commune à Atelier (PDF, LaTeX, Markdown, code).
  // Surligner et souligner deviennent une mise en forme Word, en suivi si actif.
  const selbar = $("selbar");
  const WORD_COLOR: Record<string, string> = { amber: "yellow", green: "green", blue: "cyan", red: "magenta" };
  UI?.createSelectionActions(selbar, {
    // Les deux gestes ouvrent la même boîte de note (variante A, 2026-11-12).
    onAdd: openNote,
    onAnnotate: openNote,
    onAsk: W.__atelierPost ? () => {
      const sel = readSel();
      if (!sel || collapsed(sel)) return;
      selbar.classList.remove("show");
      W.__atelierPost!({ type: "atelier-quick-ask", text: selectionText(sel), path: PATH, page: model!.paragraphs[sel.a.idx].id });
    } : undefined,
    onHighlight: (name: string) => {
      const sel = readSel();
      if (!sel || collapsed(sel)) return;
      const word = WORD_COLOR[name] || "yellow";
      // Même teinte déjà posée : on la retire, comme le surligneur de Word.
      const seg = segAt({ idx: sel.a.idx, off: sel.a.off + 1 });
      applyRun({ highlight: seg?.highlight === word ? "none" : word });
    },
    highlightColor: "amber",
    onMark: () => toggleRun("u"),
    marks: ["ul"],
  });
  // ------------------------------------- note sur un passage (variante A)
  // Annoter et Ajouter au chat ouvrent la même boîte sous la sélection : un
  // champ, deux sorties. « Annotation » (⌘↵) pose un commentaire Word signé
  // de l'auteur, dans la marge avec ceux des relecteurs ; « Au chat » (↵)
  // empile le passage et la note dans la boîte du chat. Le passage envoyé
  // garde un pointillé et son numéro tant qu'il attend dans la boîte.
  type Span = { idx: number; s: number; e: number; pid: string; quote: string; lost?: boolean };
  const nbox = document.createElement("div");
  nbox.className = "pop nbox";
  nbox.setAttribute("role", "dialog");
  nbox.setAttribute("aria-label", "Note sur le passage");
  document.body.appendChild(nbox);
  const chatNums = document.createElement("div");
  chatNums.id = "chatnums";
  chatNums.setAttribute("aria-hidden", "true");
  scroller.appendChild(chatNums);
  let noting: { sel: Sel; segs: Span[] } | null = null;
  let toChatList: { text: string; segs: Span[] }[] = [];
  const pidOfIdx = (idx: number) => model!.paragraphs[idx].para_id || model!.paragraphs[idx].id;
  function segsOf(sel: Sel): Span[] {
    const out: Span[] = [];
    for (let k = sel.a.idx; k <= sel.b.idx; k++) {
      const chars = Array.from(virtualText(k));
      const s = k === sel.a.idx ? sel.a.off : 0, e = k === sel.b.idx ? sel.b.off : chars.length;
      if (e > s) out.push({ idx: k, s, e, pid: pidOfIdx(k), quote: chars.slice(s, e).join("") });
    }
    return out;
  }
  /** Après une relecture du fichier, le passage retrouve sa place. */
  function rebaseSeg(d: Span) {
    if (!model) return;
    let idx = d.idx;
    if (!model.paragraphs[idx] || pidOfIdx(idx) !== d.pid) idx = model.paragraphs.findIndex((_, i) => pidOfIdx(i) === d.pid);
    if (idx < 0) { d.lost = true; return; }
    const text = virtualText(idx);
    let best = -1;
    for (let i = text.indexOf(d.quote); d.quote && i >= 0; i = text.indexOf(d.quote, i + 1)) {
      const at = cp(text.slice(0, i));
      if (best < 0 || Math.abs(at - d.s) < Math.abs(best - d.s)) best = at;
    }
    if (best < 0) { d.lost = true; return; }
    d.idx = idx; d.s = best; d.e = best + cp(d.quote); d.lost = false;
  }
  const segRanges = (segs: Span[]) => segs.filter((g) => !g.lost).map((g) => rangeAt(g.idx, g.s, g.e)).filter(Boolean) as Range[];
  function paintNotes() {
    for (const g of noting ? noting.segs : []) rebaseSeg(g);
    for (const it of toChatList) for (const g of it.segs) rebaseSeg(g);
    if (HL) {
      const pending = noting ? segRanges(noting.segs) : [];
      if (pending.length) highlights().set("docx-note", makeHighlight(pending)); else highlights().delete("docx-note");
      const sent = toChatList.flatMap((it) => segRanges(it.segs));
      if (sent.length) highlights().set("docx-tochat", makeHighlight(sent)); else highlights().delete("docx-tochat");
    }
    // Numéro de la rangée du chat, en exposant au bout du passage.
    const host = scroller.getBoundingClientRect();
    const frag = document.createDocumentFragment();
    toChatList.forEach((it, i) => {
      const rs = segRanges(it.segs);
      const rects = rs.length ? rs[rs.length - 1].getClientRects() : null;
      const r = rects && rects.length ? rects[rects.length - 1] : null;
      if (!r) return;
      const n = document.createElement("i");
      n.textContent = String(i + 1);
      n.style.transform = `translate(${Math.round(r.right - host.left + scroller.scrollLeft)}px, ${Math.round(r.top - host.top + scroller.scrollTop - 6)}px)`;
      frag.appendChild(n);
    });
    chatNums.replaceChildren(frag);
  }
  function closeNote() {
    if (!noting) return;
    noting = null;
    nbox.classList.remove("show");
    paintNotes();
  }
  function openNote() {
    const s = getSelection();
    const sel = readSel();
    if (!s || !s.rangeCount || !sel || collapsed(sel) || !model) return;
    const segs = segsOf(sel);
    if (!segs.length) return;
    const rect = s.getRangeAt(0).getBoundingClientRect();
    selbar.classList.remove("show");
    s.removeAllRanges();
    noting = { sel, segs };
    // Même repère que dans la boîte du chat : le numéro du paragraphe.
    const n = /p(\d+)$/.exec(model.paragraphs[segs[0].idx].id)?.[1] ?? String(segs[0].idx + 1);
    const word = view !== "original";
    nbox.innerHTML = `<div class="nb-src">${ic("note", 12)}<span>¶ ${n} · « ${esc(clip(oneLine(selectionText(sel)), 90))} »</span></div>
      <textarea class="c-input" rows="2" placeholder="Ta note…" aria-label="Ta note"></textarea>
      <div class="ac"><button class="btn q" data-act="doc"${word ? "" : " disabled"} data-tooltip="${word ? "Garder comme commentaire Word, avec ceux des relecteurs" : "Passe en vue Révision pour commenter"}">${ic("note", 14)}Annotation<kbd>⌘↵</kbd></button>
      <button class="btn p" data-act="chat" data-tooltip="Ajouter le passage et ta note à la boîte du chat">${ic("chat", 14)}Au chat<kbd>↵</kbd></button></div>`;
    nbox.classList.add("show");
    const h = nbox.offsetHeight, w = nbox.offsetWidth;
    const below = rect.bottom + 8;
    nbox.style.top = `${below + h + 8 <= innerHeight ? below : Math.max(8, rect.top - h - 8)}px`;
    nbox.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, rect.left))}px`;
    paintNotes();
    requestAnimationFrame(() => (nbox.querySelector("textarea") as HTMLTextAreaElement | null)?.focus({ preventScroll: true }));
  }
  function commitNote(dest: "doc" | "chat") {
    if (!noting || !model) return;
    const ta = nbox.querySelector("textarea") as HTMLTextAreaElement;
    const note = ta.value.trim();
    const { sel, segs } = noting;
    if (dest === "doc") {
      if (view === "original") return;
      if (!note) { ta.focus(); status("Écris ta note pour l'annotation."); return; }
      // Un commentaire Word couvre un seul paragraphe : le premier.
      const g = segs[0];
      if (g.lost) { status("Le passage a changé : sélectionne-le de nouveau.", true); return; }
      closeNote();
      const before = new Set(model.comments.map((c) => c.id));
      structural(async () => {
        const ok = await sendOp({ op: "comment_range", paragraph: ref(g.idx), start: g.s, end: g.e, text: note }, () => null);
        if (!ok) return;
        const made = model!.comments.find((c) => !before.has(c.id) && isTop(c));
        focusKey = made ? `c${made.id}` : "";
        renderCards();
        status("Annotation ajoutée");
      });
      return;
    }
    const text = `${quoteOf(sel)}\nCommentaire : ${note || "(voir passage)"}`;
    closeNote();
    if (!toChatList.some((it) => it.text === text)) toChatList.push({ text, segs: segs.map((g) => ({ ...g })) });
    paintNotes();
    toChat(text);
  }
  nbox.addEventListener("mousedown", (e) => e.stopPropagation());
  nbox.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "doc" || act === "chat") commitNote(act);
  });
  nbox.addEventListener("input", (e) => {
    const ta = e.target as HTMLElement;
    if (ta.classList.contains("c-input")) fitInput(ta as HTMLTextAreaElement);
  });
  nbox.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeNote(); paper.focus({ preventScroll: true }); return; }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); commitNote(e.metaKey || e.ctrlKey ? "doc" : "chat"); }
  });
  document.addEventListener("mousedown", (e) => { if (noting && !nbox.contains(e.target as Node)) closeNote(); });
  // La boîte du chat dit quels passages y attendent encore : envoyés ou
  // retirés, ils perdent leur pointillé ; l'ordre suit ses rangées.
  window.addEventListener("message", (e) => {
    const d = e.data as { type?: string; texts?: unknown } | null;
    if (e.source !== parent || d?.type !== "atelier-chat-pending" || !Array.isArray(d.texts)) return;
    const texts = d.texts.filter((t): t is string => typeof t === "string");
    const next = toChatList.filter((it) => texts.includes(it.text)).sort((x, y) => texts.indexOf(x.text) - texts.indexOf(y.text));
    if (next.length === toChatList.length && next.every((it, i) => it === toChatList[i])) return;
    toChatList = next;
    paintNotes();
  });

  // Curseur dessiné à la place du natif : WebKit lui donne toute la hauteur
  // de ligne (1,7), Word le garde à la hauteur des lettres.
  const caret = $("caret");
  function placeCaret() {
    const s = getSelection();
    const node = s && s.rangeCount ? s.focusNode : null;
    if (!s || !node || !s.isCollapsed || !paper.contains(node) || document.activeElement !== paper) { caret.classList.remove("on"); return; }
    const range = s.getRangeAt(0);
    let r: DOMRect | undefined = range.getClientRects()[0];
    const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement;
    if (!r || !r.height) {
      const box = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      r = new DOMRect(box.left + parseFloat(cs.paddingLeft || "0"), box.top + parseFloat(cs.paddingTop || "0"), 0, parseFloat(cs.lineHeight) || box.height);
    }
    const fs = parseFloat(getComputedStyle(el).fontSize) || 15;
    const h = Math.min(r.height, Math.round(fs * 1.25));
    const host = scroller.getBoundingClientRect();
    caret.style.height = `${h}px`;
    caret.style.transform = `translate(${Math.round(r.left - host.left + scroller.scrollLeft)}px, ${Math.round(r.top + (r.height - h) / 2 - host.top + scroller.scrollTop)}px)`;
    // Relance le clignotement à chaque déplacement, comme Word.
    caret.classList.remove("on");
    void caret.offsetWidth;
    caret.classList.add("on");
  }
  // Sélection dessinée (2026-11-12) : sur la page à l'échelle, la sélection
  // native est transparente (CSS, --sel-bg) et #selpaint peint dessous les
  // rectangles des seuls nœuds texte, à la hauteur des lettres comme le
  // surlignage des commentaires. Seule la partie à l'écran est peinte, une
  // fois par image, en réutilisant les rectangles déjà posés.
  const selLayer = $("selpaint");
  let selFrame = 0;
  function paintSel() { if (!selFrame) selFrame = requestAnimationFrame(drawSel); }
  function drawSel() {
    selFrame = 0;
    const s = getSelection();
    const rects: number[] = [];
    if (paper.classList.contains("pg") && s && s.rangeCount && !s.isCollapsed && (paper.contains(s.anchorNode) || paper.contains(s.focusNode))) {
      const range = s.getRangeAt(0);
      const host = scroller.getBoundingClientRect();
      const top = host.top - 64, bottom = host.bottom + 64;
      const dx = scroller.scrollLeft - host.left, dy = scroller.scrollTop - host.top;
      const sub = document.createRange();
      for (const block of Array.from(paper.children)) {
        if (!range.intersectsNode(block)) continue;
        const b = block.getBoundingClientRect();
        if (b.bottom < top || b.top > bottom) continue;
        const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode() as Text | null; t; t = walk.nextNode() as Text | null) {
          if (!t.data || !range.intersectsNode(t) || t.parentElement?.closest(".d-gap,.d-note-n")) continue;
          sub.selectNodeContents(t);
          if (t === range.startContainer) sub.setStart(t, range.startOffset);
          if (t === range.endContainer) sub.setEnd(t, range.endOffset);
          for (const r of Array.from(sub.getClientRects())) {
            if (r.width < 0.5 || r.bottom < top || r.top > bottom) continue;
            const x = Math.floor(r.left + dx), y = Math.round(r.top + dy);
            rects.push(x, y, Math.ceil(r.right + dx) - x, Math.round(r.bottom + dy) - y);
          }
        }
      }
    }
    const n = rects.length / 4;
    while (selLayer.childElementCount > n) selLayer.lastElementChild!.remove();
    while (selLayer.childElementCount < n) selLayer.appendChild(document.createElement("i"));
    for (let i = 0; i < n; i++) {
      const st = (selLayer.children[i] as HTMLElement).style;
      st.transform = `translate(${rects[4 * i]}px, ${rects[4 * i + 1]}px)`;
      st.width = `${rects[4 * i + 2]}px`;
      st.height = `${rects[4 * i + 3]}px`;
    }
  }
  scroller.addEventListener("scroll", paintSel, { passive: true });
  addEventListener("resize", paintSel);
  paper.addEventListener("focus", placeCaret);
  paper.addEventListener("input", () => {
    const sel = readSel();
    scheduleLines(sel ? sel.a.idx : undefined);
  });
  // Une image qui arrive après la mise en page déplace la suite : on recoupe.
  const imageArrived = (e: Event) => {
    const img = e.target as HTMLElement;
    if (img.tagName !== "IMG") return;
    const idx = (img.closest(".d-p") as HTMLElement | null)?.dataset.idx;
    scheduleLines(idx === undefined ? undefined : Number(idx));
  };
  paper.addEventListener("load", imageArrived, true);
  paper.addEventListener("error", imageArrived, true);
  document.fonts?.ready.then(() => scheduleLines()).catch(() => undefined);
  paper.addEventListener("blur", () => caret.classList.remove("on"));
  addEventListener("resize", placeCaret);
  document.addEventListener("selectionchange", () => {
    placeCaret();
    paintSel();
    syncToolbar();
    const s = getSelection();
    const sel = readSel();
    if (!s || !s.rangeCount || !sel || collapsed(sel) || !paper.contains(s.anchorNode)) { selbar.classList.remove("show"); return; }
    const r = s.getRangeAt(0).getBoundingClientRect();
    selbar.classList.add("show");
    selbar.style.top = `${Math.max(8, r.top - selbar.offsetHeight - 8)}px`;
    selbar.style.left = `${Math.max(8, Math.min(innerWidth - selbar.offsetWidth - 8, r.left))}px`;
  });

  function renderStatus() {
    if (!model) return;
    const pending = model.changes.filter((c) => AGENT.test(c.author));
    const agentNames = Array.from(new Set(pending.map((c) => c.author)));
    const other = model.other_parts.reduce((n, o) => n + o.changes, 0);
    const open = model.comments.filter((c) => !c.done && isTop(c)).length;
    let words = 0;
    for (let k = 0; k < (model.body ?? model.paragraphs.length); k++) words += (virtualText(k).match(/\S+/g) || []).length;
    $("ftWords").textContent = pl(words, "mot", "mots");
    $("laneN").textContent = open ? nf(open) : "";
    $("ftOpen").innerHTML = [
      pl(open, "commentaire ouvert", "commentaires ouverts"),
      pl(model.changes.length, "modification", "modifications"),
      ...(pending.length ? [`${nf(pending.length)} de ${esc(agentNames.join(", "))} en attente`] : []),
      ...(other ? [`<span data-tooltip="Notes de bas de page, en-têtes ou pieds de page : à traiter dans Word">${nf(other)} hors du texte</span>`] : []),
    ].join(" · ");
    $("who").textContent = `Signé ${author}`;
    zoomEl.hidden = !model.page;
    if (!inflight) status(SAVED);
    spy();
  }
  $("who").addEventListener("click", (e) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    showPopAt(r, `<label>Nom sur tes retouches (celui que tes relecteurs voient dans Word)<input value="${esc(author)}"></label><div class="c-foot"><button class="btn" data-x="cancel">Annuler</button><button class="btn primary" data-x="send">Enregistrer</button></div>`);
    pop.style.top = `${r.top - pop.offsetHeight - 8}px`;
    const input = pop.querySelector("input")!;
    input.focus();
    const save = () => {
      const v = input.value.trim();
      if (!v) return;
      author = v;
      hidePop();
      api("/docx/prefs", { author: v }).catch(() => undefined);
      renderAll();
      renderCards();
      renderStatus();
    };
    pop.querySelector('[data-x="send"]')!.addEventListener("click", save);
    pop.querySelector('[data-x="cancel"]')!.addEventListener("click", hidePop);
    input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") save(); });
  });

  // ------------------------------------------------ rechercher, remplacer
  // Sur le texte courant (suppressions exclues), surligné par l'API des
  // surlignages du navigateur, sans toucher au DOM de la page. Remplacer
  // passe par le moteur, en suivi quand le suivi est actif.
  type Hit = { idx: number; s: number; e: number; locked: "" | "field" | "rev" };
  const findEl = $("find");
  const fQ = $("fQ") as HTMLInputElement;
  const fR = $("fR") as HTMLInputElement;
  const fN = $("fN");
  let hits: Hit[] = [];
  let hitK = 0;
  const findOpen = () => findEl.classList.contains("show");
  /** Passage pris dans un champ, une citation ou une figure : un remplacement l'emporterait en entier. */
  function lockedAt(idx: number, s: number, e: number): "" | "field" | "rev" {
    const [a, b] = expandWhole(idx, s, e);
    if (a !== s || b !== e) return "field";
    // Le moteur retouche l'ajout d'un autre en suivi imbriqué, mais pas un
    // passage déplacé (à accepter ou refuser d'abord).
    let off = 0;
    for (const g of model!.paragraphs[idx].segments) {
      const removed = g.rev === "del" || g.rev === "moveFrom";
      const len = removed ? 0 : cp(g.text);
      if (!removed && g.rev === "moveTo" && g.change !== undefined && len && off < e && s < off + len && changeMap.get(g.change)?.author !== author) return "rev";
      off += len;
    }
    return "";
  }
  function runFind(reset: boolean) {
    hits = [];
    const q = fQ.value;
    if (q && model) {
      const lq = q.toLowerCase();
      for (let k = 0; k < model.paragraphs.length; k++) {
        const text = virtualText(k);
        const lt = text.toLowerCase();
        const fold = lt.length === text.length && lq.length === q.length;
        const hay = fold ? lt : text, needle = fold ? lq : q;
        for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) {
          const s = cp(text.slice(0, i));
          const e = s + cp(text.slice(i, i + needle.length));
          hits.push({ idx: k, s, e, locked: lockedAt(k, s, e) });
        }
      }
      // En Original, les insertions sont masquées : rien à trouver dedans.
      if (view === "original") hits = hits.filter((h) => { const r = rangeAt(h.idx, h.s, h.e); return !!r && r.getClientRects().length > 0; });
    }
    if (reset) hitK = 0;
    hitK = Math.min(hitK, Math.max(0, hits.length - 1));
    paintFind(reset);
  }
  function paintFind(scroll: boolean) {
    const q = fQ.value;
    fN.textContent = !q ? "" : hits.length ? `${nf(hitK + 1)} sur ${nf(hits.length)}` : "Aucun";
    const cur = hits[hitK] ? rangeAt(hits[hitK].idx, hits[hitK].s, hits[hitK].e) : null;
    if (HL) {
      const all = hits.slice(0, 2000).map((h) => rangeAt(h.idx, h.s, h.e)).filter(Boolean) as Range[];
      if (all.length) highlights().set("docx-find", makeHighlight(all)); else highlights().delete("docx-find");
      if (cur) highlights().set("docx-findcur", makeHighlight([cur])); else highlights().delete("docx-findcur");
    }
    if (scroll && cur) reveal(cur);
  }
  function openFind() {
    hideBubble();
    closeMenu();
    const r = fmtbar.getBoundingClientRect();
    findEl.style.top = `${r.bottom + 8}px`;
    findEl.classList.add("show");
    $("btnFind").classList.add("on");
    const s = getSelection();
    const sel = readSel();
    if (s && sel && !collapsed(sel) && sel.a.idx === sel.b.idx && paper.contains(s.anchorNode)) fQ.value = selectionText(sel);
    fQ.focus();
    fQ.select();
    runFind(true);
  }
  function closeFind() {
    findEl.classList.remove("show");
    $("btnFind").classList.remove("on");
    hits = [];
    fN.textContent = "";
    if (HL) { highlights().delete("docx-find"); highlights().delete("docx-findcur"); }
  }
  function stepFind(d: number) {
    if (!hits.length) return;
    hitK = (hitK + d + hits.length) % hits.length;
    paintFind(true);
  }
  const replacement = () => fR.value.replace(/[\r\n]+/g, " ");
  const tracedNote = () => (tracked ? "en suivi" : "sans suivi");
  function replaceOne() {
    const h = hits[hitK];
    if (!h) return;
    if (view === "original") { status("Repasser en Révision pour remplacer."); return; }
    if (h.locked === "field") { status("Ce passage est dans une citation ou un champ : à modifier dans Word.", true); return; }
    if (h.locked === "rev") { status("Ce passage est un déplacement en suivi d'un autre auteur : l'accepter ou le refuser d'abord.", true); return; }
    const w = replacement();
    structural(async () => {
      const ok = await sendOp({ op: "replace_range", paragraph: ref(h.idx), start: h.s, end: h.e, with: w }, () => null);
      if (!ok) return;
      // Le résultat suivant vient après le texte qu'on vient d'écrire.
      const past = h.s + cp(w);
      const k = hits.findIndex((x) => x.idx > h.idx || (x.idx === h.idx && x.s >= past));
      hitK = k < 0 ? 0 : k;
      paintFind(true);
    });
  }
  function replaceAll() {
    if (!hits.length) return;
    if (view === "original") { status("Repasser en Révision pour remplacer."); return; }
    const free = hits.filter((h) => !h.locked);
    const inField = hits.filter((h) => h.locked === "field").length;
    const inRev = hits.filter((h) => h.locked === "rev").length;
    if (!free.length) { status("Tous ces passages sont dans des champs ou des déplacements en suivi d'un autre auteur : rien à remplacer ici.", true); return; }
    const left = [inField ? pl(inField, "laissé dans un champ", "laissés dans des champs") : "", inRev ? pl(inRev, "laissé dans un suivi", "laissés dans des suivis") : ""].filter(Boolean).join(", ");
    // Du dernier au premier dans chaque paragraphe : les positions qui
    // précèdent restent justes.
    const ops = free.slice().sort((a, b) => a.idx - b.idx || b.s - a.s)
      .map((h) => ({ op: "replace_range", paragraph: ref(h.idx), start: h.s, end: h.e, with: replacement() }));
    structural(async () => {
      const ok = await sendOp(ops.length === 1 ? ops[0] : { op: "batch", ops }, () => null);
      if (ok) status(`${pl(free.length, "passage remplacé", "passages remplacés")} ${tracedNote()}${left ? ` · ${left}` : ""}`);
    });
  }
  fQ.addEventListener("input", () => runFind(true));
  fQ.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); closeFind(); paper.focus(); }
  });
  fR.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); if (e.metaKey || e.ctrlKey) replaceAll(); else replaceOne(); }
    else if (e.key === "Escape") { e.preventDefault(); closeFind(); paper.focus(); }
  });
  $("fPrev").innerHTML = ic("up", 14);
  $("fNext").innerHTML = ic("down", 14);
  $("fClose").innerHTML = ic("x", 14);
  $("fMore").innerHTML = ic("right", 14);
  $("fPrev").addEventListener("click", () => stepFind(-1));
  $("fNext").addEventListener("click", () => stepFind(1));
  $("fClose").addEventListener("click", closeFind);
  $("fMore").addEventListener("click", () => {
    const row = $("fRow2");
    row.hidden = !row.hidden;
    $("fMore").innerHTML = ic(row.hidden ? "right" : "down", 14);
    $("fMore").setAttribute("aria-expanded", String(!row.hidden));
    if (!row.hidden) fR.focus();
  });
  $("fOne").addEventListener("click", replaceOne);
  $("fAll").addEventListener("click", replaceAll);
  $("btnFind").addEventListener("click", () => (findOpen() ? closeFind() : openFind()));
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === "f") { e.preventDefault(); openFind(); return; }
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (bub.classList.contains("show")) hideBubble();
    else if (findOpen()) closeFind();
    else if (focusKey === "draft") cancelDraft();
    else if (focusKey) { focusKey = ""; renderCards(); }
  });

  // ------------------------------------------------- relecture du disque
  async function poll() {
    if (document.hidden || !model || ghosts.length || inflight || structBusy) return;
    try {
      const s = await api(`/docx/stat?path=${enc(PATH)}`);
      const sig = JSON.stringify(s.drafts || {});
      if (sig !== agentDraftsSig) { agentDraftsSig = sig; takeAgentDrafts(s.drafts || {}); }
      for (const [id, since] of asking) {
        if (Date.now() - since > ASK_TIMEOUT_MS) { asking.delete(id); renderCards(); status("Aucun brouillon reçu : voir la réponse dans le chat", true); }
      }
      if (s.mtime === model.mtime && s.openInWord === model.openInWord) return;
      if (ghosts.length || inflight || structBusy) return;
      const fresh: Model = await api(`/docx/model?path=${enc(PATH)}`);
      if (fresh.revision === model.revision) { model.mtime = fresh.mtime; model.openInWord = fresh.openInWord; notice.classList.toggle("show", fresh.openInWord); return; }
      const sel = readSel();
      applyModel(fresh, sel);
      status("Document relu : modifié par l'agent ou par Word");
    } catch { /* fichier momentanément remplacé : on réessaie */ }
  }

  // ------------------------------------------------------------- départ
  async function boot() {
    if (!PATH) { paper.innerHTML = '<div class="loading">Aucun document indiqué.</div>'; return; }
    document.title = NAME;
    try {
      const [prefs, m] = await Promise.all([api("/docx/prefs").catch(() => ({})), api(`/docx/model?path=${enc(PATH)}`)]);
      setPage(prefs.page || "blanche", false);
      if (prefs.author) author = prefs.author;
      else {
        // Le nom que Word a déjà inscrit dans ce document, s'il ressemble à
        // celui du Mac ; sinon celui du Mac.
        const sys: string = prefs.systemAuthor || "Moi";
        const first = sys.split(/\s+/)[0].toLowerCase();
        const known = (m as Model).authors.find((a) => !AGENT.test(a.name) && a.name.toLowerCase().startsWith(first));
        author = known ? known.name : sys;
      }
      applyModel(m);
      live?.schedule();
      status("Enregistré dans le .docx");
      setInterval(poll, POLL_MS);
    } catch (e: any) {
      paper.innerHTML = `<div class="loading">Ce document ne s'ouvre pas ici : ${esc(e.message || String(e))}</div>`;
    }
  }
  // « Le chat sait ce que tu regardes » (2026-11-09) : fichier, paragraphe
  // du curseur et commentaires ouverts, publiés à l'app hôte comme les
  // éditeurs (`atelier-live-context`). Jamais le texte sélectionné.
  const liveCore = W.AtelierStudioCore;
  const live = W.__atelierPost && liveCore?.createLiveContextPublisher ? liveCore.createLiveContextPublisher({
    build: () => {
      if (!model || !PATH.startsWith("/")) return null;
      const sel = readSel();
      const inPaper = !!sel && paper.contains(getSelection()?.anchorNode ?? null);
      const comments = model.comments
        .filter((c) => !c.done && (c.parent === undefined || c.parent === null) && c.text.trim())
        .slice(0, 10)
        .map((c) => ({ text: c.text.slice(0, 600), ...(c.quote ? { quote: c.quote.slice(0, 300) } : {}) }));
      return {
        path: PATH, name: NAME, kind: "docx",
        ...(inPaper && sel ? { paragraph: sel.a.idx + 1 } : {}),
        ...(comments.length ? { comments } : {}),
      };
    },
    postToHost: (payload) => W.__atelierPost!(payload),
    timers: window,
  }) : null;
  if (live) {
    liveCore!.onTabActivated?.(window, () => live.repost());
    document.addEventListener("selectionchange", () => live.schedule());
  }

  window.addEventListener("pagehide", flushOnExit);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushGhosts(); });
  boot();
})();
