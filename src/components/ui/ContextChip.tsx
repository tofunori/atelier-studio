// ContextChip (plan 016) — pilule de contexte joint (fichier, sélection,
// image…). Geste signature approuvé (014) : apparition opacity +
// translateY(2px) en 140 ms (classe .entered posée après le premier frame).
// Si onRemove est fourni, removeLabel l'est aussi (nom accessible imposé).
import { useEffect, useState } from "react";
import { cx } from "./internal";

type RemovableProps =
  | { onRemove: () => void; removeLabel: string }
  | { onRemove?: undefined; removeLabel?: undefined };

export function ContextChip(
  props: {
    label: string;
    /** Nature du contexte (méta 10px majuscules : « sel. », « image »…). */
    kind?: string;
    /** Rend le libellé cliquable (aperçu du contenu). */
    onOpen?: () => void;
    title?: string;
    className?: string;
  } & RemovableProps,
) {
  const { label, kind, onOpen, title, className, onRemove, removeLabel } = props;
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span className={cx("ui-ctxchip", entered && "entered", className)} title={title}>
      {kind && <span className="kind">{kind}</span>}
      {onOpen ? (
        <button type="button" className="label" onClick={onOpen}>
          {label}
        </button>
      ) : (
        <span className="label">{label}</span>
      )}
      {onRemove && (
        <button type="button" aria-label={removeLabel} onClick={onRemove}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      )}
    </span>
  );
}
