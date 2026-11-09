// Historique du projet (variante A, 2026-11-09) : types du fil renvoyé par
// `projectHistory` (rust/crates/atelier-runtime/src/project_history.rs),
// regroupement par jour, libellés. Les textes vivent ICI, dans le chunk
// paresseux de la surface, et non dans i18n.ts : l'entrée JS est pleine.
import { getResolvedLanguage } from "../../lib/i18n";

export type HistoryRef =
  | { git: string }
  | { disk: true }
  | { empty: true }
  | { saved: { key: string; hash: string } }
  | { turn: { threadId: string; turnId: string; sha: string; end?: string | null; next?: string | null } };

export type HistoryFile = {
  path: string;
  add: number | null;
  del: number | null;
  saves?: number;
  before: HistoryRef;
  after: HistoryRef;
};

export type HistoryKind = "turn" | "edit" | "commit" | "version" | "restore";

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  ts: number;
  title: string;
  files: HistoryFile[];
  // tour de l'agent
  threadId?: string;
  threadTitle?: string;
  provider?: string | null;
  snapshot?: string;
  // séance d'écriture
  start?: number;
  saves?: number;
  // commit, version, restauration
  sha?: string;
  shortSha?: string;
  author?: string;
  fileCount?: number;
};

export type HistoryFilter = "all" | "versions" | "agent" | "me" | "commits";

export type HistoryText = { state: "text"; text: string } | { state: "missing" | "binary" | "large" };

const FR = {
  title: "Historique",
  all: "Tout",
  versions: "Versions",
  agent: "Agent",
  me: "Moi",
  commits: "Commits",
  filters: "Filtrer l’historique",
  allFiles: "Tous les fichiers",
  compare: "Comparer…",
  timeline: "Revenir au fil",
  saveVersion: "Enregistrer une version",
  versionName: "Nom de la version",
  versionPlaceholder: "Envoyé à Christophe",
  versionHelp: "Garde l’état de tout le projet tel qu’il est maintenant.",
  save: "Enregistrer",
  cancel: "Annuler",
  refresh: "Actualiser",
  today: "Aujourd’hui",
  yesterday: "Hier",
  yourChanges: "Tes modifications",
  saves: (n: number) => `${n} sauvegarde${n > 1 ? "s" : ""}`,
  range: (a: string, b: string) => (a === b ? a : `${a} à ${b}`),
  conversation: (title: string) => `conversation « ${title} »`,
  commit: "Commit",
  version: "Version",
  filesSincePrevious: (n: number) => `${n} fichier${n > 1 ? "s" : ""} depuis la précédente`,
  files: (n: number) => `${n} fichier${n > 1 ? "s" : ""}`,
  restoreOf: (path: string) => `Restauration de ${path}`,
  restoreFile: "Restaurer ce fichier",
  undoRestore: "Annuler cette restauration",
  compareNow: "Comparer avec maintenant",
  thisChange: "Voir ce changement",
  openConversation: "Ouvrir la conversation",
  openFile: "Ouvrir le fichier",
  removeVersion: "Retirer cette version",
  restored: (path: string) => `${path} restauré. La restauration apparaît dans l’historique.`,
  restoreFailed: (error: string) => `Restauration impossible : ${error}`,
  versionSaved: (name: string) => `Version « ${name} » enregistrée.`,
  versionFailed: (error: string) => `Version non enregistrée : ${error}`,
  loading: "Chargement de l’historique…",
  empty: "Aucun changement pour l’instant",
  emptyHelp: "Les tours de l’agent qui modifient des fichiers, tes sauvegardes dans les éditeurs, les commits et les versions que tu nommes apparaîtront ici.",
  noProject: "Ouvre un projet pour voir son historique.",
  noRepo: "Ce projet n’est pas un dépôt Git : les versions nommées et la restauration ne sont pas disponibles.",
  diffLoading: "Chargement du diff…",
  missingBefore: "Le fichier n’existait pas avant.",
  missingAfter: "Le fichier a été supprimé.",
  binary: "Fichier binaire : pas de diff texte.",
  large: "Fichier trop volumineux pour le diff.",
  pruned: "Cet état n’est plus disponible dans le dépôt.",
  noChange: "Aucune différence.",
  from: "De",
  to: "À",
  now: "Maintenant",
  before: (title: string) => `Avant : ${title}`,
  compareEmpty: "Aucune différence entre ces deux moments.",
  compareHint: "Choisis deux moments à comparer.",
  between: (n: number) => `${n} fichier${n > 1 ? "s" : ""} changé${n > 1 ? "s" : ""}`,
  agentLabel: "Agent",
};

