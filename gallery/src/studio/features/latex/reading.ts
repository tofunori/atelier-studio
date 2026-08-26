import type {StudioEditor, StudioPosition} from "../../core/editor_contract";
import {findAnnotationRange} from "./annotations";

export interface KatexRenderer {
  renderToString(source: string, options: Record<string, unknown>): string;
}

interface ReadingBlock {
  type: "h" | "p" | "list" | "env";
  line: number;
  /** Dernière ligne source du bloc (paragraphes seulement) : porte
   *  l'édition sur place en vue Lecture. */
  end?: number;
  text?: string;
  tag?: string;
  ordered?: boolean;
  items?: Array<{text: string; line: number}>;
  name?: string;
}

export interface LatexReadingOptions {
  getEditor(): StudioEditor | null;
  right: HTMLElement;
  splitButton: HTMLElement;
  popPdfButton?: HTMLElement | null;
  setPdfVisible(visible: boolean): void;
  revealLine(editor: StudioEditor, line: number): void;
  /** Prose sélectionnée en vue Lecture, déjà ramenée à ses positions source :
   *  l'hôte y branche la même pastille que dans l'éditeur (commenter, envoyer
   *  au chat). Absent = pas de sélection annotable en Lecture. */
  onProseSelection?(selection: {
    text: string;
    from: StudioPosition;
    to: StudioPosition;
    anchor: {box: DOMRect; caret: {left: number; top: number; bottom: number}};
  }): void;
  /** Appelé quand la sélection de prose disparaît, pour retirer la pastille. */
  onProseSelectionCleared?(): void;
  /** Annotations du fichier (texte source + couleur) : la Lecture les surligne
   *  dans la prose rendue. Absent = pas de surlignage. */
  getAnnotations?(): readonly {text: string; from: StudioPosition; color?: string}[];
  /** Un paragraphe édité sur place vient d'être appliqué au buffer : l'hôte
   *  déclenche sa sauvegarde habituelle. Absent = pas d'édition en Lecture. */
  onBlockEdited?(): void;
  /** Le rendu de la prose vient d'être (re)construit — marques du diff
   *  comprises. La gouttière de marge s'y raccroche pour repeindre ses
   *  pistes : numéros, signets, pastilles. */
  onRendered?(): void;
  katex: KatexRenderer;
  document?: Document;
  window?: Window;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export interface LatexReadingController {
  bind(): void;
  render(): void;
  setRead(enabled: boolean): void;
  syncMode(): void;
  isReading(): boolean;
  /** Amène la vue Lecture sur la ligne SOURCE demandée (plan du document).
   *  Rend false hors vue Lecture : l'appelant retombe alors sur l'éditeur. */
  revealSourceLine(line: number): boolean;
  /** Navigation ⌥↓/⌥↑ d'une comparaison : révèle le bloc du changement et
   *  affiche un compteur transitoire (la barre d'état est masquée en Lecture). */
  revealChange(line: number, index: number, total: number): boolean;
  /** Marques du diff en termes de SOURCE, publiées par le moteur de
   *  comparaison. Liste vide = comparaison fermée, la prose redevient calme. */
  setDiffMarks(marks: ReadonlyArray<{kind: string; line: number; text: string}>): void;
  /** Redessine les surlignages d'annotations (appelé quand le jeu change). */
  refreshAnnotations(): void;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderLatexReadingHtml(source: string, katex: KatexRenderer): string {
  const fullSource = String(source || "");
  const documentMatch = /\\begin\{document\}([\s\S]*?)\\end\{document\}/.exec(fullSource);
  let body = documentMatch?.[1] || fullSource;
  body = body.replace(/(^|[^\\])%.*$/gm, "$1");
  // Plomberie TeX : entre \makeatletter et \makeatother vivent des définitions
  // de macros, jamais de la prose. Sans ce retrait, un fragment sans
  // \begin{document} (chapitre inclus par un fichier racine) fait rendre son
  // préambule de chargement comme un paragraphe — « @path\@undefined@path ».
  // Vidé ligne à ligne et non supprimé : `data-line` renvoie au source, et
  // supprimer des lignes ferait sauter tous les ancrages suivants.
  body = body.replace(/\\makeatletter[\s\S]*?\\makeatother/g, (block: string) => block.replace(/[^\n]/g, ""));
  // Même famille, mais sur une ligne : chargement conditionnel d'une racine,
  // définitions et inclusions. Une ligne qui commence par l'une de ces
  // primitives ne porte pas de texte à lire.
  body = body.replace(/^[ \t]*\\(?:ifdefined|ifx|else|fi|expandafter|endinput|input|include|def|makeatletter|makeatother)\b.*$/gm, "");

  const math: Array<{source: string; display: boolean}> = [];
  const stash = (tex: string, display: boolean): string => {
    math.push({source: tex.trim(), display});
    return `\x00M${math.length - 1}\x00`;
  };
  body = body.replace(/\$\$([\s\S]+?)\$\$/g, (_match, text: string) => stash(text, true));
  body = body.replace(/\\\[([\s\S]+?)\\\]/g, (_match, text: string) => stash(text, true));
  body = body.replace(/\\begin\{(equation|align|equation\*|align\*|gather|gather\*)\}([\s\S]*?)\\end\{\1\}/g,
    (_match, _environment: string, text: string) => stash(text, true));
  body = body.replace(/\$([^$]+?)\$/g, (_match, text: string) => stash(text, false));
  body = body.replace(/\\\(([\s\S]+?)\\\)/g, (_match, text: string) => stash(text, false));

  const lines = body.split("\n");
  const blocks: ReadingBlock[] = [];
  let paragraph: string[] = [];
  let paragraphLine = 0;
  let list: ReadingBlock | null = null;
  let paragraphEnd = 0;
  const flushParagraph = (): void => {
    if (paragraph.length) blocks.push({type: "p", text: paragraph.join(" "), line: paragraphLine, end: paragraphEnd});
    paragraph = [];
  };
  const flushList = (): void => {
    if (list) blocks.push(list);
    list = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] || "").trim();
    const sourceLine = index + 1;
    let match: RegExpExecArray | null;
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    match = /^\\(title|section|subsection|subsubsection|paragraph)\*?\{([\s\S]*?)\}\s*$/.exec(line);
    if (match) {
      flushParagraph();
      flushList();
      const tags: Record<string, string> = {title: "h1", section: "h2", subsection: "h3", subsubsection: "h4", paragraph: "h5"};
      blocks.push({type: "h", tag: tags[match[1] || ""] || "h2", text: match[2] || "", line: sourceLine});
      continue;
    }
    if (/^\\(begin|end)\{(itemize|enumerate)\}/.test(line)) {
      flushParagraph();
      if (/^\\begin/.test(line)) {
        flushList();
        list = {type: "list", ordered: /enumerate/.test(line), items: [], line: sourceLine};
      } else flushList();
      continue;
    }
    match = /^\\item\s*([\s\S]*)$/.exec(line);
    if (match && list) {
      list.items?.push({text: match[1] || "", line: sourceLine});
      continue;
    }
    match = /^\\begin\{(figure|table|tabular|tikzpicture|thebibliography|abstract)\*?\}/.exec(line);
    if (match) {
      flushParagraph();
      flushList();
      const environment = match[1] || "";
      if (environment === "abstract") {
        blocks.push({type: "h", tag: "h2", text: "Abstract", line: sourceLine});
        continue;
      }
      let end = index + 1;
      while (end < lines.length && !new RegExp(`\\\\end\\{${environment}`).test(lines[end] || "")) end += 1;
      if (environment !== "thebibliography") blocks.push({type: "env", name: environment, line: sourceLine});
      index = end;
      continue;
    }
    if (/^\\end\{abstract\}/.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^\\(maketitle|newpage|clearpage|pagebreak|bibliographystyle|bibliography|input|include|tableofcontents|noindent|centering|raggedright|hline|toprule|midrule|bottomrule)\b/.test(line)) continue;
    if (!paragraph.length) paragraphLine = sourceLine;
    paragraphEnd = sourceLine;
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  const inline = (value: string): string => {
    let output = escapeHtml(value)
      .replace(/---/g, "—").replace(/--/g, "–")
      .replace(/``/g, "“").replace(/''/g, "”").replace(/`/g, "‘")
      .replace(/~/g, " ")
      .replace(/\\%/g, "%").replace(/\\&/g, "&amp;").replace(/\\_/g, "_")
      .replace(/\\#/g, "#").replace(/\\\$/g, "$").replace(/\\ /g, " ")
      .replace(/\\\\/g, "<br>").replace(/\\newline/g, "<br>")
      .replace(/\[\[([\s\S]*?)\]\]/g, '<span class="tex-todo">[[$1]]</span>')
      .replace(/\\todo\{([\s\S]*?)\}/g, '<span class="tex-todo">$1</span>')
      .replace(/\\textcolor\{[^}]*\}\{([\s\S]*?)\}/g, '<span class="tex-todo">$1</span>');
    for (let pass = 0; pass < 3; pass += 1) {
      output = output.replace(/\\textbf\{([^{}]*)\}/g, "<strong>$1</strong>")
        .replace(/\\(emph|textit|textsl)\{([^{}]*)\}/g, "<em>$2</em>")
        .replace(/\\texttt\{([^{}]*)\}/g, "<code>$1</code>")
        .replace(/\\underline\{([^{}]*)\}/g, "<u>$1</u>");
    }
    output = output.replace(/\\(cite[a-z]*|citep|citet)\{([^}]*)\}/g, '<span class="tex-cite">[$2]</span>')
      .replace(/\\(eqref|ref|autoref|cref|Cref)\{([^}]*)\}/g, '<span class="tex-ref">§$2</span>')
      .replace(/\\label\{[^}]*\}/g, "")
      .replace(/\\footnote\{([\s\S]*?)\}/g, '<sup class="tex-fn" title="$1">*</sup>')
      .replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, '<a href="$1">$2</a>')
      .replace(/\\url\{([^}]*)\}/g, '<a href="$1">$1</a>');
    for (let pass = 0; pass < 4; pass += 1) output = output.replace(/\\[a-zA-Z]+\*?\{([^{}]*)\}/g, "$1");
    return output.replace(/\\[a-zA-Z]+\*?/g, "").replace(/[{}]/g, "");
  };
  const withMath = (html: string): string => html.replace(/\x00M(\d+)\x00/g, (_match, rawIndex: string) => {
    const item = math[Number(rawIndex)];
    if (!item) return "";
    try {
      return katex.renderToString(item.source, {displayMode: item.display, throwOnError: false, errorColor: "#e0726a"});
    } catch {
      return `<span class="tex-matherr">${escapeHtml(item.source)}</span>`;
    }
  });
  return blocks.map((block) => {
    if (block.type === "h") return `<${block.tag} data-line="${block.line}">${withMath(inline(block.text || ""))}</${block.tag}>`;
    if (block.type === "p") return `<p data-line="${block.line}" data-line-end="${block.end ?? block.line}">${withMath(inline(block.text || ""))}</p>`;
    if (block.type === "list") {
      const tag = block.ordered ? "ol" : "ul";
      const items = (block.items || []).map((item) => `<li data-line="${item.line}">${withMath(inline(item.text))}</li>`).join("");
      return `<${tag}>${items}</${tag}>`;
    }
    return `<div class="tex-env" data-line="${block.line}">[ ${block.name} ]</div>`;
  }).join("\n");
}

/** Le rendu applique au texte des substitutions déterministes (« ~ » → espace,
 *  « \% » → « % », tirets, guillemets…). Pour retrouver une sélection rendue
 *  dans le fichier, on applique LES MÊMES substitutions au source en gardant,
 *  caractère par caractère, l'offset d'origine — puis on cherche dans ce texte
 *  transformé et on revient aux positions réelles par la carte. Sans ça,
 *  sélectionner « 500 m » ne retrouvait jamais « 500~m » (48 tildes dans un
 *  chapitre de méthodes réel : le cas n'est pas marginal). */
const RENDER_SUBSTITUTIONS: ReadonlyArray<[string, string]> = [
  ["---", "—"], ["--", "–"], ["``", "“"], ["''", "”"], ["`", "‘"],
  ["\\%", "%"], ["\\&", "&"], ["\\_", "_"], ["\\#", "#"], ["\\$", "$"],
  ["\\ ", " "], ["~", " "],
];
export function renderedSourceView(source: string): {text: string; map: number[]} {
  const text: string[] = [];
  const map: number[] = [];
  let index = 0;
  outer: while (index < source.length) {
    for (const [needle, replacement] of RENDER_SUBSTITUTIONS) {
      if (source.startsWith(needle, index)) {
        for (const ch of replacement) { text.push(ch); map.push(index); }
        index += needle.length;
        continue outer;
      }
    }
    text.push(source[index] as string);
    map.push(index);
    index += 1;
  }
  map.push(source.length);  // borne de fin pour la conversion des plages
  return {text: text.join(""), map};
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Cherche `needle` (texte tel que RENDU, blancs libres) dans le source via la
 *  vue transformée ; renvoie la plage SOURCE la plus proche de `nearIndex`. */
export function findRenderedText(
  source: string,
  needle: string,
  nearIndex: number,
  editor: Pick<StudioEditor, "posFromIndex">,
): {from: StudioPosition; to: StudioPosition} | null {
  const words = needle.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const view = renderedSourceView(source);
  const pattern = new RegExp(words.map(escapeRegExp).join("[\\s]+"), "g");
  let best: {start: number; end: number} | null = null;
  for (const match of view.text.matchAll(pattern)) {
    const start = view.map[match.index as number] as number;
    const end = view.map[(match.index as number) + match[0].length] as number;
    if (!best || Math.abs(start - nearIndex) < Math.abs(best.start - nearIndex)) best = {start, end};
  }
  return best ? {from: editor.posFromIndex(best.start), to: editor.posFromIndex(best.end)} : null;
}

/** Borne une sélection de prose rendue dans le texte SOURCE. Les fragments
 *  arrivent dans l'ordre du document, déjà débarrassés des nœuds fabriqués
 *  (citations, refs, math) — mais le rendu retouche aussi la prose elle-même
 *  (« \% » → « % », commandes dépouillées) : aucun fragment n'est garanti
 *  littéral en entier. On ancre donc le début sur le plus long PRÉFIXE du
 *  premier fragment retrouvable dans le source, la fin sur le plus long
 *  SUFFIXE du dernier, en raccourcissant mot à mot. */
export function anchorProseFragments(
  source: string,
  fragments: string[],
  line: number,
  editor: Pick<StudioEditor, "indexFromPos" | "posFromIndex">,
): {from: StudioPosition; to: StudioPosition} | null {
  const nearIndex = editor.indexFromPos({line, ch: 0} as StudioPosition);
  const locate = (text: string): ReturnType<typeof findAnnotationRange> => {
    if (text.length < 4) return null;
    // 1. Littéral (avec repli blancs) — le chemin des annotations.
    const direct = findAnnotationRange(source, {text, from: {line, ch: 0}}, editor);
    if (direct) return direct;
    // 2. À travers les substitutions du rendu (« ~ » → espace, « \% » → % …).
    return findRenderedText(source, text, nearIndex, editor);
  };
  const shrink = (
    fragment: string,
    cut: (words: string[], keep: number) => string,
  ): ReturnType<typeof findAnnotationRange> => {
    const words = fragment.split(/\s+/).filter(Boolean);
    for (let keep = Math.min(words.length, 8); keep >= 1; keep -= 1) {
      const candidate = cut(words, keep);
      // Un seul mot très court est trop ambigu pour ancrer.
      if (keep === 1 && candidate.length < 4) break;
      const found = locate(candidate);
      if (found) return found;
    }
    return null;
  };
  let start: ReturnType<typeof findAnnotationRange> = null;
  for (const fragment of fragments) {
    start = shrink(fragment, (words, keep) => words.slice(0, keep).join(" "));
    if (start) break;
  }
  if (!start) return null;
  let end: ReturnType<typeof findAnnotationRange> = null;
  for (let index = fragments.length - 1; index >= 0 && !end; index -= 1) {
    end = shrink(fragments[index] || "", (words, keep) => words.slice(-keep).join(" "));
  }
  if (!end) end = start;
  // Ambiguïté résolue à l'envers (fin trouvée avant le début) : se rabattre
  // sur la seule borne sûre plutôt que d'envoyer une plage négative.
  if (editor.indexFromPos(end.to) < editor.indexFromPos(start.from)) end = start;
  return {from: start.from as StudioPosition, to: end.to as StudioPosition};
}

/** Séquences de mots d'un texte SOURCE sans aucune commande LaTeX — les seuls
 *  passages garantis identiques dans la prose rendue. Une annotation qui
 *  traverse un \cite{} donne deux séquences : avant et après. */
export function proseRuns(text: string): string[] {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const runs: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    if (/[\\{}~$%]/.test(word)) {
      if (current.length) runs.push(current.join(" "));
      current = [];
    } else current.push(word);
  }
  if (current.length) runs.push(current.join(" "));
  return runs.filter((run) => run.length >= 4);
}

/** Apparie CHAQUE suite de prose retrouvable dans le texte rendu, en avançant
 *  strictement (jamais de retour en arrière). Une suite absente du rendu
 *  (contenu transformé : citation, math) est simplement sautée — les suites
 *  suivantes restent appariées. Sert au surlignage du diff en vue Lecture :
 *  un segment par suite, au lieu d'une seule plage première→dernière qui se
 *  tronquait dès qu'une suite manquait. */
export function proseRunRanges(
  blockText: string,
  runs: readonly string[],
): Array<{start: number; end: number}> {
  const segments: Array<{start: number; end: number}> = [];
  let cursor = 0;
  for (const run of runs) {
    const at = blockText.indexOf(run, cursor);
    if (at < 0) continue;
    segments.push({start: at, end: at + run.length});
    cursor = at + run.length;
  }
  return segments;
}

export function createLatexReadingController(options: LatexReadingOptions): LatexReadingController {
  const doc = options.document || document;
  const win = options.window || window;
  const storage = options.storage || win.localStorage;
  const reading = doc.createElement("div");
  reading.id = "texread";
  options.right.appendChild(reading);

  // ---- taille de police de la Lecture --------------------------------------
  // Le cache local donne la valeur au premier rendu ; la vérité vient de
  // `/state` (piège n°1 : le localStorage du WebView ne survit pas au
  // redémarrage de l'app), comme texAutoRewrap.
  const FS_MIN = 13, FS_MAX = 24, FS_DEFAULT = 15;
  const FS_KEY = "texReadFontSize";
  const clampFs = (value: unknown): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(FS_MIN, Math.min(FS_MAX, Math.round(numeric))) : FS_DEFAULT;
  };
  let fontSize = clampFs(storage.getItem(FS_KEY) ?? FS_DEFAULT);
  const fsControl = doc.createElement("span");
  fsControl.id = "texreadFs";
  const fsMinus = doc.createElement("button");
  fsMinus.textContent = "−";
  fsMinus.title = "Réduire le texte";
  fsMinus.setAttribute("aria-label", "Réduire la taille du texte");
  const fsValue = doc.createElement("span");
  fsValue.className = "fs-val";
  const fsPlus = doc.createElement("button");
  fsPlus.textContent = "+";
  fsPlus.title = "Agrandir le texte";
  fsPlus.setAttribute("aria-label", "Agrandir la taille du texte");
  fsControl.append(fsMinus, fsValue, fsPlus);
  options.right.appendChild(fsControl);
  const applyFontSize = (): void => {
    reading.style.setProperty("--texread-fs", `${fontSize}px`);
    fsValue.textContent = String(fontSize);
    fsMinus.disabled = fontSize <= FS_MIN;
    fsPlus.disabled = fontSize >= FS_MAX;
  };
  // Écritures /state sérialisées : deux réglages (taille, fond) fusionnent le
  // même document — deux lecture-modification-écriture concurrents se
  // perdraient l'un l'autre.
  let persistChain: Promise<unknown> = Promise.resolve();
  const persistState = (key: string, value: unknown): void => {
    persistChain = persistChain
      .then(() => win.fetch("/state").then((response) => response.json() as Promise<Record<string, unknown>>))
      .catch(() => ({}))
      .then((state) => win.fetch("/state", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({...(state && typeof state === "object" ? state : {}), [key]: value}),
      }))
      .catch(() => { /* le réglage vaut pour la session en cours */ });
  };
  const setFontSize = (next: number): void => {
    fontSize = clampFs(next);
    applyFontSize();
    storage.setItem(FS_KEY, String(fontSize));
    persistState(FS_KEY, fontSize);
  };
  fsMinus.onclick = () => setFontSize(fontSize - 1);
  fsPlus.onclick = () => setFontSize(fontSize + 1);
  applyFontSize();

  // ---- fond de lecture : noir du chat (défaut), sombre, sépia -------------
  const THEME_KEY = "texReadTheme";
  const THEMES: ReadonlyArray<{name: string; swatch: string; label: string}> = [
    {name: "chat", swatch: "#1e2124", label: "Fond noir du chat (défaut)"},
    {name: "dark", swatch: "#1a1d22", label: "Fond sombre"},
    {name: "sepia", swatch: "#efe7d4", label: "Fond sépia"},
  ];
  const themeNames = new Set(THEMES.map((theme) => theme.name));
  let readTheme = themeNames.has(storage.getItem(THEME_KEY) || "") ? storage.getItem(THEME_KEY) as string : "chat";
  const themeButtons: HTMLButtonElement[] = [];
  const applyTheme = (): void => {
    if (readTheme === "dark") delete options.right.dataset.trTheme;
    else options.right.dataset.trTheme = readTheme;
    themeButtons.forEach((button) => button.classList.toggle("on", button.dataset.theme === readTheme));
  };
  const setTheme = (name: string): void => {
    readTheme = themeNames.has(name) ? name : "chat";
    applyTheme();
    storage.setItem(THEME_KEY, readTheme);
    persistState(THEME_KEY, readTheme);
  };
  const fsSep = doc.createElement("span");
  fsSep.className = "fs-sep";
  fsControl.appendChild(fsSep);
  for (const theme of THEMES) {
    const button = doc.createElement("button");
    button.className = "tr-sw";
    button.dataset.theme = theme.name;
    button.style.background = theme.swatch;
    button.title = theme.label;
    button.setAttribute("aria-label", theme.label);
    button.onclick = () => setTheme(theme.name);
    themeButtons.push(button);
    fsControl.appendChild(button);
  }
  applyTheme();

  void win.fetch("/state")
    .then((response) => response.json() as Promise<Record<string, unknown>>)
    .then((state) => {
      if (!state || typeof state !== "object") return;
      if (state[FS_KEY] !== undefined) {
        fontSize = clampFs(state[FS_KEY]);
        storage.setItem(FS_KEY, String(fontSize));
        applyFontSize();
      }
      if (themeNames.has(String(state[THEME_KEY] || ""))) {
        readTheme = String(state[THEME_KEY]);
        storage.setItem(THEME_KEY, readTheme);
        applyTheme();
      }
    })
    .catch(() => { /* serveur muet : le cache local fait foi */ });
  // Trois vues, un seul segment, icônes seules : les libellés « Édition » et
  // « Split » coûtaient 114 px de barre pour redire ce que la forme montre.
  // Lecture entre dans le segment — elle n'était atteignable que par le menu.
  const glyph = (path: string): string =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45"`
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const readButton = doc.createElement("button");
  readButton.id = "readBtn";
  readButton.title = "Vue Lecture — prose rendue (KaTeX), sans le code";
  readButton.setAttribute("aria-label", "Vue Lecture");
  // Un œil, pas un troisième rectangle : « Édition » et « Lecture » dessinés
  // tous deux en panneau lignés devenaient indiscernables à 14 px.
  readButton.innerHTML = glyph('<path d="M1.4 8s2.5-4.2 6.6-4.2S14.6 8 14.6 8s-2.5 4.2-6.6 4.2S1.4 8 1.4 8Z"/>'
    + '<circle cx="8" cy="8" r="1.9"/>');
  const editButton = doc.createElement("button");
  editButton.id = "editBtn";
  editButton.title = "Éditeur seul";
  editButton.setAttribute("aria-label", "Éditeur seul");
  editButton.innerHTML = glyph('<rect x="2" y="3" width="12" height="10" rx="1.6"/>'
    + '<path d="M4.6 6.2h5M4.6 8.6h6.4M4.6 11h3.2" opacity=".75"/><path d="M2 5.4h12" opacity=".45"/>');
  if (!options.splitButton.querySelector("svg")) {
    options.splitButton.title = "Vue scindée éditeur + PDF";
    options.splitButton.setAttribute("aria-label", "Vue scindée éditeur et PDF");
    options.splitButton.innerHTML = glyph('<rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M8 3v10"/>');
  }
  const segment = doc.createElement("span");
  segment.className = "modeseg";
  options.splitButton.parentNode?.insertBefore(segment, options.splitButton);
  segment.appendChild(editButton);
  segment.appendChild(options.splitButton);
  segment.appendChild(readButton);
  let enabled = false;
  let frame = 0;
  let bound = false;

  const render = (): void => {
    frame = 0;
    try { reading.innerHTML = renderLatexReadingHtml(options.getEditor()?.getValue() || "", options.katex); }
    catch (error) { reading.innerHTML = `<p style="color:#e0726a">Rendu impossible : ${escapeHtml(String(error))}</p>`; }
    applyAnnotationHighlights();
    applyDiffMarks();   // le rendu est reconstruit à chaque frappe : repeindre
    options.onRendered?.();
  };
  const syncMode = (): void => {
    editButton.classList.toggle("on", options.right.style.display === "none" && !enabled);
    options.splitButton.classList.toggle("on", options.right.style.display !== "none" && !enabled);
  };
  const setRead = (next: boolean): void => {
    enabled = next;
    storage.setItem("texReadMode", next ? "1" : "0");
    options.right.classList.toggle("reading", next);
    readButton.classList.toggle("on", next);
    // Lecture = une vue à part entière, prose plein cadre. Le panneau droit
    // doit d'abord exister (il porte #texread) avant qu'on masque l'éditeur.
    if (next && options.right.style.display === "none") options.setPdfVisible(true);
    doc.documentElement.classList.toggle("tex-read-only", next);
    if (next) {
      options.splitButton.classList.remove("on");
      render();
    } else {
      applyAnnotationHighlights();          // vide le registre en quittant
      options.onProseSelectionCleared?.();  // la pastille de prose avec lui
    }
    win.setTimeout(() => options.getEditor()?.refresh(), 60);
    syncMode();
  };
  readButton.onclick = () => setRead(!enabled);
  editButton.onclick = () => {
    if (enabled) setRead(false);
    options.setPdfVisible(false);
    syncMode();
  };
  options.splitButton.addEventListener("click", () => { if (enabled) setRead(false); });
  options.popPdfButton?.addEventListener("click", () => { if (enabled) setRead(false); });
  reading.addEventListener("click", (event) => {
    // Une sélection en cours n'est pas un clic de navigation : sans ça, finir
    // de surligner un passage renverrait aussitôt vers la source.
    if (!win.getSelection()?.isCollapsed) return;
    const element = (event.target as Element | null)?.closest<HTMLElement>("[data-line]");
    const editor = options.getEditor();
    if (!element || !editor) return;
    const line = Number.parseInt(element.dataset.line || "", 10) - 1;
    if (Number.isFinite(line)) options.revealLine(editor, line);
  });

  // ---- sélection de prose : commenter et envoyer au chat depuis la Lecture --
  // Le rendu perd les commandes LaTeX : impossible de compter les caractères
  // pour remonter au source. On retrouve donc le passage PAR SON CONTENU, avec
  // la même primitive que le ré-ancrage des commentaires (piège connu n°6), en
  // partant de la ligne du bloc — l'ancre `data-line` sert de voisinage.
  /** Éléments que le rendu a fabriqués : leur texte n'a pas d'équivalent
   *  littéral dans le source, donc il ne peut pas servir d'ancre. */
  const RENDERED_ONLY = ".tex-cite, .tex-ref, .tex-fn, .tex-matherr, .katex, .katex-display, .tr-gutter";
  const literalFragments = (range: Range): string[] => {
    const root = range.commonAncestorContainer;
    const host = (root.nodeType === 1 ? root as Element : root.parentElement) || reading;
    const walker = doc.createTreeWalker(host, 4 /* NodeFilter.SHOW_TEXT */);
    const out: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!range.intersectsNode(node)) continue;
      if (node.parentElement?.closest(RENDERED_ONLY)) continue;
      const whole = node.textContent || "";
      const from = node === range.startContainer ? range.startOffset : 0;
      const to = node === range.endContainer ? range.endOffset : whole.length;
      const piece = whole.slice(from, to).trim();
      if (piece) out.push(piece);
    }
    return out;
  };
  const proseSelection = (): void => {
    const selection = win.getSelection();
    const editor = options.getEditor();
    if (!selection || !editor || !options.onProseSelection) return;
    const text = String(selection.toString() || "").trim();
    if (!text || selection.isCollapsed || selection.rangeCount === 0) {
      options.onProseSelectionCleared?.();
      return;
    }
    const range = selection.getRangeAt(0);
    if (!reading.contains(range.commonAncestorContainer)) return;
    const holder = (range.startContainer.nodeType === 1
      ? range.startContainer as Element
      : range.startContainer.parentElement)?.closest<HTMLElement>("[data-line]");
    const line = Math.max(0, Number.parseInt(holder?.dataset.line || "1", 10) - 1);
    const source = editor.getValue();
    // Le rendu fabrique du texte absent du source : « [rgi7consortium2023] »
    // pour \cite{...}, « §label » pour \ref{...}, les formules KaTeX — mais
    // aussi des retouches DANS la prose elle-même (« \% » rendu « % »,
    // commandes dépouillées). Un fragment n'est donc jamais garanti littéral
    // en entier : on cherche le plus long préfixe du premier fragment et le
    // plus long suffixe du dernier qui existent dans le source, en
    // raccourcissant mot à mot.
    const found = anchorProseFragments(source, literalFragments(range), line, editor);
    if (!found) {
      options.onProseSelectionCleared?.();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    // On envoie le passage SOURCE, pas le rendu : un commentaire se ré-ancre en
    // recherchant son texte dans le fichier (piège connu n°6). Stocker
    // « [rgi7consortium2023] » condamnerait l'ancre dès le premier rechargement.
    const sourceText = source.slice(editor.indexFromPos(found.from), editor.indexFromPos(found.to)) || text;
    options.onProseSelection({
      text: sourceText,
      from: found.from as StudioPosition,
      to: found.to as StudioPosition,
      anchor: {
        box: reading.getBoundingClientRect(),
        caret: {left: rect.right, top: rect.top, bottom: rect.bottom},
      },
    });
  };
  reading.addEventListener("mouseup", () => win.setTimeout(proseSelection, 0));
  reading.addEventListener("keyup", (event) => {
    if ((event as KeyboardEvent).shiftKey) win.setTimeout(proseSelection, 0);
  });

  // ---- surlignage des annotations dans la prose rendue ---------------------
  // API CSS Custom Highlight : aucun nœud ajouté, donc les ancres `data-line`
  // et le calcul de sélection restent intacts. Les couleurs répondent à celles
  // des marques de l'éditeur (SWATCHES d'annotations.ts, alpha adouci).
  const HIGHLIGHT_COLORS: readonly string[] = ["amber", "red", "blue", "green", "purple"];
  const blockForLine = (line: number): HTMLElement | null => {
    let best: HTMLElement | null = null;
    for (const el of reading.querySelectorAll<HTMLElement>("[data-line]")) {
      const at = Number.parseInt(el.dataset.line || "", 10);
      if (Number.isFinite(at) && at <= line) best = el;
      else if (Number.isFinite(at) && at > line) break;
    }
    return best;
  };
  const rangeFromOffsets = (block: HTMLElement, start: number, end: number): Range | null => {
    const walker = doc.createTreeWalker(block, 4 /* NodeFilter.SHOW_TEXT */);
    let offset = 0;
    let range: Range | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = (node.textContent || "").length;
      if (!range && start < offset + length) {
        range = doc.createRange();
        range.setStart(node, Math.max(0, start - offset));
      }
      if (range && end <= offset + length) {
        range.setEnd(node, Math.max(0, end - offset));
        return range;
      }
      offset += length;
    }
    return null;
  };
  /** Retrouve un texte SOURCE dans un bloc rendu. Le rendu est irréversible
   *  mot à mot (citations, math, commandes) : on cherche donc les suites de
   *  mots de prose, pas la chaîne brute. Sert aux annotations ET au diff. */
  const locateText = (block: HTMLElement, text: string): Range | null => {
    const runs = proseRuns(text);
    if (!runs.length) return null;
    const blockText = block.textContent || "";
    let start = -1;
    for (const run of runs) {
      start = blockText.indexOf(run);
      if (start >= 0) break;
    }
    if (start < 0) return null;
    let end = start;
    for (let index = runs.length - 1; index >= 0; index -= 1) {
      const at = blockText.indexOf(runs[index] || "", start);
      if (at >= 0) { end = at + (runs[index] || "").length; break; }
    }
    return end > start ? rangeFromOffsets(block, start, end) : null;
  };
  const locateAnnotation = (annotation: {text: string; from: StudioPosition}): Range | null => {
    const block = blockForLine(annotation.from.line + 1);
    return block ? locateText(block, annotation.text) : null;
  };
  const applyAnnotationHighlights = (): void => {
    const registry = (win as unknown as {CSS?: {highlights?: Map<string, unknown>}}).CSS?.highlights;
    const HighlightCtor = (win as unknown as {Highlight?: new (...ranges: Range[]) => unknown}).Highlight;
    if (!registry || !HighlightCtor) return;
    for (const color of HIGHLIGHT_COLORS) registry.delete(`texc-read-${color}`);
    if (!enabled || !options.getAnnotations) return;
    const byColor = new Map<string, Range[]>();
    for (const annotation of options.getAnnotations()) {
      const span = locateAnnotation(annotation);
      if (!span) continue;
      const color = HIGHLIGHT_COLORS.includes(annotation.color || "") ? annotation.color as string : "amber";
      const list = byColor.get(color) || [];
      list.push(span);
      byColor.set(color, list);
    }
    for (const [color, list] of byColor) registry.set(`texc-read-${color}`, new HighlightCtor(...list));
  };
  // ---- édition sur place : double-clic sur un paragraphe -------------------
  // Le rendu est irréversible mot à mot (citations, math, commandes) : on
  // n'édite donc jamais la prose rendue, mais le SOURCE du bloc, que le rendu
  // borne exactement (`data-line`…`data-line-end`). ⌘⏎ ou ⇧⏎ applique via
  // replaceRange — la sélection, les marques et le défilement de l'éditeur se
  // remappent naturellement — puis l'hôte sauvegarde. Échap abandonne.
  let editing = false;
  const editBlock = (holder: HTMLElement): void => {
    const editor = options.getEditor();
    if (!editor || editing || !options.onBlockEdited) return;
    const from = Number.parseInt(holder.dataset.line || "", 10) - 1;
    const to = Number.parseInt(holder.dataset.lineEnd || "", 10) - 1;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return;
    const lastLength = (editor.getLine(to) || "").length;
    const sourceText = editor.getRange({line: from, ch: 0}, {line: to, ch: lastLength});
    editing = true;
    const area = doc.createElement("textarea");
    area.className = "texread-edit";
    area.value = sourceText;
    area.rows = Math.max(3, sourceText.split("\n").length + 1);
    area.setAttribute("aria-label", `Éditer les lignes ${from + 1} à ${to + 1}`);
    holder.replaceChildren(area);
    holder.classList.add("editing");
    area.focus();
    const leave = (apply: boolean): void => {
      if (!editing) return;
      editing = false;
      const next = area.value;
      if (apply && next !== sourceText) {
        // Recontrôle juste avant d'écrire : un agent a pu recharger le buffer
        // pendant l'édition. Si le bloc a bougé, ne rien écraser — re-rendre.
        const still = options.getEditor();
        const same = still && still.getRange({line: from, ch: 0}, {line: to, ch: (still.getLine(to) || "").length}) === sourceText;
        if (same) {
          still.replaceRange(next, {line: from, ch: 0}, {line: to, ch: (still.getLine(to) || "").length});
          options.onBlockEdited?.();
          return;  // le change de l'éditeur re-rend déjà la vue
        }
      }
      render();
    };
    area.addEventListener("keydown", (event) => {
      const key = event as KeyboardEvent;
      if (key.key === "Escape") { key.preventDefault(); leave(false); }
      else if (key.key === "Enter" && (key.metaKey || key.ctrlKey || key.shiftKey)) {
        key.preventDefault();
        leave(true);
      }
      key.stopPropagation();
    });
    area.addEventListener("blur", () => leave(true));
  };
  reading.addEventListener("dblclick", (event) => {
    const holder = (event.target as Element | null)?.closest<HTMLElement>("p[data-line-end]");
    if (!holder || !enabled) return;
    event.preventDefault();
    win.getSelection()?.removeAllRanges();
    options.onProseSelectionCleared?.();
    editBlock(holder);
  });

  const bind = (): void => {
    const editor = options.getEditor();
    if (bound || !editor) return;
    bound = true;
    editor.on("change", () => {
      if (enabled && !frame && !editing) frame = win.requestAnimationFrame(render);
    });
    if (storage.getItem("texReadMode") === "1") setRead(true);
  };
  syncMode();
  // ---- marques du diff dans la prose (liées au bouton comparaison) --------
  // Elles n'apparaissent QUE pendant une comparaison : la Lecture sert aussi à
  // relire au propre, une prose constamment barbouillée ne s'y prête pas.
  let diffMarks: ReadonlyArray<{kind: string; line: number; text: string}> = [];
  const applyDiffMarks = (): void => {
    for (const old of reading.querySelectorAll(".tr-cut, .tr-cut-text")) old.remove();
    const registry = (win as unknown as {CSS?: {highlights?: Map<string, unknown>}}).CSS?.highlights;
    const HighlightCtor = (win as unknown as {Highlight?: new (...ranges: Range[]) => unknown}).Highlight;
    registry?.delete("texc-read-diff");
    registry?.delete("texc-read-diff-bridge");
    if (!enabled || !diffMarks.length) return;
    const added: Range[] = [];
    const bridged: Range[] = [];
    // Les suppressions insérées avant les surlignages : le texte déplié d'une
    // coupe changerait les offsets des plages déjà calculées dans le même bloc.
    for (const mark of diffMarks) {
      if (mark.kind !== "del") continue;
      // `line` vient de CodeMirror (0-based), les ancres du rendu sont 1-based
      const block = blockForLine(mark.line + 1);
      if (!block) continue;
      // Une suppression n'existe PLUS dans le texte rendu : impossible de la
      // surligner. La barre de marge devient un bouton : un clic déplie le
      // texte retiré EN BARRÉ au début du bloc, un second le replie. Le nœud
      // injecté est retiré au repli (et à chaque re-rendu), donc les ancres
      // `data-line` et le calcul de sélection restent intacts.
      const cut = doc.createElement("span");
      cut.className = "tr-cut";
      cut.setAttribute("role", "button");
      cut.tabIndex = 0;
      cut.setAttribute("aria-expanded", "false");
      cut.setAttribute("aria-label", `Texte supprimé : ${mark.text}`);
      cut.title = "Afficher le texte supprimé";
      const body = doc.createElement("del");
      body.className = "tr-cut-text";
      body.textContent = mark.text + " ";
      // Position réelle de la coupe : la marque porte le début du texte qui la
      // SUIT dans la source (`next` — remplacement ou commun, donc présent
      // dans la prose rendue). On insère le barré juste avant ce contexte ;
      // introuvable (transformé au rendu) = repli en tête de bloc.
      const insertAtAnchor = (): void => {
        const context = (mark as {next?: string}).next || "";
        for (const run of proseRuns(context)) {
          const at = (block.textContent || "").indexOf(run);
          if (at < 0) continue;
          const anchor = rangeFromOffsets(block, at, at);
          if (anchor) { anchor.insertNode(body); return; }
        }
        // Repli en tête de bloc. On ne vise PAS `cut.nextSibling` : la
        // gouttière de marge adopte la coupe, qui n'est alors plus un
        // enfant du bloc — insertBefore lèverait NotFoundError.
        block.insertBefore(body, block.firstChild);
      };
      const toggle = (): void => {
        const open = !body.parentNode;
        if (open) insertAtAnchor();
        else body.remove();
        cut.classList.toggle("open", open);
        cut.setAttribute("aria-expanded", open ? "true" : "false");
        cut.title = open ? "Replier le texte supprimé" : "Afficher le texte supprimé";
      };
      cut.addEventListener("click", (event) => { event.stopPropagation(); toggle(); });
      cut.addEventListener("keydown", (event) => {
        const key = event as KeyboardEvent;
        if (key.key === "Enter" || key.key === " ") { key.preventDefault(); toggle(); }
      });
      block.insertBefore(cut, block.firstChild);
    }
    for (const mark of diffMarks) {
      if (mark.kind === "del") continue;
      const block = blockForLine(mark.line + 1);
      if (!block) continue;
      // Un segment par suite de prose retrouvée (les suites transformées au
      // rendu sont sautées) — le surlignage ne se tronque plus à la première
      // suite introuvable. Les « ponts » (inchangés absorbés par la fusion)
      // vont dans un registre à part, peint plus pâle.
      const blockText = block.textContent || "";
      const bucket = mark.kind === "bridge" ? bridged : added;
      for (const segment of proseRunRanges(blockText, proseRuns(mark.text))) {
        const range = rangeFromOffsets(block, segment.start, segment.end);
        if (range) bucket.push(range);
      }
    }
    if (registry && HighlightCtor) {
      if (added.length) registry.set("texc-read-diff", new HighlightCtor(...added));
      if (bridged.length) registry.set("texc-read-diff-bridge", new HighlightCtor(...bridged));
    }
  };
  const setDiffMarks = (marks: ReadonlyArray<{kind: string; line: number; text: string}>): void => {
    diffMarks = marks;
    applyDiffMarks();
    options.onRendered?.();
  };

  // En vue Lecture l'éditeur est masqué (`tex-read-only`) : y déplacer le
  // curseur ne montre RIEN. On vise donc l'ancre `data-line` la plus proche
  // avant la ligne demandée — le rendu n'a pas d'ancre pour chaque ligne
  // source, la plus proche en amont est le bon voisinage.
  const revealSourceLine = (line: number): boolean => {
    if (!enabled) return false;
    const target = blockForLine(line + 1) || reading.querySelector<HTMLElement>("[data-line]");
    if (!target) return false;
    target.scrollIntoView({block: "start", behavior: "smooth"});
    target.classList.add("tr-jump");
    win.setTimeout(() => target?.classList.remove("tr-jump"), 900);
    return true;
  };

  // Compteur « k / N » transitoire pour ⌥↓/⌥↑ : la barre d'état de l'hôte est
  // masquée en Lecture, le repère doit vivre DANS la vue.
  let navPill: HTMLElement | null = null;
  let navPillTimer = 0;
  const revealChange = (line: number, index: number, total: number): boolean => {
    if (!revealSourceLine(line)) return false;
    if (!navPill) {
      navPill = doc.createElement("span");
      navPill.className = "tr-navpill";
      navPill.setAttribute("aria-live", "polite");
      options.right.appendChild(navPill);
    }
    navPill.textContent = `${index + 1} / ${total}`;
    navPill.classList.add("show");
    win.clearTimeout(navPillTimer);
    navPillTimer = win.setTimeout(() => navPill?.classList.remove("show"), 1600);
    return true;
  };

  return {bind, render, setRead, syncMode, isReading: () => enabled,
    revealSourceLine, revealChange, setDiffMarks, refreshAnnotations: applyAnnotationHighlights};
}
