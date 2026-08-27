// Présentation des outils du chat (plan 015, slice 4) — déplacée verbatim
// depuis Chat.tsx : résumé de grappes d'outils, ligne de sortie d'outil,
// icônes de type de fichier. Aucune logique modifiée.
import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { AgentEvent } from "../../lib/ws";
import { eventLabel, t } from "../../lib/i18n";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { highlightCode } from "./md";
import { RowButton } from "../ui";

export type ToolCat =
  | "search" | "read" | "list" | "edit" | "command" | "web" | "todo"
  | "permission" | "image" | "visualization" | "integration" | "skill"
  | "agent" | "compaction" | "interrupted" | "thinking" | "tool";

export type ActivityIcon = {
  cat: ToolCat;
  imageUrl?: string | null;
  label?: string;
};

type ToolAction = Extract<AgentEvent, { kind: "tool" | "tool_update" }>;
type SummaryPartKind =
  | "integrations" | "loaded-tools" | "file-changes" | "exploration"
  | "visualization" | "commands" | "web-search" | "images" | "agents"
  | "todo" | "permissions" | "compaction" | "thinking" | "tools";

type SemanticToolActivity = {
  action: ToolAction;
  kind: ToolCat;
  target: string;
  sourceKey: string | null;
  interrupted: boolean;
};

export type ToolActivitySummary = {
  label: string;
  icon?: ActivityIcon;
  actionCount: number;
  parts: { kind: SummaryPartKind; count: number }[];
};

const SEARCH_CMD = /^\s*!?\s*#?\s*(rg|grep|egrep|fgrep|ag|ack|find|fd|glob)\b/;
const LIST_CMD = /^\s*!?\s*#?\s*(ls|tree)\b/;
const READ_CMD = /^\s*!?\s*(cat|bat|head|tail|less|more|sed -n)\b/;
const VISUALIZATION_CMD = /\b(matplotlib|pyplot|plotly|ggplot|vega|chart|render[_-]?(?:plot|figure)|savefig|\.plot\s*\()\b/iu;
const INTERRUPTED_STATUS = /^(interrupted|cancelled|canceled|declined|denied|stopped)$/i;
const COMPLETED_STATUS = /^(completed|complete|succeeded|success|done)$/i;

/** Statut provider normalisé : casse, camelCase et underscores. Les providers
 * écrivent « completed », « Completed », « in_progress », « inProgress ». */
function normalizedStatus(status: string | undefined): string {
  return status?.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/_/g, "-") ?? "";
}

/** État affiché d'un appel d'outil : c'est le SEUL élément coloré de la
 * rangée. L'icône de tête et le nom de l'outil restent neutres — trois
 * accents sur une même ligne et l'œil n'a plus de point d'entrée. */
export type ToolOutcome = "done" | "failed" | "running";

/** Le code de sortie fait foi sur le statut : un provider peut très bien
 * annoncer « completed » sur un exit 2. */
export function toolOutcome(event: Extract<AgentEvent, { kind: "tool_update" }>): ToolOutcome {
  const status = normalizedStatus(event.status);
  if ((event.exitCode != null && event.exitCode !== 0) || status === "failed") return "failed";
  return COMPLETED_STATUS.test(status) ? "done" : "running";
}
const SUMMARY_ORDER: SummaryPartKind[] = [
  "integrations", "loaded-tools", "file-changes", "exploration", "visualization",
  "commands", "web-search", "images", "agents", "todo", "permissions", "compaction", "tools",
];

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

// Séquences d'échappement ANSI (SGR/curseur, ex: \x1b[31m, \x1b[2K) et OSC
// (ex: titre de fenêtre \x1b]0;...\x07, hyperliens \x1b]8;;url\x1b\) : les
// providers CLI streament parfois de la sortie brute avec ces codes.
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, "")
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

