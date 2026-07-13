import type { ReactNode } from "react";

export function JumpNavigation({ firstLabel, firstIcon, onFirst, lastLabel, lastIcon, onLast, lastControl }:
  { firstLabel: string; firstIcon: ReactNode; onFirst: () => void; lastLabel: string; lastIcon: ReactNode; onLast?: () => void; lastControl?: ReactNode }) {
  return (
    <nav className="ui-jumpnav" aria-label={lastLabel}>
      <button type="button" title={firstLabel} onClick={onFirst}>{firstIcon}<span>{firstLabel}</span></button>
      <span className="ui-jumpnav-separator" />
      {lastControl ?? (
        <button type="button" title={lastLabel} aria-label={lastLabel} onClick={onLast}>{lastIcon}</button>
      )}
    </nav>
  );
}
