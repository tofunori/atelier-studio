// Barre au survol d'une figure locale (chat ou surface Noyau) : l'ouvrir dans
// la galerie ou l'y enregistrer. L'image est copiée dans le projet (commande
// Tauri local_image_save_to_gallery) ; une figure captée par le noyau garde sa
// recette, la copie entre dans les fichiers écrits de sa cellule.
import { useState, type ReactNode } from "react";
import { t } from "../lib/i18n";
import { figureCell, kernelCommand } from "../lib/kernel";
import { saveLocalImageToGallery } from "../lib/localImage";
import { IconButton } from "./ui";

const GALLERY = <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="5.2" height="5.2" rx="1" /><rect x="9.3" y="1.5" width="5.2" height="5.2" rx="1" /><rect x="1.5" y="9.3" width="5.2" height="5.2" rx="1" /><rect x="9.3" y="9.3" width="5.2" height="5.2" rx="1" /></svg>;
const SAVE = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h8l2 2v9H3z" /><path d="M5.5 2.5v3.5h5V2.5M5.5 13.5V9.5h5v4" /></svg>;
const CHECK = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>;

export function FigureGalleryBar({ path, threadId, cell, saved: known = null, onSaved, children }: {
  path: string;
  threadId: string;
  cell?: number | null;
  /** Copie déjà faite dans le projet : la barre ne recopie pas la figure. */
  saved?: string | null;
  onSaved?: (rel: string) => void;
  /** Bouton placé avant « ouvrir » et « enregistrer » (agrandir, noyau). */
  children?: ReactNode;
}) {
  const [saved, setSaved] = useState(known);
  const [saving, setSaving] = useState(false);

  async function save(): Promise<string | null> {
    if (saved) return saved;
    setSaving(true);
    try {
      const rel = await saveLocalImageToGallery(path, threadId);
      setSaved(rel);
      onSaved?.(rel);
      const id = cell ?? figureCell(path);
      if (id != null) void kernelCommand(threadId, "link", { cell: id, path: rel }).catch(() => {});
      return rel;
    } catch {
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function open() {
    const rel = await save();
    if (rel) window.dispatchEvent(new CustomEvent("chat-open-file", { detail: { rel, line: null } }));
  }

  const saveLabel = saved ? t("kernel.figure-saved") : t("kernel.figure-save");
  return (
    <span className="figure-gallery-bar">
      {children}
      <IconButton size="s" className="ghost" label={t("kernel.figure-open")} title={t("kernel.figure-open")}
        disabled={saving} onClick={() => void open()}>{GALLERY}</IconButton>
      <IconButton size="s" className="ghost" label={saveLabel} title={saveLabel}
        disabled={saving || saved != null} onClick={() => void save()}>{saved ? CHECK : SAVE}</IconButton>
    </span>
  );
}