// Troncature tête+queue : au lieu de couper aveuglément la fin (perdant le
// début — souvent le contexte le plus utile), on garde ~1500 premiers
// caractères (étendus jusqu'à la fin de ligne) et ~4500 derniers (démarrant
// à un début de ligne), avec un marqueur i18n entre les deux indiquant le
// nombre de lignes complètes omises.
export function truncateToolOutput(raw: string): string {
  if (raw.length <= 6000) return raw;
  const HEAD = 1500;
  const TAIL = 4500;

  const headBreak = raw.indexOf("\n", HEAD);
  const headEnd = headBreak === -1 ? raw.length : headBreak + 1;

  let tailStart = raw.length - TAIL;
  const tailBreak = raw.indexOf("\n", tailStart);
  if (tailBreak !== -1) {
    tailStart = tailBreak + 1;
  } else {
    const priorBreak = raw.lastIndexOf("\n", tailStart);
    tailStart = priorBreak === -1 ? tailStart : priorBreak + 1;
  }
  if (tailStart < headEnd) tailStart = headEnd;

  const head = raw.slice(0, headEnd);
  const omitted = raw.slice(headEnd, tailStart);
  const tail = raw.slice(tailStart);
  const n = (omitted.match(/\n/g) ?? []).length;
  const headPart = head && !head.endsWith("\n") ? `${head}\n` : head;
  return `${headPart}${t("chat.output-omitted", { n })}\n${tail}`;
}

