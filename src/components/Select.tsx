import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type SelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

type MenuPosition = {
  left: number;
  minWidth: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
  placement: "top" | "bottom";
};

export function Select(p: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  compact?: boolean;
  title?: string;
}) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selectedIndex = p.options.findIndex((opt) => opt.value === p.value);
  const selected = selectedIndex >= 0 ? p.options[selectedIndex] : null;

  function updatePosition() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 4;
    const edge = 8;
    const estimatedHeight = Math.min(Math.max(p.options.length * 32 + 8, 44), 360);
    const spaceBelow = viewportHeight - rect.bottom - edge;
    const spaceAbove = rect.top - edge;
    const placeBelow = spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove;
    const available = Math.max(80, (placeBelow ? spaceBelow : spaceAbove) - gap);
    const menuWidth = Math.min(Math.max(rect.width, 148), viewportWidth - edge * 2);
    const left = Math.min(Math.max(edge, rect.left), viewportWidth - edge - menuWidth);

    setPosition({
      left,
      minWidth: rect.width,
      maxHeight: Math.min(estimatedHeight, available),
      ...(placeBelow
        ? { top: rect.bottom + gap, placement: "bottom" as const }
        : { bottom: viewportHeight - rect.top + gap, placement: "top" as const }),
    });
  }

  function openMenu(index = selectedIndex >= 0 ? selectedIndex : 0) {
    updatePosition();
    setActiveIndex(Math.min(Math.max(index, 0), Math.max(p.options.length - 1, 0)));
    setOpen(true);
  }

  function choose(index: number) {
    const option = p.options[index];
    if (!option) return;
    if (option.value !== p.value) p.onChange(option.value);
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, Math.max(p.options.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        choose(activeIndex);
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, activeIndex, p.options, p.value]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [selectedIndex, open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector(".custom-select-option.active")?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const label = selected?.label ?? p.value;

  return (
    <span className={`custom-select ${p.compact ? "compact" : ""}`} data-value={p.value}>
      <button
        ref={buttonRef}
        type="button"
        className="custom-select-trigger"
        title={p.title}
        aria-label={p.title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={(event) => {
          if (open) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <span className="custom-select-label">
          {selected?.icon && <span className="custom-select-icon">{selected.icon}</span>}
          <span>{label}</span>
        </span>
        <svg className="custom-select-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.2 3.7 5 6.5l2.8-2.8" />
        </svg>
      </button>
      {open && position && (
        <div
          ref={menuRef}
          id={`${id}-menu`}
          className={`custom-select-menu ${position.placement}`}
          role="listbox"
          style={{
            left: position.left,
            minWidth: position.minWidth,
            maxHeight: position.maxHeight,
            top: position.top,
            bottom: position.bottom,
          }}
        >
          {p.options.map((option, index) => {
            const selectedOption = option.value === p.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selectedOption}
                className={`custom-select-option ${activeIndex === index ? "active" : ""} ${option.icon ? "has-icon" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span className="custom-select-check" aria-hidden="true">
                  {selectedOption && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.2 6.1 4.8 8.7 9.8 3.4" />
                    </svg>
                  )}
                </span>
                {option.icon && <span className="custom-select-option-icon">{option.icon}</span>}
                <span className="custom-select-option-label">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
