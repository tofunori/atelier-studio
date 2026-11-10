// Surfaces dans la barre du haut (plan 055 ; refonte « onglets posés »,
// variante B + S2 du 2026-11-09). La moitié atelier suit la même phrase que
// celle du chat : des onglets à gauche, UN ⌄ au bord.
//  - La Galerie est un onglet épinglé, icône seule, toujours en tête.
//  - La surface ouverte ailleurs (terminal, navigateur, bibliothèque…) devient
//    un onglet à sa suite ; plus de pastille « IDE » : un document ouvert est
//    lui-même un onglet (TopBarTabs).
//  - Le ⌄ au bord ouvre toutes les autres surfaces et les outils.
import { useState } from "react";
import { t } from "../lib/i18n";
import { dispatchWorkspacePointerDragStart, shouldSuppressWorkspaceSourceClick } from "../lib/workspaceDrag";
import { SURFACES, type Surface } from "./surfaces";
import { requestWorkspacePaneMenu } from "../lib/workspacePaneMenu";
import { IconButton } from "./ui/IconButton";
import { RowButton } from "./ui/RowButton";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";

import { ChevronDownIcon, CodeXmlIcon, FolderIcon, LayoutListIcon } from "lucide-react";
/** Cible de la barre : une surface de l'atelier, l'IDE, ou l'explorateur. */
export type TargetId = Surface | "ide" | "explorer" | "annots";

/** Le glisser-déposer d'une surface vers un pane, identique à celui du rail. */
function dragProps(surface: Surface) {
  return {
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
      if (!shouldSuppressWorkspaceSourceClick({ kind: "surface", surface })) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      dispatchWorkspacePointerDragStart(event.nativeEvent, { kind: "surface", surface });
    },
  };
}

const EXPLORER_ICON = (
  <FolderIcon size={14} />
);
const ANNOTS_ICON = (
  <LayoutListIcon size={14} />
);
const IDE_ICON = (
  <CodeXmlIcon size={14} />
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

export type SurfaceProps = {
  activeSurface: Surface;
  showAtelier: boolean;
  ideActive: boolean;
  showExplorer: boolean;
  onSelectSurface: (surface: Surface) => void;
  onSelectIde: () => void;
  onToggleExplorer: () => void;
  onToggleAnnots: () => void;
};

export function buildTargets(p: SurfaceProps): TopBarTarget[] {
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

/** Surface ouverte hors galerie : c'est elle qui devient un onglet. L'IDE ne
 *  se nomme que s'il n'a aucun document actif (sinon l'onglet du document
 *  suffit). */
function currentSurface(p: SurfaceProps, documentActive: boolean): TopBarTarget | undefined {
  const targets = buildTargets(p);
  return targets.find((target) => target.active && target.surface && target.id !== "atelier")
    ?? (p.showAtelier && p.ideActive && !documentActive ? targets.find((target) => target.id === "ide") : undefined);
}

/** Tête de la bande de l'atelier : l'onglet Galerie, épinglé, puis la
 *  surface ouverte s'il y en a une. */
export default function TopBarSurfaces(p: SurfaceProps & { documentActive?: boolean }) {
  const targets = buildTargets(p);
  const gallery = targets.find((target) => target.id === "atelier")!;
  const galleryLabel = t("atelier.gallery-title");
  const current = currentSurface(p, p.documentActive ?? false);
  // nom court : « IDE — éditeurs et fichiers ouverts » → « IDE »
  const currentName = current?.label.split(" — ")[0];
  return <span className="topbar-surfaces" role="group" aria-label={t("topbar.surfaces")}>
    <span className="topbar-gallery-tab document-tab-shell topbar-surface-drag" data-active={gallery.active} data-pinned=""
      {...dragProps("atelier")}
      onContextMenu={gallery.active ? (event) => requestWorkspacePaneMenu(event, { surface: "atelier" }) : undefined}>
      <RowButton className="topbar-gallery-main" aria-label={galleryLabel} title={galleryLabel}
        aria-pressed={gallery.active} onClick={gallery.onSelect}>
        {gallery.icon}
      </RowButton>
    </span>
    {current && <span className={`topbar-surface-tab document-tab-shell${current.surface ? " topbar-surface-drag" : ""}`} data-active="true"
      {...(current.surface ? dragProps(current.surface) : {})}
      // clic droit = actions du pane de cette surface ; le navigateur garde
      // son menu dans sa propre barre
      onContextMenu={current.surface && current.surface !== "browser"
        ? (event) => requestWorkspacePaneMenu(event, { surface: current.surface! })
        : undefined}>
      <RowButton className="topbar-surface-main" aria-current="page" title={current.label} onClick={current.onSelect}>
        <span className="topbar-surface-icon">{current.icon}</span>
        <span className="topbar-surface-name">{currentName}</span>
      </RowButton>
    </span>}
  </span>;
}

/** Le ⌄ au bord de l'atelier : toutes les surfaces (hors Galerie, qui a son
 *  onglet), puis les outils. */
export function SurfacesMenu(p: SurfaceProps) {
  const [open, setOpen] = useState(false);
  const targets = buildTargets(p);
  const item = (target: TopBarTarget) => ({
    key: target.id,
    label: <><span className="topbar-menu-icon">{target.icon}</span>{target.label}</>,
    checked: target.active, keepOpen: false,
    onSelect: target.onSelect,
  });
  const rest = targets.filter((target) => target.id !== "atelier");
  return <LazyDropdownMenu open={open} onOpenChange={setOpen} align="end" label={t("topbar.surfaces")}
    trigger={<IconButton className="topbar-surfaces-menu" label={t("topbar.surfaces")} aria-haspopup="menu" aria-expanded={open}>
      <ChevronDownIcon size={12} />
    </IconButton>}
    groups={[
      { key: "surfaces", label: t("topbar.open-in-atelier"), items: rest.filter((target) => !TOOL_IDS.includes(target.id)).map(item) },
      { key: "tools", separatorBefore: true, items: rest.filter((target) => TOOL_IDS.includes(target.id)).map(item) },
    ]} />;
}
