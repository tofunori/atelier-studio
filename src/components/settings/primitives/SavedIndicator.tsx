// Pastille « Enregistré » (lot 1). Il n'y a PAS de bouton Enregistrer :
// settings.ts:287 écrit dans localStorage à chaque changement et App.tsx:683
// miroite sur disque (débouncé 200ms). Ce qui manquait était le retour —
// sans lui, l'utilisateur cherche un bouton Save qui n'existe pas.
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../../lib/i18n";

import { CheckIcon, CircleAlertIcon } from "lucide-react";
const FLASH_MS = 1600;

export function useSavedFlash() {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), FLASH_MS);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { visible, flash };
}

export function SavedIndicator(p: { visible: boolean; failed?: boolean }) {
  // Le texte reste en place le temps du fondu de sortie (SET-19) : retiré en
  // même temps que .on, il disparaissait d'un coup.
  const [kept, setKept] = useState(p.visible);
  useEffect(() => {
    if (p.visible) { setKept(true); return; }
    const id = setTimeout(() => setKept(false), 150);
    return () => clearTimeout(id);
  }, [p.visible]);
  // Toujours monté : un nœud aria-live inséré au moment de l'annonce n'est
  // pas lu par les lecteurs d'écran.
  return (
    <span
      className={`set-saved ${p.visible ? "on" : ""} ${p.failed ? "failed" : ""}`}
      role="status"
      aria-live="polite"
    >
      {(p.visible || kept) && (
        <>
          {p.failed ? <CircleAlertIcon size={12} /> : <CheckIcon size={12} />}
          {p.failed ? t("settings.save-failed") : t("settings.saved")}
        </>
      )}
    </span>
  );
}
