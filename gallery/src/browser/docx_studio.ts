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
  type Ghost = { idx: number; at: number; text: string; sent: boolean };
  type Op = Record<string, unknown>;

  const W = window as Window & {
    __atelierPost?: (p: Record<string, unknown>) => void;
    AtelierStudioCore?: { requestChatAttachment?: (o: Record<string, unknown>) => Promise<void> };
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
  let lastStatus = "";
  let composing: Pos | null = null;
  const cp = (s: string) => Array.from(s).length;

  // ---------------------------------------------------------------- icônes
  const svg = (d: string, w = 1.4) =>
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  // Teintes de surlignage de Word, rendues avec celles des annotations
  // d'Atelier pour les quatre que la capsule propose.
  const HIGHLIGHT: Record<string, string> = {
    yellow: "rgba(255,213,74,.40)", green: "rgba(120,220,140,.40)", cyan: "rgba(120,170,255,.40)", magenta: "rgba(255,140,160,.40)",
    darkYellow: "color-mix(in srgb, olive 40%, transparent)", darkGreen: "color-mix(in srgb, green 40%, transparent)",
    darkCyan: "color-mix(in srgb, teal 40%, transparent)", darkMagenta: "color-mix(in srgb, purple 40%, transparent)",
    darkBlue: "color-mix(in srgb, navy 40%, transparent)", darkRed: "color-mix(in srgb, maroon 40%, transparent)",
    darkGray: "color-mix(in srgb, gray 40%, transparent)", lightGray: "color-mix(in srgb, silver 40%, transparent)",
  };
  const ICON = {
    chev: svg('<path d="M8 10l4 4 4-4"/>'),
    left: svg('<path d="M14 7l-5 5 5 5"/>'),
    right: svg('<path d="M10 7l5 5-5 5"/>'),
    check: svg('<path d="M6 12.5l4 4 8-9"/>'),
    x: svg('<path d="M7 7l10 10M17 7L7 17"/>'),
    alLeft: svg('<path d="M5 6h14M5 10h9M5 14h14M5 18h9"/>'),
    alCenter: svg('<path d="M5 6h14M7.5 10h9M5 14h14M7.5 18h9"/>'),
    alRight: svg('<path d="M5 6h14M10 10h9M5 14h14M10 18h9"/>'),
    alBoth: svg('<path d="M5 6h14M5 10h14M5 14h14M5 18h14"/>'),
    bullets: svg('<circle cx="6" cy="7" r=".9"/><circle cx="6" cy="12" r=".9"/><circle cx="6" cy="17" r=".9"/><path d="M10 7h9M10 12h9M10 17h9"/>'),
    numbers: svg('<path d="M10 7h9M10 12h9M10 17h9"/><path d="M5 5.5l1-.5v4M4.8 13.5c.3-.6 1.9-.9 1.9.3 0 .8-1.9 1.7-1.9 2.4h2"/>', 1.3),
    comment: svg('<path d="M5 6.5h14v9H10l-4 3v-3H5z"/><path d="M12 9v4M10 11h4"/>'),
    undo: svg('<path d="M9 7L5 11l4 4"/><path d="M5.5 11H14a5 5 0 0 1 0 10h-2"/>'),
    redo: svg('<path d="M15 7l4 4-4 4"/><path d="M18.5 11H10a5 5 0 0 0 0 10h2"/>'),
    warn: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>'),
    saved: svg('<path d="M6 12.5l4 4 8-9"/>', 1.5),
    chat: svg('<path d="M5 6h14v10H9l-4 3z"/>'),
    trash: svg('<path d="M6 7h12M10 7V5h4v2M8 7l1 12h6l1-12"/>'),
    reply: svg('<path d="M10 8L5 12l5 4"/><path d="M5.5 12H14a5 5 0 0 1 5 5v1"/>'),
    note: svg('<path d="M4 18h10M4 13h10M4 8h7"/><path d="M16.5 6.5l1.5-1v5"/>'),
    table: svg('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14.5h16M10 5v14"/>'),
    figure: svg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M5 17l5-4 3 3 2-2 4 3"/>'),
  };
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
  const colorCache = new Map<string, string>();
  function authorColor(name: string): string {
    if (!name) return "var(--text-muted)";
    if (AGENT.test(name)) return "var(--accent)";
    if (name === author) return "var(--text-muted)";
    if (!colorCache.has(name)) colorCache.set(name, `var(--doc-author-${(colorCache.size % 3) + 1})`);
    return colorCache.get(name) as string;
  }
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
        } else {
          node.textContent = isNote && s.number ? String(s.number) : s.text || (label === "image" ? "[figure]" : label === "équation" ? "[équation]" : `[${label || "objet"}]`);
        }
        node.contentEditable = "false";
        node.title = s.kind === "field" ? (label.startsWith("zotero") ? "Citation Zotero : à modifier dans Word" : `Champ ${label}`) : (isNote ? (label === "note" ? "Note de bas de page" : "Note de fin") : s.media ? (s.alt || "Figure") : label);
      } else {
        node = document.createElement("span");
        let inner: Node = document.createTextNode(s.text);
        const wrap = (tag: string) => { const w = document.createElement(tag); w.appendChild(inner); inner = w; };
        if (s.b) wrap("b");
        if (s.i) wrap("i");
        if (s.u) wrap("u");
        if (s.strike) wrap("s");
        if (s.sup) wrap("sup");
        if (s.sub) wrap("sub");
        node.appendChild(inner);
        if (s.font) node.style.fontFamily = `"${s.font}", ${getComputedStyle(paper).fontFamily}`;
        if (s.size) node.style.fontSize = model!.page ? `calc(var(--pt) * ${s.size})` : `${s.size}pt`;
        if (s.highlight && s.highlight !== "white" && s.highlight !== "black") node.style.backgroundColor = HIGHLIGHT[s.highlight] || `color-mix(in srgb, ${s.highlight} 40%, transparent)`;
      }
      node.dataset.off = String(off);
      node.dataset.len = String(len);
      if (chip) node.dataset.chip = "1";
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
  function fitPage(force = false) {
    const pg = model?.page;
    if (!pg) return;
    const cs = getComputedStyle(scroller);
    const room = scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const next = PT * Math.max(0.4, Math.min(1.5, room / (pg.width * PT)));
    if (!force && Math.abs(next - ptPx) < 1e-3) return;
    ptPx = next;
    document.documentElement.style.setProperty("--pt", `${next.toFixed(4)}px`);
    scheduleLines();
  }
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

  let linesFrame = 0;
  function scheduleLines() {
    if (linesFrame) return;
    linesFrame = requestAnimationFrame(() => { linesFrame = 0; layoutPages(); });
  }
  function layoutPages() {
    const pg = model?.page;
    if (!pg) return;
    const s = getSelection();
    const keep = s && s.rangeCount && paper.contains(s.anchorNode) ? readSel() : null;
    for (const g of Array.from(paper.querySelectorAll(".d-gap"))) {
      const parent = g.parentNode;
      g.remove();
      parent?.normalize();
    }
    paper.style.minHeight = "";
    const pages = paginate(pg);
    if (keep) setCaret(keep.a, collapsed(keep) ? undefined : keep.b);
    drawSheets(pg, pages);
    drawLines(pg);
    placeCards();
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
          if (c.dataset.chip || c.tagName === "BR" || c.tagName === "IMG") {
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
    g.contentEditable = "false";
    g.style.height = `${Math.max(0, h)}px`;
    return g;
  }

  /** Coupe le flux en feuilles ; rend le nombre de feuilles. */
  function paginate(pg: Page): number {
    const pt = ptPx, pageH = pg.height * pt, stride = pageH + GAP;
    const o = paper.getBoundingClientRect().top;
    const topOf = (k: number) => k * stride + pg.top * pt;
    const bottomOf = (k: number) => k * stride + pageH - pg.bottom * pt;
    const pageAt = (y: number) => Math.max(0, Math.floor(y / stride));
    const lookOf = (el: Element) => (el as HTMLElement).dataset.idx !== undefined ? model!.paragraphs[Number((el as HTMLElement).dataset.idx)]?.look || {} : {};
    // Blocs du flux, dans l'ordre : paragraphes, lignes de tableau, notes,
    // en-têtes et pieds particuliers ; les en-tête et pied courants sont épinglés.
    const blocks: HTMLElement[] = [];
    for (const c of Array.from(paper.children) as HTMLElement[]) {
      if (c.classList.contains("d-p")) blocks.push(c);
      else if (c.tagName === "TABLE") blocks.push(...(Array.from((c as HTMLTableElement).rows) as HTMLElement[]));
      else if ((c.classList.contains("d-notes") || c.classList.contains("d-zone")) && !c.classList.contains("pinned")) blocks.push(...(Array.from(c.querySelectorAll(".d-p")) as HTMLElement[]));
    }
    const topOfEl = (el: Element) => el.getBoundingClientRect().top - o;
    // Intervalle avant un bloc entier ; le premier paragraphe d'une note emporte son numéro.
    const gapBefore = (el: HTMLElement, target: number) => {
      const host = el.closest(".d-note") && !el.previousElementSibling ? el.closest(".d-note") as HTMLElement : el;
      const h = target - topOfEl(host);
      if (host.tagName === "TR") {
        const tr = document.createElement("tr");
        tr.className = "d-gap";
        tr.innerHTML = `<td colspan="99" style="padding:0;border:0"><div style="height:${Math.max(0, h)}px"></div></td>`;
        host.before(tr);
      } else host.before(gapEl(false, h));
    };
    let page = 0;
    let forceNext = false;
    for (let b = 0; b < blocks.length; b++) {
      const el = blocks[b];
      if (el.tagName === "TR") {
        const r = el.getBoundingClientRect();
        const top = r.top - o, bottom = r.bottom - o;
        page = Math.max(page, pageAt(top));
        if ((forceNext || bottom > bottomOf(page) + 0.5) && top > topOf(page) + 1) { gapBefore(el, topOf(page + 1)); page++; }
        forceNext = false;
        continue;
      }
      const lk = lookOf(el);
      let lines = linesOf(el, o);
      if (!lines.length) continue;
      page = Math.max(page, pageAt(lines[0].top));
      if ((forceNext || (lk.page_break_before && b > 0)) && topOfEl(el) > topOf(page) + 1) {
        gapBefore(el, topOf(page + 1));
        page++;
        lines = linesOf(el, o);
      }
      forceNext = false;
      // Sauts de page forcés dans le paragraphe : la ligne qui suit change de feuille.
      const forced = (Array.from(el.querySelectorAll(".pbr")) as HTMLElement[]).map((x) => x.getBoundingClientRect().top - o);
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
          let k = b;
          while (k > 0 && blocks[k - 1].classList.contains("d-p") && blocks[k - 1].parentElement === el.parentElement && lookOf(blocks[k - 1]).keep_next && topOfEl(blocks[k - 1]) > topOf(page) + 1) k--;
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
            lines = linesOf(el, o);
            i = 0;
            continue;
          }
        }
        const target = topOf(page + 1);
        const L = parseFloat(getComputedStyle(el).lineHeight) || (lines[at].bottom - lines[at].top);
        const lead = Math.max(0, (L - (lines[at].bottom - lines[at].top)) / 2);
        const want = lines[at].top;
        const { node, before } = lineStart(lines[at], o);
        const gap = gapEl(true, target - (want - lead));
        node.insertBefore(gap, before);
        // Ajustement : la ligne repoussée doit commencer au haut de la feuille.
        const moved = linesOf(el, o)[at];
        if (moved) gap.style.height = `${Math.max(0, parseFloat(gap.style.height) + (target + lead - moved.top))}px`;
        page++;
        lines = linesOf(el, o);
        i = at + 1;
      }
      if (restart) continue;
      // Saut de page en fin de paragraphe : le bloc suivant change de feuille.
      const lastLine = lines[lines.length - 1];
      if (forced.some((y) => y >= lastLine.top - 1)) forceNext = true;
    }
    const end = paper.scrollHeight;
    return Math.max(1, pageAt(Math.max(0, end - pg.bottom * pt - 1)) + 1);
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
    const frag = document.createDocumentFragment();
    for (let k = 0; k < pages; k++) {
      const sh = document.createElement("div");
      sh.className = "sheet";
      sh.style.left = `${paper.offsetLeft}px`;
      sh.style.top = `${paper.offsetTop + k * stride}px`;
      sh.style.width = `${paper.offsetWidth}px`;
      sh.style.height = `${pageH}px`;
      if (k > 0) {
        for (const z of pinned) {
          const c = z.cloneNode(true) as HTMLElement;
          c.removeAttribute("contenteditable");
          c.querySelectorAll("[contenteditable]").forEach((x) => x.removeAttribute("contenteditable"));
          c.querySelectorAll("[data-idx]").forEach((x) => x.removeAttribute("data-idx"));
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
    const x = paper.offsetLeft + (pg.left - ln.distance) * pt;
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
          num.style.top = `${paper.offsetTop + line.bottom - size * 1.15}px`;
          frag.appendChild(num);
        }
        n++;
      }
    }
    if (ln.font) lnLayer.style.fontFamily = `"${ln.font}", "Times New Roman", serif`;
    lnLayer.replaceChildren(frag);
  }

  function repaint(idx: number) {
    const old = paper.querySelector(`.d-p[data-idx="${idx}"]`);
    if (old) old.replaceWith(renderPara(idx));
    scheduleLines();
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
    renderCards();
    renderStatus();
    syncToolbar();
    notice.classList.toggle("show", next.openInWord);
    if (next.openInWord) {
      notice.innerHTML = `${ICON.warn}<span>Ce document est aussi ouvert dans Word. Ferme-le dans Word avant de le retoucher ici : Word écraserait ces retouches à son prochain enregistrement.</span>`;
    }
  }

  function status(text: string, err = false) {
    lastStatus = text;
    const s = foot.querySelector(".st") as HTMLElement | null;
    if (s) { s.textContent = text; s.classList.toggle("err", err); }
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
              ghosts = [];
              applyModel(fresh, sel);
              if (same) continue;
              status("Le document a changé pendant ce geste : refais-le sur la version à jour.", true);
              return false;
            }
            throw e;
          }
        }
        return false;
      } catch (e: any) {
        ghosts = [];
        status(e.message || String(e), true);
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
        inflight++;
        status("Enregistrement…");
        try {
          const r = await api("/docx/op", { path: PATH, revision: model!.revision, author, tracked, op: { op: "insert", paragraph: ref(g.idx), at: g.at, with: g.text } });
          const sel = readSel();
          ghosts.shift();
          applyModel(r.model, sel);
          status("Enregistré dans le .docx");
        } catch (e: any) {
          ghosts = [];
          status(e.status === 409 ? "Le document a changé pendant la frappe : la dernière saisie n'a pas été enregistrée." : (e.message || String(e)), true);
          try { applyModel(await api(`/docx/model?path=${enc(PATH)}`), readSel()); } catch { /* le message reste */ }
        } finally {
          inflight--;
        }
      });
    }
    return chain;
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
          status(redo ? "Rétabli" : "Annulé");
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
  function closeMenu() {
    if (openMenu) { openMenu.classList.remove("show"); const m = openMenu; setTimeout(() => m.remove(), 150); }
    openTrigger?.classList.remove("open");
    openMenu = null;
    openTrigger = null;
  }
  type Item = { label: string; html?: string; on?: boolean; danger?: boolean; sep?: boolean; run?: () => void };
  function showMenu(trigger: HTMLElement, items: Item[], alignRight = false) {
    if (openTrigger === trigger) { closeMenu(); return; }
    closeMenu();
    const m = document.createElement("div");
    m.className = "menu";
    m.setAttribute("role", "menu");
    for (const it of items) {
      if (it.sep) { const s = document.createElement("div"); s.className = "mi-sep"; m.appendChild(s); continue; }
      const b = document.createElement("button");
      b.className = "mi" + (it.danger ? " danger" : "");
      b.setAttribute("role", "menuitem");
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
    openMenu = m;
    openTrigger = trigger;
  }
  document.addEventListener("mousedown", (e) => {
    if (openMenu && !openMenu.contains(e.target as Node) && !(openTrigger && openTrigger.contains(e.target as Node))) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenu(); hidePop(); } });

  // ---------------------------------------------------------- barres
  const fmtbar = $("fmtbar");
  const revbar = $("revbar");
  const FONTS = ["Times New Roman", "Calibri", "Cambria", "Arial", "Helvetica", "Georgia", "Garamond", "Palatino"];
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36];
  fmtbar.innerHTML = `
    <button class="dd w-style" id="ddStyle" data-tooltip="Style du paragraphe"><span>Normal</span>${ICON.chev}</button>
    <button class="dd w-font" id="ddFont" data-tooltip="Police"><span>Police</span>${ICON.chev}</button>
    <button class="dd w-size" id="ddSize" data-tooltip="Taille"><span>12</span>${ICON.chev}</button>
    <span class="vsep"></span>
    <button class="tb" data-run="b" data-tooltip="Gras (⌘B)"><span class="glyph b">G</span></button>
    <button class="tb" data-run="i" data-tooltip="Italique (⌘I)"><span class="glyph i">I</span></button>
    <button class="tb" data-run="u" data-tooltip="Souligné (⌘U)"><span class="glyph u">S</span></button>
    <button class="tb" data-run="strike" data-tooltip="Barré"><span class="glyph s">ab</span></button>
    <button class="tb" data-run="sup" data-tooltip="Exposant"><span class="glyph">x<sup>2</sup></span></button>
    <button class="tb" data-run="sub" data-tooltip="Indice"><span class="glyph">x<sub>2</sub></span></button>
    <span class="vsep"></span>
    <button class="tb" data-align="left" data-tooltip="Aligner à gauche">${ICON.alLeft}</button>
    <button class="tb" data-align="center" data-tooltip="Centrer">${ICON.alCenter}</button>
    <button class="tb" data-align="right" data-tooltip="Aligner à droite">${ICON.alRight}</button>
    <button class="tb" data-align="both" data-tooltip="Justifier">${ICON.alBoth}</button>
    <span class="vsep"></span>
    <button class="tb" id="btnBullets" data-tooltip="Liste à puces">${ICON.bullets}</button>
    <button class="tb" id="btnNumbers" data-tooltip="Liste numérotée">${ICON.numbers}</button>
    <span class="vsep"></span>
    <button class="tb" id="btnComment" data-tooltip="Commenter la sélection">${ICON.comment}</button>
    <button class="tb" id="btnNote" data-tooltip="Insérer une note de bas de page">${ICON.note}</button>
    <button class="tb" id="btnFigure" data-tooltip="Insérer une figure du projet">${ICON.figure}</button>
    <button class="tb" id="btnTable" data-tooltip="Lignes et colonnes du tableau">${ICON.table}</button>
    <button class="tb" id="btnUndo" data-tooltip="Annuler (⌘Z)">${ICON.undo}</button>
    <button class="tb" id="btnRedo" data-tooltip="Rétablir (⌘⇧Z)">${ICON.redo}</button>
    <span class="sp"></span>
    <button class="track on" id="btnTrack" data-tooltip="Suivi des modifications : Christophe verra chaque retouche dans Word"><span class="sw"><i></i></span>Suivi</button>`;
  revbar.innerHTML = `
    <div class="seg" id="segView"><button data-view="revue" class="on">Revue</button><button data-view="final">Final</button><button data-view="original">Original</button></div>
    <span class="sp"></span>
    <span class="pagesw">Page<span class="seg" id="segPage"><button data-page="blanche">Blanche</button><button data-page="theme">Thème</button></span></span>
    <span class="vsep"></span>
    <span class="nav"><button class="tb" id="navPrev" data-tooltip="Précédent">${ICON.left}</button><span class="num" id="navNum">0 / 0</span><button class="tb" id="navNext" data-tooltip="Suivant">${ICON.right}</button></span>
    <button class="btn" id="btnAll">Tout accepter${ICON.chev}</button>`;

  // Les boutons ne prennent pas le focus : la sélection reste dans la page.
  for (const b of Array.from(document.querySelectorAll("#fmtbar button, #revbar button"))) {
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
    status(tracked ? "Suivi des modifications activé" : "Suivi désactivé : tes retouches s'écrivent directement");
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
  $("btnBullets").addEventListener("click", () => { const s = listStyle(/puce|bullet/i); if (s) applyPara({ style: s.id }); });
  $("btnNumbers").addEventListener("click", () => { const s = listStyle(/num[ée]ro|number/i); if (s) applyPara({ style: s.id }); });
  $("btnComment").addEventListener("click", () => askComment());
  $("btnNote").addEventListener("click", () => {
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
  });
  $("btnTable").addEventListener("click", (e) => {
    const sel = readSel();
    const p = sel && model ? model.paragraphs[sel.a.idx] : null;
    if (!sel || !p || !p.cell || view === "original") return;
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
    showMenu(e.currentTarget as HTMLElement, [
      { label: "Insérer une ligne au-dessus", run: () => run({ op: "insert_row", paragraph: ref(sel.a.idx), above: true }, toCell(r, 0)) },
      { label: "Insérer une ligne en dessous", run: () => run({ op: "insert_row", paragraph: ref(sel.a.idx) }, toCell(r + 1, 0)) },
      { label: "Insérer une colonne à gauche", run: () => run({ op: "insert_column", paragraph: ref(sel.a.idx), left: true }, toCell(r, c), direct && `Colonne ajoutée ${direct}`) },
      { label: "Insérer une colonne à droite", run: () => run({ op: "insert_column", paragraph: ref(sel.a.idx) }, toCell(r, c + 1), direct && `Colonne ajoutée ${direct}`) },
      { label: "", sep: true },
      { label: "Supprimer la ligne", danger: true, run: () => run({ op: "delete_row", paragraph: ref(sel.a.idx) }, () => null) },
      { label: "Supprimer la colonne", danger: true, run: () => run({ op: "delete_column", paragraph: ref(sel.a.idx) }, () => null, direct && `Colonne supprimée ${direct}`) },
    ]);
  });
  $("btnFigure").addEventListener("click", async (e) => {
    const trigger = e.currentTarget as HTMLElement;
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
  });

  revbar.querySelectorAll<HTMLElement>("[data-view]").forEach((b) => b.addEventListener("click", () => {
    view = b.dataset.view as typeof view;
    document.body.classList.remove("v-revue", "v-final", "v-original");
    document.body.classList.add(`v-${view}`);
    revbar.querySelectorAll("[data-view]").forEach((x) => x.classList.toggle("on", x === b));
    paper.contentEditable = view === "original" ? "false" : "true";
    layoutCards();
    scheduleLines();
  }));
  function setPage(next: string, save: boolean) {
    page = next;
    document.body.classList.toggle("blanche", page === "blanche");
    revbar.querySelectorAll("[data-page]").forEach((x) => x.classList.toggle("on", (x as HTMLElement).dataset.page === page));
    if (save) api("/docx/prefs", { page }).catch(() => undefined);
  }
  revbar.querySelectorAll<HTMLElement>("[data-page]").forEach((b) => b.addEventListener("click", () => setPage(b.dataset.page!, true)));
  $("btnAll").addEventListener("click", (e) => {
    if (!model) return;
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
    showMenu(e.currentTarget as HTMLElement, items, true);
  });
  $("navPrev").addEventListener("click", () => step(-1));
  $("navNext").addEventListener("click", () => step(1));

  function currentPara(): Para | null {
    const sel = readSel();
    return sel && model ? model.paragraphs[sel.a.idx] || null : null;
  }

  function syncToolbar() {
    if (!model) return;
    const sel = readSel();
    const p = sel ? model.paragraphs[sel.a.idx] : null;
    const seg = sel ? segAt(sel.a.off === sel.b.off || sel.a.idx !== sel.b.idx ? sel.a : { idx: sel.a.idx, off: sel.a.off + 1 }) : null;
    const style = model.styles.find((s) => s.id === (p?.style || "Normal"));
    ($("ddStyle").firstElementChild as HTMLElement).textContent = styleLabel(style ? style.name : (p?.style || "Normal"));
    ($("ddFont").firstElementChild as HTMLElement).textContent = seg?.font || "Police du style";
    ($("ddSize").firstElementChild as HTMLElement).textContent = seg?.size ? String(seg.size).replace(".", ",") : "–";
    fmtbar.querySelectorAll<HTMLElement>("[data-run]").forEach((b) => b.classList.toggle("on", !!(seg && (seg as Record<string, unknown>)[b.dataset.run!])));
    fmtbar.querySelectorAll<HTMLElement>("[data-align]").forEach((b) => b.classList.toggle("on", (p?.align || "left") === b.dataset.align));
    ($("btnBullets") as HTMLButtonElement).disabled = !listStyle(/puce|bullet/i);
    ($("btnNumbers") as HTMLButtonElement).disabled = !listStyle(/num[ée]ro|number/i);
    ($("btnComment") as HTMLButtonElement).disabled = !sel || collapsed(sel);
    ($("btnNote") as HTMLButtonElement).disabled = !sel || !!(p && p.story);
    ($("btnTable") as HTMLButtonElement).disabled = !p || !p.cell;
  }

  async function decideAll(op: string, who?: string) {
    structural(async () => {
      const ok = await sendOp({ op, author: who ?? null });
      if (ok) status(op === "accept_all" ? "Modifications acceptées" : "Modifications refusées");
    });
  }

  // ------------------------------------------------------- cartes de marge
  type CardItem = { key: string; kind: "change" | "comment"; ids: number[]; author: string; anchor: HTMLElement | null; idx: number; head: string; body: string; done?: boolean };
  let cardItems: CardItem[] = [];

  const KIND: Record<string, string> = {
    ins: "Ajout", del: "Suppression", moveTo: "Déplacé ici", moveFrom: "Déplacé", "paragraph-ins": "Paragraphe ajouté",
    "paragraph-del": "Paragraphes fusionnés", "row-ins": "Ligne ajoutée", "row-del": "Ligne supprimée", format: "Mise en forme", cell: "Cellule",
  };
  const shortDate = (d?: string) => (d ? new Date(d).toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) : "");
  const clip = (s: string, n = 140) => (cp(s) > n ? Array.from(s).slice(0, n).join("") + "…" : s);

  function collectCards(): CardItem[] {
    if (!model) return [];
    const items: CardItem[] = [];
    const byId = changeById();
    const seen = new Set<number>();
    const anchorOf = (sel: string) => paper.querySelector(sel) as HTMLElement | null;
    const paraIdx = (pid?: string) => (pid ? model!.paragraphs.findIndex((p) => p.id === pid) : -1);
    // Suivis dans l'ordre du document : une suppression suivie d'un ajout du
    // même auteur forme un remplacement, avec une seule carte.
    model.paragraphs.forEach((p, idx) => {
      const segs = p.segments.filter((s) => s.change !== undefined);
      for (let k = 0; k < segs.length; k++) {
        const s = segs[k];
        if (seen.has(s.change!)) continue;
        const c = byId.get(s.change!);
        if (!c) continue;
        seen.add(c.id);
        const ids = [c.id];
        let head = "";
        let body = "";
        const next = segs[k + 1];
        const nc = next ? byId.get(next.change!) : undefined;
        if ((c.kind === "del" || c.kind === "moveFrom") && nc && nc.kind === "ins" && nc.author === c.author && !seen.has(nc.id)) {
          seen.add(nc.id);
          ids.push(nc.id);
          head = "Remplacement";
          body = `<s>${esc(clip(c.text, 80))}</s> → ${esc(clip(nc.text, 80))}`;
        } else {
          head = KIND[c.kind] || c.kind;
          body = c.kind === "del" || c.kind === "moveFrom" ? `<s>${esc(clip(c.text))}</s>` : esc(clip(c.text));
        }
        items.push({ key: `ch${c.id}`, kind: "change", ids, author: c.author, anchor: anchorOf(`[data-ch="${c.id}"]`), idx, head: `<span class="c-kind">${head}</span>`, body: `<div class="c-body">${body}</div>` });
      }
    });
    for (const c of model.changes) {
      if (seen.has(c.id)) continue;
      const idx = paraIdx(c.paragraph);
      const body = c.kind === "format" && c.text ? `<div class="c-body">${esc(clip(c.text))}</div>` : "";
      items.push({ key: `ch${c.id}`, kind: "change", ids: [c.id], author: c.author, anchor: idx >= 0 ? anchorOf(`.d-p[data-idx="${idx}"]`) : null, idx: idx >= 0 ? idx : 1e9, head: `<span class="c-kind">${KIND[c.kind] || c.kind}</span>`, body });
    }
    for (const c of model.comments.filter((x) => x.parent === undefined || x.parent === null)) {
      const idx = paraIdx(c.paragraph);
      const replies = model.comments.filter((r) => r.parent === c.id);
      const span = Array.from(paper.querySelectorAll<HTMLElement>("[data-c]")).find((el) => el.dataset.c!.split(" ").includes(String(c.id))) || null;
      const head = `<span class="c-date">${c.done ? "résolu · " : ""}${shortDate(c.date)}</span>`;
      const body = `${c.quote ? `<div class="c-body"><q>${esc(clip(c.quote, 80))}</q></div>` : ""}
        <div class="c-body">${esc(c.text)}</div>
        ${replies.map((r) => `<div class="c-reply" style="--rev-color:${authorColor(r.author)}"><span class="av">${esc(r.initials || "?")}</span><div><div class="c-name">${esc(r.author)}</div><div class="c-body">${esc(r.text)}</div></div></div>`).join("")}
        <div class="c-foot">
          <button class="btn" data-act="reply">${ICON.reply}Répondre</button>
          <button class="btn" data-act="resolve">${c.done ? "Rouvrir" : "Résoudre"}</button>
          <button class="btn" data-act="ask">${ICON.chat}Agent</button>
          <span class="sp"></span>
          <button class="tb" data-act="delete" data-tooltip="Supprimer le commentaire et ses réponses">${ICON.trash}</button>
        </div>`;
      items.push({ key: `c${c.id}`, kind: "comment", ids: [c.id], author: c.author, anchor: span || (idx >= 0 ? anchorOf(`.d-p[data-idx="${idx}"]`) : null), idx: idx >= 0 ? idx : 1e9, head, body, done: c.done });
    }
    return items;
  }

  function renderCards() {
    cardItems = collectCards();
    const frag = document.createDocumentFragment();
    for (const it of cardItems) {
      const el = document.createElement("div");
      el.className = "card" + (it.done ? " done" : "") + (it.key === focusKey ? " focus" : "");
      el.dataset.key = it.key;
      el.style.setProperty("--rev-color", authorColor(it.author));
      const initials = it.author.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase() || "?";
      const acts = it.kind === "change"
        ? `<span class="c-acts"><button class="tb no" data-act="reject" data-tooltip="Refuser">${ICON.x}</button><button class="tb ok" data-act="accept" data-tooltip="Accepter">${ICON.check}</button></span>`
        : "";
      el.innerHTML = `<div class="c-head"><span class="av">${esc(initials)}</span><span class="c-name">${esc(it.author || "Inconnu")}</span>${it.head}${acts}</div>${it.body}`;
      frag.appendChild(el);
    }
    cardsEl.replaceChildren(frag);
    layoutCards();
  }

  function layoutCards() {
    const visible = view === "revue";
    // Sans fiche à montrer, la marge de revue disparaît : la page reprend la largeur du panneau.
    document.body.classList.toggle("no-margin", !visible || !cardItems.length);
    fitPage();
    placeCards();
  }

  function placeCards() {
    const visible = view === "revue";
    const base = cardsEl.getBoundingClientRect().top;
    let bottom = 0;
    const order: { el: HTMLElement; y: number }[] = [];
    const byKey = new Map(cardItems.map((c) => [c.key, c]));
    for (const el of Array.from(cardsEl.children) as HTMLElement[]) {
      const it = byKey.get(el.dataset.key!)!;
      el.style.display = visible ? "block" : "none";
      const a = it.anchor && it.anchor.isConnected ? it.anchor : null;
      const want = a ? a.getBoundingClientRect().top - base : 1e6;
      order.push({ el, y: want });
    }
    order.sort((x, y) => x.y - y.y);
    for (const o of order) {
      const y = Math.max(o.y === 1e6 ? bottom : o.y, bottom);
      o.el.style.top = `${y}px`;
      bottom = y + o.el.offsetHeight + 8;
    }
    cardsEl.style.height = `${bottom}px`;
    const ordered = order.map((o) => o.el.dataset.key!);
    cardItems.sort((a, b) => ordered.indexOf(a.key) - ordered.indexOf(b.key));
    const n = cardItems.findIndex((c) => c.key === focusKey);
    $("navNum").textContent = `${n >= 0 ? n + 1 : 0} / ${cardItems.filter((c) => !c.done).length}`;
  }

  function focusCard(key: string, scroll: boolean) {
    focusKey = key;
    cardsEl.querySelectorAll(".card").forEach((c) => c.classList.toggle("focus", (c as HTMLElement).dataset.key === key));
    paper.querySelectorAll(".cmt.on").forEach((x) => x.classList.remove("on"));
    const it = cardItems.find((c) => c.key === key);
    if (it && it.kind === "comment") {
      paper.querySelectorAll<HTMLElement>("[data-c]").forEach((el) => { if (el.dataset.c!.split(" ").includes(String(it.ids[0]))) el.classList.add("on"); });
    }
    if (it && scroll && it.anchor) it.anchor.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    layoutCards();
  }

  function step(dir: number) {
    const open = cardItems.filter((c) => !c.done);
    if (!open.length) return;
    const n = open.findIndex((c) => c.key === focusKey);
    const next = open[(n + dir + open.length) % open.length];
    focusCard(next.key, true);
  }

  cardsEl.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest("textarea")) return;
    if ((e.target as HTMLElement).closest("button")) e.preventDefault();
  });
  cardsEl.addEventListener("click", (e) => {
    const card = (e.target as HTMLElement).closest(".card") as HTMLElement | null;
    if (!card) return;
    const it = cardItems.find((c) => c.key === card.dataset.key);
    if (!it) return;
    const act = ((e.target as HTMLElement).closest("[data-act]") as HTMLElement | null)?.dataset.act;
    if (!act) { focusCard(it.key, true); return; }
    if (act === "accept" || act === "reject") {
      structural(async () => {
        const ops = it.ids.map((id) => ({ op: act, id }));
        await sendOp(ops.length === 1 ? ops[0] : { op: "batch", ops });
      });
    } else if (act === "resolve") {
      const c = model!.comments.find((x) => x.id === it.ids[0]);
      structural(async () => { await sendOp({ op: "resolve", id: it.ids[0], done: !(c && c.done) }); });
    } else if (act === "delete") {
      structural(async () => { await sendOp({ op: "delete_comment", id: it.ids[0] }); });
    } else if (act === "reply") {
      if (card.querySelector("textarea")) return;
      const box = document.createElement("div");
      box.innerHTML = `<textarea class="c-input" placeholder="Répondre à ${esc(it.author)}…"></textarea><div class="c-foot"><span class="sp"></span><button class="btn" data-x="cancel">Annuler</button><button class="btn primary" data-x="send">Répondre</button></div>`;
      card.appendChild(box);
      const ta = box.querySelector("textarea")!;
      ta.focus();
      layoutCards();
      const send = () => {
        const text = ta.value.trim();
        if (!text) return;
        structural(async () => { await sendOp({ op: "reply", parent: it.ids[0], text }); });
      };
      box.querySelector('[data-x="send"]')!.addEventListener("click", (ev) => { ev.stopPropagation(); send(); });
      box.querySelector('[data-x="cancel"]')!.addEventListener("click", (ev) => { ev.stopPropagation(); box.remove(); layoutCards(); });
      ta.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); send(); } });
    } else if (act === "ask") {
      const c = model!.comments.find((x) => x.id === it.ids[0])!;
      const replies = model!.comments.filter((r) => r.parent === c.id).map((r) => `\n  ↳ ${r.author} : ${r.text}`).join("");
      toChat(`${PATH} (commentaire c${c.id}${c.paragraph ? `, ${c.paragraph}` : ""}) — ${c.author} sur « ${c.quote} » : ${c.text}${replies}`);
    }
  });
  window.addEventListener("resize", () => layoutCards());
  paper.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest("[data-ch],[data-c]") as HTMLElement | null;
    if (!el) return;
    if (el.dataset.c) focusCard(`c${el.dataset.c.split(" ")[0]}`, false);
    else if (el.dataset.ch) {
      const it = cardItems.find((c) => c.ids.includes(Number(el.dataset.ch)));
      if (it) focusCard(it.key, false);
    }
  });

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

  // Bulle de note partagée avec les autres surfaces : Entrée écrit un
  // commentaire Word sur le passage, la bulle de chat l'envoie au chat.
  const UI = W.AtelierAnnotationUI;
  const noteHost = document.createElement("div");
  noteHost.className = "d-note-editor";
  document.body.appendChild(noteHost);
  let noteSel: Sel | null = null;
  function hideNote() { noteHost.classList.remove("show"); noteSel = null; }
  function quoteOf(sel: Sel) {
    return `${PATH} (${model!.paragraphs[sel.a.idx].id}${sel.b.idx !== sel.a.idx ? `-${model!.paragraphs[sel.b.idx].id}` : ""}) : « ${selectionText(sel)} »`;
  }
  const noteUI = UI?.createNoteEditor(noteHost, {
    placeholder: "Commentaire dans le .docx…",
    submitLabel: "Commenter",
    onSubmit: (value: string) => {
      const sel = noteSel, text = value.trim();
      if (!sel || !text) return;
      hideNote();
      // Un commentaire couvre un passage d'un seul paragraphe : on borne au premier.
      const end = sel.a.idx === sel.b.idx ? sel.b.off : cp(virtualText(sel.a.idx));
      structural(async () => { await sendOp({ op: "comment_range", paragraph: ref(sel.a.idx), start: sel.a.off, end, text }, () => sel); });
    },
    onSendDirect: (value: string) => {
      const sel = noteSel;
      if (!sel) return;
      hideNote();
      toChat(value.trim() ? `${quoteOf(sel)}\n${value.trim()}` : quoteOf(sel));
    },
    onDelete: hideNote,
    onDismiss: hideNote,
  });
  function askComment() {
    const sel = readSel();
    if (!sel || collapsed(sel) || !model || !noteUI) return;
    const rect = getSelection()!.getRangeAt(0).getBoundingClientRect();
    noteSel = sel;
    selbar.classList.remove("show");
    noteUI.input.value = "";
    noteUI.status.textContent = "";
    noteHost.classList.add("show");
    const h = noteHost.offsetHeight;
    noteHost.style.left = `${Math.max(8, Math.min(innerWidth - noteHost.offsetWidth - 8, rect.left))}px`;
    noteHost.style.top = `${rect.bottom + 8 + h < innerHeight - 8 ? rect.bottom + 8 : Math.max(8, rect.top - h - 8)}px`;
    noteUI.focus();
  }
  paper.addEventListener("mousedown", () => { if (noteHost.classList.contains("show")) hideNote(); });

  // Capsule de sélection commune à Atelier (PDF, LaTeX, Markdown, code).
  // Surligner et souligner deviennent une mise en forme Word, en suivi si actif.
  const selbar = $("selbar");
  const WORD_COLOR: Record<string, string> = { amber: "yellow", green: "green", blue: "cyan", red: "magenta" };
  UI?.createSelectionActions(selbar, {
    onAdd: () => {
      const sel = readSel();
      if (!sel || collapsed(sel)) return;
      selbar.classList.remove("show");
      toChat(quoteOf(sel));
    },
    onAnnotate: askComment,
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
  paper.addEventListener("focus", placeCaret);
  paper.addEventListener("input", scheduleLines);
  // Une image qui arrive après la mise en page déplace la suite : on recoupe.
  paper.addEventListener("load", (e) => { if ((e.target as HTMLElement).tagName === "IMG") scheduleLines(); }, true);
  paper.addEventListener("error", (e) => { if ((e.target as HTMLElement).tagName === "IMG") scheduleLines(); }, true);
  document.fonts?.ready.then(scheduleLines).catch(() => undefined);
  paper.addEventListener("blur", () => caret.classList.remove("on"));
  addEventListener("resize", placeCaret);
  document.addEventListener("selectionchange", () => {
    placeCaret();
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
    foot.innerHTML = `<span>${model.changes.length} modification${model.changes.length > 1 ? "s" : ""}</span>
      ${pending.length ? `<span>·</span><span>${pending.length} de ${esc(agentNames.join(", "))} en attente</span>` : ""}
      <span>·</span><span>${model.comments.filter((c) => !c.done && (c.parent === undefined || c.parent === null)).length} commentaire(s) ouvert(s)</span>
      ${other ? `<span>·</span><span data-tooltip="Notes de bas de page, en-têtes ou pieds de page : à traiter dans Word">${other} hors du texte</span>` : ""}
      <span class="sp"></span>
      <span class="st"></span>
      <span>·</span><button id="who" data-tooltip="Nom inscrit sur tes retouches et commentaires">Signé ${esc(author)}</button>`;
    status(lastStatus || "Enregistré dans le .docx", false);
    $("who").addEventListener("click", (e) => {
      showPopAt((e.currentTarget as HTMLElement).getBoundingClientRect(), `<label>Nom sur tes retouches (celui que Christophe voit dans Word)<input value="${esc(author)}"></label><div class="c-foot"><button class="btn" data-x="cancel">Annuler</button><button class="btn primary" data-x="send">Enregistrer</button></div>`);
      pop.style.top = `${(e.currentTarget as HTMLElement).getBoundingClientRect().top - pop.offsetHeight - 8}px`;
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
  }

  // ------------------------------------------------- relecture du disque
  async function poll() {
    if (document.hidden || !model || ghosts.length || inflight || structBusy) return;
    try {
      const s = await api(`/docx/stat?path=${enc(PATH)}`);
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
      status("Enregistré dans le .docx");
      setInterval(poll, POLL_MS);
    } catch (e: any) {
      paper.innerHTML = `<div class="loading">Ce document ne s'ouvre pas ici : ${esc(e.message || String(e))}</div>`;
    }
  }
  window.addEventListener("pagehide", () => { flushGhosts(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushGhosts(); });
  boot();
})();
