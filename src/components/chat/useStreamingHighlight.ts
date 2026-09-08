import { useEffect, useRef, useState } from "react";

/** Les grands blocs coûtent davantage à recolorer ; le texte reste immédiat. */
export function streamingHighlightDelay(length: number): number {
  return Math.min(1000, 160 + Math.max(0, length - 8000) * (840 / 72000));
}

/** Préfixe à colorer à cadence bornée. Le consommateur affiche le reste
 * échappé, de sorte que la coloration ne retarde jamais le texte ni la copie.
 * Un timer lit la dernière valeur, sans être repoussé par chaque token. */
export function useStreamingHighlight(raw: string, language: string, active: boolean): string {
  const [sample, setSample] = useState({ raw, language });
  const latest = useRef({ raw, language });
  latest.current = { raw, language };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!active) {
      if (timer.current != null) clearTimeout(timer.current);
      timer.current = null;
      return;
    }
    if (timer.current == null && (raw !== sample.raw || language !== sample.language)) {
      timer.current = setTimeout(() => {
        timer.current = null;
        setSample(latest.current);
      }, streamingHighlightDelay(raw.length));
    }
  }, [raw, language, active, sample]);
  useEffect(() => () => {
    if (timer.current != null) clearTimeout(timer.current);
  }, []);
  if (!active) return raw;
  if (language !== sample.language) return "";
  if (raw.startsWith(sample.raw)) return sample.raw;
  // ReactMarkdown ferme une fence partielle par un saut de ligne synthétique.
  // Le token suivant s'insère avant ce saut : garder la couleur du préfixe.
  const prefix = sample.raw.replace(/\n$/, "");
  return raw.startsWith(prefix) ? prefix : "";
}
