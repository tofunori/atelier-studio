import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyScore, PaletteItem, PaletteSection } from "../lib/palette";
import { t } from "../lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "./shadcn/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./shadcn/command";
import { Kbd, KbdGroup } from "./shadcn/kbd";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
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

  function run(item: PaletteItem) {
    item.run();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="cmdk-panel"
        overlayClassName="cmdk-dialog-overlay"
        showCloseButton={false}
        aria-label={t("palette.title")}
      >
        <DialogTitle className="tw:sr-only">{t("palette.title")}</DialogTitle>
        <Command className="cmdk-root" shouldFilter={false} label={t("palette.placeholder")}>
          <CommandInput
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onValueChange={setQuery}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
          />
          <CommandList id="cmdk-listbox" className="cmdk-list" aria-label={t("palette.results")}>
          <CommandEmpty className="cmdk-empty">{t("palette.empty")}</CommandEmpty>
          {SECTION_ORDER.map((section) => {
            const group = visible.filter((item) => item.section === section);
            if (!group.length) return null;
            return (
              <CommandGroup className="cmdk-group" key={section} heading={sectionLabel(section)}>
                {group.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      keywords={[item.label, item.hint ?? ""]}
                      className="cmdk-item"
                      onSelect={() => run(item)}
                    >
                      {item.icon && <span className="cmdk-icon">{item.icon}</span>}
                      <span className="cmdk-copy">
                        <span className="cmdk-label">{item.label}</span>
                        {item.hint && <span className="cmdk-hint">{item.hint}</span>}
                      </span>
                    </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
          </CommandList>
        <div className="cmdk-footer">
          <KbdGroup aria-label={t("palette.navigate")}><Kbd>↑</Kbd><Kbd>↓</Kbd></KbdGroup>
          <span>{t("palette.navigate")}</span><span aria-hidden="true">·</span>
          <Kbd>↵</Kbd><span>{t("palette.open")}</span><span aria-hidden="true">·</span>
          <Kbd>esc</Kbd><span>{t("palette.close")}</span>
        </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
