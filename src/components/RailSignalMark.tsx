// Coin d'une puce du rail (piste B, 2026-10-21) : l'anneau tourne pour un
// agent, un point pour le reste (lib/railSignals). Classes préfixées sig- :
// `.dot.unread` existe déjà ailleurs (vert) et repeignait le point.
import { SIGNAL_LABEL, type RailSignal } from "../lib/railSignals";

export { SIGNAL_LABEL };

export function RailSignalMark({ signal }: { signal: RailSignal | null | undefined }) {
  if (!signal) return null;
  if (signal === "run") {
    return (
      <svg className="rail-signal sig-run" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="4" className="trk" />
        <circle cx="6" cy="6" r="4" className="arc" />
      </svg>
    );
  }
  return <span className={`rail-signal sig-dot sig-${signal}`} aria-hidden="true" />;
}
