// Présentation UNIQUE des statuts UI (plan 018, étape 3) : reçoit un état
// métier déjà fiable et retourne libellé, ton et texte accessible. Ne fusionne
// JAMAIS un concept scientifique avec le succès technique : « terminé » décrit
// le record d'exécution, pas la validité du résultat — d'où un ton neutre pour
// done (aucun vert « résultat correct »).
import { t } from "./i18n";
import type { BadgeStatus } from "../components/ui";

export type UiStatusKind =
  | "idle"
  | "running"
  | "done"
  | "warning"
  | "error"
  | "interrupted"
  | "disconnected";

export type PresentedStatus = {
  kind: UiStatusKind;
  /** libellé court traduit (badge, méta) */
  label: string;
  /** ton visuel du StatusBadge — pas de vert pour done (record technique) */
  tone: BadgeStatus;
  /** texte accessible complet (label + détail) */
  a11y: string;
  /** détail du record (message d'erreur, durée) — jamais reformulé */
  detail?: string;
};

export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const TONES: Record<UiStatusKind, BadgeStatus> = {
  idle: "neutral",
  running: "running",
  done: "neutral", // record technique — le ton « success » reste hors budget
  warning: "warning",
  error: "error",
  interrupted: "warning",
  disconnected: "error",
};

export function presentStatus(input: {
  kind: UiStatusKind;
  /** epoch ms du début si running — produit « en cours depuis X » */
  since?: number | null;
  now?: number;
  /** détail du record (message d'erreur…) — transmis tel quel */
  detail?: string;
}): PresentedStatus {
  const { kind, since, detail } = input;
  const now = input.now ?? Date.now();
  let label: string;
  switch (kind) {
    case "running":
      label = since != null
        ? t("status.running-for", { t: fmtDuration(Math.max(0, now - since)) })
        : t("status.running");
      break;
    case "done": label = t("status.done"); break;
    case "warning": label = t("status.warning"); break;
    case "error": label = t("status.error"); break;
    case "interrupted": label = t("status.interrupted"); break;
    case "disconnected": label = t("status.disconnected"); break;
    default: label = t("status.idle");
  }
  return {
    kind,
    label,
    tone: TONES[kind],
    a11y: detail ? `${label} — ${detail}` : label,
    detail,
  };
}
