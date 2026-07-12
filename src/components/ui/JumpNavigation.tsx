import type { ReactNode } from "react";

export function JumpNavigation({ firstLabel, firstIcon, onFirst, lastLabel, lastIcon, onLast }:
  { firstLabel: string; firstIcon: ReactNode; onFirst: () => void; lastLabel: string; lastIcon: ReactNode; onLast: () => void }) {
  return (
    <nav className="ui-jumpnav" aria-label={lastLabel}>
      <button type="button" title={firstLabel} onClick={onFirst}>{firstIcon}<span>{firstLabel}</span></button>
      <span className="ui-jumpnav-separator" />
      <button type="button" title={lastLabel} aria-label={lastLabel} onClick={onLast}>{lastIcon}</button>
    </nav>
  );
}