type Strings = typeof FR;

const EN: Strings = {
  ...FR,
  title: "History",
  all: "All",
  versions: "Versions",
  agent: "Agent",
  me: "Me",
  commits: "Commits",
  filters: "Filter history",
  allFiles: "All files",
  compare: "Compare…",
  timeline: "Back to timeline",
  saveVersion: "Save version",
  versionName: "Version name",
  versionPlaceholder: "Sent to supervisor",
  versionHelp: "Keeps the whole project as it is now.",
  save: "Save",
  cancel: "Cancel",
  refresh: "Refresh",
  today: "Today",
  yesterday: "Yesterday",
  yourChanges: "Your changes",
  saves: (n: number) => `${n} save${n > 1 ? "s" : ""}`,
  range: (a: string, b: string) => (a === b ? a : `${a} to ${b}`),
  conversation: (title: string) => `conversation “${title}”`,
  commit: "Commit",
  version: "Version",
  filesSincePrevious: (n: number) => `${n} file${n > 1 ? "s" : ""} since the previous one`,
  files: (n: number) => `${n} file${n > 1 ? "s" : ""}`,
  restoreOf: (path: string) => `Restored ${path}`,
  restoreFile: "Restore this file",
  undoRestore: "Undo this restore",
  compareNow: "Compare with now",
  thisChange: "Show this change",
  openConversation: "Open conversation",
  openFile: "Open file",
  removeVersion: "Remove this version",
  restored: (path: string) => `${path} restored. The restore appears in the history.`,
  restoreFailed: (error: string) => `Could not restore: ${error}`,
  versionSaved: (name: string) => `Version “${name}” saved.`,
  versionFailed: (error: string) => `Version not saved: ${error}`,
  loading: "Loading history…",
  empty: "No changes yet",
  emptyHelp: "Agent turns that change files, your saves in the editors, commits and the versions you name will show up here.",
  noProject: "Open a project to see its history.",
  noRepo: "This project is not a Git repository: named versions and restore are unavailable.",
  diffLoading: "Loading diff…",
  missingBefore: "The file did not exist before.",
  missingAfter: "The file was deleted.",
  binary: "Binary file: no text diff.",
  large: "File too large for a diff.",
  pruned: "This state is no longer available in the repository.",
  noChange: "No differences.",
  from: "From",
  to: "To",
  now: "Now",
  before: (title: string) => `Before: ${title}`,
  compareEmpty: "No differences between these two moments.",
  compareHint: "Pick two moments to compare.",
  between: (n: number) => `${n} file${n > 1 ? "s" : ""} changed`,
  agentLabel: "Agent",
};

export function strings(): Strings {
  return getResolvedLanguage() === "en" ? EN : FR;
}

function locale() {
  return getResolvedLanguage() === "en" ? "en-CA" : "fr-CA";
}

// Un formateur par locale et par forme : en construire un par ligne coûte cher.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale()}|${JSON.stringify(options)}`;
  let found = formatters.get(key);
  if (!found) { found = new Intl.DateTimeFormat(locale(), options); formatters.set(key, found); }
  return found;
}

