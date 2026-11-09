// Barre d'outils LaTeX épurée et personnalisable (Thierry, 2026-11-08).
//
// Par défaut : vues + éditeur visuel + Diff à gauche ; Références, Annotations,
// Ajouter au chat et Compiler à droite, puis « … ». Le reste (PDF en onglet,
// console, retour à la ligne, plan, recherche, reformatage) attend dans « … »
// et revient dans la barre depuis « Personnaliser la barre… » (menu « … » ou
// clic droit sur la barre). On n'y déplace aucun nœud : les groupes de la
// barre passent en `display:contents` et chaque bouton reçoit son `order`,
// si bien que les sélecteurs existants (#compileActions>#popPdf, etc.) tiennent.
// Le réglage vit dans /state (clé texToolbar) avec un cache local, comme
// l'éditeur visuel : le port du serveur change d'un lancement à l'autre.

export type ToolbarZone = "left" | "right";

export interface ToolbarItemSpec {
  key: string;
  /** id du bouton (ou du groupe) dans latex_studio.html. */
  id: string;
  label: string;
  zone: ToolbarZone;
  /** Visible dans la barre par défaut. */
  on: boolean;
  kbd?: string;
  /** Entrée du menu « … » qui fait doublon quand l'outil est dans la barre. */
  menuAct?: string;
}

export interface ToolbarLayoutEntry { key: string; on: boolean }

export const TOOLBAR_STATE_KEY = "texToolbar";

export const LATEX_TOOLBAR_ITEMS: readonly ToolbarItemSpec[] = [
  {key: "visual", id: "toolbarVisual", label: "Éditeur visuel", zone: "left", on: true, menuAct: "visual"},
  {key: "diff", id: "diffGrp", label: "Diff et versions", zone: "left", on: true},
  {key: "wrap", id: "toolbarWrap", label: "Retour à la ligne", zone: "left", on: false},
  {key: "references", id: "bibBtn", label: "Références (Crossref)", zone: "right", on: true, menuAct: "references"},
  {key: "annotations", id: "texcBtn", label: "Annotations", zone: "right", on: true, menuAct: "comments"},
  {key: "chat", id: "chatAdd", label: "Ajouter au chat", zone: "right", on: true},
  {key: "outline", id: "outlineBtn", label: "Plan du document", zone: "right", on: false, kbd: "⌘⇧O", menuAct: "outline"},
  {key: "find", id: "findBtn", label: "Rechercher", zone: "right", on: false, kbd: "⌘F", menuAct: "find"},
  {key: "rewrapall", id: "rewrapAllBtn", label: "Reformater le document", zone: "right", on: false, kbd: "⇧⌥Q", menuAct: "rewrapall"},
  {key: "compile", id: "build", label: "Compiler", zone: "right", on: true, kbd: "⌘B"},
  {key: "poppdf", id: "popPdf", label: "Ouvrir le PDF dans un onglet", zone: "right", on: false, menuAct: "poppdf"},
  {key: "console", id: "consoleBtn", label: "Console de compilation", zone: "right", on: false, menuAct: "console"},
];

const specOf = (key: string): ToolbarItemSpec | undefined => LATEX_TOOLBAR_ITEMS.find(item => item.key === key);

export const defaultToolbarLayout = (): ToolbarLayoutEntry[] =>
  LATEX_TOOLBAR_ITEMS.map(item => ({key: item.key, on: item.on}));

/** Relit un réglage enregistré : clés inconnues ignorées, doublons écartés,
 * outils nouveaux ajoutés à leur place par défaut, zones regroupées (gauche
 * puis droite) quel que soit l'ordre reçu. */
export function normalizeToolbarLayout(raw: unknown): ToolbarLayoutEntry[] {
  const source = (raw && typeof raw === "object" && Array.isArray((raw as {items?: unknown}).items))
    ? (raw as {items: unknown[]}).items
    : Array.isArray(raw) ? raw : null;
  if (!source) return defaultToolbarLayout();
  const seen = new Set<string>();
  const kept: ToolbarLayoutEntry[] = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const key = String((entry as {k?: unknown; key?: unknown}).k ?? (entry as {key?: unknown}).key ?? "");
    if (!specOf(key) || seen.has(key)) continue;
    seen.add(key);
    const on = (entry as {on?: unknown}).on;
    kept.push({key, on: typeof on === "boolean" ? on : specOf(key)!.on});
  }
  // Un outil absent du réglage (ajouté après coup) reprend sa place par
  // défaut : juste après le dernier outil connu qui le précède.
  LATEX_TOOLBAR_ITEMS.forEach((item, index) => {
    if (seen.has(item.key)) return;
    const before = LATEX_TOOLBAR_ITEMS.slice(0, index).reverse().find(other => seen.has(other.key));
    const at = before ? kept.findIndex(entry => entry.key === before.key) + 1 : 0;
    kept.splice(at, 0, {key: item.key, on: item.on});
    seen.add(item.key);
  });
  const zone = (entry: ToolbarLayoutEntry) => specOf(entry.key)!.zone;
  return [...kept.filter(entry => zone(entry) === "left"), ...kept.filter(entry => zone(entry) === "right")];
}

