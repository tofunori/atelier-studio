// Surfaces dans la barre du haut (plan 055) — TOUTES au même endroit.
// Avant, Git/Navigateur/Terminal vivaient ici et IDE/Galerie/Connaissances/
// Narval dans le rail : une frontière que rien ne justifiait. Le rail est
// vertical et croissant (les projets), la barre est horizontale et fixe (les
// surfaces) — chacun son contenu.
import { useState } from "react";
import { t } from "../lib/i18n";
import { dispatchWorkspacePointerDragStart, shouldSuppressWorkspaceSourceClick } from "../lib/workspaceDrag";
import { SURFACES, type Surface } from "./surfaces";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import { IconButton } from "./ui/IconButton";

/** Cible de la barre : une surface de l'atelier, l'IDE, ou l'explorateur. */
export type TargetId = Surface | "ide" | "explorer";

const PIN_KEY = "atelier-studio.topbar-surfaces";
/** Plafond large : c'est la fenêtre qui décide vraiment (règle CSS de repli),
 *  pas un quota arbitraire. Dix laisse la place au crumb et aux contrôles. */
export const MAX_PINNED = 10;
export const DEFAULT_PINNED: TargetId[] = ["explorer", "ide", "connaissances", "preuves", "atelier", "git", "terminal"];
/** Migration une-fois : les listes épinglées persistées d'avant la surface
 * Preuves ne la contiennent pas — sans ça, les passages épinglés sont
 * introuvables (vécu : Thierry les cherchait dans Connaissances). On insère
 * après Connaissances UNE seule fois ; s'il la retire ensuite, on respecte. */
const PREUVES_MIGRATION_KEY = "atelier-studio.topbar-surfaces.preuves-v1";

export function readPinned(): TargetId[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return DEFAULT_PINNED;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PINNED;
    const list = parsed.filter((id): id is TargetId => typeof id === "string").slice(0, MAX_PINNED);
    if (!list.includes("preuves") && !localStorage.getItem(PREUVES_MIGRATION_KEY)) {
      localStorage.setItem(PREUVES_MIGRATION_KEY, "1");
      if (list.length < MAX_PINNED) {
        const at = list.indexOf("connaissances");
        list.splice(at >= 0 ? at + 1 : list.length, 0, "preuves");
        localStorage.setItem(PIN_KEY, JSON.stringify(list));
      }
    }
    return list;
  } catch {
    return DEFAULT_PINNED;
  }
}

function writePinned(ids: TargetId[]) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(ids));
  } catch { /* stockage indisponible : le choix ne survivra pas à la session */ }
}

/** Le glisser-déposer vers un pane, identique à celui du rail. */
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

export default function TopBarSurfaces(p: {
  activeSurface: Surface;
  showAtelier: boolean;
  ideActive: boolean;
  showExplorer: boolean;
  onSelectSurface: (surface: Surface) => void;
  onSelectIde: () => void;
  onToggleExplorer: () => void;
}) {
  const [pinned, setPinned] = useState<TargetId[]>(readPinned);
  const [menuOpen, setMenuOpen] = useState(false);
  const targets = buildTargets(p);
  const byId = new Map(targets.map((target) => [target.id, target]));
  const visible = pinned.map((id) => byId.get(id)).filter((x): x is TopBarTarget => Boolean(x));
  // une surface active mais non épinglée reste atteignable sans ouvrir le menu
  const revealed = targets.find((target) => target.active && !pinned.includes(target.id));

  function togglePin(id: TargetId) {
    setPinned((current) => {
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id].slice(-MAX_PINNED);
      writePinned(next);
      return next;
    });
  }

  // Réorganisation par le menu et pas par glisser-déposer : le glissé d'une
  // icône de surface est DÉJÀ pris — il la dépose dans un pane du workspace.
  function movePinned(id: TargetId, delta: -1 | 1) {
    setPinned((current) => {
      const from = current.indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      writePinned(next);
      return next;
    });
  }

  const moveButton = (id: TargetId, delta: -1 | 1, disabled: boolean) => (
    <span
      className={`topbar-menu-move ${disabled ? "off" : ""}`}
      title={t(delta === -1 ? "topbar.move-up" : "topbar.move-down")}
      role="button"
      tabIndex={-1}
      onClick={(event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) movePinned(id, delta);
      }}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {delta === -1 ? <path d="M4 10l4-4 4 4" /> : <path d="M4 6l4 4 4-4" />}
      </svg>
    </span>
  );

  const pinButton = (id: TargetId) => (
    <span
      className={`topbar-menu-pin ${pinned.includes(id) ? "on" : ""}`}
      title={t(pinned.includes(id) ? "topbar.unpin" : "topbar.pin")}
      role="button"
      tabIndex={-1}
      onClick={(event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        togglePin(id);
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 2v7M5.4 4.6 8 2l2.6 2.6M4.5 13.5h7" />
      </svg>
    </span>
  );

  const button = (target: TopBarTarget) => {
    const node = (
      <IconButton
        key={target.id}
        label={target.label}
        title={target.label}
        className={`ghost topbar-qa topbar-surface ${target.active ? "on" : ""}`}
        onClick={target.onSelect}
      >
        {target.icon}
      </IconButton>
    );
    if (!target.surface) return node;
    return (
      <span key={target.id} className="topbar-surface-drag" {...dragProps(target.surface)}>
        {node}
      </span>
    );
  };

  return (
    <span className="topbar-surfaces">
      {visible.map(button)}
      {revealed && button(revealed)}
      <LazyDropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="end"
        label={t("atelier.more")}
        header={<div className="topbar-menu-head">{t("topbar.surfaces")}</div>}
        trigger={(
          <IconButton
            label={t("atelier.more")}
            title={t("atelier.more")}
            className={`ghost topbar-qa topbar-surface-more ${menuOpen ? "on" : ""}`}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" />
            </svg>
          </IconButton>
        )}
        items={[
          ...visible.map((target, index) => ({
            key: target.id,
            className: `topbar-menu-row ${target.active ? "on" : ""}`,
            keepOpen: true,
            label: (
              <>
                <span className="topbar-menu-icon">{target.icon}</span>
                <span className="topbar-menu-name">{target.label}</span>
                {moveButton(target.id, -1, index === 0)}
                {moveButton(target.id, 1, index === visible.length - 1)}
                {pinButton(target.id)}
              </>
            ),
            onSelect: target.onSelect,
          })),
          ...targets.filter((target) => !pinned.includes(target.id)).map((target, index) => ({
            key: target.id,
            className: `topbar-menu-row ${target.active ? "on" : ""}`,
            separatorBefore: index === 0,
            keepOpen: true,
            label: (
              <>
                <span className="topbar-menu-icon">{target.icon}</span>
                <span className="topbar-menu-name">{target.label}</span>
                {pinButton(target.id)}
              </>
            ),
            onSelect: target.onSelect,
          })),
        ]}
      />
    </span>
  );
}
