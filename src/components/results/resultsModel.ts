// Écran « Résultats » (variante A validée le 2026-11-10) : types de la liste
// et du détail renvoyés par `projectResults` / `projectResultDetail`
// (rust/crates/atelier-runtime/src/results.rs), filtres, tri, libellés et
// message « Reproduire ». Les textes vivent ICI, dans le chunk paresseux de la
// surface, et non dans i18n.ts : l'entrée JS est pleine.
import { getResolvedLanguage } from "../../lib/i18n";

export type ResultKind = "figure" | "table" | "pdf";
export type ResultFilter = "all" | ResultKind;
export type ResultView = "list" | "grid";

export type ResultOrigin = {
  kind: "script" | "cell" | "command" | "turn";
  label: string;
  path?: string;
  cell?: number;
  threadId?: string | null;
};

export type ResultStale = { input: string; name: string; changedAt: number | null; count: number };

export type ResultSummary = {
  path: string;
  name: string;
  kind: ResultKind;
  ext: string;
  version: number;
  ts: number | null;
  size: number | null;
  origin: ResultOrigin;
  starred: boolean;
  stale: ResultStale | null;
};

export type ResultBrief = { path: string; name: string; kind: ResultKind; version: number };

export type InputState = "unchanged" | "changed" | "missing" | "unknown";

export type ResultInput = {
  path: string;
  name: string;
  sha: string | null;
  size: number | null;
  state: InputState;
  changedAt: number | null;
  result: boolean;
};

export type ResultRecipe = {
  script: { path: string; sha: string | null } | null;
  command: string | null;
  cell: { id?: number; purpose?: string | null; env?: string | null; author?: string | null; threadId?: string | null } | null;
  inputs: ResultInput[];
  env: { name: string | null; manager?: "pixi" | "conda" | null; lock?: string | null; python: string | null; sha: string | null; packages: number };
  threadId?: string | null;
  threadTitle?: string | null;
  head?: string | null;
};

export type ResultVersion = {
  version: number;
  ts: number | null;
  current: boolean;
  origin: ResultOrigin;
  /** État Git de cette version, quand un diff texte est possible. */
  compare: { git: string } | null;
};

export type ResultDetail = ResultSummary & {
  width: number | null;
  height: number | null;
  abs: string;
  sidecar: string;
  recipe: ResultRecipe;
  /** Dernière entrée brute de la recette : matière du message « Reproduire ». */
  entry: Record<string, any>;
  versions: ResultVersion[];
  versionCount: number;
  diffPath: string | null;
  dependsOn: ResultBrief[];
  usedBy: ResultBrief[];
};

