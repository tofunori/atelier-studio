// Mises à jour d'Atelier (2026-11-24, maquette mises-a-jour-2026-11-24) :
// l'état de la carte « Atelier X est disponible » et des réglages. Le travail
// (vérifier, télécharger, vérifier la signature, installer, redémarrer) est
// fait en Rust (src-tauri/src/updater.rs) ; ce module ne fait qu'appeler ses
// commandes et décider quand montrer la carte. Chargé en différé par App.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { confirmDiscard, flushUnsavedFrames, unsavedDocuments } from "./unsavedDocuments";

export type UpdateInfo = { version: string; currentVersion: string; notes?: string | null; date?: string | null };
export type UpdateStatus = { currentVersion: string; autoCheck: boolean; releasesUrl: string };

export type UpdatePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "downloading"; info: UpdateInfo; downloaded: number; total: number | null }
  | { kind: "installing"; info: UpdateInfo }
  | { kind: "error"; info: UpdateInfo | null; message: string };

export type UpdateState = {
  phase: UpdatePhase;
  /** la carte est affichée (fermée par « Plus tard ») */
  cardOpen: boolean;
  lastCheck: number | null;
  /** résultat de la dernière recherche lancée à la main */
  upToDate: boolean;
};

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const FIRST_CHECK_DELAY_MS = 15 * 1000;
/** « Plus tard » : la même version ne revient pas avant ce délai */
export const SNOOZE_MS = 24 * 60 * 60 * 1000;
const AUTO_KEY = "atelier-studio.update.auto";
const SNOOZE_KEY = "atelier-studio.update.snooze";
const LAST_CHECK_KEY = "atelier-studio.update.last-check";

let state: UpdateState = { phase: { kind: "idle" }, cardOpen: false, lastCheck: readNumber(LAST_CHECK_KEY), upToDate: false };
const listeners = new Set<() => void>();

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  for (const listener of [...listeners]) listener();
}

export const getUpdateState = () => state;
export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Préférence « Vérifier automatiquement » (activée par défaut). */
export function autoCheckPreference(): boolean {
  try { return localStorage.getItem(AUTO_KEY) !== "0"; } catch { return true; }
}
export function setAutoCheckPreference(on: boolean) {
  try { localStorage.setItem(AUTO_KEY, on ? "1" : "0"); } catch { /* stockage indisponible */ }
  for (const listener of [...listeners]) listener();
}

type Snooze = { version: string; until: number };
function snoozed(version: string, now: number): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as Snooze;
    return s.version === version && now < s.until;
  } catch { return false; }
}

/** Décision pure (testée) : la carte s'ouvre-t-elle sur une version trouvée ? */
export function shouldOpenCard(version: string, manual: boolean, now = Date.now()): boolean {
  return manual || !snoozed(version, now);
}

export async function updateStatus(): Promise<UpdateStatus | null> {
  try { return await invoke<UpdateStatus>("update_status"); } catch { return null; }
}

let inflight: Promise<UpdateInfo | null> | null = null;

/** `manual` : bouton « Rechercher » des réglages (montre aussi « À jour »
 *  et ouvre la carte même après un « Plus tard »). */
export function checkForUpdate(manual = false): Promise<UpdateInfo | null> {
  const busy = state.phase.kind === "downloading" || state.phase.kind === "installing";
  if (busy) return Promise.resolve(null);
  if (inflight) return inflight;
  if (manual) set({ phase: { kind: "checking" }, upToDate: false });
  inflight = invoke<UpdateInfo | null>("update_check")
    .then((info) => {
      const now = Date.now();
      try { localStorage.setItem(LAST_CHECK_KEY, String(now)); } catch { /* stockage indisponible */ }
      if (!info) {
        set({ phase: { kind: "idle" }, cardOpen: false, lastCheck: now, upToDate: manual });
        return null;
      }
      const open = shouldOpenCard(info.version, manual, now);
      const wasOpen = state.cardOpen && state.phase.kind === "available" && state.phase.info.version === info.version;
      set({ phase: { kind: "available", info }, cardOpen: open, lastCheck: now, upToDate: false });
      if (open && !wasOpen) void notifyAway(info);
      return info;
    })
    .catch((error: unknown) => {
      // une vérification automatique qui échoue (hors ligne, release en
      // cours de publication) reste silencieuse ; à la main, on le dit
      if (manual) set({ phase: { kind: "error", info: null, message: String(error) }, cardOpen: false });
      else if (state.phase.kind === "checking") set({ phase: { kind: "idle" } });
      return null;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function snoozeUpdate() {
  const phase = state.phase;
  if (phase.kind === "available") {
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify({ version: phase.info.version, until: Date.now() + SNOOZE_MS } satisfies Snooze));
    } catch { /* stockage indisponible */ }
  }
  set({ cardOpen: false, phase: phase.kind === "error" ? { kind: "idle" } : phase });
}

/** Les documents modifiés passent par la même garde que « Quitter » ; puis
 *  la coquille télécharge, vérifie la signature, installe et redémarre. */
export async function installUpdate(): Promise<void> {
  const phase = state.phase;
  const info = phase.kind === "available" || phase.kind === "error" ? phase.info : null;
  if (!info) return;
  const ok = await confirmDiscard("quit", unsavedDocuments());
  if (!ok) return;
  await flushUnsavedFrames();
  set({ phase: { kind: "downloading", info, downloaded: 0, total: null }, cardOpen: true });
  const offProgress = await listen<{ downloaded: number; total: number | null }>("atelier-update-progress", (event) => {
    if (state.phase.kind === "downloading") set({ phase: { ...state.phase, ...event.payload } });
  }).catch(() => null);
  const offInstalling = await listen("atelier-update-installing", () => set({ phase: { kind: "installing", info } })).catch(() => null);
  try {
    await invoke("update_install"); // ne revient pas en cas de succès : l'app redémarre
  } catch (error) {
    set({ phase: { kind: "error", info, message: String(error) }, cardOpen: true });
  } finally {
    offProgress?.();
    offInstalling?.();
  }
}

export async function openReleasesPage() {
  try { await invoke("update_open_releases"); } catch { /* rien à faire */ }
}

async function notifyAway(info: UpdateInfo) {
  if (!document.hidden && document.hasFocus()) return;
  try {
    const [{ init }, { sendNotification }, { t }] = await Promise.all([
      import("./notify"), import("@tauri-apps/plugin-notification"), import("./i18n"),
    ]);
    if (!(await init())) return;
    sendNotification({ title: "Atelier", body: t("update.notification", { version: info.version }), autoCancel: true });
  } catch { /* notifications indisponibles : la carte suffit */ }
}

let started = false;
/** Vérification automatique : au lancement (après un délai, pour ne pas
 *  gêner le démarrage), puis toutes les 6 heures. Builds de release seulement
 *  (voir updater.rs) et si l'utilisateur ne l'a pas coupée. */
export async function startUpdateChecks(): Promise<void> {
  if (started) return;
  started = true;
  const status = await updateStatus();
  if (!status?.autoCheck) return;
  const tick = () => { if (autoCheckPreference()) void checkForUpdate(false); };
  window.setTimeout(tick, FIRST_CHECK_DELAY_MS);
  window.setInterval(tick, CHECK_INTERVAL_MS);
}

/** Pour les tests. */
export function resetUpdateStateForTests() {
  state = { phase: { kind: "idle" }, cardOpen: false, lastCheck: null, upToDate: false };
  inflight = null;
  started = false;
  listeners.clear();
}
