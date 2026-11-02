// Surfaces dans la barre du haut (plan 055, compacté 2026-11-01) : la
// galerie garde son bouton, toujours visible ; toutes les autres surfaces et
// outils passent dans UN lanceur dont la pastille porte le nom de la surface
// ouverte (« Surfaces » sur la galerie). Avant, six icônes épinglées et un
// menu de personnalisation prenaient ~170 px de barre (demande Thierry,
// variante B avec bouton Galerie).
import { useState } from "react";
import { t } from "../lib/i18n";
import { dispatchWorkspacePointerDragStart, shouldSuppressWorkspaceSourceClick } from "../lib/workspaceDrag";
import { SURFACES, type Surface } from "./surfaces";
import { requestWorkspacePaneMenu } from "./WorkspacePaneMenuSlot";
import { Tooltip } from "./ui/Tooltip";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";

/** Cible de la barre : une surface de l'atelier, l'IDE, ou l'explorateur. */
export type TargetId = Surface | "ide" | "explorer" | "annots";

/** Le glisser-déposer de la galerie vers un pane, identique à celui du rail. */
function dragProps(surface: Surface) {
  return {
    onClickCapture: (event: React.MouseEvent<HTMLSpanElement>) => {
      if (!shouldSuppressWorkspaceSourceClick({ kind: "surface", surface })) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onPointerDown: (event: React.PointerEvent<HTMLSpanElement>) => {
      dispatchWorkspacePointerDragStart(event.nativeEvent, { kind: "surface", surface });
    },
  };
}

const EXPLORER_ICON = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.6c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2v-7.6z" />
  </svg>
);
const ANNOTS_ICON = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 3h3v3h-3zM7.5 3.8h6M7.5 5.2h4M2.5 9h3v3h-3zM7.5 9.8h6M7.5 11.2h4" />
  </svg>
);
const IDE_ICON = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.5 5 3 8l2.5 3M10.5 5 13 8l-2.5 3M8.8 3.5 7.2 12.5" />
  </svg>
);

export type TopBarTarget = {
  id: TargetId;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onSelect: () => void;
  /** seules les vraies surfaces se déposent dans un pane */
  surface: Surface | null;
};

export function buildTargets(p: {
  activeSurface: Surface;
  showAtelier: boolean;
  ideActive: boolean;
  showExplorer: boolean;
  onSelectSurface: (surface: Surface) => void;
  onSelectIde: () => void;
  onToggleExplorer: () => void;
  onToggleAnnots: () => void;
}): TopBarTarget[] {
  return [
    {
      id: "explorer",
      label: t("atelier.file-explorer"),
      icon: EXPLORER_ICON,
      active: p.showExplorer,
      onSelect: p.onToggleExplorer,
      surface: null,
    },
    {
      id: "ide",
      label: t("atelier.ide"),
      icon: IDE_ICON,
      active: p.ideActive,
      onSelect: p.onSelectIde,
      surface: null,
    },
    {
      id: "annots",
      label: t("atelier.annotations"),
      icon: ANNOTS_ICON,
      active: false,   // l'état vit dans le lecteur PDF
      onSelect: p.onToggleAnnots,
      surface: null,
    },
    ...SURFACES.map((s) => ({
      id: s.id as TargetId,
      label: t(s.labelKey),
      icon: s.icon,
      // l'IDE occupe la même case que la galerie : une surface n'est active
      // que si l'atelier est visible ET que l'IDE ne la recouvre pas
      active: p.showAtelier && p.activeSurface === s.id && !(s.id === "atelier" && p.ideActive),
      onSelect: () => p.onSelectSurface(s.id),
      surface: s.id,
    })),
  ];
}

/** Les outils (bascules et IDE) suivent les surfaces dans le menu. */
const TOOL_IDS: TargetId[] = ["explorer", "ide", "annots"];

export default function TopBarSurfaces(p: Parameters<typeof buildTargets>[0]) {
  const [open, setOpen] = useState(false);
  const targets = buildTargets(p);
  const gallery = targets.find((target) => target.id === "atelier")!;
  // la pastille nomme ce qui occupe l'atelier, sauf la galerie (son bouton
  // suffit) ; l'IDE recouvre la galerie, il se nomme donc aussi
  const current = targets.find((target) => target.active && target.surface && target.id !== "atelier")
    ?? (p.showAtelier && p.ideActive ? targets.find((target) => target.id === "ide") : undefined);
  const item = (target: (typeof targets)[number]) => ({
    key: target.id,
    label: <><span className="topbar-menu-icon">{target.icon}</span>{target.label}</>,
    checked: target.active, keepOpen: false,
    onSelect: target.onSelect,
  });
  const rest = targets.filter((target) => target.id !== "atelier");
  return <span className="topbar-surfaces" role="toolbar" aria-label={t("topbar.surfaces")}>
    <span className="topbar-target topbar-surface-drag" data-active={gallery.active} {...dragProps("atelier")}
      onContextMenu={gallery.active ? (event) => requestWorkspacePaneMenu(event, { surface: "atelier" }) : undefined}>
      <Tooltip label={gallery.label} placement="bottom">
        <IconButton label={gallery.label} aria-pressed={gallery.active}
          className={`ghost topbar-qa topbar-surface ${gallery.active ? "on" : ""}`} onClick={gallery.onSelect}>
          {gallery.icon}
        </IconButton>
      </Tooltip>
    </span>
    <LazyDropdownMenu open={open} onOpenChange={setOpen} align="center" label={t("topbar.surfaces")} header={t("topbar.surfaces")}
      trigger={<Button variant="ghost" size="sm" className="topbar-launcher" data-current={current ? "" : undefined}
        aria-label={current ? `${t("topbar.surfaces")} : ${current.label}` : t("topbar.surfaces")}
        aria-haspopup="menu" aria-expanded={open}
        // clic droit sur la pastille = actions du pane de cette surface ; le
        // navigateur garde son menu dans sa propre barre
        onContextMenu={current?.surface && current.surface !== "browser"
          ? (event: React.MouseEvent) => requestWorkspacePaneMenu(event, { surface: current.surface! })
          : undefined}>
        {current?.icon}{/* nom court : « IDE — éditeurs et fichiers ouverts » → « IDE » */}
        <span className="topbar-launcher-name">{current?.label.split(" — ")[0] ?? t("topbar.surfaces")}</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 6.2 8 9.7l3.5-3.5" /></svg>
      </Button>}
      groups={[
        { key: "surfaces", items: rest.filter((target) => !TOOL_IDS.includes(target.id)).map(item) },
        { key: "tools", separatorBefore: true, items: rest.filter((target) => TOOL_IDS.includes(target.id)).map(item) },
      ]} />
  </span>;
}
