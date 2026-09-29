// Generated from gallery/src/browser/pdf_tools.ts; edit the TypeScript source.
(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AtelierPdfTools = api;
})(typeof globalThis !== "undefined" ? globalThis : this, createAtelierPdfToolsApi);
/** Outils d'annotation du lecteur PDF (barre du haut) : catalogue des tampons,
 *  réglages de la zone de texte, raccourcis clavier, plan de l'article et
 *  export Markdown. Fonctions pures, testées sans navigateur. Les teintes
 *  ci-dessous sont des couleurs de DONNÉES (écrites dans pdf_annots.json et
 *  lues par le MCP et l'iPhone), pas des jetons de thème. */
function createAtelierPdfToolsApi(){
  /** Même ordre que `HL_COLORS` du lecteur et `COLORS` du MCP ; le sens suit
   *  la légende des marquages de Claude. */
  const COLOR_NAMES = ["Jaune", "Vert", "Bleu", "Rose", "Orange", "Violet"];
  const COLOR_MEANINGS = ["Résultats", "Méthode et données", "Contexte et lacune", "Limites", "À citer", "Désaccord"];

  /** Tampons : sens fixe, couleur fixe. `path` = icône blanche (viewBox 16). */
  const STAMPS = [
    {id: "verif", label: "À vérifier", color: "#d4921a", path: "M6 6a2 2 0 1 1 2.7 1.9c-.5.2-.7.6-.7 1.2M8 11.6v.1"},
    {id: "imp", label: "Important", color: "#d9463b", path: "M8 3.5v6M8 12.3v.1"},
    {id: "ok", label: "D'accord", color: "#2f9e5b", path: "M4 8.4l2.6 2.6L12 5.4"},
    {id: "no", label: "Désaccord", color: "#7c5cd6", path: "M4.8 4.8l6.4 6.4M11.2 4.8l-6.4 6.4"},
    {id: "cite", label: "À citer", color: "#e07a2e", path: "M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z"},
    {id: "def", label: "Définition", color: "#2f78d6", path: "M3 3.5h4.2c.5 0 .8.3.8.8v8.5c0-.5-.4-.8-.8-.8H3zM13 3.5H8.8c-.5 0-.8.3-.8.8v8.5c0-.5.4-.8.8-.8H13z"},
  ]         ;
  function stampById(id         ){
    return STAMPS.find(s => s.id === id) || STAMPS[0];
  }
  function stampIcon(id         , size = 14){
    const s = stampById(id);
    return '<svg viewBox="0 0 16 16" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + s.path + '"/></svg>';
  }

  /** Zone de texte : police, tailles (en points PDF, donc elles suivent le
   *  zoom), gras, italique, encre graphite + cinq teintes sombres. */
  const TEXT_FONTS = [
    {id: "sans", label: "Sans", css: "-apple-system,'SF Pro Text','Inter Variable',sans-serif"},
    {id: "serif", label: "Serif", css: "Georgia,'Times New Roman',serif"},
    {id: "mono", label: "Mono", css: "ui-monospace,'SF Mono',Menlo,monospace"},
  ]         ;
  const TEXT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24];
  const TEXT_INKS = [
    {id: "#2b2f35", label: "Graphite"},
    {id: "#c7362f", label: "Rouge"},
    {id: "#2f6fd6", label: "Bleu"},
    {id: "#1f8a4c", label: "Vert"},
    {id: "#b8860b", label: "Ocre"},
    {id: "#7a4fd0", label: "Violet"},
  ]         ;
  const TEXT_DEFAULTS = {font: "sans", size: 13, bold: false, italic: false, ink: "#2b2f35"};

  function textStyle(a                            )            {
    const src = a || {};
    const font = TEXT_FONTS.some(f => f.id === src.font) ? String(src.font) : TEXT_DEFAULTS.font;
    const raw = Number(src.size);
    const size = Number.isFinite(raw) ? Math.min(24, Math.max(10, Math.round(raw))) : TEXT_DEFAULTS.size;
    const ink = TEXT_INKS.some(i => i.id === src.ink) ? String(src.ink) : TEXT_DEFAULTS.ink;
    return {font, size, bold: src.bold === true, italic: src.italic === true, ink};
  }
  function fontCss(id         ){
    return (TEXT_FONTS.find(f => f.id === id) || TEXT_FONTS[0]).css;
  }

  /** Raccourcis de la barre. Les lettres suivent la disposition du clavier
   *  (`key`) ; les chiffres, la touche physique (`code`) : sur un clavier
   *  AZERTY « 1 » demande Maj, et Maj+1 doit rester le premier tampon. */
  const LETTERS                         = {h: "hl", u: "ul", s: "st", n: "note", t: "text", z: "area", e: "erase"};

  function shortcut(e         )                                                         {
    if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
    const digit = /^Digit([1-6])$/.exec(e.code || "") || /^Numpad([1-6])$/.exec(e.code || "");
    if (digit) {
      const i = Number(digit[1]) - 1;
      return e.shiftKey ? {stamp: i} : {color: i};
    }
    if (e.shiftKey) return null;
    const tool = LETTERS[String(e.key || "").toLowerCase()];
    return tool ? {tool} : null;
  }

  /** Colonne de texte d'une page, en coordonnées normalisées : les bords
   *  gauche et droit que franchit la quasi-totalité des lignes (les numéros
   *  de page ou de ligne isolés n'élargissent pas la colonne). */
  function textColumn(spans            )                          {
    const lines = (spans || []).filter(s => s && s[1] - s[0] > 0.02);
    if (lines.length < 3) return null;
    const lefts = lines.map(s => s[0]).sort((a, b) => a - b);
    const rights = lines.map(s => s[1]).sort((a, b) => a - b);
    const n = lines.length;
    return [lefts[Math.floor(n * 0.05)], rights[Math.max(0, Math.ceil(n * 0.95) - 1)]];
  }
  /** Un clic hors de la colonne de texte tombe dans la marge (pastille) ;
   *  sans couche texte (scan), les 12 % de chaque bord font office de marge. */
  function isMargin(x        , column                         ){
    if (!column) return x < 0.12 || x > 0.88;
    return x < column[0] - 0.004 || x > column[1] + 0.004;
  }

  /** Plan pdf.js (`getOutline`) → liste à plat, avec la profondeur. */

  function flattenOutline(items                      , depth = 0, out                                                  = []){
    for (const item of items || []) {
      const title = String(item && item.title || "").replace(/\s+/g, " ").trim();
      if (title) out.push({title, dest: item.dest ?? null, depth});
      if (item && item.items && item.items.length && depth < 5) flattenOutline(item.items, depth + 1, out);
    }
    return out;
  }

  /** Nom et sens d'une teinte de surlignage (rgba du lecteur ou nom anglais). */
  const COLOR_KEYS = ["255,213,74", "120,220,140", "120,170,255", "255,140,160", "255,160,80", "185,150,255"];
  const COLOR_ALIASES = ["amber", "green", "blue", "red", "orange", "violet"];
  function colorIndex(color         ){
    const c = String(color || "").replace(/\s+/g, "").toLowerCase();
    if (!c) return 0;
    const i = COLOR_KEYS.findIndex(k => c.includes(k));
    if (i >= 0) return i;
    const j = COLOR_ALIASES.indexOf(c);
    return j >= 0 ? j : -1;
  }



  const clean = (s         ) => String(s || "").replace(/­\s?/g, "").replace(/\s+/g, " ").trim();
  function sortKey(a       ){
    return (a.rects && a.rects[0] && a.rects[0][1]) ?? (a.pin && a.pin[1]) ?? 0;
  }
  /** Toutes les annotations d'un article en Markdown : groupées par page,
   *  la citation, sa teinte (nom · sens) et les notes. */
  function annotationsMarkdown(annots         , ref        ){
    const list = (annots || []).filter(Boolean).slice()
      .sort((a, b) => (Number(a.page) - Number(b.page)) || (sortKey(a) - sortKey(b)));
    const out = ["## Annotations — " + (ref || "article"), ""];
    let page = null;
    for (const a of list) {
      if (a.page !== page) {
        if (page !== null) out.push("");
        page = a.page;
        out.push("### p. " + page);
      }
      const quote = clean(a.text);
      const memo = clean(a.memo);
      const chat = clean(a.note);
      const ci = colorIndex(a.color);
      const tint = ci >= 0 ? COLOR_NAMES[ci].toLowerCase() + " · " + COLOR_MEANINGS[ci] : "";
      let line        ;
      if (a.kind === "note") line = "- Note : " + (chat || "(vide)");
      else if (a.kind === "text") line = "- Zone de texte : " + (quote || "(vide)");
      else if (a.kind === "area") line = "- Zone capturée" + (chat ? " : " + chat : "");
      else if (a.kind === "stamp") line = "- Tampon « " + stampById(a.stamp).label + " »" + (quote ? " près de : « " + quote + " »" : "");
      else {
        const style = a.kind === "ul" ? "souligné" : a.kind === "st" ? "barré" : a.kind === "comment" ? "annoté" : "surligné";
        line = "- « " + quote + " » (" + style + (tint ? ", " + tint : "") + ")";
      }
      out.push(line);
      if (memo && a.kind !== "note") out.push("  - Note : " + memo);
      if (chat && a.kind !== "note" && a.kind !== "area") out.push("  - Au chat : " + chat);
    }
    if (!list.length) out.push("(aucune annotation)");
    return out.join("\n") + "\n";
  }

  return {COLOR_NAMES, COLOR_MEANINGS, STAMPS, stampById, stampIcon, TEXT_FONTS, TEXT_SIZES, TEXT_INKS, TEXT_DEFAULTS,
    textStyle, fontCss, shortcut, textColumn, isMargin, flattenOutline, colorIndex, annotationsMarkdown};
}
