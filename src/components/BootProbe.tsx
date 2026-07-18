import { useLayoutEffect } from "react";
import { markBootMetric, persistBootMetrics } from "../lib/bootMetrics";

export function BootProbe() {
  useLayoutEffect(() => {
    markBootMetric("reactCommitted");
    // Persiste le commit même si WebKit suspend requestAnimationFrame lorsque
    // la fenêtre est lancée en arrière-plan (diagnostic, pas faux first paint).
    void persistBootMetrics();
    const frame = requestAnimationFrame(() => {
      markBootMetric("firstMeaningfulPaint");
      void persistBootMetrics();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