export const serializeToolbarLayout = (layout: ToolbarLayoutEntry[]): {v: 1; items: {k: string; on: boolean}[]} =>
  ({v: 1, items: layout.map(entry => ({k: entry.key, on: entry.on}))});

export const toggleToolbarItem = (layout: ToolbarLayoutEntry[], key: string): ToolbarLayoutEntry[] =>
  layout.map(entry => entry.key === key ? {...entry, on: !entry.on} : entry);

/** Déplace `key` juste avant `beforeKey` (ou en fin de zone si `beforeKey`
 * est null). Un outil ne change jamais de côté. */
export function moveToolbarItem(layout: ToolbarLayoutEntry[], key: string, beforeKey: string | null): ToolbarLayoutEntry[] {
  const spec = specOf(key);
  if (!spec || key === beforeKey) return layout;
  if (beforeKey && specOf(beforeKey)?.zone !== spec.zone) return layout;
  const moving = layout.find(entry => entry.key === key);
  if (!moving) return layout;
  const rest = layout.filter(entry => entry.key !== key);
  let at: number;
  if (beforeKey) at = rest.findIndex(entry => entry.key === beforeKey);
  else {
    const lastOfZone = rest.map(entry => specOf(entry.key)!.zone).lastIndexOf(spec.zone);
    at = lastOfZone + 1;
  }
  if (at < 0) return layout;
  rest.splice(at, 0, moving);
  return normalizeToolbarLayout(rest);
}

/** Décale `key` d'un cran dans sa zone (⌥↑ / ⌥↓ dans le panneau). */
export function nudgeToolbarItem(layout: ToolbarLayoutEntry[], key: string, step: -1 | 1): ToolbarLayoutEntry[] {
  const zone = specOf(key)?.zone;
  const same = layout.filter(entry => specOf(entry.key)?.zone === zone).map(entry => entry.key);
  const index = same.indexOf(key);
  const target = index + step;
  if (index < 0 || target < 0 || target >= same.length) return layout;
  return moveToolbarItem(layout, key, step < 0 ? (same[target] ?? null) : (same[target + 1] ?? null));
}

/** Valeur CSS `order` de chaque outil : gauche 10.., espaceur 50, droite 60.. */
export function toolbarOrders(layout: ToolbarLayoutEntry[]): Record<string, number> {
  const orders: Record<string, number> = {};
  let left = 10, right = 60;
  for (const entry of layout) orders[entry.key] = specOf(entry.key)!.zone === "left" ? left++ : right++;
  return orders;
}

const SVG = (body: string, size = 15): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  grip: '<circle cx="9" cy="6" r=".9"/><circle cx="15" cy="6" r=".9"/><circle cx="9" cy="12" r=".9"/><circle cx="15" cy="12" r=".9"/><circle cx="9" cy="18" r=".9"/><circle cx="15" cy="18" r=".9"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  views: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  console: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
};

export interface LatexToolbarLayoutOptions {
  document?: Document;
  window?: Window;
  storage?: Pick<Storage, "getItem" | "setItem">;
  fetch?: typeof fetch;
}

export interface LatexToolbarLayoutController {
  layout(): ToolbarLayoutEntry[];
  open(anchor?: {left: number; top: number; right?: number; bottom: number}): void;
  close(): void;
  dispose(): void;
}

