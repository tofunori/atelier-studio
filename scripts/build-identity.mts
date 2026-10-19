/**
 * Identité de build embarquée dans le frontend : commit court et date du
 * build, calculés une fois par `vite.config.ts` (donc à chaque
 * `npm run tauri:build:app`), sans réseau. La version de Cargo reste 2.0.0
 * sur toutes les builds : c'est ce couple qui dit quelle build tourne.
 *
 * Sans git (archive sans `.git`, git absent du PATH, dépôt illisible), le
 * commit vaut « inconnu » et le build continue.
 */
import { execFileSync } from "node:child_process";

export const UNKNOWN_COMMIT = "inconnu";

export interface BuildIdentity {
  /** Commit court (`git rev-parse --short HEAD`), ou « inconnu ». */
  commit: string;
  /** Date locale du build, `AAAA-MM-JJ HH:MM`. */
  date: string;
}

export interface ResolveOptions {
  cwd: string;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}

export function gitShortCommit(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  try {
    const out = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
    return /^[0-9a-f]{4,40}$/.test(out) ? out : UNKNOWN_COMMIT;
  } catch {
    return UNKNOWN_COMMIT;
  }
}

const pad = (value: number) => String(value).padStart(2, "0");

export function formatBuildDate(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function resolveBuildIdentity({ cwd, now = new Date(), env = process.env }: ResolveOptions): BuildIdentity {
  return { commit: gitShortCommit(cwd, env), date: formatBuildDate(now) };
}
