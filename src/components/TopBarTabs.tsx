// Onglets du pane focalisé, dans la barre du haut (lot 068). Ils vivaient
// dans le rail depuis `806a20bb` (« le rail porte les onglets, la bande
// disparaît »), réduits à un monogramme de deux lettres faute de place à
// 48 px : `methods_en.tex` et `memoire.tex` donnaient tous deux « me », et il
// fallait survoler chaque tuile pour savoir laquelle était laquelle. La barre
// du haut a la largeur qui manquait — le nom s'écrit, l'extension distingue,
// et la croix de fermeture tient sans manger le libellé.
//
// Le rail garde ce qu'il sait porter : les vues, les projets, l'activité.
import { useState } from "react";
import { t } from "../lib/i18n";
import { CloseIcon } from "./icons";
import { SURFACES, type Surface } from "./surfaces";
import { parseWorkspaceTabId } from "../lib/workspaceLayout";
import { dispatchWorkspacePointerDragStart, shouldSuppressWorkspaceSourceClick } from "../lib/workspaceDrag";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import { IconButton, RowButton } from "./ui";

/** Au-delà, les onglets passent dans le menu de débordement, qui affiche les
 *  noms complets. Huit tiennent sur 1440 px une fois la recherche réduite à
 *  son icône et les surfaces épinglées ramenées à trois (lot 068) — soit
 *  autant que les huit tuiles du rail, mais nommés. */
export const MAX_TABS = 8;

export type PaneTab = {
  id: string;
  title: string;
  url?: string;
  /** onglet du pane : document, surface, agent ou IDE (plan 057) */
  kind?: "document" | "surface" | "agent" | "ide";
  surface?: Surface;
};

/** Nom affiché : dernier segment du chemin, extension GARDÉE — c'est elle qui
 *  sépare `memoire.tex` de `memoire.pdf`. La troncature est laissée au CSS
 *  (ellipse), jamais calculée ici : elle dépend de la largeur réelle. */
export function tabLabel(title: string): string {
  const base = String(title ?? "").split("/").pop() ?? "";
  return base.trim() || t("tabs.untitled");
}

export function extensionOf(tab: PaneTab): string {
  const source = tab.url && tab.url.includes(".") ? tab.url : tab.title;
  return (/\.([a-z0-9]+)(?:[?#].*)?$/i.exec(String(source ?? ""))?.[1] ?? "").toLowerCase();
}

/** Famille de glyphe — on en montre quatre, le reste tombe sur « document ». */
export function kindOf(tab: PaneTab): "tex" | "code" | "note" | "image" | "doc" {
  const ext = extensionOf(tab);
  if (ext === "tex" || ext === "bib") return "tex";
  if (["py", "r", "js", "ts", "tsx", "mjs", "jl", "sh", "json", "toml", "yml", "yaml"].includes(ext)) return "code";
  if (["md", "txt", "org"].includes(ext)) return "note";
  if (["png", "jpg", "jpeg", "svg", "pdf", "webp", "gif"].includes(ext)) return "image";
  return "doc";
}

function KindGlyph({ kind }: { kind: ReturnType<typeof kindOf> }) {
  const common = {
    className: "topbar-tab-kind", viewBox: "0 0 24 24", width: 13, height: 13, fill: "none",
    stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const, "aria-hidden": true,
  };
  if (kind === "code") return <svg {...common}><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /></svg>;
  if (kind === "note") return <svg {...common}><path d="M4 7h16M4 12h16M4 17h9" /></svg>;
  if (kind === "image") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m5 17 5-6 3 3.5 2-2 4 4.5" /></svg>;
  if (kind === "tex") return <svg {...common}><path d="M5 6h14M12 6v12" /></svg>;
  return <svg {...common}><path d="M7 3h7l4 4v14H7z" /></svg>;
}

/** Icône de tête : une surface porte la sienne, un fichier son type. */
export function tabIcon(tab: PaneTab) {
  if (tab.kind === "surface") {
    const found = SURFACES.find((surface) => surface.id === tab.surface);
    if (found) return <span className="topbar-tab-kind">{found.icon}</span>;
  }
  if (tab.kind === "agent") {
    return (
      <svg className="topbar-tab-kind" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h16v11H8l-4 3z" />
      </svg>
    );
  }
  if (tab.kind === "ide") {
    return (
      <svg className="topbar-tab-kind" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 7 6 12l3 5M15 7l3 5-3 5" />
      </svg>
    );
  }
  return <KindGlyph kind={kindOf(tab)} />;
}

export default function TopBarTabs(p: {
  tabs: PaneTab[];
  activeTab: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (p.tabs.length === 0) return null;

  const visible = p.tabs.slice(0, MAX_TABS);
  const overflow = p.tabs.slice(MAX_TABS);

  return (
    <div className="topbar-tabs" aria-label={t("tabs.open-files")}>
      {visible.map((tab, index) => {
        // Le glisser d'un onglet vers un autre pane suivait les tuiles du
        // rail depuis la disparition de la bande ; il suit les onglets ici,
        // même mécanisme et même cible.
        const ref = parseWorkspaceTabId(tab.id);
        const label = tabLabel(tab.title);
        const on = tab.id === p.activeTab;
        return (
          <span key={tab.id} className={`topbar-tab ${on ? "on" : ""}`}>
            <RowButton
              className="topbar-tab-main"
              title={`${tab.title} — ⌥${index + 1}`}
              aria-current={on ? "page" : undefined}
              onClickCapture={(event: React.MouseEvent) => {
                if (!ref || !shouldSuppressWorkspaceSourceClick(ref)) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onPointerDown={(event: React.PointerEvent) => {
                if (ref) dispatchWorkspacePointerDragStart(event.nativeEvent, ref);
              }}
              onClick={() => p.onSelectTab(tab.id)}
              onAuxClick={(event: React.MouseEvent) => {
                // clic milieu = fermer, comme dans toute bande d'onglets —
                // la croix reste là pour ceux qui ne le savent pas
                if (event.button !== 1) return;
                event.preventDefault();
                p.onCloseTab(tab.id);
              }}
            >
              {tabIcon(tab)}
              <span className="topbar-tab-name">{label}</span>
            </RowButton>
            <IconButton
              className="topbar-tab-close"
              label={`${t("action.close-tab")} — ${label}`}
              title={t("action.close-tab")}
              onClick={() => p.onCloseTab(tab.id)}
            >
              <CloseIcon size={11} />
            </IconButton>
          </span>
        );
      })}
      {overflow.length > 0 && (
        <LazyDropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          align="start"
          label={t("tabs.open-files")}
          trigger={<RowButton className="topbar-tab-more">+{overflow.length}</RowButton>}
          items={overflow.map((tab) => ({
            key: tab.id,
            label: tabLabel(tab.title),
            onSelect: () => p.onSelectTab(tab.id),
          }))}
        />
      )}
    </div>
  );
}
