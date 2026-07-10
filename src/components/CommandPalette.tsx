import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyScore, PaletteItem, PaletteSection } from "../lib/palette";
import { t } from "../lib/i18n";
import { SearchIcon } from "./icons";

const SECTION_ORDER: PaletteSection[] = ["actions", "surfaces", "fichiers", "chats", "references"];

function sectionLabel(section: PaletteSection): string {
  return t(`palette.section.${section}` as any);
}

export default function CommandPalette({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: PaletteItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim();
    if (!q) return items.filter((item) => item.section === "actions").slice(0, 12);
    const scored = items
      .map((item) => ({ item, score: fuzzyScore(q, `${item.label} ${item.hint ?? ""}`) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || SECTION_ORDER.indexOf(a.item.section) - SECTION_ORDER.indexOf(b.item.section))
      .slice(0, 12)
      .map(({ item }) => item);
    return SECTION_ORDER.flatMap((section) => scored.filter((item) => item.section === section));
  }, [items, query]);

  useEffect(() => {
    setActive((index) => Math.min(index, Math.max(visible.length - 1, 0)));
  }, [visible.length]);

  if (!open) return null;

  function run(item: PaletteItem) {
    item.run();
    onClose();
  }

  function move(delta: number) {
    if (!visible.length) return;
    setActive((index) => (index + delta + visible.length) % visible.length);
  }

  let rendered = 0;

  return (
    <div className="cmdk-overlay" role="presentation" onMouseDown={onClose}>
      <div className="cmdk-panel" role="dialog" aria-modal="true" aria-label={t("palette.title")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdk-search">
          <SearchIcon size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (visible[active]) run(visible[active]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-activedescendant={visible[active] ? `cmdk-opt-${active}` : undefined}
          />
        </div>
        <div id="cmdk-listbox" className="cmdk-list" role="listbox" aria-label={t("palette.results")}>
          {visible.length === 0 && <div className="cmdk-empty">{t("palette.empty")}</div>}
          {SECTION_ORDER.map((section) => {
            const group = visible.filter((item) => item.section === section);
            if (!group.length) return null;
            return (
              <div className="cmdk-group" key={section}>
                <div className="cmdk-heading">{sectionLabel(section)}</div>
                {group.map((item) => {
                  const index = rendered++;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      id={`cmdk-opt-${index}`}
                      className={`cmdk-item ${index === active ? "active" : ""}`}
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => run(item)}
                    >
                      {item.icon && <span className="cmdk-icon">{item.icon}</span>}
                      <span className="cmdk-copy">
                        <span className="cmdk-label">{item.label}</span>
                        {item.hint && <span className="cmdk-hint">{item.hint}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="cmdk-footer">{t("palette.footer")}</div>
      </div>
    </div>
  );
}
