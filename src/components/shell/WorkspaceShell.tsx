// WorkspaceShell (plan 015, slice 3) : frontière de COMPOSITION du shell —
// TopBar + rail + panneau de vue + surface principale. Aucun redesign :
// mêmes classes (`app-row`, `side-fixed`, `handle side-handle`, `main-card`),
// même ordre DOM, mêmes bornes de redimensionnement (180–420 px) et même
// persistance `atelier-studio.sideW` que l'implémentation historique d'App.
// Le shell ne route rien et ne connaît aucun état produit : il reçoit des
// slots déjà construits.
import { useEffect, useState, type ReactNode } from "react";

export default function WorkspaceShell(p: {
  topBar: ReactNode;
  rail: ReactNode;
  /** panneau de vue déjà choisi (Sidebar, Surlignés, …) — null quand replié */
  viewPanel: ReactNode | null;
  /** surface principale (chat / split / atelier), rendue dans .main-card */
  children: ReactNode;
  /** overlays (palette, Quick Ask, usage) — même position DOM qu'avant :
   *  dans .app-row, après .main-card */
  overlays?: ReactNode;
  /** vrai pendant un drag (poignée latérale OU split de la surface) — la
   *  classe .dragging d'app-row sert aux deux, l'état vit donc chez l'appelant */
  dragging: boolean;
  onDraggingChange: (v: boolean) => void;
}) {
  // largeur FIXE de la sidebar (px) : hors PanelGroup pour ne pas gonfler
  // quand le panneau atelier passe en pleine largeur
  const [sideW, setSideW] = useState(() => {
    const v = Number(localStorage.getItem("atelier-studio.sideW"));
    return v >= 180 && v <= 420 ? v : 250;
  });
  useEffect(() => { localStorage.setItem("atelier-studio.sideW", String(sideW)); }, [sideW]);

  return (
    <>
      {p.topBar}
      <div className={`app-row ${p.dragging ? "dragging" : ""}`}>
        {p.rail}
        {p.viewPanel != null && (
          <div className="side-fixed" style={{ width: sideW }}>
            {p.viewPanel}
          </div>
        )}
        {p.viewPanel != null && (
          <div
            className="handle side-handle"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = sideW;
              p.onDraggingChange(true);
              const move = (ev: MouseEvent) => {
                setSideW(Math.min(420, Math.max(180, startW + ev.clientX - startX)));
              };
              const up = () => {
                p.onDraggingChange(false);
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
          />
        )}
        <div className="main-card">
          {p.children}
        </div>
        {p.overlays}
      </div>
    </>
  );
}
