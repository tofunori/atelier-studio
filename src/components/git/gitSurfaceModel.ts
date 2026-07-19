import { t } from "../../lib/i18n";
import type { GitFile, GitGroup, LedgerEntry } from "./types";

export const GIT_GROUPS: GitGroup[] = ["staged", "changes", "untracked"];

export function fileGroups(file: GitFile): GitGroup[] {
  if (file.status === "?" || file.status === "!") return ["untracked"];
  const groups: GitGroup[] = [];
  if (file.status[0] && file.status[0] !== ".") groups.push("staged");
  if (file.status[1] && file.status[1] !== ".") groups.push("changes");
  return groups.length ? groups : ["changes"];
}

export function groupFiles(files: GitFile[]): Record<GitGroup, GitFile[]> {
  return {
    staged: files.filter((file) => fileGroups(file).includes("staged")),
    changes: files.filter((file) => fileGroups(file).includes("changes")),
    untracked: files.filter((file) => fileGroups(file).includes("untracked")),
  };
}

export function immediateCommitSuggestion(files: GitFile[]) {
  const paths = files.map((file) => file.path.toLowerCase()).join("\n");
  const hasGit = ["gitsurface", "gitops", "/git.", "commit"].some((value) => paths.includes(value));
  const hasAnalysis = ["analysis", "diagnostic", "model", ".jl", ".py", ".r"].some((value) => paths.includes(value));
  const hasDocs = ["docs/", "manuscript", ".md", ".tex", ".bib"].some((value) => paths.includes(value));
  const hasUi = [".tsx", ".css", ".html", "components/"].some((value) => paths.includes(value));
  if (hasGit) return "Improve Git commit workflow";
  if (hasAnalysis && hasDocs) return "Update analysis scripts and documentation";
  if (hasAnalysis) return "Update analysis scripts and results";
  if (hasDocs && hasUi) return "Update interface and documentation";
  if (hasUi) return "Update application interface";
  if (hasDocs) return "Update project documentation";
  if (["test", "spec."].some((value) => paths.includes(value))) return "Update automated tests";
  return "Update project files";
}

export function shortStatus(file: GitFile) {
  if (file.status === "?") return "U";
  if (file.status.includes("R")) return "R";
  if (file.status.includes("A")) return "A";
  if (file.status.includes("D")) return "D";
  if (file.status.includes("M")) return "M";
  return file.status.trim() || "?";
}

export function isLowSignalFile(path: string) {
  return /\.bak|~$|\.log$|\.aux$/.test(path);
}

export function formatCost(cost?: number | null) {
  if (cost == null) return "—";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function dayKey(ts: string) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return t("git.date-unknown");
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function timeKey(ts: string) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function filterLedgerEntries(entries: LedgerEntry[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) => [
    entry.promptExcerpt,
    entry.provider,
    entry.threadTitle,
    ...(entry.filesChanged ?? []),
    ...(entry.tools ?? []).map((tool) => tool.name),
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized)));
}

export function groupLedgerEntries(entries: LedgerEntry[]) {
  const groups = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const key = dayKey(entry.ts);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()];
}

export function diffClass(line: string) {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "add";
  if (line.startsWith("-") && !line.startsWith("---")) return "del";
  return "";
}
