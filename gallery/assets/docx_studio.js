// Generated from gallery/src/browser/docx_studio.ts; edit the TypeScript source.
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












  /** Apparence résolue par la base (styles de Word), en points. */
































  const W = window






   ;
  const Q = new URLSearchParams(location.search);
  const PATH = Q.get("path") || Q.get("file") || "";
  const NAME = PATH.split("/").pop() || "document.docx";
  const AGENT = /^(claude|codex|kimi|grok|opencode|agent)\b/i;
  const IDLE_MS = 450;
  const POLL_MS = 1500;

  const $ = (id        ) => document.getElementById(id)               ;
  const paper = $("paper");
  const scroller = $("scroll");
  const cardsEl = $("cards");
  const foot = $("foot");
  const notice = $("notice");

  let model               = null;
  let view                                 = "revue";
  let tracked = true;
  let author = "";
  let page = "blanche";
  let ghosts          = [];
  let idleTimer = 0;
  let chain                   = Promise.resolve();
  let inflight = 0;
  let structBusy = false;
  let backlog                          = [];
  let focusKey = "";
  let lastStatus = "";
  let composing             = null;
  const cp = (s        ) => Array.from(s).length;

  // ---------------------------------------------------------------- icônes
  const svg = (d        , w = 1.4) =>
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  // Teintes de surlignage de Word, rendues avec celles des annotations
  // d'Atelier pour les quatre que la capsule propose.
  const HIGHLIGHT                         = {
    yellow: "rgba(255,213,74,.40)", green: "rgba(120,220,140,.40)", cyan: "rgba(120,170,255,.40)", magenta: "rgba(255,140,160,.40)",
    darkYellow: "color-mix(in srgb, olive 40%, transparent)", darkGreen: "color-mix(in srgb, green 40%, transparent)",
    darkCyan: "color-mix(in srgb, teal 40%, transparent)", darkMagenta: "color-mix(in srgb, purple 40%, transparent)",
    darkBlue: "color-mix(in srgb, navy 40%, transparent)", darkRed: "color-mix(in srgb, maroon 40%, transparent)",
    darkGray: "color-mix(in srgb, gray 40%, transparent)", lightGray: "color-mix(in srgb, silver 40%, transparent)",
  };
  const ICON = {
    chev: svg('<path d="M8 10l4 4 4-4"/>'),
    more: svg('<circle cx="6" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="18" cy="12" r=".9"/>'),
    plus: svg('<path d="M12 6v12M6 12h12"/>'),
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
  const esc = (s        ) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]          );

  // ---------------------------------------------------------------- serveur
  async function api(url        , body          )               {
    const res = await fetch(url, body === undefined ? undefined : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    let data      = null;
    try { data = await res.json(); } catch { /* corps vide */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `erreur ${res.status}`)                               ;
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const enc = encodeURIComponent;

  /** Corps, puis notes, puis en-têtes et pieds dans une seule liste : un
   *  rang (`idx`) désigne n'importe quel paragraphe modifiable. */
  function normalize(m       )        {
    if (m.body !== undefined) return m;
    const body         = m.paragraphs.map((p) => ({ ...p, story: "" }));
    const rest         = [];
    for (const n of m.notes || []) for (const p of n.paragraphs) rest.push({ ...p, story: n.id });
    for (const h of m.headers || []) for (const p of h.paragraphs) rest.push({ ...p, story: h.id });
    return { ...m, body: body.length, paragraphs: body.concat(rest) };
  }
  const storyAt = (idx        ) => (model && model.paragraphs[idx] ? model.paragraphs[idx].story || "" : "");
  /** Premier et dernier rang de l'histoire du paragraphe `idx`. */
  function storySpan(idx        )                   {
    const st = storyAt(idx);
    let a = idx, b = idx;
    while (a > 0 && storyAt(a - 1) === st) a--;
    while (b + 1 < model .paragraphs.length && storyAt(b + 1) === st) b++;
    return [a, b];
  }
  /** Référence d'un paragraphe pour le moteur, par rang dans son histoire
   *  (`p3`, `n1.p0`, `header1.p0`) ; `story`/`start` pour un paragraphe
   *  qu'un lot vient de créer. */
  function refIn(story        , start        , idx        )         {
    return `${story ? `${story}.` : ""}p${idx - start}`;
  }
  /** Segments « d'un bloc » (figure, note, citation, équation) : une
   *  retouche qui les touche les prend en entier. */
  function expandWhole(idx        , s        , e        )                   {
    const p = model .paragraphs[idx];
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
  const colorCache = new Map                ();
  function authorColor(name        )         {
    if (!name) return "var(--text-muted)";
    if (AGENT.test(name)) return "var(--accent)";
    if (name === author) return "var(--text-muted)";
    if (!colorCache.has(name)) colorCache.set(name, `var(--doc-author-${(colorCache.size % 3) + 1})`);
    return colorCache.get(name)          ;
  }
  const changeById = () => new Map((model?.changes || []).map((c) => [c.id, c]         ));

  // ------------------------------------------------- paragraphe « virtuel »
  /** Segments du paragraphe avec la frappe pas encore confirmée insérée. */
  function virtualSegments(idx        )        {
    const p = model .paragraphs[idx];
    let segs        = p.segments.map((s) => ({ ...s }));
    for (const g of ghosts) {
      if (g.idx !== idx) continue;
      const out        = [];
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
  const virtualLen = (idx        ) => virtualSegments(idx).reduce((n, s) => n + (s.rev === "del" || s.rev === "moveFrom" ? 0 : cp(s.text)), 0);
  const virtualText = (idx        ) => virtualSegments(idx).filter((s) => !(s.rev === "del" || s.rev === "moveFrom")).map((s) => s.text).join("");

  // ------------------------------------------------------------------ rendu
  /** Texte d'un segment avec sa mise en forme (gras, italique…). */
  function styled(s     )       {
    let inner       = document.createTextNode(s.text);
    const wrap = (tag        ) => { const w = document.createElement(tag); w.appendChild(inner); inner = w; };
    if (s.b) wrap("b");
    if (s.i) wrap("i");
    if (s.u) wrap("u");
    if (s.strike) wrap("s");
    if (s.sup) wrap("sup");
    if (s.sub) wrap("sub");
    return inner;
  }
  function renderPara(idx        )              {
    const p = model .paragraphs[idx];
    const el = document.createElement("p");
    el.className = "d-p";
    el.dataset.idx = String(idx);
    if (p.look && model .page) applyLook(el, p.look);
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
      let node             ;
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
          if (s.width) img.style.width = model .page ? `calc(var(--pt) * ${s.width * 0.75})` : `${s.width}px`;
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
        if (s.size) node.style.fontSize = model .page ? `calc(var(--pt) * ${s.size})` : `${s.size}pt`;
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
      const fmt = (model .changes || []).find((c) => c.paragraph === p.id && c.kind === "format");
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
    let table                          = null;
    let tIdx = -1;
    let row                             = null;
    let rIdx = -1;
    let cell                              = null;
    let cIdx = -1;
    const zones = new Map                     ();
    const zone = (story        )              => {
      let z = zones.get(story);
      if (z) return z;
      z = document.createElement("div");
      const note = (model .notes || []).find((n) => n.id === story);
      const hf = (model .headers || []).find((h) => h.id === story);
      if (note) {
        z.className = "d-note";
        z.innerHTML = `<span class="d-note-n" contenteditable="false">${note.number ?? ""}</span><div class="d-note-b"></div>`;
        notesBox.appendChild(z);
        zones.set(story, z.lastElementChild               );
        return z.lastElementChild               ;
      }
      z.className = `d-zone ${hf && hf.kind === "footer" ? "d-ftr" : "d-hdr"}`;
      if (hf && hf.which !== "default") {
        z.innerHTML = `<div class="d-zone-l" contenteditable="false">${hf.kind === "footer" ? "Pied de page" : "En-tête"} ${hf.which === "first" ? "de la première page" : "des pages paires"}</div>`;
      }
      // En pages, l'en-tête et le pied courants sont épinglés dans les marges
      // (et répétés sur chaque feuille) ; les particuliers suivent le texte.
      if (model .page && hf) {
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
      if (c !== cIdx) { cell = row .insertCell(); cIdx = c; }
      cell .appendChild(renderPara(idx));
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
    const u = (v        ) => `calc(var(--pt) * ${v})`;
    paper.style.width = u(pg.width);
    paper.style.padding = `${u(pg.top)} ${u(pg.right)} ${u(pg.bottom)} ${u(pg.left)}`;
    document.documentElement.style.setProperty("--ml", u(pg.left));
    document.documentElement.style.setProperty("--mr", u(pg.right));
    fitPage(true);
  }
  // Zoom : `null` suit la largeur du panneau ; sinon un pourcentage de la
  // taille réelle (100 % = un point du document vaut un point à l'écran).
  const ZOOM_MIN = 30, ZOOM_MAX = 200, ZOOM_STEP = 10;
  let zoom                = (() => {
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
    const next = zoom ? PT * zoom / 100 : PT * Math.max(0.4, Math.min(1.5, room / (pg.width * PT)));
    showZoom(next);
    if (!force && Math.abs(next - ptPx) < 1e-3) return;
    ptPx = next;
    document.documentElement.style.setProperty("--pt", `${next.toFixed(4)}px`);
    scheduleLines();
  }
  function setZoom(next               ) {
    zoom = next === null ? null : Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(next)));
    try {
      if (zoom === null) localStorage.removeItem("docxZoom");
      else localStorage.setItem("docxZoom", String(zoom));
    } catch { /* stockage indisponible : le zoom vaut pour cette session */ }
    fitPage();
  }
  const zoomPct = () => Math.round(ptPx / PT * 100);
  const zoomEl = document.createElement("span");
  zoomEl.className = "zoom";
  zoomEl.setAttribute("role", "group");
  zoomEl.setAttribute("aria-label", "Zoom");
  zoomEl.innerHTML = `<button class="z-step" data-z="out" aria-label="Zoom arrière" data-tooltip="Zoom arrière (⌘−)"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3.5 8h9"/></svg></button>
    <input type="range" min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="5" aria-label="Zoom">
    <button class="z-step" data-z="in" aria-label="Zoom avant" data-tooltip="Zoom avant (⌘+)"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3.5 8h9M8 3.5v9"/></svg></button>
    <button class="z-pct" data-tooltip="Ajuster à la largeur (⌘0)"></button>`;
  const zoomRange = zoomEl.querySelector("input")                    ;
  const zoomLabel = zoomEl.querySelector(".z-pct")               ;
  function showZoom(px        ) {
    const pct = Math.round(px / PT * 100);
    zoomRange.value = String(pct);
    zoomLabel.textContent = `${pct} %`;
    zoomLabel.classList.toggle("on", zoom === null);
  }
  zoomRange.addEventListener("input", () => setZoom(Number(zoomRange.value)));
  zoomEl.querySelector('[data-z="out"]') .addEventListener("click", () => setZoom(zoomPct() - ZOOM_STEP));
  zoomEl.querySelector('[data-z="in"]') .addEventListener("click", () => setZoom(zoomPct() + ZOOM_STEP));
  zoomLabel.addEventListener("click", () => setZoom(null));
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.key === "=" || e.key === "+") { e.preventDefault(); setZoom(zoomPct() + ZOOM_STEP); }
    else if (e.key === "-") { e.preventDefault(); setZoom(zoomPct() - ZOOM_STEP); }
    else if (e.key === "0") { e.preventDefault(); setZoom(null); }
    // La surface Documents masque sa liste : le raccourci part du panneau aussi.
    else if (e.key === "\\" && parent !== window) { e.preventDefault(); parent.postMessage({ type: "atelier-docs-toggle-list" }, "*"); }
  });
  function applyLook(el             , l      ) {
    const u = (v        ) => `calc(var(--pt) * ${v})`;
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
  let dirtyFrom                = null;
  let dirtyAll = false;
  function scheduleLines(from         ) {
    if (typeof from === "number") dirtyFrom = dirtyFrom === null ? from : Math.min(dirtyFrom, from);
    else dirtyAll = true;
    if (linesFrame) return;
    linesFrame = requestAnimationFrame(() => {
      linesFrame = 0;
      const from = dirtyAll ? null : dirtyFrom;
      dirtyAll = false;
      dirtyFrom = null;
      layoutPages(from);
    });
  }
  /** Blocs du flux, dans l'ordre : paragraphes, lignes de tableau, notes,
   *  en-têtes et pieds particuliers ; les en-tête et pied courants sont épinglés. */
  function flowBlocks()                {
    const blocks                = [];
    for (const c of Array.from(paper.children)                 ) {
      if (c.classList.contains("d-p")) blocks.push(c);
      else if (c.tagName === "TABLE") blocks.push(...(Array.from((c                    ).rows)                 ));
      else if ((c.classList.contains("d-notes") || c.classList.contains("d-zone")) && !c.classList.contains("pinned")) blocks.push(...(Array.from(c.querySelectorAll(".d-p"))                 ));
    }
    return blocks;
  }
  function layoutPages(from                = null) {
    const pg = model?.page;
    if (!pg) return;
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
    const first = blocks[start];
    for (const g of Array.from(paper.querySelectorAll(".d-gap"))) {
      // Les coupures avant le premier bloc recoupé restent en place.
      if (start > 0 && first && !(first.compareDocumentPosition(g) & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY))) continue;
      const parent = g.parentNode;
      g.remove();
      parent?.normalize();
    }
    paper.style.minHeight = "";
    const pages = paginate(pg, blocks, start, page);
    if (keep) setCaret(keep.a, collapsed(keep) ? undefined : keep.b);
    drawSheets(pg, pages);
    drawLines(pg);
    placeCards();
  }


  /** Lignes affichées d'un paragraphe, en coordonnées de la page, sans les intervalles. */
  function linesOf(el             , o        )         {
    const frags         = [];
    const range = document.createRange();
    const walk = (n      ) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          range.selectNodeContents(c);
          Array.from(range.getClientRects()).forEach((r, k) => { if (r.height > 0) frags.push({ top: r.top - o, bottom: r.bottom - o, atom: c , frag: k }); });
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
    const lines         = [];
    for (const f of frags) {
      const last = lines[lines.length - 1];
      if (last && f.top < last.bottom - 2) { last.bottom = Math.max(last.bottom, f.bottom); last.top = Math.min(last.top, f.top); }
      else lines.push({ ...f });
    }
    return lines;
  }
  /** Début d'une ligne : (nœud, décalage) où glisser l'intervalle. */
  function lineStart(line      , o        )                                      {
    const a = line.atom;
    if (a.nodeType !== 3 || line.frag === 0) return { node: a.parentNode , before: a };
    const t = a        ;
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
    return { node: rest.parentNode , before: rest };
  }
  function gapEl(inline         , h        ) {
    const g = document.createElement(inline ? "span" : "div");
    g.className = "d-gap";
    g.contentEditable = "false";
    g.style.height = `${Math.max(0, h)}px`;
    return g;
  }

  /** Coupe le flux en feuilles ; rend le nombre de feuilles. */
  function paginate(pg      , blocks               , start = 0, page0 = 0)         {
    const pt = ptPx, pageH = pg.height * pt, stride = pageH + GAP;
    // Positions relues par rapport à la page à chaque mesure : WebKit
    // ancre le défilement pendant qu'on insère les intervalles (le panneau
    // défile sous la mise en page), une origine figée fausserait chaque coupe.
    const O = () => paper.getBoundingClientRect().top;
    const topOf = (k        ) => k * stride + pg.top * pt;
    const bottomOf = (k        ) => k * stride + pageH - pg.bottom * pt;
    const pageAt = (y        ) => Math.max(0, Math.floor(y / stride));
    const lookOf = (el         ) => (el               ).dataset.idx !== undefined ? model .paragraphs[Number((el               ).dataset.idx)]?.look || {} : {};
    const topOfEl = (el         ) => el.getBoundingClientRect().top - O();
    // Intervalle avant un bloc entier ; le premier paragraphe d'une note emporte son numéro.
    const gapBefore = (el             , target        ) => {
      const host = el.closest(".d-note") && !el.previousElementSibling ? el.closest(".d-note")                : el;
      const h = target - topOfEl(host);
      if (host.tagName === "TR") {
        const tr = document.createElement("tr");
        tr.className = "d-gap";
        tr.innerHTML = `<td colspan="99" style="padding:0;border:0"><div style="height:${Math.max(0, h)}px"></div></td>`;
        host.before(tr);
      } else host.before(gapEl(false, h));
    };
    let page = page0;
    let forceNext = false;
    for (let b = start; b < blocks.length; b++) {
      const el = blocks[b];
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
      const forced = (Array.from(el.querySelectorAll(".pbr"))                 ).map((x) => x.getBoundingClientRect().top - O());
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
          const chained = (j        ) => blocks[j].classList.contains("d-p") && blocks[j].parentElement === el.parentElement && lookOf(blocks[j]).keep_next;
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
    const end = paper.scrollHeight;
    return Math.max(1, pageAt(Math.max(0, end - pg.bottom * pt - 1)) + 1);
  }

  /** Champs PAGE et NUMPAGES d'un en-tête ou d'un pied : le numéro de la feuille. */
  function pageFields(zone             , n        , pages        ) {
    for (const f of Array.from(zone.querySelectorAll("[data-field]"))                 ) {
      const kind = f.dataset.field;
      if (kind === "page") f.textContent = String(n);
      else if (kind === "numpages" || kind === "sectionpages") f.textContent = String(pages);
    }
  }
  /** Feuilles derrière le texte, en-tête et pied de page répétés. */
  function drawSheets(pg      , pages        ) {
    const pt = ptPx, pageH = pg.height * pt, stride = pageH + GAP;
    paper.style.minHeight = `${pages * stride - GAP}px`;
    const pinned = Array.from(paper.querySelectorAll(":scope > .d-zone.pinned"))                 ;
    for (const z of pinned) {
      if (z.classList.contains("d-ftr")) z.style.top = `${pageH - pg.footer * pt - z.offsetHeight}px`;
      else z.style.top = `${pg.header * pt}px`;
    }
    for (const z of pinned) pageFields(z, 1, pages);
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
          const c = z.cloneNode(true)               ;
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
  function drawLines(pg      ) {
    const ln = pg.line_numbers;
    if (!ln) { lnLayer.replaceChildren(); return; }
    const pt = ptPx, stride = pg.height * pt + GAP;
    const o = paper.getBoundingClientRect().top;
    const x = paper.offsetLeft + (pg.left - ln.distance) * pt;
    const size = (ln.size || 10) * pt;
    const frag = document.createDocumentFragment();
    let n = ln.start;
    let page = 0;
    for (const el of Array.from(paper.children)                 ) {
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

  function repaint(idx        ) {
    const old = paper.querySelector(`.d-p[data-idx="${idx}"]`)                      ;
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
  const paraEl = (n             )                     => {
    const el = n ? (n.nodeType === 3 ? n.parentElement : (n           )) : null;
    return el ? (el.closest(".d-p")                      ) : null;
  };

  function posOf(node      , offset        )             {
    let p = paraEl(node);
    if (!p && node instanceof Element && (node === paper || paper.contains(node))) {
      // Sélection posée entre des paragraphes (⌘A, tableau) : début du
      // paragraphe qui suit, ou fin du dernier.
      const child = node.childNodes[offset]                    ;
      const after = child ? (child instanceof Element ? (child.matches(".d-p") ? child : child.querySelector(".d-p")) : null) : null;
      if (after) return { idx: Number((after               ).dataset.idx), off: 0 };
      const all = Array.from(node.querySelectorAll(".d-p"))                 ;
      const before = all.length ? all[all.length - 1] : (Array.from(paper.querySelectorAll(".d-p"))                 ).pop();
      return before ? { idx: Number(before.dataset.idx), off: Number(before.dataset.len) } : null;
    }
    if (!p || !paper.contains(p)) return null;
    const idx = Number(p.dataset.idx);
    if (node === p) {
      const child = p.childNodes[offset]                           ;
      return { idx, off: child && child.dataset && child.dataset.off !== undefined ? Number(child.dataset.off) : Number(p.dataset.len) };
    }
    const el = node.nodeType === 3 ? node.parentElement  : (node               );
    const span = el.closest("[data-off]")                      ;
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

  function domOf(pos     )                                        {
    const p = paper.querySelector(`.d-p[data-idx="${pos.idx}"]`)                      ;
    if (!p) return null;
    const spans = Array.from(p.querySelectorAll(":scope > [data-off]"))                 ;
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
      let t = walker.nextNode()               ;
      while (t) {
        const n = cp(t.data);
        if (left <= n) return { node: t, offset: Array.from(t.data).slice(0, left).join("").length };
        left -= n;
        t = walker.nextNode()               ;
      }
    }
    const last = spans.filter((s) => !s.dataset.del).pop();
    if (last && pos.off >= Number(p.dataset.len)) return { node: p, offset: Array.prototype.indexOf.call(p.childNodes, last) + 1 };
    return { node: p, offset: 0 };
  }

  function readSel()             {
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
  const collapsed = (s     ) => s.a.idx === s.b.idx && s.a.off === s.b.off;

  function setCaret(pos     , end      ) {
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
  const ref = (idx        ) => refIn(storyAt(idx), storySpan(idx)[0], idx);

  function applyModel(next       , caret             ) {
    next = normalize(next);
    const prev = model;
    model = next;
    const sameShape = prev && prev.paragraphs.length === next.paragraphs.length && paper.querySelector(".d-p")
      && prev.paragraphs.every((p, i) => p.story === next.paragraphs[i].story && JSON.stringify(p.cell) === JSON.stringify(next.paragraphs[i].cell))
      && JSON.stringify((prev.notes || []).map((n) => n.number)) === JSON.stringify((next.notes || []).map((n) => n.number));
    if (sameShape) {
      next.paragraphs.forEach((p, i) => {
        if (JSON.stringify(p) !== JSON.stringify(prev .paragraphs[i]) || ghosts.some((g) => g.idx === i)) repaint(i);
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

  function status(text        , err = false) {
    lastStatus = text;
    const s = foot.querySelector(".st")                      ;
    if (s) { s.textContent = text; s.classList.toggle("err", err); }
  }

  /** File d'attente : une retouche à la fois, dans l'ordre des gestes. */
  function enqueue   (fn                  )             {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  }

  async function sendOp(op    , caret                                        , expectIdx         )                   {
    return enqueue(async () => {
      inflight++;
      status("Enregistrement…");
      const expectText = expectIdx !== undefined && model ? virtualTextReal(expectIdx) : null;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await api("/docx/op", { path: PATH, revision: model .revision, author, tracked, op });
            const fresh = normalize(r.model);
            const sel = caret ? caret(fresh, r.result) : readSel();
            applyModel(fresh, sel);
            status("Enregistré dans le .docx");
            return true;
          } catch (e     ) {
            if (e.status === 409 && attempt === 0) {
              // Word ou l'agent a écrit entre-temps : relire, et refaire le
              // geste si son paragraphe n'a pas bougé.
              const fresh        = normalize(await api(`/docx/model?path=${enc(PATH)}`));
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
      } catch (e     ) {
        ghosts = [];
        status(e.message || String(e), true);
        try { applyModel(await api(`/docx/model?path=${enc(PATH)}`), readSel()); } catch { /* le message reste */ }
        return false;
      } finally {
        inflight--;
      }
    });
  }
  const virtualTextReal = (idx        ) => model .paragraphs[idx] ? model .paragraphs[idx].text : "";

  // ------------------------------------------------------------- frappe
  function typeText(text        ) {
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
  function flushGhosts()                   {
    clearTimeout(idleTimer);
    const todo = ghosts.filter((g) => !g.sent);
    for (const g of todo) {
      g.sent = true;
      enqueue(async () => {
        inflight++;
        status("Enregistrement…");
        try {
          const r = await api("/docx/op", { path: PATH, revision: model .revision, author, tracked, op: { op: "insert", paragraph: ref(g.idx), at: g.at, with: g.text } });
          const sel = readSel();
          ghosts.shift();
          applyModel(r.model, sel);
          status("Enregistré dans le .docx");
        } catch (e     ) {
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
  function structural(fn                     ) {
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
  function deleteOps(sel     )       {
    const { a, b } = sel;
    if (a.idx === b.idx) {
      if (a.off === b.off) return [];
      const [s, e] = expandWhole(a.idx, a.off, b.off);
      return [{ op: "replace_range", paragraph: ref(a.idx), start: s, end: e, with: "" }];
    }
    const ops       = [];
    if (b.off > 0) ops.push({ op: "replace_range", paragraph: ref(b.idx), start: 0, end: expandWhole(b.idx, 0, b.off)[1], with: "" });
    for (let k = b.idx; k > a.idx; k--) {
      if (k < b.idx) {
        const len = model .paragraphs[k].text.length ? cp(model .paragraphs[k].text) : 0;
        if (len) ops.push({ op: "replace_range", paragraph: ref(k), start: 0, end: len, with: "" });
      }
      ops.push({ op: "join", paragraph: ref(k) });
    }
    const lenA = cp(model .paragraphs[a.idx].text);
    if (lenA > a.off) ops.push({ op: "replace_range", paragraph: ref(a.idx), start: expandWhole(a.idx, a.off, lenA)[0], end: lenA, with: "" });
    return ops;
  }

  async function replaceSel(sel     , text        ) {
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

  function wordBounds(text        , off        )                   {
    const chars = Array.from(text);
    let s = off, e = off;
    const w = (c        ) => /[\p{L}\p{N}'’-]/u.test(c);
    while (s > 0 && w(chars[s - 1])) s--;
    while (e < chars.length && w(chars[e])) e++;
    return [s, e];
  }

  function deleteKey(kind        ) {
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
        const prevLen = cp(model .paragraphs[idx - 1].text);
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

  paper.addEventListener("beforeinput", (e            ) => {
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
  paper.addEventListener("compositionend", (e                  ) => {
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
      toggleRun(({ b: "b", i: "i", u: "u" }                          )[e.key.toLowerCase()]);
      return;
    }
    if (e.key === "Tab" && !mod) { e.preventDefault(); if (view !== "original") typeText("\t"); }
  });

  paper.addEventListener("copy", (e                ) => {
    const sel = readSel();
    if (!sel || collapsed(sel) || !model) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", selectionText(sel));
  });
  paper.addEventListener("cut", (e                ) => {
    const sel = readSel();
    if (!sel || collapsed(sel) || !model) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", selectionText(sel));
    if (view !== "original") structural(() => replaceSel(sel, ""));
  });
  // Pas de glisser-déposer du texte (un dépôt accidentel déplace la thèse).
  paper.addEventListener("dragstart", (e) => e.preventDefault());
  paper.addEventListener("drop", (e) => e.preventDefault());

  function selectionText(sel     )         {
    const out           = [];
    for (let k = sel.a.idx; k <= sel.b.idx; k++) {
      const chars = Array.from(virtualText(k));
      out.push(chars.slice(k === sel.a.idx ? sel.a.off : 0, k === sel.b.idx ? sel.b.off : chars.length).join(""));
    }
    return out.join("\n");
  }

  async function undo(redo         ) {
    structural(async () => {
      await enqueue(async () => {
        try {
          const r = await api("/docx/undo", { path: PATH, revision: model .revision, redo });
          applyModel(r.model, readSel());
          status(redo ? "Rétabli" : "Annulé");
        } catch (e     ) {
          status(e.message || String(e), true);
        }
      });
    });
  }

  // ------------------------------------------------------ mise en forme
  function segAt(pos     )             {
    if (!model || !model.paragraphs[pos.idx]) return null;
    let off = 0;
    let found             = null;
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

  function runRanges(sel     )       {
    const ops       = [];
    for (let k = sel.a.idx; k <= sel.b.idx; k++) {
      const len = cp(model .paragraphs[k].text);
      const s = k === sel.a.idx ? sel.a.off : 0;
      const e = k === sel.b.idx ? sel.b.off : len;
      if (e > s) ops.push({ paragraph: ref(k), start: s, end: e });
    }
    return ops;
  }

  function applyRun(props                         ) {
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

  function toggleRun(key        ) {
    const sel = readSel();
    if (!sel) return;
    const seg = segAt(sel.a.off === sel.b.off || sel.a.idx !== sel.b.idx ? sel.a : { idx: sel.a.idx, off: sel.a.off + 1 });
    const on = !!(seg && (seg                           )[key]);
    const props                          = { [key]: !on };
    if (key === "sup" && !on) props.sub = false;
    if (key === "sub" && !on) props.sup = false;
    applyRun(props);
  }

  function applyPara(props                         ) {
    const sel = readSel();
    if (!sel || !model || view === "original") return;
    structural(async () => {
      const ops       = [];
      for (let k = sel.a.idx; k <= sel.b.idx; k++) ops.push({ op: "format_paragraph", paragraph: ref(k), props });
      await sendOp(ops.length === 1 ? ops[0] : { op: "batch", ops }, () => sel);
    });
  }

  // ------------------------------------------------------------ menus
  let openMenu                     = null;
  let openTrigger                     = null;
  function closeMenu() {
    if (openMenu) { openMenu.classList.remove("show"); const m = openMenu; setTimeout(() => m.remove(), 150); }
    openTrigger?.classList.remove("open");
    openMenu = null;
    openTrigger = null;
  }

  function showMenu(trigger             , items        , alignRight = false) {
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
    openMenu = m;
    openTrigger = trigger;
  }
  document.addEventListener("mousedown", (e) => {
    if (openMenu && !openMenu.contains(e.target        ) && !(openTrigger && openTrigger.contains(e.target        ))) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenu(); hidePop(); } });

  // ---------------------------------------------------------- barres
  const fmtbar = $("fmtbar");
  const FONTS = ["Times New Roman", "Calibri", "Cambria", "Arial", "Helvetica", "Georgia", "Garamond", "Palatino"];
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36];
  // Une seule barre (piste A choisie par Thierry le 2026-10-20) : mise en
  // forme à gauche, revue et suivi à droite ; le reste vit dans des menus.
  fmtbar.innerHTML = `
    <button class="dd w-style" id="ddStyle" data-tooltip="Style du paragraphe"><span>Normal</span>${ICON.chev}</button>
    <button class="dd w-font" id="ddFont" data-tooltip="Police"><span>Police</span>${ICON.chev}</button>
    <button class="dd w-size" id="ddSize" data-tooltip="Taille"><span>12</span>${ICON.chev}</button>
    <span class="gp"></span>
    <button class="tb" data-run="b" data-tooltip="Gras (⌘B)"><span class="glyph b">G</span></button>
    <button class="tb" data-run="i" data-tooltip="Italique (⌘I)"><span class="glyph i">I</span></button>
    <button class="tb" data-run="u" data-tooltip="Souligné (⌘U)"><span class="glyph u">S</span></button>
    <button class="tb" id="btnMore" aria-label="Autres mises en forme" data-tooltip="Barré, exposant, indice">${ICON.more}</button>
    <span class="gp"></span>
    <button class="tb wide" id="btnAlign" aria-label="Alignement" data-tooltip="Alignement"><span class="ic">${ICON.alLeft}</span>${ICON.chev}</button>
    <button class="tb wide" id="btnList" aria-label="Listes" data-tooltip="Listes">${ICON.bullets}${ICON.chev}</button>
    <span class="gp"></span>
    <button class="tb" id="btnComment" aria-label="Commenter" data-tooltip="Commenter la sélection">${ICON.comment}</button>
    <button class="tb wide" id="btnInsert" aria-label="Insérer" data-tooltip="Insérer une note, une figure ou une ligne de tableau">${ICON.plus}${ICON.chev}</button>
    <span class="gp"></span>
    <button class="tb" id="btnUndo" aria-label="Annuler" data-tooltip="Annuler (⌘Z)">${ICON.undo}</button>
    <button class="tb" id="btnRedo" aria-label="Rétablir" data-tooltip="Rétablir (⌘⇧Z)">${ICON.redo}</button>
    <span class="sp"></span>
    <button class="dd" id="ddView" data-tooltip="Affichage et page"><span>Revue</span>${ICON.chev}</button>
    <span class="nav"><button class="tb" id="navPrev" aria-label="Précédent" data-tooltip="Précédent">${ICON.left}</button><span class="num" id="navNum">0 / 0</span><button class="tb" id="navNext" aria-label="Suivant" data-tooltip="Suivant">${ICON.right}</button></span>
    <button class="dd" id="btnAll"><span>Tout accepter</span>${ICON.chev}</button>
    <span class="gp"></span>
    <button class="track on" id="btnTrack" data-tooltip="Suivi des modifications : Christophe verra chaque retouche dans Word"><span class="sw"><i></i></span>Suivi</button>`;

  // Les boutons ne prennent pas le focus : la sélection reste dans la page.
  for (const b of Array.from(document.querySelectorAll("#fmtbar button"))) {
    b.addEventListener("mousedown", (e) => e.preventDefault());
  }
  fmtbar.querySelectorAll             ("[data-run]").forEach((b) => b.addEventListener("click", () => toggleRun(b.dataset.run )));
  fmtbar.querySelectorAll             ("[data-align]").forEach((b) => b.addEventListener("click", () => applyPara({ align: b.dataset.align })));
  // Word range ses styles intégrés sous un nom anglais (« heading 1 ») et
  // les affiche traduits : on fait pareil.
  const BUILTIN                         = {
    "normal": "Normal", "title": "Titre", "subtitle": "Sous-titre", "caption": "Légende", "quote": "Citation",
    "intense quote": "Citation intense", "list paragraph": "Paragraphe de liste", "list bullet": "Liste à puces",
    "list number": "Liste numérotée", "no spacing": "Sans interligne", "bibliography": "Bibliographie",
    "toc heading": "En-tête de table des matières", "footnote text": "Note de bas de page", "endnote text": "Note de fin",
    "annotation text": "Commentaire", "header": "En-tête", "footer": "Pied de page", "block text": "Normal (retrait)",
  };
  function styleLabel(name        )         {
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
    showMenu(e.currentTarget               , shown.map((s) => ({
      label: styleLabel(s.name),
      html: `<span class="${s.heading === 1 || s.heading === 0 ? "mi-h1" : s.heading === 2 ? "mi-h2" : s.heading === 3 ? "mi-h3" : ""}">${esc(styleLabel(s.name))}</span>`,
      on: (cur?.style || "Normal") === s.id,
      run: () => applyPara({ style: s.id }),
    })));
  });
  $("ddFont").addEventListener("click", (e) => {
    const sel = readSel();
    const cur = sel ? segAt(sel.a)?.font : undefined;
    const used = new Set        (FONTS);
    model?.paragraphs.forEach((p) => p.segments.forEach((s) => { if (s.font) used.add(s.font); }));
    showMenu(e.currentTarget               , Array.from(used).sort().map((f) => ({
      label: f, html: `<span style="font-family:'${f.replace(/'/g, "")}'">${esc(f)}</span>`, on: f === cur, run: () => applyRun({ font: f }),
    })));
  });
  $("ddSize").addEventListener("click", (e) => {
    const sel = readSel();
    const cur = sel ? segAt(sel.a)?.size : undefined;
    showMenu(e.currentTarget               , SIZES.map((n) => ({ label: String(n).replace(".", ","), on: n === cur, run: () => applyRun({ size: n }) })));
  });
  const listStyle = (re        ) => (model?.styles || []).find((s) => re.test(s.name) || re.test(s.id));
  $("btnList").addEventListener("click", (e) => {
    const bullets = listStyle(/puce|bullet/i), numbers = listStyle(/num[ée]ro|number/i);
    const style = currentPara()?.style;
    showMenu(e.currentTarget               , [
      { label: "Liste à puces", disabled: !bullets, on: !!bullets && style === bullets.id, run: () => bullets && applyPara({ style: bullets.id }) },
      { label: "Liste numérotée", disabled: !numbers, on: !!numbers && style === numbers.id, run: () => numbers && applyPara({ style: numbers.id }) },
    ]);
  });
  const ALIGN                             = [["left", "Aligner à gauche", ICON.alLeft], ["center", "Centrer", ICON.alCenter], ["right", "Aligner à droite", ICON.alRight], ["both", "Justifier", ICON.alBoth]];
  $("btnAlign").addEventListener("click", (e) => {
    const cur = currentPara()?.align || "left";
    showMenu(e.currentTarget               , ALIGN.map(([a, label]) => ({ label, on: cur === a, run: () => applyPara({ align: a }) })));
  });
  $("btnMore").addEventListener("click", (e) => {
    const seg = currentSeg()                                  ;
    showMenu(e.currentTarget               , [["strike", "Barré"], ["sup", "Exposant"], ["sub", "Indice"]].map(([k, label]) => ({
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
  function tableItems()         {
    const sel = readSel();
    const p = sel && model ? model.paragraphs[sel.a.idx] : null;
    if (!sel || !p || !p.cell || view === "original") return [];
    const [t, r, c] = p.cell;
    const story = p.story || "";
    // Curseur dans la première cellule de la ligne voulue, après le geste.
    const toCell = (row        , col        ) => (m       ) => {
      const k = m.paragraphs.findIndex((q) => (q.story || "") === story && q.cell && q.cell[0] === t && q.cell[1] === row && q.cell[2] === col);
      return k >= 0 ? { a: { idx: k, off: 0 }, b: { idx: k, off: 0 } } : null;
    };
    const run = (op    , caret                                        , note         ) => structural(async () => {
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
  async function figureMenu(trigger             ) {
    const sel = readSel();
    if (!sel || !model || view === "original") return;
    let list                     = [];
    try { list = (await api("/docx/figures")).figures || []; } catch (err     ) { status(err.message || String(err), true); return; }
    const at = collapsed(sel) ? sel.a : sel.b;
    const items         = list.length
      ? list.map((f) => ({
        label: f.path,
        html: `<span class="mi-fig"><img src="/${f.path.split("/").map(enc).join("/")}" alt="" loading="lazy"><span>${esc(f.path)}</span></span>`,
        run: () => structural(async () => { await sendOp({ op: "insert_image", paragraph: ref(at.idx), at: at.off, path: f.path }, () => ({ a: { idx: at.idx, off: at.off + 1 }, b: { idx: at.idx, off: at.off + 1 } })); }),
      }))
      : [{ label: "Aucune image PNG, JPEG ou GIF dans le projet" }];
    showMenu(trigger, items);
  }
  $("btnInsert").addEventListener("click", (e) => {
    const trigger = e.currentTarget               ;
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


  const VIEWS                   = [["revue", "Revue"], ["final", "Final"], ["original", "Original"]];
  function setView(next      ) {
    view = next;
    document.body.classList.remove("v-revue", "v-final", "v-original");
    document.body.classList.add(`v-${view}`);
    ($("ddView").firstElementChild               ).textContent = VIEWS.find(([v]) => v === view) [1];
    paper.contentEditable = view === "original" ? "false" : "true";
    layoutCards();
    scheduleLines();
  }
  function setPage(next        , save         ) {
    page = next;
    document.body.classList.toggle("blanche", page === "blanche");
    if (save) api("/docx/prefs", { page }).catch(() => undefined);
  }
  $("ddView").addEventListener("click", (e) => {
    showMenu(e.currentTarget               , [
      { label: "Affichage", head: true },
      ...VIEWS.map(([v, label]) => ({ label, on: view === v, run: () => setView(v) })),
      { label: "", sep: true },
      { label: "Page", head: true },
      { label: "Blanche", on: page === "blanche", run: () => setPage("blanche", true) },
      { label: "Thème de l'app", on: page !== "blanche", run: () => setPage("theme", true) },
    ]);
  });
  $("btnAll").addEventListener("click", (e) => {
    if (!model) return;
    const items         = [
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
    showMenu(e.currentTarget               , items, true);
  });
  $("navPrev").addEventListener("click", () => step(-1));
  $("navNext").addEventListener("click", () => step(1));

  function currentPara()              {
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
    ($("ddStyle").firstElementChild               ).textContent = styleLabel(style ? style.name : (p?.style || "Normal"));
    ($("ddFont").firstElementChild               ).textContent = seg?.font || "Police du style";
    ($("ddSize").firstElementChild               ).textContent = seg?.size ? String(seg.size).replace(".", ",") : "–";
    fmtbar.querySelectorAll             ("[data-run]").forEach((b) => b.classList.toggle("on", !!(seg && (seg                           )[b.dataset.run ])));
    const al = ALIGN.find(([a]) => a === (p?.align || "left")) || ALIGN[0];
    const alIcon = $("btnAlign").firstElementChild               ;
    if (alIcon.dataset.al !== al[0]) { alIcon.dataset.al = al[0]; alIcon.innerHTML = al[2]; }
    ($("btnComment")                     ).disabled = !sel || collapsed(sel);
  }

  async function decideAll(op        , who         ) {
    structural(async () => {
      const ok = await sendOp({ op, author: who ?? null });
      if (ok) status(op === "accept_all" ? "Modifications acceptées" : "Modifications refusées");
    });
  }

  // ------------------------------------------------------- cartes de marge

  let cardItems             = [];

  const KIND                         = {
    ins: "Ajout", del: "Suppression", moveTo: "Déplacé ici", moveFrom: "Déplacé", "paragraph-ins": "Paragraphe ajouté",
    "paragraph-del": "Paragraphes fusionnés", "row-ins": "Ligne ajoutée", "row-del": "Ligne supprimée", format: "Mise en forme", cell: "Cellule",
  };
  const shortDate = (d         ) => (d ? new Date(d).toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) : "");
  const clip = (s        , n = 140) => (cp(s) > n ? Array.from(s).slice(0, n).join("") + "…" : s);

  function collectCards()             {
    if (!model) return [];
    const items             = [];
    const byId = changeById();
    const seen = new Set        ();
    const anchorOf = (sel        ) => paper.querySelector(sel)                      ;
    const paraIdx = (pid         ) => (pid ? model .paragraphs.findIndex((p) => p.id === pid) : -1);
    // Suivis dans l'ordre du document : une suppression suivie d'un ajout du
    // même auteur forme un remplacement, avec une seule carte.
    model.paragraphs.forEach((p, idx) => {
      const segs = p.segments.filter((s) => s.change !== undefined);
      for (let k = 0; k < segs.length; k++) {
        const s = segs[k];
        if (seen.has(s.change )) continue;
        const c = byId.get(s.change );
        if (!c) continue;
        seen.add(c.id);
        const ids = [c.id];
        let head = "";
        let body = "";
        const next = segs[k + 1];
        const nc = next ? byId.get(next.change ) : undefined;
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
      const span = Array.from(paper.querySelectorAll             ("[data-c]")).find((el) => el.dataset.c .split(" ").includes(String(c.id))) || null;
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
    const order                                   = [];
    const byKey = new Map(cardItems.map((c) => [c.key, c]));
    for (const el of Array.from(cardsEl.children)                 ) {
      const it = byKey.get(el.dataset.key ) ;
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
    const ordered = order.map((o) => o.el.dataset.key );
    cardItems.sort((a, b) => ordered.indexOf(a.key) - ordered.indexOf(b.key));
    const n = cardItems.findIndex((c) => c.key === focusKey);
    $("navNum").textContent = `${n >= 0 ? n + 1 : 0} / ${cardItems.filter((c) => !c.done).length}`;
  }

  function focusCard(key        , scroll         ) {
    focusKey = key;
    cardsEl.querySelectorAll(".card").forEach((c) => c.classList.toggle("focus", (c               ).dataset.key === key));
    paper.querySelectorAll(".cmt.on").forEach((x) => x.classList.remove("on"));
    const it = cardItems.find((c) => c.key === key);
    if (it && it.kind === "comment") {
      paper.querySelectorAll             ("[data-c]").forEach((el) => { if (el.dataset.c .split(" ").includes(String(it.ids[0]))) el.classList.add("on"); });
    }
    if (it && scroll && it.anchor) it.anchor.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    layoutCards();
  }

  function step(dir        ) {
    const open = cardItems.filter((c) => !c.done);
    if (!open.length) return;
    const n = open.findIndex((c) => c.key === focusKey);
    const next = open[(n + dir + open.length) % open.length];
    focusCard(next.key, true);
  }

  cardsEl.addEventListener("mousedown", (e) => {
    if ((e.target               ).closest("textarea")) return;
    if ((e.target               ).closest("button")) e.preventDefault();
  });
  cardsEl.addEventListener("click", (e) => {
    const card = (e.target               ).closest(".card")                      ;
    if (!card) return;
    const it = cardItems.find((c) => c.key === card.dataset.key);
    if (!it) return;
    const act = ((e.target               ).closest("[data-act]")                      )?.dataset.act;
    if (!act) { focusCard(it.key, true); return; }
    if (act === "accept" || act === "reject") {
      structural(async () => {
        const ops = it.ids.map((id) => ({ op: act, id }));
        await sendOp(ops.length === 1 ? ops[0] : { op: "batch", ops });
      });
    } else if (act === "resolve") {
      const c = model .comments.find((x) => x.id === it.ids[0]);
      structural(async () => { await sendOp({ op: "resolve", id: it.ids[0], done: !(c && c.done) }); });
    } else if (act === "delete") {
      structural(async () => { await sendOp({ op: "delete_comment", id: it.ids[0] }); });
    } else if (act === "reply") {
      if (card.querySelector("textarea")) return;
      const box = document.createElement("div");
      box.innerHTML = `<textarea class="c-input" placeholder="Répondre à ${esc(it.author)}…"></textarea><div class="c-foot"><span class="sp"></span><button class="btn" data-x="cancel">Annuler</button><button class="btn primary" data-x="send">Répondre</button></div>`;
      card.appendChild(box);
      const ta = box.querySelector("textarea") ;
      ta.focus();
      layoutCards();
      const send = () => {
        const text = ta.value.trim();
        if (!text) return;
        structural(async () => { await sendOp({ op: "reply", parent: it.ids[0], text }); });
      };
      box.querySelector('[data-x="send"]') .addEventListener("click", (ev) => { ev.stopPropagation(); send(); });
      box.querySelector('[data-x="cancel"]') .addEventListener("click", (ev) => { ev.stopPropagation(); box.remove(); layoutCards(); });
      ta.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); send(); } });
    } else if (act === "ask") {
      const c = model .comments.find((x) => x.id === it.ids[0]) ;
      const replies = model .comments.filter((r) => r.parent === c.id).map((r) => `\n  ↳ ${r.author} : ${r.text}`).join("");
      toChat(`${PATH} (commentaire c${c.id}${c.paragraph ? `, ${c.paragraph}` : ""}) — ${c.author} sur « ${c.quote} » : ${c.text}${replies}`);
    }
  });
  window.addEventListener("resize", () => layoutCards());
  paper.addEventListener("click", (e) => {
    const el = (e.target               ).closest("[data-ch],[data-c]")                      ;
    if (!el) return;
    if (el.dataset.c) focusCard(`c${el.dataset.c.split(" ")[0]}`, false);
    else if (el.dataset.ch) {
      const it = cardItems.find((c) => c.ids.includes(Number(el.dataset.ch)));
      if (it) focusCard(it.key, false);
    }
  });

  // ---------------------------------------------- chat, commentaire, signature
  function toChat(text        ) {
    const core = W.AtelierStudioCore;
    if (!W.__atelierPost || !core || !core.requestChatAttachment) {
      status("Le chat d'Atelier n'est pas joignable depuis cette page.", true);
      return;
    }
    core.requestChatAttachment({ postToHost: W.__atelierPost, payload: { type: "atelier-add-to-chat", text, path: PATH, name: NAME } })
      .then(() => status("Ajouté au chat"))
      .catch((e       ) => status(e.message, true));
  }

  const pop = document.createElement("div");
  pop.className = "pop";
  document.body.appendChild(pop);
  function hidePop() { pop.classList.remove("show"); }
  function showPopAt(rect         , html        ) {
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
  let noteSel             = null;
  function hideNote() { noteHost.classList.remove("show"); noteSel = null; }
  function quoteOf(sel     ) {
    return `${PATH} (${model .paragraphs[sel.a.idx].id}${sel.b.idx !== sel.a.idx ? `-${model .paragraphs[sel.b.idx].id}` : ""}) : « ${selectionText(sel)} »`;
  }
  const noteUI = UI?.createNoteEditor(noteHost, {
    placeholder: "Commentaire dans le .docx…",
    submitLabel: "Commenter",
    onSubmit: (value        ) => {
      const sel = noteSel, text = value.trim();
      if (!sel || !text) return;
      hideNote();
      // Un commentaire couvre un passage d'un seul paragraphe : on borne au premier.
      const end = sel.a.idx === sel.b.idx ? sel.b.off : cp(virtualText(sel.a.idx));
      structural(async () => { await sendOp({ op: "comment_range", paragraph: ref(sel.a.idx), start: sel.a.off, end, text }, () => sel); });
    },
    onSendDirect: (value        ) => {
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
    const rect = getSelection() .getRangeAt(0).getBoundingClientRect();
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
  const WORD_COLOR                         = { amber: "yellow", green: "green", blue: "cyan", red: "magenta" };
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
      W.__atelierPost ({ type: "atelier-quick-ask", text: selectionText(sel), path: PATH, page: model .paragraphs[sel.a.idx].id });
    } : undefined,
    onHighlight: (name        ) => {
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
    let r                      = range.getClientRects()[0];
    const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)               ;
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
  paper.addEventListener("input", () => scheduleLines());
  // Une image qui arrive après la mise en page déplace la suite : on recoupe.
  const imageArrived = (e       ) => {
    const img = e.target               ;
    if (img.tagName !== "IMG") return;
    const idx = (img.closest(".d-p")                      )?.dataset.idx;
    scheduleLines(idx === undefined ? undefined : Number(idx));
  };
  paper.addEventListener("load", imageArrived, true);
  paper.addEventListener("error", imageArrived, true);
  document.fonts?.ready.then(() => scheduleLines()).catch(() => undefined);
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
    if (model.page) foot.appendChild(zoomEl);
    status(lastStatus || "Enregistré dans le .docx", false);
    $("who").addEventListener("click", (e) => {
      showPopAt((e.currentTarget               ).getBoundingClientRect(), `<label>Nom sur tes retouches (celui que Christophe voit dans Word)<input value="${esc(author)}"></label><div class="c-foot"><button class="btn" data-x="cancel">Annuler</button><button class="btn primary" data-x="send">Enregistrer</button></div>`);
      pop.style.top = `${(e.currentTarget               ).getBoundingClientRect().top - pop.offsetHeight - 8}px`;
      const input = pop.querySelector("input") ;
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
      pop.querySelector('[data-x="send"]') .addEventListener("click", save);
      pop.querySelector('[data-x="cancel"]') .addEventListener("click", hidePop);
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
      const fresh        = await api(`/docx/model?path=${enc(PATH)}`);
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
        const sys         = prefs.systemAuthor || "Moi";
        const first = sys.split(/\s+/)[0].toLowerCase();
        const known = (m         ).authors.find((a) => !AGENT.test(a.name) && a.name.toLowerCase().startsWith(first));
        author = known ? known.name : sys;
      }
      applyModel(m);
      status("Enregistré dans le .docx");
      setInterval(poll, POLL_MS);
    } catch (e     ) {
      paper.innerHTML = `<div class="loading">Ce document ne s'ouvre pas ici : ${esc(e.message || String(e))}</div>`;
    }
  }
  window.addEventListener("pagehide", () => { flushGhosts(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushGhosts(); });
  boot();
})();
