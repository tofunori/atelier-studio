/* atelier_tooltip.js — infobulle commune des éditeurs de la galerie.

   L'infobulle native (attribut title) de WKWebView est grise et n'apparaît
   qu'au bout d'une seconde environ ; le shell React, lui, affiche la sienne
   (Tooltip shadcn) après 420 ms. Ce script donne aux iframes le même
   comportement sans toucher au balisage : délégation d'événements sur
   document, pour tout élément de chrome qui porte un title.

   - au survol (pointerover) ou au focus clavier (:focus-visible), le title
     passe dans data-atelier-title (la bulle native ne s'ouvre donc pas) et la
     bulle maison apparaît après 420 ms — immédiatement si une autre bulle
     vient de se fermer il y a moins de 300 ms (barre d'outils macOS) ;
   - au départ (pointerout, pointerdown, Échap, défilement, perte de focus de
     la fenêtre) la bulle disparaît et le title est RESTAURÉ. Pendant le
     survol, element.title continue de lire et d'écrire le libellé (le code
     des éditeurs qui met à jour un title en cours de survol reste correct) ;
   - un raccourci entre parenthèses final (« Compiler (⌘B) ») s'affiche en
     second segment, en gris atténué ;
   - les zones de contenu de l'utilisateur (texte du PDF, éditeur, rendu
     Markdown ou LaTeX) gardent leur comportement natif. */
export interface AtelierTooltipApi {
  /** Ferme la bulle et restaure le title (tests, changement de vue). */
  hide(): void;
  readonly element: HTMLDivElement | null;
}

