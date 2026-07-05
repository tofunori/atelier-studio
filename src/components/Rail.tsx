import { useState } from "react";
import { t } from "../lib/i18n";
import { PlusIcon, SettingsIcon, SidebarIcon } from "./icons";

export type ProjMeta = { color?: string; label?: string };

export const PROJ_COLORS = [
  "#e05d5d", "#e8823a", "#8b5cf6", "#3b82f6",
  "#22b07d", "#e0b74a", "#64748b", "#ec4899",
];

export function projInitial(root: string, meta?: ProjMeta) {
  if (meta?.label) return meta.label;
  const name = root.split("/").pop() ?? "?";
  return name.charAt(0).toUpperCase();
}

export default function Rail(p: {
  projects: string[];
  activeProject: string | null;
  meta: Record<string, ProjMeta>;
  running: Set<string>;
  onSelectProject: (root: string) => void;
  onAddProject: () => void;
  onExpand: () => void;
  onSettings: () => void;
  onSetMeta: (root: string, meta: ProjMeta) => void;
}) {
  const [menu, setMenu] = useState<{ root: string; y: number } | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  return (
    <div className="rail" onClick={() => setMenu(null)}>
      <button className="rail-btn" title={t("action.expand-sidebar")} onClick={p.onExpand}>
        <SidebarIcon />
      </button>
      {p.projects.map((root) => {
        const m = p.meta[root];
        const active = root === p.activeProject;
        return (
          <button
            key={root}
            className={`rail-proj ${active ? "on" : ""}`}
            style={{ background: m?.color ?? "#2c313a" }}
            title={root.split("/").pop()}
            onClick={() => p.onSelectProject(root)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLabelDraft(m?.label ?? "");
              setMenu({ root, y: e.clientY });
            }}
          >
            {projInitial(root, m)}
            {p.running.has(root) && <span className="rail-dot" />}
          </button>
        );
      })}
      <button className="rail-btn" title={t("action.add-project")} onClick={p.onAddProject}>
        <PlusIcon />
      </button>
      <span className="flex" />
      <button className="rail-btn" title={t("action.settings")} onClick={p.onSettings}>
        <SettingsIcon />
      </button>
      {menu && (
        <div className="rail-menu" style={{ top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <div className="rail-menu-title">{menu.root.split("/").pop()}</div>
          <div className="swatches">
            {PROJ_COLORS.map((c) => (
              <span
                key={c}
                className="swatch"
                style={{ background: c }}
                onClick={() => p.onSetMeta(menu.root, { ...p.meta[menu.root], color: c })}
              />
            ))}
            <span
              className="swatch none"
              title={t("sidebar.without-color")}
              onClick={() => p.onSetMeta(menu.root, { ...p.meta[menu.root], color: undefined })}
            >
              ∅
            </span>
          </div>
          <input
            placeholder={t("sidebar.label-placeholder")}
            value={labelDraft}
            maxLength={2}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                p.onSetMeta(menu.root, {
                  ...p.meta[menu.root],
                  label: labelDraft || undefined,
                });
                setMenu(null);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