const FR = {
  title: "Résultats",
  count: (n: number) => `${n} résultat${n > 1 ? "s" : ""}`,
  staleCount: (n: number) => `${n} périmé${n > 1 ? "s" : ""}`,
  all: "Tout",
  figure: "Figures",
  table: "Tableaux",
  pdf: "PDF",
  filters: "Filtrer les résultats",
  search: "Chercher",
  view: "Affichage",
  list: "Liste",
  grid: "Grille",
  name: "Nom",
  origin: "Origine",
  modified: "Modifié",
  sortNewest: "Du plus récent au plus ancien",
  sortOldest: "Du plus ancien au plus récent",
  staleMark: "périmé",
  cell: (id: string | number) => `cellule ${id}`,
  star: "Marquer d’une étoile",
  unstar: "Retirer l’étoile",
  starFailed: (error: string) => `Étoile non enregistrée : ${error}`,
  refresh: "Actualiser",
  loading: "Chargement des résultats…",
  detailLoading: "Chargement de la recette…",
  noProject: "Ouvre un projet pour voir ses résultats.",
  noMatch: "Aucun résultat ne correspond.",
  emptyTitle: "Aucun résultat pour l’instant",
  emptyOn: "Les figures, tableaux et PDF produits par les prochains tours apparaîtront ici, avec leur recette.",
  emptyOff: "Les recettes sont éteintes : sans elles, Atelier ne note pas ce que chaque tour produit.",
  recipesOffNotice: "Les recettes sont éteintes : les nouveaux fichiers produits n’apparaîtront pas ici.",
  turnOn: "Allumer les recettes",
  truncated: "Liste tronquée : le projet contient plus de recettes que cet écran n’en parcourt.",
  staleLead: "Périmé.",
  staleOne: (name: string, when: string) => `${name} a changé ${when}, après cette version.`,
  staleMany: (name: string, others: number, when: string) =>
    `${name} a changé ${when}, après cette version, ainsi que ${others} autre${others > 1 ? "s" : ""} entrée${others > 1 ? "s" : ""}.`,
  staleNoDate: (name: string) => `${name} a changé depuis cette version.`,
  on: (date: string, time: string) => `le ${date} à ${time}`,
  at: (date: string, time: string) => `${date} à ${time}`,
  reproduce: "Reproduire",
  reproduceHint: "Prépare le message dans le chat, sans l’envoyer",
  reproduceReady: "Message prêt dans le chat : relis-le avant de l’envoyer.",
  open: "Ouvrir",
  reveal: "Afficher dans le Finder",
  revealFailed: (error: string) => `Impossible d’afficher le fichier : ${error}`,
  more: "Autres actions",
  openScript: "Ouvrir le script",
  openConversation: "Ouvrir la conversation",
  copyPath: "Copier le chemin",
  pathCopied: "Chemin copié.",
  recipe: "Recette",
  script: "Script",
  command: "Commande",
  cellLabel: "Cellule",
  inputs: "Entrées",
  environment: "Environnement",
  unchanged: "inchangé",
  changed: "modifié",
  missing: "introuvable",
  unknown: "non vérifié",
  noRecipe: "La recette ne note ni script, ni commande, ni entrée.",
  versions: "Versions",
  current: "actuelle",
  compare: "Comparer",
  closeCompare: "Fermer",
  compareTitle: (version: number) => `v${version} comparée à la version actuelle`,
  older: (n: number) => `${n} plus ancienne${n > 1 ? "s" : ""}`,
  versionsLost: (n: number) => `${n} version${n > 1 ? "s" : ""} plus ancienne${n > 1 ? "s" : ""} hors de la recette`,
  dependsOn: "Dépend de",
  usedBy: "Utilisé par",
  none: "Rien",
  diffLoading: "Chargement du diff…",
  noChange: "Aucune différence.",
  binary: "Fichier binaire : pas de diff texte.",
  large: "Fichier trop volumineux pour le diff.",
  pruned: "Cet état n’est plus disponible dans le dépôt.",
  kb: "Ko",
  mb: "Mo",
  gb: "Go",
  bytes: "octets",
};

type Strings = typeof FR;

