// Groupe = étiquette discrète + carte arrondie contenant des rangées
// séparées par des filets.
import React from "react";
import { useSettingsTarget } from "../searchTarget";

export function Group(p: { label?: string; children: React.ReactNode }) {
  const { ref, matches } = useSettingsTarget(p.label ? `group:${p.label}` : undefined);
  return (
    <div ref={ref} className="set-group" tabIndex={-1} data-search-match={matches || undefined}>
      {p.label && <h2 className="set-group-label">{p.label}</h2>}
      <div className="set-card">{p.children}</div>
    </div>
  );
}
