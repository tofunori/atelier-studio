/** The UI scale is independent from chat prose and editor font settings.
 * Small labels stop shrinking before they become difficult to read. */
export function interfaceTypography(baseSize: number): Record<string, string> {
  const base = Number.isFinite(baseSize) ? Math.min(18, Math.max(12, baseSize)) : 15;
  const size = (normal: number, minimum: number) => `${Math.max(minimum, normal * base / 15).toFixed(2)}px`;
  return {
    "--fs-xs": size(10, 10),
    "--fs-s": size(11, 11),
    "--fs-m": size(12, 11),
    "--fs-l": size(13, 12),
    "--fs-xl": size(15, 13),
    "--fs-caption": size(10, 10),
    "--fs-label": size(11, 11),
    "--fs-body-s": size(12, 11),
    "--fs-body": size(13, 12),
    "--fs-title": size(15, 13),
    "--fs-display-s": size(18, 16),
    "--fs-display": size(20, 18),
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
