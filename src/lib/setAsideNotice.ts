// Avis non bloquant après une mise de côté (audit 2026-10-18, problème 3).
// « Restaurer » dans le panneau Git et « Rembobiner quand même » ne
// suppriment plus rien : le serveur met la version écartée à la Corbeille,
// ou, sans Corbeille utilisable (autre volume, refus d'accès), dans
// `.git/atelier-trash/` — un dossier caché que Thierry ne trouverait pas
// seul. La réponse porte l'emplacement ; cet avis le lui dit.
import { t } from "./i18n";
import { showInfo } from "../components/ui/toast";

export type SetAsideKind = "restore" | "rewind";

/** Texte de l'avis, ou null s'il n'y a rien eu à mettre de côté. */
export function setAsideMessage(path: unknown, kind: SetAsideKind): string | null {
  if (typeof path !== "string" || !path) return null;
  const parts = path.split("/").filter(Boolean);
  const name = parts[parts.length - 1] ?? path;
  const inTrash = parts.includes(".Trash");
  if (kind === "restore") {
    return inTrash ? t("git.set-aside-trash", { name }) : t("git.set-aside-folder", { path });
  }
  return inTrash ? t("git.rewind-set-aside-trash", { name }) : t("git.rewind-set-aside-folder", { path });
}

export function notifySetAside(path: unknown, kind: SetAsideKind): void {
  const message = setAsideMessage(path, kind);
  if (message) void showInfo(message);
}
