// Repli « Avancé » (lot 1) : rien n'est supprimé de la surface des réglages,
// la moitié passe simplement sous ce repli, FERMÉ par défaut. L'état n'est
// délibérément PAS persisté — un repli qui se souvient d'être ouvert annule
// son bénéfice au démarrage suivant.
import React, { useContext, useEffect, useState } from "react";
import { RowButton } from "../../ui";
import { t } from "../../../lib/i18n";
import { SettingsSearchTarget } from "../searchTarget";

export function Advanced(p: { children: React.ReactNode; count?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const target = useContext(SettingsSearchTarget);
  useEffect(() => { if (target) setOpen(true); }, [target]);
  const label = p.label ?? (p.count
    ? `${t("settings.advanced-toggle")} · ${t("settings.advanced-count", { count: p.count })}`
    : t("settings.advanced-toggle"));
  return (
    <div className="set-advanced">
      <RowButton
        className={`set-advanced-trigger ${open ? "on" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        {label}
      </RowButton>
      {open && <div className="set-advanced-body">{p.children}</div>}
    </div>
  );
}
