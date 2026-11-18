// État d'exécution d'une cellule de cahier, vu par l'onglet : la durée et
// l'heure du dernier passage, l'attente pendant « Tout exécuter », le passage
// fait avant un redémarrage du noyau, et la ligne fautive d'une erreur.
// Fonctions pures : testées dans notebookRun.test.ts.
import type { UiCell, UiOutput } from "./notebook";

/** Un passage de cellule dans la session courante de l'onglet. */
export type CellRun = {
  startedAt: number;
  finishedAt?: number;
  /** Génération du noyau (incrémentée à chaque démarrage). */
  generation: number;
};

export type CellRunState =
  | { kind: "idle" }
  | { kind: "running"; elapsedMs: number }
  | { kind: "queued" }
  | { kind: "done"; durationMs: number; finishedAt: number }
  | { kind: "error"; durationMs?: number }
  | { kind: "stale" };

export function cellHasError(cell: Pick<UiCell, "outputs">): boolean {
  return cell.outputs.some((o) => o.kind === "error");
}

export function cellRunState(opts: {
  cell: Pick<UiCell, "id" | "outputs" | "executionCount">;
  run?: CellRun;
  running: boolean;
  queued: boolean;
  generation: number;
  now: number;
}): CellRunState {
  const { cell, run, running, queued, generation, now } = opts;
  if (running) return { kind: "running", elapsedMs: run ? Math.max(0, now - run.startedAt) : 0 };
  if (queued) return { kind: "queued" };
  if (run?.finishedAt !== undefined && run.generation < generation) return { kind: "stale" };
  if (cellHasError(cell)) {
    return { kind: "error", durationMs: run?.finishedAt !== undefined ? run.finishedAt - run.startedAt : undefined };
  }
  if (run?.finishedAt !== undefined) {
    return { kind: "done", durationMs: run.finishedAt - run.startedAt, finishedAt: run.finishedAt };
  }
  return { kind: "idle" };
}

/** « 0,84 s », « 12 s », « 2 min 05 s ». */
export function formatRunDuration(ms: number, lang = "fr"): string {
  const s = ms / 1000;
  if (s < 10) {
    return `${s.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
  }
  if (s < 60) return `${Math.floor(s)} s`;
  const m = Math.floor(s / 60);
  const rest = Math.floor(s % 60);
  return `${m} min ${String(rest).padStart(2, "0")} s`;
}

/** Heure courte « 14:32 ». */
export function formatRunClock(at: number, lang = "fr"): string {
  return new Date(at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
}

export type ErrorLocation = { line: number; code: string; func?: string };

/**
 * Ligne fautive dans la cellule, lue dans la trace d'ipykernel :
 *   Cell In[6], line 2, in anomalie(a, ref)
 *         1 def anomalie(a, ref):
 *   ----> 2     return (a - ref) / ref.std
 * On garde le cadre le plus profond qui appartient à CETTE cellule
 * (même numéro d'exécution quand il est connu).
 */
export function errorLocation(traceback: string, executionCount?: number | null): ErrorLocation | null {
  const lines = traceback.split(/\r?\n/);
  let found: ErrorLocation | null = null;
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^\s*(?:Cell In\s*\[(\d*)\]|Input In \[(\d*)\]), line (\d+)(?:, in (.+))?\s*$/);
    if (!head) continue;
    const n = head[1] ?? head[2];
    if (executionCount != null && n && Number(n) !== executionCount) continue;
    const line = Number(head[3]);
    let code = "";
    for (let j = i + 1; j < lines.length && lines[j].trim() !== ""; j++) {
      const arrow = lines[j].match(/^-+>\s*(\d+)\s?(.*)$/);
      if (arrow && Number(arrow[1]) === line) {
        code = arrow[2].replace(/\s+$/, "");
        break;
      }
    }
    const func = head[4] && head[4] !== "<module>" ? head[4].trim() : undefined;
    found = { line, code: code.trim(), func };
  }
  return found;
}

/** Texte envoyé au chat par « Corriger avec le chat » : une capsule. */
export function errorFixRequest(opts: {
  notebookName: string;
  cellIndex: number;
  source: string;
  error: Extract<UiOutput, { kind: "error" }>;
}): string {
  const { notebookName, cellIndex, source, error } = opts;
  const count = Math.max(1, source.split("\n").length);
  const range = count > 1 ? `L1-${count}` : "L1";
  const trace = error.traceback?.trim() || `${error.ename}: ${error.evalue}`;
  return (
    `${notebookName} [${cellIndex}] (${range}) : « ${source} »\n\n` +
    `Cette cellule échoue avec ${error.ename}: ${error.evalue}\n` +
    `Corrige-la dans le cahier (propose la modification de la cellule), puis explique en une phrase.\n\n` +
    `Trace :\n${trace}`
  );
}
