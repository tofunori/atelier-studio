/** The UI scale is independent from chat prose and editor font settings.
 * Small labels stop shrinking before they become difficult to read. */
export function interfaceTypography(baseSize: number): Record<string, string> {
  const base = Number.isFinite(baseSize) ? Math.min(18, Math.max(12, baseSize)) : 15;
  // pixel entier et au moins 1 px entre deux niveaux (audit TRANS-30) : pas
  // de 11,2 px indiscernable de 11, ni de niveaux qui fusionnent en petit
  let previous = 0;
  const step = (normal: number, minimum: number) => {
    previous = Math.max(previous + 1, minimum, Math.round(normal * base / 15));
    return previous;
  };
  const [xs, s, m, l, xl] = [step(10, 10), step(11, 11), step(12, 11), step(13, 12), step(15, 13)];
  const displayS = step(18, 16), display = step(20, 18);
  const px = (value: number) => `${value}px`;
  return {
    "--fs-xs": px(xs),
    "--fs-s": px(s),
    "--fs-m": px(m),
    "--fs-l": px(l),
    "--fs-xl": px(xl),
    "--fs-caption": px(xs),
    "--fs-label": px(s),
    "--fs-body-s": px(m),
    "--fs-body": px(l),
    "--fs-title": px(xl),
    "--fs-display-s": px(displayS),
    "--fs-display": px(display),
    "--ui-base-size": `${base}px`,
  };
}

/** Read the shell's effective contract, including reduced-motion overrides.
 * Embedded views must not invent their own geometry or animation durations. */
export function interfaceGeometry(style: Pick<CSSStyleDeclaration, "getPropertyValue">): Record<string, string> {
  return Object.fromEntries([
    "--radius-control", "--radius-surface", "--control-height", "--control-height-compact",
    "--surface-header-height", "--motion-fast", "--motion-standard", "--motion-panel",
    "--ease-out", "--elevation-overlay", "--elev-soft", "--focus-ring-color",
    "--focus-ring-width", "--focus-ring-offset",
  ].map((name) => [name, style.getPropertyValue(name).trim()]).filter(([, value]) => value));
}

/** Remplissage des actions (tokens.css, 2026-10-21) : les éditeurs reçoivent
 * la valeur RÉSOLUE du shell, pour qu'un changement d'option (relief, accent
 * plein, accent doux) ne se règle qu'à un seul endroit, tokens.css. */
export const FILL_ROLES = [
  "--fill-primary", "--fill-primary-hover", "--on-fill-primary",
  "--fill-secondary", "--fill-secondary-hover", "--fill-secondary-ring",
] as const;

export function interfaceFills(style: Pick<CSSStyleDeclaration, "getPropertyValue">): Record<string, string> {
  return Object.fromEntries(FILL_ROLES
    .map((name) => [name, style.getPropertyValue(name).trim()]).filter(([, value]) => value));
}