const EN: Strings = {
  ...FR,
  title: "Results",
  count: (n) => `${n} result${n > 1 ? "s" : ""}`,
  staleCount: (n) => `${n} stale`,
  all: "All",
  figure: "Figures",
  table: "Tables",
  pdf: "PDF",
  filters: "Filter results",
  search: "Search",
  view: "View",
  list: "List",
  grid: "Grid",
  name: "Name",
  origin: "Origin",
  modified: "Modified",
  sortNewest: "Newest first",
  sortOldest: "Oldest first",
  staleMark: "stale",
  cell: (id) => `cell ${id}`,
  star: "Star",
  unstar: "Remove star",
  starFailed: (error) => `Star not saved: ${error}`,
  refresh: "Refresh",
  loading: "Loading results…",
  detailLoading: "Loading recipe…",
  noProject: "Open a project to see its results.",
  noMatch: "No matching result.",
  emptyTitle: "No results yet",
  emptyOn: "Figures, tables and PDFs produced by the next turns will show up here, with their recipe.",
  emptyOff: "Recipes are off: without them, Atelier does not record what each turn produces.",
  recipesOffNotice: "Recipes are off: newly produced files will not show up here.",
  turnOn: "Turn recipes on",
  truncated: "List truncated: the project holds more recipes than this screen scans.",
  staleLead: "Stale.",
  staleOne: (name, when) => `${name} changed ${when}, after this version.`,
  staleMany: (name, others, when) => `${name} changed ${when}, after this version, along with ${others} other input${others > 1 ? "s" : ""}.`,
  staleNoDate: (name) => `${name} changed since this version.`,
  on: (date, time) => `on ${date} at ${time}`,
  at: (date, time) => `${date} at ${time}`,
  reproduce: "Reproduce",
  reproduceHint: "Prepares the message in the chat without sending it",
  reproduceReady: "Message ready in the chat: read it before sending.",
  open: "Open",
  reveal: "Show in Finder",
  revealFailed: (error) => `Could not show the file: ${error}`,
  more: "More actions",
  openScript: "Open script",
  openConversation: "Open conversation",
  copyPath: "Copy path",
  pathCopied: "Path copied.",
  recipe: "Recipe",
  script: "Script",
  command: "Command",
  cellLabel: "Cell",
  inputs: "Inputs",
  environment: "Environment",
  unchanged: "unchanged",
  changed: "modified",
  missing: "missing",
  unknown: "not checked",
  noRecipe: "The recipe records no script, command or input.",
  versions: "Versions",
  current: "current",
  compare: "Compare",
  closeCompare: "Close",
  compareTitle: (version) => `v${version} compared with the current version`,
  older: (n) => `${n} older`,
  versionsLost: (n) => `${n} older version${n > 1 ? "s" : ""} no longer in the recipe`,
  dependsOn: "Depends on",
  usedBy: "Used by",
  none: "Nothing",
  diffLoading: "Loading diff…",
  noChange: "No differences.",
  binary: "Binary file: no text diff.",
  large: "File too large for a diff.",
  pruned: "This state is no longer available in the repository.",
  kb: "KB",
  mb: "MB",
  gb: "GB",
  bytes: "bytes",
};

export function strings(): Strings {
  return getResolvedLanguage() === "en" ? EN : FR;
}

function locale() {
  return getResolvedLanguage() === "en" ? "en-CA" : "fr-CA";
}

// Un formateur par locale et par forme : en construire un par rangée coûte cher.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale()}|${JSON.stringify(options)}`;
  let found = formatters.get(key);
  if (!found) { found = new Intl.DateTimeFormat(locale(), options); formatters.set(key, found); }
  return found;
}

/** « 9 nov. » (l'année s'ajoute quand ce n'est pas l'année en cours). */
export function formatDay(ts: number, now = Date.now()): string {
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return formatter(sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(ts));
}

/** « 14:10 », toujours sur 24 heures. */
export function formatTime(ts: number): string {
  return formatter({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts)).replace(/\s?h\s?/, ":");
}

/** « 9 nov. 14:10 » : la colonne « Modifié » de la liste. */
export function formatStamp(ts: number | null, now = Date.now()): string {
  return ts == null ? "" : `${formatDay(ts, now)} ${formatTime(ts)}`;
}

/** « 9 nov. 2026 à 11:40 » : la ligne méta du détail. */
export function formatFull(ts: number | null): string {
  if (ts == null) return "";
  const date = formatter({ day: "numeric", month: "short", year: "numeric" }).format(new Date(ts));
  return strings().at(date, formatTime(ts));
}

/** « 212 Ko », à la française (1 Ko = 1000 octets, comme le Finder). */
export function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  const s = strings();
  const number = (value: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
  if (bytes < 1000) return `${bytes} ${s.bytes}`;
  if (bytes < 1e6) return `${number(bytes / 1e3)} ${s.kb}`;
  if (bytes < 1e9) return `${number(bytes / 1e6)} ${s.mb}`;
  return `${number(bytes / 1e9)} ${s.gb}`;
}

/** Ligne méta du détail : « v5 · 9 nov. 2026 à 11:40 · PNG 2400 × 1500 · 212 Ko ». */
export function detailMeta(result: ResultSummary & { width?: number | null; height?: number | null }): string {
  const type = result.ext.toUpperCase();
  const dims = result.width && result.height ? `${type} ${result.width} × ${result.height}` : type;
  return [`v${result.version}`, formatFull(result.ts), dims, formatSize(result.size)].filter(Boolean).join(" · ");
}