export function createLatexToolbarLayout(options: LatexToolbarLayoutOptions = {}): LatexToolbarLayoutController | null {
  const doc = options.document || document;
  const win = options.window || window;
  const storage = options.storage || (() => { try { return win.localStorage; } catch { return null; } })();
  const fetchImpl = options.fetch || win.fetch?.bind(win);
  const header = doc.querySelector("header");
  const morePop = doc.getElementById("morePop");
  const moreBtn = doc.getElementById("moreBtn");
  if (!header || !morePop || !moreBtn) return null;
  doc.body.classList.add("tbx");

  // Console : seul outil sans bouton de barre jusqu'ici (la barre d'état est
  // masquée) ; il ouvre la même console que « … » > Console de compilation.
  if (!doc.getElementById("consoleBtn")) {
    const consoleBtn = doc.createElement("button");
    consoleBtn.type = "button";
    consoleBtn.id = "consoleBtn";
    consoleBtn.setAttribute("aria-label", "Console de compilation");
    consoleBtn.title = "Console de compilation";
    consoleBtn.innerHTML = SVG(ICONS.console, 16);
    consoleBtn.onclick = () => doc.getElementById("sbCompile")?.click();
    (doc.getElementById("compileActions") || header).appendChild(consoleBtn);
  }
  // « Rechercher » n'avait pas de place dans la barre (masqué en dur).
  const findBtn = doc.getElementById("findBtn");
  if (findBtn?.style.display === "none") findBtn.style.display = "";
  if (!doc.getElementById("tbGap")) {
    const gap = doc.createElement("span");
    gap.id = "tbGap";
    gap.setAttribute("aria-hidden", "true");
    header.appendChild(gap);
  }
  // Diff éteint : l'interrupteur seul. Une classe posée ici plutôt qu'un
  // `:has()` en CSS : le `:has()` ralentissait l'ouverture d'un gros diff
  // (diff.spec.ts « diff worker stays responsive »).
  const diffGrp = doc.getElementById("diffGrp");
  const diffTag = doc.getElementById("diffTag");
  const syncDiff = (): void => {
    diffGrp?.classList.toggle("tb-diff-off", diffTag?.getAttribute("aria-pressed") !== "true");
  };
  syncDiff();
  const Observer = (win as Window & {MutationObserver?: typeof MutationObserver}).MutationObserver;
  const diffObserver = diffTag && Observer ? new Observer(syncDiff) : null;
  if (diffTag) diffObserver?.observe(diffTag, {attributes: true, attributeFilter: ["aria-pressed"]});
  if (!morePop.querySelector('[data-act="customize"]')) {
    morePop.insertAdjacentHTML("beforeend",
      '<div class="mp-sep" role="separator"></div><button type="button" role="menuitem" data-act="customize">Personnaliser la barre&hellip;</button>');
  }
  const comments = morePop.querySelector<HTMLElement>('[data-act="comments"]');
  if (comments) comments.textContent = "Annotations";

  const readCache = (): unknown => {
    try { return JSON.parse(storage?.getItem(TOOLBAR_STATE_KEY) || "null"); } catch { return null; }
  };
  let layout = normalizeToolbarLayout(readCache());

  const apply = (): void => {
    const orders = toolbarOrders(layout);
    for (const entry of layout) {
      const spec = specOf(entry.key)!;
      const element = doc.getElementById(spec.id);
      if (!element) continue;
      element.style.order = String(orders[entry.key]);
      element.classList.toggle("tb-off", !entry.on);
      if (spec.menuAct) morePop.querySelector(`[data-act="${spec.menuAct}"]`)?.classList.toggle("tb-dup", entry.on);
    }
  };
  const persist = (): void => {
    const value = serializeToolbarLayout(layout);
    try { storage?.setItem(TOOLBAR_STATE_KEY, JSON.stringify(value)); } catch { /* cache facultatif */ }
    if (!fetchImpl) return;
    void fetchImpl("/state", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({[TOOLBAR_STATE_KEY]: value}),
    }).catch(() => undefined);
  };
  const update = (next: ToolbarLayoutEntry[], focusKey?: string): void => {
    layout = next;
    apply();
    persist();
    if (panel.classList.contains("open")) render(focusKey);
  };
  apply();
  if (fetchImpl) {
    void fetchImpl("/state").then(response => response.json()).then((state: Record<string, unknown>) => {
      const value = state?.[TOOLBAR_STATE_KEY];
      if (!value) return;
      layout = normalizeToolbarLayout(value);
      try { storage?.setItem(TOOLBAR_STATE_KEY, JSON.stringify(serializeToolbarLayout(layout))); } catch { /* idem */ }
      apply();
      if (panel.classList.contains("open")) render();
    }).catch(() => undefined);
  }

  // Panneau : même surface que « … » (fond surélevé, ombre, rayon 10, sans
  // bordure), rangées de 12 px, ✓ à droite pour ce qui est dans la barre.
  const panel = doc.createElement("div");
  panel.id = "tbCustom";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Personnaliser la barre");
  doc.body.appendChild(panel);

  const iconFor = (spec: ToolbarItemSpec): string => {
    if (spec.key === "console") return SVG(ICONS.console);
    const source = spec.key === "diff" ? doc.querySelector("#diffTag svg") : doc.querySelector(`#${spec.id} svg`);
    if (!source) return SVG("");
    const copy = source.cloneNode(true) as SVGElement;
    copy.setAttribute("width", "15");
    copy.setAttribute("height", "15");
    copy.removeAttribute("class");
    copy.setAttribute("aria-hidden", "true");
    return copy.outerHTML;
  };
  const escapeText = (text: string): string => text.replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]!));
  const row = (entry: ToolbarLayoutEntry): string => {
    const spec = specOf(entry.key)!;
    return `<button type="button" class="tbc-row" role="menuitemcheckbox" aria-checked="${entry.on}" draggable="true" data-key="${spec.key}" title="Glisser pour changer l’ordre ; ⌥↑ ⌥↓ au clavier">`
      + `<span class="tbc-grip">${SVG(ICONS.grip, 14)}</span><span class="tbc-ic">${iconFor(spec)}</span>`
      + `<span class="tbc-label">${escapeText(spec.label)}</span>${spec.kbd ? `<em>${escapeText(spec.kbd)}</em>` : ""}`
      + `<span class="tbc-ck">${SVG(ICONS.check)}</span></button>`;
  };
  const render = (focusKey?: string): void => {
    const left = layout.filter(entry => specOf(entry.key)!.zone === "left");
    const right = layout.filter(entry => specOf(entry.key)!.zone === "right");
    panel.innerHTML = '<div class="tbc-head"><b>Personnaliser la barre</b><span>Coché : dans la barre. Sinon : dans «&nbsp;…&nbsp;».</span></div>'
      + '<div class="tbc-sec">À gauche</div>'
      + `<div class="tbc-fixed"><span class="tbc-grip"></span><span class="tbc-ic">${SVG(ICONS.views)}</span><span class="tbc-label">Source · Scindé · Lecture</span><span class="tbc-ck tbc-lock" title="Toujours dans la barre">${SVG(ICONS.lock, 13)}</span></div>`
      + `<div class="tbc-zone" data-zone="left">${left.map(row).join("")}</div>`
      + '<div class="tbc-sec">À droite</div>'
      + `<div class="tbc-zone" data-zone="right">${right.map(row).join("")}</div>`
      + '<div class="tbc-foot"><span>Glisser pour réordonner</span><button type="button" class="tbc-reset">Rétablir par défaut</button></div>';
    if (focusKey) panel.querySelector<HTMLElement>(`.tbc-row[data-key="${focusKey}"]`)?.focus();
  };

  const place = (anchor: {left: number; top: number; right?: number; bottom: number}): void => {
    const viewportWidth = doc.documentElement.clientWidth || win.innerWidth;
    const viewportHeight = doc.documentElement.clientHeight || win.innerHeight;
    panel.style.visibility = "hidden";
    const width = panel.offsetWidth, height = panel.offsetHeight;
    const right = anchor.right ?? anchor.left + width;
    const left = Math.max(8, Math.min(right - width, viewportWidth - width - 8));
    const top = Math.max(8, Math.min(anchor.bottom + 4, viewportHeight - height - 8));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.visibility = "";
  };
  const open = (anchor?: {left: number; top: number; right?: number; bottom: number}): void => {
    render();
    panel.classList.add("open");
    place(anchor || moreBtn.getBoundingClientRect());
    panel.querySelector<HTMLElement>(".tbc-row")?.focus({preventScroll: true});
  };
  const close = (): void => { panel.classList.remove("open"); };

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
    const target = event.target as Element | null;
    if (target?.closest(".tbc-reset")) { update(defaultToolbarLayout()); return; }
    const key = target?.closest<HTMLElement>(".tbc-row")?.dataset.key;
    if (key) update(toggleToolbarItem(layout, key), key);
  });
  panel.addEventListener("keydown", (event) => {
    const current = (event.target as Element | null)?.closest<HTMLElement>(".tbc-row");
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); moreBtn.focus(); return; }
    if (!current) return;
    const key = current.dataset.key!;
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      update(nudgeToolbarItem(layout, key, event.key === "ArrowUp" ? -1 : 1), key);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const rows = [...panel.querySelectorAll<HTMLElement>(".tbc-row")];
      const next = rows[rows.indexOf(current) + (event.key === "ArrowUp" ? -1 : 1)];
      next?.focus();
    }
  });
  let dragKey = "";
  const clearDropMarks = (): void => panel.querySelectorAll(".drop-before,.drop-after").forEach(node => node.classList.remove("drop-before", "drop-after"));
  panel.addEventListener("dragstart", (event) => {
    const rowEl = (event.target as Element | null)?.closest<HTMLElement>(".tbc-row");
    if (!rowEl) return;
    dragKey = rowEl.dataset.key || "";
    rowEl.classList.add("dragging");
    event.dataTransfer?.setData("text/plain", dragKey);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });
  const dropTarget = (event: DragEvent): {key: string | null; after: boolean; zone: string} | null => {
    const rowEl = (event.target as Element | null)?.closest<HTMLElement>(".tbc-row");
    const zoneEl = (event.target as Element | null)?.closest<HTMLElement>(".tbc-zone");
    if (!zoneEl || !dragKey || specOf(dragKey)?.zone !== zoneEl.dataset.zone) return null;
    if (!rowEl) return {key: null, after: true, zone: zoneEl.dataset.zone || ""};
    const rect = rowEl.getBoundingClientRect();
    return {key: rowEl.dataset.key || null, after: event.clientY > rect.top + rect.height / 2, zone: zoneEl.dataset.zone || ""};
  };
  panel.addEventListener("dragover", (event) => {
    const target = dropTarget(event);
    if (!target) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearDropMarks();
    if (target.key) panel.querySelector(`.tbc-row[data-key="${target.key}"]`)?.classList.add(target.after ? "drop-after" : "drop-before");
  });
  panel.addEventListener("dragleave", (event) => {
    if (!panel.contains(event.relatedTarget as Node | null)) clearDropMarks();
  });
  panel.addEventListener("drop", (event) => {
    const target = dropTarget(event);
    clearDropMarks();
    if (!target) return;
    event.preventDefault();
    let before: string | null = target.key;
    if (target.key && target.after) {
      const zoneKeys = layout.filter(entry => specOf(entry.key)?.zone === target.zone).map(entry => entry.key);
      before = zoneKeys[zoneKeys.indexOf(target.key) + 1] ?? null;
    }
    const key = dragKey;
    dragKey = "";
    if (before !== key) update(moveToolbarItem(layout, key, before), key);
  });
  panel.addEventListener("dragend", () => {
    dragKey = "";
    clearDropMarks();
    panel.querySelectorAll(".dragging").forEach(node => node.classList.remove("dragging"));
  });

  const onMenu = (event: Event): void => {
    if (!(event.target as Element | null)?.closest('[data-act="customize"]')) return;
    morePop.style.display = "none";
    open(moreBtn.getBoundingClientRect());
  };
  morePop.addEventListener("click", onMenu);
  const onContext = (event: MouseEvent): void => {
    if (doc.body.classList.contains("pdfmode")) return;
    event.preventDefault();
    morePop.style.display = "none";
    open({left: event.clientX, top: event.clientY, bottom: event.clientY});
  };
  header.addEventListener("contextmenu", onContext);
  const onMoreBtn = (): void => close();
  moreBtn.addEventListener("click", onMoreBtn);
  const onDocClick = (event: MouseEvent): void => {
    if (panel.classList.contains("open") && !panel.contains(event.target as Node | null)) close();
  };
  doc.addEventListener("click", onDocClick);
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && panel.classList.contains("open")) close();
  };
  doc.addEventListener("keydown", onKey);

  return {
    layout: () => layout.map(entry => ({...entry})),
    open,
    close,
    dispose: () => {
      morePop.removeEventListener("click", onMenu);
      header.removeEventListener("contextmenu", onContext);
      moreBtn.removeEventListener("click", onMoreBtn);
      doc.removeEventListener("click", onDocClick);
      doc.removeEventListener("keydown", onKey);
      diffObserver?.disconnect();
      diffGrp?.classList.remove("tb-diff-off");
      panel.remove();
      doc.body.classList.remove("tbx");
    },
  };
}
