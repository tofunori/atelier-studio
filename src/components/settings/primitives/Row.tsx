// Rangée de réglage : libellé à gauche, contrôle à droite. Extraite de
// Settings.tsx (lot 1) sans changement de rendu — la géométrie vit dans
// App.css (.set-row), pas ici.
import React from "react";

export function Row(p: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-txt">
        <div className="set-row-title">{p.title}</div>
        {p.desc && <div className="set-row-desc">{p.desc}</div>}
      </div>
      <div className="set-row-ctl">{p.children}</div>
    </div>
  );
}