export function originLabel(origin: ResultOrigin): string {
  return origin.kind === "cell" ? strings().cell(origin.label) : origin.label;
}

/** Phrase du bandeau « Périmé » (sans le mot d'attaque, rendu en gras). */
export function staleSentence(stale: ResultStale): string {
  const s = strings();
  if (stale.changedAt == null) return s.staleNoDate(stale.name);
  const when = s.on(formatDay(stale.changedAt), formatTime(stale.changedAt));
  return stale.count > 1 ? s.staleMany(stale.name, stale.count - 1, when) : s.staleOne(stale.name, when);
}

export function countByKind(results: ResultSummary[]): Record<ResultFilter, number> {
  const counts: Record<ResultFilter, number> = { all: results.length, figure: 0, table: 0, pdf: 0 };
  for (const result of results) counts[result.kind] += 1;
  return counts;
}

/** Filtre par famille et par texte (nom, chemin, origine), tri par date. */
export function visibleResults(
  results: ResultSummary[], filter: ResultFilter, query: string, newestFirst: boolean,
): ResultSummary[] {
  const needle = query.trim().toLowerCase();
  const kept = results.filter((result) => {
    if (filter !== "all" && result.kind !== filter) return false;
    if (!needle) return true;
    return result.path.toLowerCase().includes(needle) || originLabel(result.origin).toLowerCase().includes(needle);
  });
  const direction = newestFirst ? -1 : 1;
  return kept.sort((a, b) => direction * ((a.ts ?? 0) - (b.ts ?? 0)) || a.path.localeCompare(b.path));
}

function firstOf(list: unknown): string {
  return (Array.isArray(list) ? list.filter(Boolean) : [])[0] ?? "";
}

/** Message de reproduction : le MÊME que l'entrée « Recette » de la galerie
 *  (`recipeDraft`, gallery/src/browser/pages/gallery_template_1.ts). Il est
 *  préparé dans le compositeur, jamais envoyé ni exécuté. */
export function reproduceDraft(detail: Pick<ResultDetail, "abs" | "sidecar" | "entry">): string {
  const e = detail.entry ?? {};
  const env = e.env ?? {};
  const script = firstOf(e.scripts);
  const command = String(e.command || firstOf(e.commands) || "");
  const inputs = Array.isArray(e.inputs) ? e.inputs : [];
  const scriptHash = (() => {
    const version = (Array.isArray(e.scriptVersions) ? e.scriptVersions : []).find((x: any) => x && x.path === script);
    return version?.sha256 ? String(version.sha256).slice(0, 7) : "";
  })();
  const envLine = [env.pixi ? `pixi ${env.pixi}` : env.conda ? `conda ${env.conda}` : "", env.python ? `Python ${env.python}` : ""].filter(Boolean).join(" · ");
  const lines = [`Reproduis ce résultat : ${detail.abs}`, `Recette : ${detail.sidecar}`];
  if (command) lines.push(`Commande enregistrée : ${command}`);
  if (e.cell?.id) {
    lines.push(`Cellule ${e.cell.id} du noyau Python${e.cell.env ? ` (${e.cell.env})` : ""}`
      + `${e.cell.codeSha256 ? `, code sha256 ${String(e.cell.codeSha256).slice(0, 7)}…` : ""} : son code est dans la recette`);
  }
  if (script) lines.push(`Script : ${script}${scriptHash ? ` (sha256 ${scriptHash}…)` : ""}`);
  if (inputs.length) lines.push(`Entrées : ${inputs.length} fichier${inputs.length > 1 ? "s" : ""}, empreintes dans la recette`);
  if (envLine) lines.push(`Environnement : ${envLine}`);
  if (e.head) lines.push(`Commit au moment du tour : ${String(e.head).slice(0, 7)}`);
  lines.push("Avant de lancer quoi que ce soit : vérifie que le script et les entrées ont encore les empreintes de la recette et signale tout écart, puis propose les commandes exactes et attends mon accord. Écris la sortie à côté de l’original (suffixe _repro) et compare-les, sans jamais écraser l’original.");
  return lines.join("\n");
}
