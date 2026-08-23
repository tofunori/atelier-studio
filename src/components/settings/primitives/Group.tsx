// Groupe = étiquette discrète + carte arrondie contenant des rangées
// séparées par des filets.
import React from "react";

export function Group(p: { label?: string; children: React.ReactNode }) {
  return (
    <div className="set-group">
      {p.label && <div className="set-group-label">{p.label}</div>}
      <div className="set-card">{p.children}</div>
    </div>
  );
}
