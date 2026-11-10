// Barre au survol d'une figure locale (chat ou surface Noyau) : l'ouvrir dans
// la galerie ou l'y enregistrer. L'image est copiée dans le projet (commande
// Tauri local_image_save_to_gallery) ; une figure captée par le noyau garde sa
// recette, la copie entre dans les fichiers écrits de sa cellule.
import { useState, type ReactNode } from "react";
import { t } from "../lib/i18n";
import { figureCell, kernelCommand } from "../lib/kernel";
import { saveLocalImageToGallery } from "../lib/localImage";
import { IconButton } from "./ui";

import { CheckIcon, LayoutGridIcon, SaveIcon } from "lucide-react";
const GALLERY = <LayoutGridIcon size={14} />;
const SAVE = <SaveIcon size={14} />;
const CHECK = <CheckIcon size={12} />;

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
      <IconButton size="s" label={t("kernel.figure-open")} title={t("kernel.figure-open")}
        disabled={saving} onClick={() => void open()}>{GALLERY}</IconButton>
      <IconButton size="s" label={saveLabel} title={saveLabel}
        disabled={saving || saved != null} onClick={() => void save()}>{saved ? CHECK : SAVE}</IconButton>
    </span>
  );
}
