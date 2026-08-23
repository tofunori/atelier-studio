// Pastille « Enregistré » (lot 1). Il n'y a PAS de bouton Enregistrer :
// settings.ts:287 écrit dans localStorage à chaque changement et App.tsx:683
// miroite sur disque (débouncé 200ms). Ce qui manquait était le retour —
// sans lui, l'utilisateur cherche un bouton Save qui n'existe pas.
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../../lib/i18n";

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
  // Toujours monté : un nœud aria-live inséré au moment de l'annonce n'est
  // pas lu par les lecteurs d'écran.
  return (
    <span
      className={`set-saved ${p.visible ? "on" : ""} ${p.failed ? "failed" : ""}`}
      role="status"
      aria-live="polite"
    >
      {p.visible && (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {p.failed ? <path d="M12 8v5M12 17h.01" /> : <path d="M20 6L9 17l-5-5" />}
          </svg>
          {p.failed ? t("settings.save-failed") : t("settings.saved")}
        </>
      )}
    </span>
  );
}