function isJsonText(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Durée d'un appel d'outil : lisible du ms à la minute, virgule française
 * sous 10 s (le seul régime où la décimale change la lecture). */
export function fmtToolDur(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  const s = ms / 1000;
  if (s < 10) {
    const short = s.toFixed(1);
    return short.endsWith(".0") ? `${Math.round(s)} s` : `${short.replace(".", ",")} s`;
  }
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  return rs ? `${m} min ${rs} s` : `${m} min`;
}

export function ToolOutputLine({ event }: { event: Extract<AgentEvent, { kind: "tool_update" }> }) {
  const cleanOutput = stripAnsi(event.output);
  const output = truncateToolOutput(cleanOutput);
  const inputView = toolInputView(event.input);
  const outcome = toolOutcome(event);
  const failed = outcome === "failed";
  const [open, setOpen] = useState(failed);
  const summary = event.detail || toolOutputSummary(output) || (inputView ? "input" : "");
  const trimmedOutput = output.trim();
  // Requêtes d'une recherche web (Rust web_search_update → input.queries) :
  // une seule requête tient déjà dans le résumé de la ligne, donc pas de pilule.
  const queries = Array.isArray((event.input as { queries?: unknown } | undefined)?.queries)
    ? ((event.input as { queries: unknown[] }).queries.filter(
        (q): q is string => typeof q === "string" && q.trim() !== "",
      ))
    : [];
  const isJsonOutput = cleanOutput.length <= 6000
    && (trimmedOutput.startsWith("{") || trimmedOutput.startsWith("["))
    && isJsonText(trimmedOutput);
  return (
    <div className={`tool-output ${open ? "open" : "collapsed"} ${failed ? "failed" : ""} ${outcome === "done" ? "is-done" : ""}`}>
      <RowButton className="tool-output-head" onClick={() => setOpen((v) => !v)}>
        <Tick open={open} />
        <span className="tool-output-name">
          {eventLabel(event.name)}
          {event.source ? <span className="tool-source">{event.source}</span> : null}
        </span>
        {summary && <span className="tool-output-summary">{summary}</span>}
        {event.exitCode != null && event.exitCode !== 0 && (
          <span className="tool-exit">exit {event.exitCode}</span>
        )}
        {event.durationMs != null && event.durationMs > 0 && (
          <span className="tool-duration">{fmtToolDur(event.durationMs)}</span>
        )}
        {event.status && (
          <span className="tool-status">
            {outcome === "done" && <CheckIcon className="tool-status-icon" aria-hidden="true" />}
            {event.status}
          </span>
        )}
      </RowButton>
      {queries.length > 1 && (
        <div className="tool-query-chips" data-testid="tool-query-chips">
          {queries.map((q, i) => (
            <span className="tool-query-chip" key={`${i}-${q}`} title={q}>{q}</span>
          ))}
        </div>
      )}
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
              {isJsonOutput ? (
                <pre><code
                  className="hljs"
                  dangerouslySetInnerHTML={{ __html: highlightCode(output, "json") }}
                /></pre>
              ) : (
                <pre>{output}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Indexé par NOM DE BASE : les clés d'import.meta.glob reprennent le motif tel
// qu'écrit (« ../../assets/… »), et la lecture cherchait « ../assets/… » — un
// cran de trop, donc AUCUNE icône de fichier ne s'affichait (vécu 2026-08-21 :
// carte « fichiers modifiés » avec une indentation vide à la place des icônes).
const FICONS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob("../../assets/ficons/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>,
  ).map(([path, url]) => [path.split("/").pop()?.replace(/\.svg$/, "") ?? path, url]),
);
export function ficon(name: string): string | null {
  return FICONS[name] ?? null;
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
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.3">
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
  return e.name === "__compacted" || e.name === "__thinking-step"
    || e.name.startsWith("__edits:") || !e.name.startsWith("__");
}

// catégorise un outil tous providers confondus (Claude: Bash/Read/Edit/Grep ;
// Codex: Bash/apply_patch ; Grok: Execute/read_file/edit_file/permission…)
export function toolCategory(name: string, detail?: string): ToolCat {
  if (name.startsWith("__edits:")) return "edit";
  // Titre de résumé de raisonnement (étape façon Codex) : ligne d'étape du
  // ticker, jamais résumée — voir partKind et SUMMARY_ORDER.
  if (name === "__thinking-step") return "thinking";
  const n = name.toLowerCase();
  const d = shellCommand(detail ?? "");
  if (n === "__compacted" || n.includes("context_compact") || n.includes("context-compaction")) return "compaction";
  if (n.startsWith("permission") || n.includes("approval") || n.includes("request_user_input") || n.includes("elicitation")) return "permission";
  if (n.startsWith("agent:") || n.includes("spawn_agent") || n.includes("subagent") || n.includes("multi_agent") || n.includes("multi-agent")) return "agent";
  if (n.includes("image_generation") || n.includes("image-generation") || n.includes("generate_image") || n.includes("generate-image")) return "visualization";
  if (n.includes("view_image") || n.includes("image_view") || n.includes("open_image") || n === "image" || n.startsWith("image ")) return "image";
  if (n === "webfetch" || n === "websearch" || n.includes("web_search") || n.includes("web-search") || n.includes("browser") || n.includes("recherche web")) return "web";
  // exécution shell (Bash, Execute, run_terminal…) : affiner via la commande
  if (n === "bash" || n === "execute" || n.includes("shell") || n.includes("terminal") || n.includes("command")) {
    if (LIST_CMD.test(d)) return "list";
    if (SEARCH_CMD.test(d)) return "search";
    if (READ_CMD.test(d)) return "read";
    if (VISUALIZATION_CMD.test(d)) return "visualization";
    return "command";
  }
  if (n.includes("read") || n === "cat" || n.includes("open_file")) return "read";
  if (n.includes("list_dir") || n.includes("list_files") || n === "ls" || n === "tree") return "list";
  if (n.includes("edit") || n.includes("write") || n.includes("create_file") ||
      n.includes("str_replace") || n.includes("patch")) return "edit";
  if (n.includes("search") || n.includes("grep") || n.includes("glob") ||
      n.includes("codebase") || n.includes("find")) return "search";
  if (n.includes("visual") || n.includes("chart") || n.includes("plot") || n.includes("figure")) return "visualization";
  if (n.includes("todo") || n.includes("plan")) return "todo";
  return "tool";
}

/** Chemins structurés récents + ancien format `image /path`, pour que les
 * conversations déjà enregistrées gagnent aussi leur miniature. */
export function imagePathsForActions(actions: ToolAction[]): string[] {
  const paths = actions.flatMap((action) => {
    // Seuls les outils d'IMAGE fournissent des chemins à prévisualiser : un
    // `input.path` est porté par n'importe quelle lecture (Read methods_en.tex
    // → vignette cassée, vécu 2026-08-21). Le nom de l'outil fait foi.
    if (action.kind === "tool_update" && toolCategory(action.name, action.detail) === "image"
      && action.input && typeof action.input === "object") {
      const input = action.input as Record<string, unknown>;
      const listed = Array.isArray(input.paths)
        ? input.paths.filter((value): value is string => typeof value === "string")
        : [];
      const single = typeof input.path === "string" ? [input.path] : [];
      if (listed.length || single.length) return [...listed, ...single];
    }
    if (action.kind === "tool" && action.name.toLowerCase().startsWith("image ")) {
      return [action.name.slice("image ".length).trim()];
    }
    return [];
  });
  return [...new Set(paths.filter(Boolean))];
}

function shellCommand(value: string): string {
  const command = value.trim();
  const wrapped = /^(?:\/\S+\/)?(?:zsh|bash|sh)\s+-[a-z]*c\s+(["'])([\s\S]*)\1$/iu.exec(command);
  return (wrapped?.[2] ?? command).trim();
}

/** Clause significative d'une commande shell, pour la LIGNE de statut (la
 * commande complète vit dans le dépliage). Trois réductions : couper à la
 * première frontière de premier niveau (`;`, `&&`, `||` — hors quotes et
 * parenthèses), déballer une assignation `x=$(…)`, retirer les redirections
 * de plomberie (`2>/dev/null`, `>f`, `2>&1`, `<f`). Retombe sur la commande
 * entière si la réduction vide tout. */
function significantCommand(raw: string): string {
  const command = shellCommand(raw);
  let depth = 0;
  let quote: string | null = null;
  let end = command.length;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote && command[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "(") { depth += 1; continue; }
    if (c === ")") { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && (c === ";"
      || (c === "&" && command[i + 1] === "&")
      || (c === "|" && command[i + 1] === "|"))) { end = i; break; }
  }
  let clause = command.slice(0, end).trim();
  const assign = /^[A-Za-z_][A-Za-z0-9_]*=\$\(([\s\S]*)\)$/u.exec(clause);
  if (assign) clause = assign[1].trim();
  const tokens = clause.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? [];
  const kept = tokens.filter((token) => !/^(?:\d*&?>{1,2}(?:&\d+|\S*)|<\S+)$/u.test(token));
  const reduced = kept.join(" ").trim();
  return reduced || command;
}

function shellTool(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized === "bash" || normalized === "execute" || normalized.includes("shell") ||
    normalized.includes("terminal") || normalized.includes("command");
}

function actionTarget(action: ToolAction): string {
  if (action.kind !== "tool_update" || action.input == null || typeof action.input !== "object") {
    return "detail" in action && action.detail?.trim() ? action.detail.trim() : "";
  }
  const input = action.input as Record<string, unknown>;
  // Le détail des adapters peut être tronqué à 64 caractères. Pour une action
  // shell, la commande complète est la source fiable de la catégorie et de la
  // cible (« Reading PromptInput.tsx » plutôt que « Running /bin/zsh… »).
  if (shellTool(action.name) && typeof input.command === "string" && input.command.trim()) {
    return shellCommand(input.command);
  }
  if (action.detail?.trim()) return action.detail.trim();
  for (const key of ["file_path", "path", "query", "pattern", "command", "url"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function conciseActionTarget(name: string, target: string, kind: ToolCat): string {
  if (!shellTool(name)) return target;
  const command = shellCommand(target);
  if (kind === "command") return significantCommand(target);
  if (kind !== "read" && kind !== "list") return command;
  const firstClause = command.split(/\s*(?:;|&&|\|\|)\s*/u, 1)[0] ?? command;
  const tokens = firstClause.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? [];
  const candidate = [...tokens].reverse().find((token) => {
    const clean = token.replace(/^["']|["']$/gu, "");
    return !clean.startsWith("-") && /(?:[/\\]|\.[a-z0-9]{1,8}$)/iu.test(clean);
  });
  if (!candidate) return command;
  const clean = candidate.replace(/^["']|["']$/gu, "");
  const segments = clean.split(/[/\\]/u);
  return segments[segments.length - 1] ?? clean;
}

function actionIdentity(action: ToolAction, index: number): string {
  const meta = action.meta && "turnId" in action.meta ? action.meta : null;
  const itemId = meta?.itemId ?? (action.kind === "tool_update" ? action.id : null);
  return itemId ? `${meta?.turnId ?? "legacy"}:${itemId}` : `event:${index}`;
}

function structuredCommandActivity(action: ToolAction): { kind: "read" | "search" | "list"; target: string } | null {
  if (action.kind !== "tool_update" || action.input == null || typeof action.input !== "object") return null;
  const input = action.input as Record<string, unknown>;
  if (!Array.isArray(input.commandActions)) return null;
  const actions = input.commandActions.filter((value): value is Record<string, unknown> => (
    value != null && typeof value === "object"
  ));
  // Codex fournit une analyse structurée de chaque commande. Une commande
  // composée (`pwd && sed ...`) reste une lecture si l'une de ses actions lit
  // réellement un fichier; inutile de réinterpréter le shell avec des regex.
  const picked = actions.find((entry) => entry.type === "read")
    ?? actions.find((entry) => entry.type === "search")
    ?? actions.find((entry) => entry.type === "listFiles");
  if (!picked) return null;
  const kind = picked.type === "read" ? "read" : picked.type === "search" ? "search" : "list";
  const target = [picked.name, picked.path, picked.query, picked.command]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? "";
  return { kind, target };
}

/** Dernier état de chaque appel, dans l'ordre de première apparition. */
export function distinctToolActions(actions: ToolAction[]): ToolAction[] {
  const byIdentity = new Map<string, ToolAction>();
  actions.forEach((action, index) => byIdentity.set(actionIdentity(action, index), action));
  return [...byIdentity.values()];
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean).join("-");
}

function semanticActivity(action: ToolAction): SemanticToolActivity {
  const structuredCommand = structuredCommandActivity(action);
  const rawTarget = structuredCommand?.target || actionTarget(action);
  const name = action.name.toLowerCase();
  const source = action.kind === "tool_update" ? action.source?.toLowerCase() ?? "" : "";
  const status = action.kind === "tool_update" ? normalizedStatus(action.status) : "";
  let kind = structuredCommand?.kind ?? toolCategory(action.name, shellCommand(rawTarget));
  const target = conciseActionTarget(action.name, rawTarget, kind);

  // Codex distingue un SKILL.md lu d'une lecture de fichier ordinaire.
  if (kind === "read" && /(?:^|[/\\])skill\.md(?:$|\s)/iu.test(target)) kind = "skill";
  else if (source === "approval") kind = "permission";
  else if (source === "mcp" || name.startsWith("mcp__") || (source === "dynamic" && kind === "tool")) kind = "integration";

  const sourceKey = kind === "integration"
    ? (action.name.split(/[/:]/)[0]?.replace(/^mcp__/, "") || source || null)
    : kind === "skill" ? target : null;
  return { action, kind, target, sourceKey, interrupted: INTERRUPTED_STATUS.test(status) };
}

function partKind(kind: ToolCat): SummaryPartKind {
  if (kind === "integration") return "integrations";
  if (kind === "skill") return "loaded-tools";
  if (kind === "edit") return "file-changes";
  if (kind === "read" || kind === "search" || kind === "list") return "exploration";
  if (kind === "visualization") return "visualization";
  if (kind === "command" || kind === "interrupted") return "commands";
  if (kind === "web") return "web-search";
  if (kind === "image") return "images";
  if (kind === "agent") return "agents";
  if (kind === "todo") return "todo";
  if (kind === "permission") return "permissions";
  if (kind === "compaction") return "compaction";
  // Étapes de raisonnement : HORS de SUMMARY_ORDER à dessein — le bloc
  // Réflexion porte déjà ce contenu après le tour, le résumer serait du bruit.
  if (kind === "thinking") return "thinking";
  return "tools";
}

function pluginForActivity(item: SemanticToolActivity, plugins: PluginCatalogEntry[]) {
  if (item.kind !== "integration" && item.kind !== "skill") return null;
  const haystack = normalizeKey([item.sourceKey, item.action.name, item.target].filter(Boolean).join(" "));
  return plugins.find((plugin) => {
    const candidates = [plugin.id, plugin.name, plugin.displayName].map(normalizeKey).filter(Boolean);
    return candidates.some((candidate) => haystack.includes(candidate));
  }) ?? null;
}

function iconForActivity(item: SemanticToolActivity, plugins: PluginCatalogEntry[] = []): ActivityIcon {
  const plugin = pluginForActivity(item, plugins);
  const imageUrl = plugin?.icon && /^(https?:|data:image\/)/i.test(plugin.icon) ? plugin.icon : null;
  return {
    cat: item.interrupted ? "interrupted" : item.kind,
    imageUrl,
    label: plugin?.displayName ?? item.sourceKey ?? undefined,
  };
}

export function activityIconForAction(action: ToolAction, plugins: PluginCatalogEntry[] = []): ActivityIcon {
  return iconForActivity(semanticActivity(action), plugins);
}

export function activityIconForPhase(phase?: string): ActivityIcon | undefined {
  const cat = phase === "search" ? "search"
    : phase === "edit" ? "edit"
    : phase === "command" ? "command"
    : phase === "todo" ? "todo"
    : phase === "tool" ? "tool"
    : undefined;
  return cat ? { cat } : undefined;
}

/** Libellé présent et orienté intention pour l'unique activité du tour actif. */
export function activeToolLabel(action: Extract<AgentEvent, { kind: "tool" | "tool_update" }>): string {
  // Étape de raisonnement : le titre EST le libellé — aucune conjugaison.
  if (action.name === "__thinking-step") return action.detail || t("event.thinking");
  const activity = semanticActivity(action);
  const target = activity.target;
  const cat = activity.kind;
  const status = action.kind === "tool_update"
    ? action.status?.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/_/g, "-") ?? ""
    : "";
  if (cat === "command") {
    const completed = COMPLETED_STATUS.test(status);
    if (/\b(test|vitest|jest|pytest|cargo test|swift test|xcodebuild test)\b/iu.test(target)) {
      return t(completed ? "chat.activity-ran-tests" : "chat.activity-running-tests");
    }
    if (/\b(format|prettier|eslint --fix|rustfmt|cargo fmt)\b/iu.test(target)) {
      return t(completed ? "chat.activity-formatted" : "chat.activity-formatting");
    }
    if (completed) return target
      ? t("chat.activity-command-completed-target", { target: significantCommand(target) })
      : t("chat.activity-command-completed");
  }
  if (cat === "permission") return t("chat.activity-awaiting");
  const key = cat === "search" ? "chat.activity-searching"
    : cat === "read" ? "chat.activity-reading"
    : cat === "list" ? "chat.activity-listing"
    : cat === "edit" ? "chat.activity-editing"
    : cat === "web" ? "chat.activity-web"
    : cat === "image" ? "chat.activity-image"
    : cat === "visualization" ? "chat.activity-visualization"
    : cat === "integration" ? "chat.activity-integration"
    : cat === "skill" ? "chat.activity-skill"
    : cat === "agent" ? "chat.activity-agent"
    : cat === "compaction" ? "chat.activity-compaction"
    : cat === "todo" ? "chat.activity-planning"
    : cat === "command" ? "chat.activity-command"
    : "chat.activity-tool";
  const conciseTarget = conciseActionTarget(action.name, target, cat);
  return conciseTarget ? t(`${key}-target`, { target: conciseTarget }) : t(key);
}

export function toolClause(cat: ToolCat, n: number): string {
  switch (cat) {
    case "search":
    case "list": return t("tools.searched");
    case "web": return t("tools.web");
    case "todo": return t("tools.todo");
    case "read": return n > 1 ? t("tools.read-n", { n }) : t("tools.read-1");
    case "edit": return n > 1 ? t("tools.edit-n", { n }) : t("tools.edit-1");
    case "command": return n > 1 ? t("tools.cmd-n", { n }) : t("tools.cmd-1");
    default: return n > 1 ? t("tools.tool-n", { n }) : t("tools.tool-1");
  }
}

/** Catégories dont un singleton nomme sa cible (façon Hermes run-summary.ts,
 * MIT) — les commandes restent comptées : une commande finie n'a d'intérêt
 * nominatif qu'en direct, où activeToolLabel la porte déjà. */
const TARGET_CLAUSE_KEY: Partial<Record<SummaryPartKind, Parameters<typeof t>[0]>> = {
  "file-changes": "tools.summary.file-changes-target",
  exploration: "tools.summary.exploration-target",
  visualization: "tools.summary.visualization-target",
  images: "tools.summary.images-target",
  agents: "tools.summary.agents-target",
};

/** Une clause de bilan nomme un fichier par son nom, jamais par son chemin. */
function clauseTarget(kind: SummaryPartKind, target: string): string {
  if (kind !== "file-changes" && kind !== "exploration" && kind !== "images") return target;
  const segments = target.split(/[/\\]/u);
  return segments[segments.length - 1] || target;
}

/** Le nommage exige une cible nominale : une recherche (`rg -n …`, web) ou un
 * listage portent une requête — parfois du bruit interne du provider (« other »
 * vu sur opencode) — pas un nom ; ils restent comptés. */
const NAMEABLE_ITEM_KINDS = new Set<ToolCat>(["read", "edit", "image", "visualization", "agent"]);

function summaryClause(kind: SummaryPartKind, items: SemanticToolActivity[]): string {
  if (items.length === 1) {
    const target = clauseTarget(kind, items[0].target);
    const targetKey = TARGET_CLAUSE_KEY[kind];
    if (target && targetKey && NAMEABLE_ITEM_KINDS.has(items[0].kind)) return t(targetKey, { target });
    return t(`tools.summary.${kind}-1`, { n: 1 });
  }
  return t(`tools.summary.${kind}-n`, { n: items.length });
}

/** Même contrat que Codex : parties dans un ordre sémantique fixe et icône de
 * l'item représentatif de la première partie, jamais une catégorie dominante. */
export function summarizeActivity(actions: ToolAction[], plugins: PluginCatalogEntry[] = []): ToolActivitySummary {
  const items = distinctToolActions(actions).map(semanticActivity);
  const byPart = new Map<SummaryPartKind, SemanticToolActivity[]>();
  for (const item of items) {
    const part = partKind(item.kind);
    const existing = byPart.get(part);
    if (existing) existing.push(item);
    else byPart.set(part, [item]);
  }
  const ordered = SUMMARY_ORDER.flatMap((kind) => {
    const partItems = byPart.get(kind);
    return partItems?.length ? [{ kind, items: partItems }] : [];
  });
  const clauses = ordered.map(({ kind, items: partItems }) => summaryClause(kind, partItems));
  const phrase = clauses.join(", ");
  const firstItem = ordered[0]?.items[0];
  return {
    label: phrase ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : t("chat.activity"),
    icon: firstItem ? iconForActivity(firstItem, plugins) : undefined,
    actionCount: items.length,
    parts: ordered.map(({ kind, items: partItems }) => ({ kind, count: partItems.length })),
  };
}

export function summarizeTools(actions: ToolAction[]): string {
  return summarizeActivity(actions).label;
}

/** Segments du bilan cumulatif du tour actif — mêmes clauses que le bilan
 * replié, mais en morceaux séparés pour que l'UI éclaire la catégorie qui
 * vient de bouger (`live` = celle de l'action la plus récente). */
export function activitySegments(actions: ToolAction[]): { text: string; live: boolean }[] {
  const distinct = distinctToolActions(actions);
  const items = distinct.map(semanticActivity);
  const lastItem = items[items.length - 1];
  const liveKind = lastItem ? partKind(lastItem.kind) : null;
  const byPart = new Map<SummaryPartKind, SemanticToolActivity[]>();
  for (const item of items) {
    const part = partKind(item.kind);
    const existing = byPart.get(part);
    if (existing) existing.push(item);
    else byPart.set(part, [item]);
  }
  return SUMMARY_ORDER.flatMap((kind) => {
    const partItems = byPart.get(kind);
    return partItems?.length ? [{ text: summaryClause(kind, partItems), live: kind === liveKind }] : [];
  });
}

/** Signature de progrès du tour (façon Hermes turn-activity.ts, MIT) : change
 * exactement quand le tour avance visiblement. Le statut fait partie de la
 * clé — un résultat qui arrive MUTE l'appel déjà affiché : sans lui, un outil
 * qui se termine se lirait comme du silence et daterait mal l'attente. */
export function turnProgressSignature(actions: ToolAction[], thoughtLength: number, answerLength = 0): string {
  const calls = distinctToolActions(actions)
    .map((a) => (a.kind === "tool_update" ? `${a.id}:${a.status ?? ""}` : a.name))
    .join("|");
  return `${calls}#${thoughtLength}#${answerLength}`;
}

/** Lignes du ticker une-ligne (façon Hermes ToolRunTicker, MIT) : une par
 * action distincte, clé stable par identité d'appel pour que React fasse
 * glisser le bandeau au lieu de le reconstruire — pas de fenêtre glissante,
 * qui ferait sauter le bandeau d'un cran à chaque éviction ; le nombre
 * d'actions d'un tour borne naturellement le reel. La dernière ligne est
 * l'action courante ; les précédentes gardent leur libellé au passé. */
export function tickerRows(
  actions: ToolAction[],
): { key: string; label: string; pre?: string; code?: string; post?: string }[] {
  return distinctToolActions(actions).map((action, offset) => {
    const key = action.kind === "tool_update" ? `tick:${action.id}` : `tick:${offset}:${action.name}`;
    const label = activeToolLabel(action);
    // Segment commande isolé pour le rendu mono : seulement quand le libellé
    // interpole réellement la commande (les lignes nominales — « Running
    // tests », lectures — restent en un seul morceau).
    const activity = semanticActivity(action);
    if (activity.kind === "command") {
      const code = significantCommand(activity.target);
      const idx = code ? label.lastIndexOf(code) : -1;
      if (idx >= 0) {
        return { key, label, pre: label.slice(0, idx), code, post: label.slice(idx + code.length) };
      }
    }
    return { key, label };
  });
}

export function ToolGlyph({ icon }: { icon: ActivityIcon }) {
  if (icon.imageUrl) {
    return <img className="ui-activity-source-icon" src={icon.imageUrl} alt="" title={icon.label} />;
  }
  const { cat } = icon;
  const c = { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor",
    strokeWidth: 1.35, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (cat) {
    case "command": return <svg {...c}><rect x="1.5" y="3" width="13" height="10" rx="2" /><path d="M4.4 6.4 6.2 8l-1.8 1.6M8.4 10h3.2" /></svg>;
    case "thinking": return <svg {...c}><path d="M5.6 11.2a4.6 4.6 0 1 1 4.8 0v1.4H5.6z" /><path d="M6.4 14.6h3.2" /></svg>;
    case "edit": return <svg {...c}><path d="M12.2 1.6 14.4 3.8 5.5 12.7l-3 .8.8-3z" /><path d="M10.6 3.2 12.8 5.4" /></svg>;
    case "search": return <svg {...c}><circle cx="7" cy="7" r="4.3" /><path d="M10.4 10.4 14 14" /></svg>;
    case "read": return <svg {...c}><path d="M2.2 3.1c2.1-.5 4-.1 5.8 1.2v9c-1.8-1.3-3.7-1.7-5.8-1.2zM13.8 3.1c-2.1-.5-4-.1-5.8 1.2v9c1.8-1.3 3.7-1.7 5.8-1.2z" /></svg>;
    case "list": return <svg {...c}><path d="M1.8 4.4h4l1.3 1.5h7.1v6.7H1.8z" /><path d="M1.8 5.9V3.4h4.6l1 1" /></svg>;
    case "web": return <svg {...c}><circle cx="8" cy="8" r="5.6" /><path d="M2.4 8h11.2M8 2.4c1.7 1.7 1.7 9.5 0 11.2M8 2.4c-1.7 1.7-1.7 9.5 0 11.2" /></svg>;
    case "todo": return <svg {...c}><path d="M3 4.4 4.1 5.5 6 3.4M3 10.6 4.1 11.7 6 9.6M8.4 4.6h4.6M8.4 10.8h4.6" /></svg>;
    case "permission": return <svg {...c}><path d="M8 1.8 13 3.8v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z" /><path d="m5.6 8 1.5 1.5 3.4-3.4" /></svg>;
    case "image": return <svg {...c}><rect x="3.2" y="1.8" width="10.8" height="9.6" rx="1.6" /><path d="M3.2 4H2.6A1.6 1.6 0 0 0 1 5.6v6.8A1.6 1.6 0 0 0 2.6 14h8.8a1.6 1.6 0 0 0 1.6-1.6v-1" /><circle cx="6.4" cy="5" r="1" /><path d="m4.5 9 2.2-2.2 1.8 1.7 1.4-1.3 2 1.8" /></svg>;
    case "visualization": return <svg {...c}><path d="M2.2 13.5V8.8h2.6v4.7M6.7 13.5V5.4h2.6v8.1M11.2 13.5V2.2h2.6v11.3M1.5 13.5h13" /></svg>;
    case "integration": return <svg {...c}><path d="M6.2 5.1 4.4 3.3a2.1 2.1 0 0 0-3 3l2.2 2.2a2.1 2.1 0 0 0 3 0l.7-.7M9.8 10.9l1.8 1.8a2.1 2.1 0 0 0 3-3l-2.2-2.2a2.1 2.1 0 0 0-3 0l-.7.7M5.8 10.2l4.4-4.4" /></svg>;
    case "skill": return <svg {...c}><path d="m8 1.8 1.5 3.1 3.5.5-2.5 2.5.6 3.5L8 9.8l-3.1 1.6.6-3.5L3 5.4l3.5-.5z" /><path d="M4 13.8h8" /></svg>;
    case "agent": return <svg {...c}><circle cx="8" cy="4" r="2" /><circle cx="3.2" cy="11.5" r="1.7" /><circle cx="12.8" cy="11.5" r="1.7" /><path d="M8 6v2M4.7 10.2 8 8l3.3 2.2" /></svg>;
    case "compaction": return <svg {...c}><path d="M2 5h4V1M14 5h-4V1M2 11h4v4M14 11h-4v4" /><path d="m6 5-4-4M10 5l4-4M6 11l-4 4M10 11l4 4" /></svg>;
    case "interrupted": return <svg {...c}><circle cx="8" cy="8" r="5.6" /><path d="m5.2 5.2 5.6 5.6" /></svg>;
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