function installAtelierTooltip(): AtelierTooltipApi {
  if (window.__atelierTooltip) return window.__atelierTooltip;

  const SHOW_DELAY_MS = 420;
  const WARM_WINDOW_MS = 300;
  const GAP_PX = 4;
  const EDGE_PX = 4;
  /* Contenu de l'utilisateur : pas d'infobulle maison, le title reste natif. */
  const CONTENT = [
    ".cm-content", ".CodeMirror-code", ".textLayer", ".annotationLayer",
    ".md-body", ".markdown-body", "#prevPane #wrap", ".toastui-editor-contents", ".ProseMirror",
    ".tex-cite", ".tex-fn", ".tex-ref", ".tex-unsupported",
    "[contenteditable='true']", "[contenteditable='']", "textarea",
  ].join(",");
  const SHORTCUT_KEYS = /[⌘⌥⇧⌃↩⏎⌫↑↓←→]|^(?:Échap|Esc|Entrée|Enter|Tab|Espace|Suppr|Retour|F\d{1,2}|(?:press|touche) \S{1,6}|\S)$/i;

  type Source = "pointer" | "focus";
  let current: HTMLElement | null = null;
  let source: Source | null = null;
  let suppressed: HTMLElement | null = null;
  let addedLabel = false;
  let addedDescribedBy = false;
  let timer = 0;
  let warmUntil = 0;
  let bubble: HTMLDivElement | null = null;
  let observer: MutationObserver | null = null;

  function now() { return performance.now(); }

  function ensureBubble() {
    if (bubble && bubble.isConnected) return bubble;
    if (!document.getElementById("atelier-tooltip-style")) {
      const style = document.createElement("style");
      style.id = "atelier-tooltip-style";
      style.textContent = ".atelier-tooltip{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;"
        + "box-sizing:border-box;max-width:280px;padding:4px 8px;border:0;border-radius:6px;"
        + "background:var(--surface-overlay,var(--card,#24282d));color:var(--text-primary,var(--txt,#dadee3));"
        + "box-shadow:var(--elevation-overlay,var(--elev,0 4px 16px rgba(0,0,0,.25)));"
        + "font:400 11px/1.3 var(--font-chrome,var(--ui-font,-apple-system,BlinkMacSystemFont,sans-serif));"
        + "letter-spacing:0;text-align:left;white-space:normal;overflow-wrap:break-word;"
        + "opacity:0;transform:translateY(-2px);"
        + "transition:opacity 120ms var(--ease-out,ease-out),transform 120ms var(--ease-out,ease-out)}"
        + ".atelier-tooltip[data-open]{opacity:1;transform:none}"
        + ".atelier-tooltip[hidden]{display:none}"
        + ".atelier-tooltip-key{margin-left:8px;color:var(--text-muted,var(--muted,#90969d));font-variant-numeric:tabular-nums;white-space:nowrap}"
        + ".atelier-tooltip-key:empty{display:none}"
        + "@media (prefers-reduced-motion:reduce){.atelier-tooltip{transition:none;transform:none}}";
      (document.head || document.documentElement).appendChild(style);
    }
    bubble = document.createElement("div");
    bubble.className = "atelier-tooltip";
    bubble.id = "atelier-tooltip";
    bubble.setAttribute("role", "tooltip");
    bubble.hidden = true;
    const label = document.createElement("span");
    label.className = "atelier-tooltip-label";
    const key = document.createElement("span");
    key.className = "atelier-tooltip-key";
    bubble.append(label, key);
    document.documentElement.appendChild(bubble);
    return bubble;
  }

  /** « Compiler (⌘B) » → ["Compiler", "⌘B"] ; une parenthèse qui n'est pas un raccourci reste dans le libellé. */
  function splitShortcut(text: string): [string, string] {
    const match = text.match(/^([\s\S]*\S)\s*\(([^()]{1,24})\)\s*$/);
    if (match && SHORTCUT_KEYS.test(match[2].trim())) return [match[1], match[2].trim()];
    return [text, ""];
  }

  function candidate(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest("[title]");
    if (!(el instanceof HTMLElement)) return null;
    if (el === document.documentElement || el === document.body) return null;
    if (el.closest(CONTENT)) return null;
    if (!(el.getAttribute("title") || "").trim()) return null;
    return el;
  }

  function labelOf(el: HTMLElement) {
    return el.getAttribute("data-atelier-title") || "";
  }

  function render() {
    if (!current || !bubble) return;
    const [text, key] = splitShortcut(labelOf(current));
    (bubble.firstChild as HTMLElement).textContent = text;
    (bubble.lastChild as HTMLElement).textContent = key;
    if (!text.trim()) hide(false);
  }

  function place() {
    if (!current || !bubble || bubble.hidden) return;
    const r = current.getBoundingClientRect();
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    let top = r.bottom + GAP_PX;
    if (top + h > vh - EDGE_PX && r.top - GAP_PX - h >= EDGE_PX) top = r.top - GAP_PX - h;
    top = Math.max(EDGE_PX, Math.min(top, vh - h - EDGE_PX));
    const left = Math.max(EDGE_PX, Math.min(r.left + r.width / 2 - w / 2, vw - w - EDGE_PX));
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
  }

  function show() {
    timer = 0;
    if (!current || !current.isConnected) { release(); return; }
    const el = ensureBubble();
    el.hidden = false;
    render();
    if (!current) return;
    place();
    if (!current.hasAttribute("aria-describedby")) {
      current.setAttribute("aria-describedby", el.id);
      addedDescribedBy = true;
    }
    void el.offsetWidth;
    el.setAttribute("data-open", "");
  }

  function hide(warm: boolean) {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (!bubble || bubble.hidden) return;
    if (warm) warmUntil = now() + WARM_WINDOW_MS;
    bubble.removeAttribute("data-open");
    bubble.hidden = true;
  }

  /** Prend le title de l'élément : la bulle native ne s'ouvre plus, element.title reste lisible. */
  function take(el: HTMLElement, from: Source) {
    const text = el.getAttribute("title") || "";
    current = el;
    source = from;
    el.setAttribute("data-atelier-title", text);
    el.removeAttribute("title");
    // Un bouton icône nommé par son seul title garderait sinon un nom vide pendant le survol.
    addedLabel = false;
    if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby") && !(el.textContent || "").trim()) {
      el.setAttribute("aria-label", text);
      addedLabel = true;
    }
    Object.defineProperty(el, "title", {
      configurable: true,
      get() { return el.getAttribute("data-atelier-title") || ""; },
      set(value) { el.setAttribute("data-atelier-title", String(value)); if (addedLabel) el.setAttribute("aria-label", String(value)); render(); place(); },
    });
    observer = observer || new MutationObserver(() => {
      if (!current) return;
      const next = current.getAttribute("title");
      if (next === null) return;
      current.setAttribute("data-atelier-title", next);
      if (addedLabel) current.setAttribute("aria-label", next);
      current.removeAttribute("title");
      render();
      place();
    });
    observer.observe(el, { attributes: true, attributeFilter: ["title"] });
  }

  /** Rend le title à l'élément et ferme la bulle. */
  function release(warm = false) {
    hide(warm);
    const el = current;
    current = null;
    source = null;
    if (observer) observer.disconnect();
    if (!el) return;
    delete (el as { title?: string }).title;
    const text = el.getAttribute("data-atelier-title");
    el.removeAttribute("data-atelier-title");
    if (text !== null && !el.hasAttribute("title")) el.setAttribute("title", text);
    if (addedLabel) el.removeAttribute("aria-label");
    if (addedDescribedBy) el.removeAttribute("aria-describedby");
    addedLabel = false;
    addedDescribedBy = false;
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    const delay = now() < warmUntil ? 0 : SHOW_DELAY_MS;
    if (delay === 0) show();
    else timer = window.setTimeout(show, delay);
  }

  function isFocusVisible(el: Element) {
    try { return el.matches(":focus-visible"); } catch (_) { return false; }
  }

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    const el = candidate(event.target);
    if (el && el === current) return;
    if (el && el === suppressed) return;
    const wasVisible = !!(bubble && !bubble.hidden);
    if (current) release(wasVisible);
    if (!el) return;
    suppressed = null;
    take(el, "pointer");
    schedule();
  }, true);

  document.addEventListener("pointerout", (event) => {
    const related = event.relatedTarget;
    if (suppressed && !(related instanceof Node && suppressed.contains(related))) suppressed = null;
    if (!current || source !== "pointer") return;
    if (related instanceof Node && current.contains(related)) return;
    release(!!(bubble && !bubble.hidden));
  }, true);

  document.addEventListener("pointerdown", () => {
    if (!current) return;
    suppressed = source === "pointer" ? current : null;
    release();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !current) return;
    suppressed = source === "pointer" ? current : null;
    release();
  }, true);

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !isFocusVisible(target)) return;
    const el = candidate(target);
    if (!el || el !== target || el === current) return;
    const wasVisible = !!(bubble && !bubble.hidden);
    if (current) release(wasVisible);
    take(el, "focus");
    schedule();
  }, true);

  document.addEventListener("focusout", (event) => {
    if (current && source === "focus" && event.target === current) release(!!(bubble && !bubble.hidden));
  }, true);

  document.addEventListener("scroll", () => { if (current) release(); }, true);
  window.addEventListener("blur", () => { if (current) release(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && current) release(); });

  const api: AtelierTooltipApi = {
    hide() { release(); },
    get element() { return bubble; },
  };
  window.__atelierTooltip = api;
  return api;
}
installAtelierTooltip();
