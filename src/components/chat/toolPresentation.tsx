// Présentation des outils du chat (plan 015, slice 4) — déplacée verbatim
// depuis Chat.tsx : résumé de grappes d'outils, ligne de sortie d'outil,
// icônes de type de fichier. Aucune logique modifiée.
import { useState } from "react";
import { AgentEvent } from "../../lib/ws";
import { eventLabel, t } from "../../lib/i18n";
import { highlightCode } from "./md";

export type ToolCat = "search" | "read" | "edit" | "command" | "web" | "todo" | "permission" | "tool";
const SEARCH_CMD = /^\s*!?\s*#?\s*(rg|grep|egrep|fgrep|ag|ack|find|fd|glob|tree|ls)\b/;
const READ_CMD = /^\s*!?\s*(cat|bat|head|tail|less|more|sed -n)\b/;

export function toolOutputSummary(output: string) {
  const clean = output.trim();
  if (!clean) return "";
  const lines = clean.split(/\r?\n/).length;
  const chars = clean.length;
  const size = chars >= 1000 ? `${Math.round(chars / 100) / 10}k chars` : `${chars} chars`;
  return lines > 1 ? `${lines} lines · ${size}` : size;
}

export function toolPayloadText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// vue colorée de l'input d'un outil : la commande bash telle quelle (pas le
// blob JSON), le contenu d'un fichier écrit coloré selon son extension, sinon
// le JSON indenté — la coloration passe par highlightCode (cache LRU partagé).
export function toolInputView(value: unknown): { lang: string; text: string } | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") return { lang: "", text: value };
  const o = value as Record<string, unknown>;
  if (typeof o.command === "string" && o.command.trim()) return { lang: "bash", text: o.command };
  if (typeof o.file_path === "string" && typeof o.content === "string") {
    return { lang: String(o.file_path).split(".").pop() ?? "", text: o.content };
  }
  return { lang: "json", text: toolPayloadText(value) };
}

