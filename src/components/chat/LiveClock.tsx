import { useEffect, useState } from "react";
import { fmtClock } from "./clock";

/** Chrono qui défile à la seconde, au format unique des durées : commande en
 * cours dans le fil, temps du tour à côté du bouton Arrêter du compositeur. */
export function LiveClock({ since, className = "turn-activity-elapsed", label }: { since: number; className?: string; label?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const duration = fmtClock(Math.max(0, Date.now() - since));
  const aria = label ? `${label} : ${duration}` : undefined;
  return <span className={className} title={aria} aria-label={aria}>{duration}</span>;
}
