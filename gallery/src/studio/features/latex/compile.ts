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
  now?: () => number;
  clockLabel?: () => string;
  startInterval?: (callback: () => void, milliseconds: number) => number;
  stopInterval?: (handle: number) => void;
}

export interface LatexCompileCoordinator {
  compile(): Promise<void>;
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
    async compile(): Promise<void> {
      if (options.isDirty() && !(await options.save())) {
        setChip("err", "sauvegarde refusée — compilation annulée");
        options.setState("err", "sauvegarde refusée — compilation annulée");
        return;
      }

      if (options.isTex) {
        const issue = texPreflight(options.getText());
        const checkedAt = now();
        if (issue && checkedAt - lastPreflightAt > 8000) {
          lastPreflightAt = checkedAt;
          options.revealIssue(issue);
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
        setChip("err", "serveur galerie injoignable");
        options.setState("err", "compilation : serveur injoignable");
        return;
      }

      const duration = ((now() - startedAt) / 1000).toFixed(1).replace(".", ",");
      const log = analyzeCompileResponse(response);
      options.renderLog(log);
      if (!response.ok) {
        setChip("err", log.errors
          ? `${log.errors} ${log.errors > 1 ? "erreurs" : "erreur"}${log.warnings ? ` · ${log.warnings} warning${log.warnings > 1 ? "s" : ""}` : ""}`
          : "échec — voir la console");
        options.setState("err", "✗ compilation échouée — voir la console");
        return;
      }

      const clock = clockLabel();
      setChip("ok", `compilé en ${duration} s · ${clock}`);
      options.setState("ok", `✓ compiled ${clock}`);
      options.onCompiled(response);
    },
    dispose(): void {
      stopTick();
    },
  };
}
