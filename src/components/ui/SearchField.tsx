// SearchField (A5, SHELL-25 / SET-13) — LE champ de recherche d'Atelier.
// Explorateur, conversations du projet, « Reprendre une session » et
// Réglages partageaient quatre dessins (hauteur, contour, marge, loupe ou
// pas). Ici : Input shadcn + loupe 13 px à gauche, fond --surface-inset,
// contour --border-interactive, rayon 6, hauteur --control-height, focus =
// l'anneau commun. La géométrie de placement (marges) reste au parent, via
// `className` sur l'enveloppe ; `inputClassName` ne sert qu'aux sélecteurs
// de test ou de comportement.
import React from "react";
import { Input } from "../shadcn/input";
import { SearchIcon } from "../icons";
import { cx } from "./internal";

export type SearchFieldProps = Omit<React.ComponentProps<"input">, "type" | "ref"> & {
  /** Classe de l'enveloppe (placement, marges). */
  className?: string;
  /** Classe ajoutée au champ lui-même. */
  inputClassName?: string;
};

export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  function SearchField({ className, inputClassName, ...rest }, ref) {
    return (
      <span className={cx("ui-search", className)}>
        <span className="ui-search-icon" aria-hidden="true"><SearchIcon size={13} /></span>
        <Input {...rest} ref={ref} type="search" className={cx("ui-search-input", inputClassName)} />
      </span>
    );
  },
);
