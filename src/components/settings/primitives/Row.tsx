// Rangée de réglage : libellé à gauche, contrôle à droite. Extraite de
// Settings.tsx (lot 1) sans changement de rendu — la géométrie vit dans
// App.css (.set-row), pas ici.
import React from "react";
import { useSettingsTarget } from "../searchTarget";

export function Row(p: { title: string; desc?: string; children: React.ReactNode }) {
  const { ref, matches } = useSettingsTarget(p.title);
  return (
    <div ref={ref} className="set-row" tabIndex={-1} data-search-match={matches || undefined} role="group" aria-label={p.title}>
      <div className="set-row-txt">
        <div className="set-row-title">{p.title}</div>
        {p.desc && <div className="set-row-desc">{p.desc}</div>}
      </div>
      <div className="set-row-ctl">{p.children}</div>
    </div>
  );
}
