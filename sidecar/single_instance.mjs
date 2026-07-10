import { readFileSync } from "node:fs";

// Instance unique du sidecar via sidecar.pid — SANS SIGTERM aveugle.
// L'ancien comportement (tuer systématiquement le pid du fichier) créait une
// boucle d'entre-tuerie au premier lancement post-build : health Rust expiré
// → orphelin vivant → respawn → le nouveau SIGTERM l'ancien pendant que Rust
// attend son health → « Sidecar déconnecté » indéfiniment. Ici, un ancien
// sidecar VÉRIFIÉ sain et du même bundle n'est jamais tué : c'est le nouveau
// venu qui s'efface, et Rust réutilise l'ancien via sidecar.lock.

export function pidAlive(pid, kill = process.kill) {
  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// sidecar.lock ({port, token, identity:{pid, bundleHash…}}) : écrit par Rust
// UNIQUEMENT après un health réussi — absent/illisible = aucun sidecar vérifié.
export function readLock(lockFile, readFile = readFileSync) {
  try {
    const lock = JSON.parse(readFile(lockFile, "utf8"));
    return lock && typeof lock.port === "number" ? lock : null;
  } catch {
    return null;
  }
}

export async function probeHealth(lock, { fetchImpl = fetch, timeoutMs = 800 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`http://127.0.0.1:${lock.port}/health`, {
      headers: lock.token ? { "x-atelier-token": lock.token } : {},
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Décide du sort de l'ancien sidecar référencé par le pid file.
 * - "none"  : pas d'ancien vivant — continuer et écrire notre pid.
 * - "kill"  : ancien vivant mais non vérifié sain/même build — SIGTERM envoyé,
 *             continuer et écrire notre pid.
 * - "defer" : ancien vivant, sain, même bundle — il garde le pid file, le
 *             nouveau doit se terminer sans rien toucher.
 */
export async function resolveSingleInstance({
  pidFile,
  lockFile,
  selfPid,
  bundleHash,
  readFile = readFileSync,
  kill = process.kill,
  fetchImpl = fetch,
  timeoutMs = 800,
}) {
  let oldPid = 0;
  try {
    oldPid = Number(readFile(pidFile, "utf8"));
  } catch {}
  if (!oldPid || oldPid === selfPid || !pidAlive(oldPid, kill)) {
    return { action: "none", oldPid: oldPid || null };
  }

  const lock = readLock(lockFile, readFile);
  if (lock?.identity?.pid === oldPid) {
    const health = await probeHealth(lock, { fetchImpl, timeoutMs });
    if (health?.ok === true && health.pid === oldPid && health.bundleHash === bundleHash) {
      return { action: "defer", oldPid };
    }
  }
  try {
    kill(oldPid, "SIGTERM");
  } catch {}
  return { action: "kill", oldPid };
}
