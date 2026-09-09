import {texPreflight, type LatexPreflightIssue} from "./preflight";

export interface LatexCompileResponse {
  ok?: boolean;
  pdf?: string;
  log?: string;
  error?: string;
}

export interface LatexCompileLog {
  ok: boolean;
  log: string;
  html: string;
  errors: number;
  warnings: number;
}

export interface LatexLogDiagnostic {
  line: number;
  message: string;
  severity: "error" | "warning";
  source: "latexmk";
}

/**
 * Diagnostics ligne à ligne tirés du log de latexmk : erreurs `! …` suivies
 * de `l.N`, avertissements `LaTeX Warning: … on input line N` (et Package …
 * Warning). Les avertissements sans ligne sont ignorés — ils n'ont pas
 * d'ancre dans la source.
 */
export function parseLatexLogDiagnostics(log: string): LatexLogDiagnostic[] {
  const lines = String(log || "").split("\n");
  const out: LatexLogDiagnostic[] = [];
  const seen = new Set<string>();
  const push = (line: number, message: string, severity: "error" | "warning"): void => {
    const text = message.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!Number.isFinite(line) || line < 1 || !text) return;
    const key = `${severity}:${line}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({line, message: text, severity, source: "latexmk"});
  };
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] || "";
    if (raw.startsWith("! ")) {
      const message = raw.slice(2);
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j += 1) {
        const at = /^l\.(\d+)/.exec(lines[j] || "");
        if (at) { push(Number(at[1]), message, "error"); break; }
        if ((lines[j] || "").startsWith("! ")) break;
      }
      continue;
    }
    const warning = /^(?:LaTeX|Package [^ ]+|Class [^ ]+) Warning: (.*)$/.exec(raw);
    if (warning) {
      // Le message peut continuer sur la ligne suivante avant « on input line N ».
      let text = warning[1] || "";
      let at = /on input line (\d+)/.exec(text);
      if (!at && i + 1 < lines.length) {
        at = /on input line (\d+)/.exec(lines[i + 1] || "");
        if (at) text += " " + (lines[i + 1] || "").trim();
      }
      if (at) push(Number(at[1]), text.replace(/\s*on input line \d+\.?$/, ""), "warning");
    }
  }
  return out;
}

export type CompileChipKind = "run" | "ok" | "err";
export type CompileStateKind = "dirty" | "ok" | "err";

export interface LatexCompileCoordinatorOptions {
  isTex: boolean;
  getText(): string;
  isDirty(): boolean;
  save(): Promise<unknown>;
  requestCompile(): Promise<LatexCompileResponse>;
  revealIssue(issue: LatexPreflightIssue): void;
  setState(kind: CompileStateKind, message: string): void;
  setChip(kind: CompileChipKind, message: string): void;
  renderLog(log: LatexCompileLog): void;
  onCompiled(response: LatexCompileResponse): void;
  /** Diagnostics du log (vide quand la compilation réussit sans avertissement ancré). */
  onDiagnostics?(list: LatexLogDiagnostic[]): void;
  now?: () => number;
  clockLabel?: () => string;
  startInterval?: (callback: () => void, milliseconds: number) => number;
  stopInterval?: (handle: number) => void;
}

export interface LatexCompileCoordinator {
  /** `auto` : déclenchement automatique (sauvegarde, passage d'agent) — la
   * pastille rend compte, mais ni le curseur ni la barre d'état du document
   * ne sont dérangés. */
  compile(auto?: boolean): Promise<void>;
  dispose(): void;
}

function escapeLog(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

export function analyzeCompileResponse(response: LatexCompileResponse): LatexCompileLog {
  const log = String(response.log || response.error || "");
  let errors = 0;
  let warnings = 0;
  const html = escapeLog(log || "(pas de log)")
    .split("\n")
    .map((line) => {
      let className = "";
      if (/^!|Fatal error|Emergency stop/.test(line)) {
        className = "tl-err";
        errors += 1;
      } else if (/^LaTeX Warning|^Package .* Warning|Overfull|Underfull/.test(line)) {
        className = "tl-warn";
        warnings += 1;
      }
      const withJumps = line
        .replace(/\bl\.(\d+)/g, (_match, lineNumber: string) =>
          `<span class="tl-jump" data-l="${lineNumber}">l.${lineNumber}</span>`)
        .replace(/lines? (\d+)/g, (match, lineNumber: string) =>
          `<span class="tl-jump" data-l="${lineNumber}">${match}</span>`);
      return className ? `<span class="${className}">${withJumps}</span>` : withJumps;
    })
    .join("\n");
  return {ok: Boolean(response.ok), log, html, errors, warnings};
}

export function createLatexCompileCoordinator(
  options: LatexCompileCoordinatorOptions,
): LatexCompileCoordinator {
  const now = options.now || Date.now;
  const clockLabel = options.clockLabel || (() =>
    new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"}));
  const startInterval = options.startInterval || ((callback: () => void, milliseconds: number) =>
    window.setInterval(callback, milliseconds));
  const stopInterval = options.stopInterval || ((handle: number) => window.clearInterval(handle));
  let busy = false;
  let lastPreflightAt = 0;
  let startedAt = 0;
  let tick: number | null = null;

  const stopTick = (): void => {
    if (tick !== null) stopInterval(tick);
    tick = null;
  };
  const setChip = (kind: CompileChipKind, message: string): void => {
    if (kind !== "run") stopTick();
    options.setChip(kind, message);
  };
  const startChip = (): void => {
    stopTick();
    startedAt = now();
    options.setChip("run", "compilation…");
    tick = startInterval(() => {
      options.setChip("run", `compilation… ${Math.round((now() - startedAt) / 1000)} s`);
    }, 1000);
  };

  return {
    async compile(auto = false): Promise<void> {
      if (busy) return;
      busy = true;
      try {
        if (options.isDirty() && !(await options.save())) {
          options.renderLog(analyzeCompileResponse({ok:false, log:"! Sauvegarde refusée — compilation annulée"}));
          setChip("err", "sauvegarde refusée — compilation annulée");
          if (!auto) options.setState("err", "sauvegarde refusée — compilation annulée");
          return;
        }

        if (options.isTex) {
          const issue = texPreflight(options.getText());
          const checkedAt = now();
          // Mode auto : la pastille suffit. Ni revealIssue (qui déplacerait le
          // curseur et le défilement sous les doigts de l'utilisateur pendant
          // qu'un agent travaille), ni prise de la barre d'état du document.
          if (issue && auto) {
            options.renderLog(analyzeCompileResponse({ok:false, log:`! ${issue.msg}\nl.${issue.line}`}));
            setChip("err", `L.${issue.line} : ${issue.msg}`);
            return;
          }
          if (issue && checkedAt - lastPreflightAt > 8000) {
            lastPreflightAt = checkedAt;
            options.revealIssue(issue);
            options.renderLog(analyzeCompileResponse({ok:false, log:`! ${issue.msg}\nl.${issue.line}`}));
            setChip("err", `L.${issue.line} : ${issue.msg}`);
            options.setState("err", `L.${issue.line} : ${issue.msg} — re-⌘B pour compiler quand même`);
            return;
          }
        }

        options.setState("dirty", "compiling…");
        startChip();
        let response: LatexCompileResponse;
        try {
          response = await options.requestCompile();
        } catch {
          options.renderLog(analyzeCompileResponse({ok:false, log:"! Serveur galerie injoignable"}));
          setChip("err", "serveur galerie injoignable");
          options.setState("err", "compilation : serveur injoignable");
          return;
        }

        const duration = ((now() - startedAt) / 1000).toFixed(1).replace(".", ",");
        const log = analyzeCompileResponse(response);
        options.renderLog(log);
        options.onDiagnostics?.(parseLatexLogDiagnostics(log.log));
        if (!response.ok) {
          // La pastille de la barre d'état porte déjà le résultat, en plus
          // précis (nombre d'erreurs et de warnings). Le répéter dans la barre
          // du haut ne disait rien de neuf et occupait la place réservée à
          // l'état du DOCUMENT — sauvegarde, rechargement, baseline.
          setChip("err", log.errors
            ? `${log.errors} ${log.errors > 1 ? "erreurs" : "erreur"}${log.warnings ? ` · ${log.warnings} warning${log.warnings > 1 ? "s" : ""}` : ""}`
            : "échec — voir la console");
          // Rendre la barre du haut à l'état du document : sans ça elle
          // resterait figée sur « compiling… ».
          options.setState("ok", "saved");
          return;
        }

        const clock = clockLabel();
        setChip("ok", `compilé en ${duration} s · ${clock}`);
        options.setState("ok", "saved");
        options.onCompiled(response);
      } finally { busy = false; }
    },
    dispose(): void {
      stopTick();
    },
  };
}