export function formatTime(ts: number): string {
  return formatter({ hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(ts: number, now = Date.now()): string {
  const s = strings();
  if (dayKey(ts) === dayKey(now)) return s.today;
  if (dayKey(ts) === dayKey(now - 86_400_000)) return s.yesterday;
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  const label = formatter(sameYear
    ? { weekday: "long", day: "numeric", month: "long" }
    : { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(ts));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Entrées regroupées par jour, dans l'ordre reçu (plus récent en tête). */
export function groupByDay(entries: HistoryEntry[], now = Date.now()): [string, HistoryEntry[]][] {
  const groups: [string, HistoryEntry[]][] = [];
  let last = "";
  for (const entry of entries) {
    const key = dayKey(entry.ts);
    if (key !== last || !groups.length) {
      groups.push([dayLabel(entry.ts, now), []]);
      last = key;
    }
    groups[groups.length - 1][1].push(entry);
  }
  return groups;
}

export function filterEntries(entries: HistoryEntry[], filter: HistoryFilter, path: string): HistoryEntry[] {
  return entries.filter((entry) => {
    if (filter === "versions" && entry.kind !== "version") return false;
    if (filter === "agent" && entry.kind !== "turn") return false;
    if (filter === "me" && entry.kind !== "edit" && entry.kind !== "restore") return false;
    if (filter === "commits" && entry.kind !== "commit") return false;
    return !path || entry.files.some((file) => file.path === path);
  });
}

/** Fichiers présents dans l'historique, du plus souvent touché au moins. */
export function historyPaths(entries: HistoryEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === "version" || entry.kind === "commit") continue;
    for (const file of entry.files) counts.set(file.path, (counts.get(file.path) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([path]) => path);
}

export function providerName(provider?: string | null): string {
  const p = (provider ?? "").trim();
  if (!p) return strings().agentLabel;
  const known: Record<string, string> = { claude: "Claude", codex: "Codex", grok: "Grok", opencode: "OpenCode", kimi: "Kimi" };
  return known[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

export function entryTitle(entry: HistoryEntry): string {
  const s = strings();
  if (entry.kind === "edit") return s.yourChanges;
  if (entry.kind === "restore") return s.restoreOf(entry.files[0]?.path ?? "");
  return entry.title || s.agentLabel;
}

export function churn(files: HistoryFile[]): { add: number; del: number; known: boolean } {
  let add = 0, del = 0, known = false;
  for (const file of files) {
    if (typeof file.add === "number") { add += file.add; known = true; }
    if (typeof file.del === "number") { del += file.del; known = true; }
  }
  return { add, del, known };
}

function fileNames(files: HistoryFile[], max = 3): string {
  const names = files.slice(0, max).map((f) => f.path.split("/").pop() ?? f.path);
  return files.length > max ? `${names.join(", ")} +${files.length - max}` : names.join(", ");
}

/** Ligne méta sous le titre, sans les ± (rendus à part). */
export function entryMeta(entry: HistoryEntry): string {
  const s = strings();
  switch (entry.kind) {
    case "turn":
      return [providerName(entry.provider), entry.threadTitle ? s.conversation(entry.threadTitle) : "", fileNames(entry.files)]
        .filter(Boolean).join(" · ");
    case "edit":
      return [fileNames(entry.files),
        `${s.saves(entry.saves ?? 0)}, ${s.range(formatTime(entry.start ?? entry.ts), formatTime(entry.ts))}`].join(" · ");
    case "commit":
      return [`${s.commit} ${entry.shortSha ?? ""}`.trim(), s.files(entry.files.length)].join(" · ");
    case "version":
      return [s.version, s.filesSincePrevious(entry.fileCount ?? entry.files.length)].join(" · ");
    case "restore":
      return entry.title;
  }
}

/** Libellé court d'un moment, pour les menus De / À et la restauration. */
export function momentLabel(entry: HistoryEntry): string {
  const when = `${dayLabel(entry.ts)} ${formatTime(entry.ts)}`;
  const s = strings();
  if (entry.kind === "version") return `${entry.title} · ${when}`;
  if (entry.kind === "commit") return `${entry.title} · ${entry.shortSha ?? ""}`;
  if (entry.kind === "turn") return `${s.before(entry.title)} · ${when}`;
  return `${entryTitle(entry)} · ${when}`;
}

/** Point de comparaison Git d'une entrée : la version, le commit, ou l'état
 *  du projet juste AVANT un tour de l'agent (son point de reprise). */
export function compareSha(entry: HistoryEntry): string | null {
  if (entry.kind === "version" || entry.kind === "commit") return entry.sha ?? null;
  if (entry.kind === "turn") return entry.snapshot ?? null;
  return null;
}

/** Une restauration se défait en remettant son « avant ». */
export function restoreTarget(entry: HistoryEntry, file: HistoryFile): HistoryRef {
  return entry.kind === "restore" ? file.before : file.after;
}

export function restoreLabel(entry: HistoryEntry): string {
  return `${entryTitle(entry)}, ${dayLabel(entry.ts).toLowerCase()} ${formatTime(entry.ts)}`;
}