export function ToolOutputLine({ event }: { event: Extract<AgentEvent, { kind: "tool_update" }> }) {
  const output = event.output.length > 6000 ? "[...]\n" + event.output.slice(-6000) : event.output;
  const inputView = toolInputView(event.input);
  const failed = Boolean(event.exitCode && event.exitCode !== 0) || event.status === "failed";
  const [open, setOpen] = useState(failed);
  const summary = event.detail || toolOutputSummary(output) || (inputView ? "input" : "");
  return (
    <div className={`tool-output ${open ? "open" : "collapsed"} ${failed ? "failed" : ""}`}>
      <button type="button" className="tool-output-head" onClick={() => setOpen((v) => !v)}>
        <Tick open={open} />
        <span className="tool-output-name">
          {eventLabel(event.name)}
          {event.source ? <span className="tool-source">{event.source}</span> : null}
        </span>
        {summary && <span className="tool-output-summary">{summary}</span>}
        {event.status && <span className="tool-status">{event.status}</span>}
      </button>
      {open && (inputView || output.trim()) && (
        <div className="tool-output-body">
          {inputView && (
            <div className="tool-payload">
              <div className="tool-payload-label">input</div>
              {inputView.lang ? (
                <pre><code
                  className="hljs"
                  dangerouslySetInnerHTML={{ __html: highlightCode(inputView.text, inputView.lang) }}
                /></pre>
              ) : (
                <pre>{inputView.text}</pre>
              )}
            </div>
          )}
          {output.trim() && (
            <div className="tool-payload">
              <div className="tool-payload-label">output</div>
              <pre>{output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const FICONS = import.meta.glob("../../assets/ficons/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
export function ficon(name: string): string | null {
  return FICONS[`../assets/ficons/${name}.svg`] ?? null;
}
export const EXT_ICON: Record<string, string> = {
  py: "python", md: "markdown", markdown: "markdown", json: "json",
  js: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "react", jsx: "react",
  pdf: "pdf", png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image",
  tex: "tex", bib: "tex", r: "r", jl: "julia", css: "css", html: "html",
  sh: "console", zsh: "console", bash: "console", csv: "table", tsv: "table",
  yml: "yaml", yaml: "yaml", toml: "toml", txt: "document", log: "document",
  gitignore: "git",
};
export function FileTypeIcon({ ext }: { ext: string }) {
  if (ext === "local")
    return (
      <span className="fglyph">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.3">
          <rect x="2" y="3" width="12" height="8" rx="1.5" /><path d="M5.5 13.5h5" />
        </svg>
      </span>
    );
  const name = ext === "dir" ? "folder" : EXT_ICON[ext] ?? "file";
  const url = ficon(name);
  if (!url) return <span className="fglyph" />;
  return <img className="fglyph" src={url} alt="" width={16} height={16} />;
}

export function isSummarizableTool(e: AgentEvent): e is Extract<AgentEvent, { kind: "tool" | "tool_update" }> {
  if (e.kind === "tool_update") return true;
  if (e.kind !== "tool") return false;
  return e.name.startsWith("__edits:") || !e.name.startsWith("__");
}

// catégorise un outil tous providers confondus (Claude: Bash/Read/Edit/Grep ;
// Codex: Bash/apply_patch ; Grok: Execute/read_file/edit_file/permission…)
export function toolCategory(name: string, detail?: string): ToolCat {
  if (name.startsWith("__edits:")) return "edit";
  const n = name.toLowerCase();
  if (n.startsWith("permission")) return "permission";
  // exécution shell (Bash, Execute, run_terminal…) : affiner via la commande
  if (n === "bash" || n === "execute" || n.includes("shell") || n.includes("terminal") || n.includes("command")) {
    const d = detail ?? "";
    if (SEARCH_CMD.test(d)) return "search";
    if (READ_CMD.test(d)) return "read";
    return "command";
  }
  if (n.includes("read") || n === "cat" || n.includes("open_file")) return "read";
  if (n.includes("edit") || n.includes("write") || n.includes("create_file") ||
      n.includes("str_replace") || n.includes("patch")) return "edit";
  if (n.includes("search") || n.includes("grep") || n.includes("glob") ||
      n.includes("list_dir") || n.includes("codebase") || n.includes("find")) return "search";
  if (n === "webfetch" || n === "websearch" || n.includes("web") || n.includes("browser") || n.includes("recherche web")) return "web";
  if (n.includes("todo") || n.includes("plan")) return "todo";
  return "tool";
}

function actionTarget(action: Extract<AgentEvent, { kind: "tool" | "tool_update" }>): string {
  if ("detail" in action && action.detail?.trim()) return action.detail.trim();
  if (action.kind !== "tool_update" || action.input == null || typeof action.input !== "object") return "";
  const input = action.input as Record<string, unknown>;
  for (const key of ["file_path", "path", "query", "pattern", "command", "url"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Libellé présent et orienté intention pour l'unique activité du tour actif. */
export function activeToolLabel(action: Extract<AgentEvent, { kind: "tool" | "tool_update" }>): string {
  const target = actionTarget(action);
  const cat = toolCategory(action.name, target);
  if (cat === "command") {
    if (/\b(test|vitest|jest|pytest|cargo test|swift test|xcodebuild test)\b/iu.test(target)) return t("chat.activity-running-tests");
    if (/\b(format|prettier|eslint --fix|rustfmt|cargo fmt)\b/iu.test(target)) return t("chat.activity-formatting");
  }
  if (cat === "permission") return t("chat.activity-awaiting");
  const key = cat === "search" ? "chat.activity-searching"
    : cat === "read" ? "chat.activity-reading"
    : cat === "edit" ? "chat.activity-editing"
    : cat === "web" ? "chat.activity-web"
    : cat === "todo" ? "chat.activity-planning"
    : cat === "command" ? "chat.activity-command"
    : "chat.activity-tool";
  return target ? t(`${key}-target`, { target }) : t(key);
}

export function toolClause(cat: ToolCat, n: number): string {
  switch (cat) {
    case "search": return t("tools.searched");
    case "web": return t("tools.web");
    case "todo": return t("tools.todo");
    case "read": return n > 1 ? t("tools.read-n", { n }) : t("tools.read-1");
    case "edit": return n > 1 ? t("tools.edit-n", { n }) : t("tools.edit-1");
    case "command": return n > 1 ? t("tools.cmd-n", { n }) : t("tools.cmd-1");
    default: return n > 1 ? t("tools.tool-n", { n }) : t("tools.tool-1");
  }
}

// résume une grappe d'outils consécutifs en une phrase (ordre de 1re apparition)
export function summarizeTools(actions: Extract<AgentEvent, { kind: "tool" | "tool_update" }>[]): string {
  const order: ToolCat[] = [];
  const counts = new Map<ToolCat, number>();
  for (const a of actions) {
    const cat = toolCategory(a.name, "detail" in a ? a.detail : undefined);
    if (cat === "permission") continue; // bruit : absorbé, visible au déploiement
    if (!counts.has(cat)) order.push(cat);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  // groupe entièrement de permissions → libellé neutre
  if (order.length === 0) {
    const n = actions.length;
    return n > 1 ? t("tools.perm-n", { n }) : t("tools.perm-1");
  }
  const phrase = order.map((cat) => toolClause(cat, counts.get(cat) ?? 1)).join(", ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

// icône du résumé = catégorie dominante (priorité édition > commande > web…)
export function groupIconCat(actions: Extract<AgentEvent, { kind: "tool" | "tool_update" }>[]): ToolCat {
  const cats = new Set(actions.map((a) => toolCategory(a.name, "detail" in a ? a.detail : undefined)));
  const prio: ToolCat[] = ["edit", "command", "web", "read", "search", "todo", "tool"];
  return prio.find((c) => cats.has(c)) ?? "tool";
}
export function ToolGlyph({ cat }: { cat: ToolCat }) {
  const c = { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor",
    strokeWidth: 1.35, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (cat) {
    case "command": return <svg {...c}><rect x="1.5" y="3" width="13" height="10" rx="2" /><path d="M4.4 6.4 6.2 8l-1.8 1.6M8.4 10h3.2" /></svg>;
    case "edit": return <svg {...c}><path d="M12.2 1.6 14.4 3.8 5.5 12.7l-3 .8.8-3z" /><path d="M10.6 3.2 12.8 5.4" /></svg>;
    case "search": return <svg {...c}><circle cx="7" cy="7" r="4.3" /><path d="M10.4 10.4 14 14" /></svg>;
    case "read": return <svg {...c}><path d="M3 2.6h5.2L12 6v7.4H3z" /><path d="M8 2.6V6h4M5.3 8.6h5.4M5.3 10.8h5.4" /></svg>;
    case "web": return <svg {...c}><circle cx="8" cy="8" r="5.6" /><path d="M2.4 8h11.2M8 2.4c1.7 1.7 1.7 9.5 0 11.2M8 2.4c-1.7 1.7-1.7 9.5 0 11.2" /></svg>;
    case "todo": return <svg {...c}><path d="M3 4.4 4.1 5.5 6 3.4M3 10.6 4.1 11.7 6 9.6M8.4 4.6h4.6M8.4 10.8h4.6" /></svg>;
    default: return <svg {...c}><path d="M9.6 2.5a2.1 2.1 0 0 0 2.8 2.8l.7.7a2.2 2.2 0 0 1-3.1 3.1l-4-4a2.2 2.2 0 0 1 3.1-3.1z" /></svg>;
  }
}

/** Chevron trait fin partagé (remplace les ▸/▾ texte, hors système). */
export function Tick({ open }: { open?: boolean }) {
  return (
    <svg className="tool-tick" width="10" height="10" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      {open ? <path d="M3.5 6l4.5 4.5L12.5 6" /> : <path d="M6 3.5l4.5 4.5L6 12.5" />}
    </svg>
  );
}
