// Spinner (A11, TRANS-08 / SHELL-12) — LE seul indicateur « ça travaille »
// d'Atelier : un arc de 270° au trait 1,5 en currentColor, qui tourne au
// tempo unique --motion-spin (.ui-spin, primitives.css, coupé sous
// prefers-reduced-motion). Il remplace l'anneau CSS doublé d'un arc lucide du
// bouton en chargement, les roues de la liste des fils, de Savoirs, des
// articles, du reviewer et des avis du chat, chacune à sa vitesse.
// La couleur vient du parent (currentColor) ; la taille de `size` ou d'une
// classe (la CSS l'emporte sur les attributs width/height).
import type { ComponentProps } from "react";
import { cx } from "./internal";
import { t } from "../../lib/i18n";

export type SpinnerProps = Omit<ComponentProps<"svg">, "children"> & {
  size?: number;
  /** Nom accessible ; sans lui (et sans aria-label), l'arc est décoratif. */
  label?: string;
};

export function Spinner({ size = 16, label, className, ...rest }: SpinnerProps) {
  const named = label ?? rest["aria-label"];
  const hidden = rest["aria-hidden"] === true || rest["aria-hidden"] === "true";
  return (
    <svg
      data-slot="spinner"
      role={hidden ? undefined : "status"}
      aria-label={hidden ? undefined : named ?? t("action.loading")}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      {...rest}
      className={cx("ui-spin", className)}
    >
      <path d="M8 2a6 6 0 1 0 6 6" />
    </svg>
  );
}
