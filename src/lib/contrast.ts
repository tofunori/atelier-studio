// Contraste WCAG 2.x entre couleurs hex (#rrggbb). Sert aux rôles de texte
// dérivés des palettes (themes.ts) et au test de contraste des presets.

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = ([r, g, b]: Rgb) =>
  "#" + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("");

export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return NaN;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mélange linéaire sRGB : t = 0 → a, t = 1 → b (comme color-mix in srgb). */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex([0, 1, 2].map((i) => ca[i] + (cb[i] - ca[i]) * t) as Rgb);
}

/** Teinte HSL en degrés (0–360). */
export function hueOf(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return NaN;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export const hueDistance = (a: string, b: string) => {
  const d = Math.abs(hueOf(a) - hueOf(b)) % 360;
  return d > 180 ? 360 - d : d;
};

/** Rapproche `color` de `toward` (par pas de 2 %) jusqu'à atteindre `ratio`
 * sur chacun des fonds. Rend `color` inchangée si elle passe déjà, et ne
 * touche jamais une valeur non hex (variable CSS, color-mix…). */
export function ensureContrast(color: string, toward: string, backgrounds: string[], ratio = 4.5): string {
  if (!parseHex(color) || !parseHex(toward)) return color;
  const fonds = backgrounds.filter((bg) => parseHex(bg));
  const passes = (c: string) => fonds.every((bg) => contrast(c, bg) >= ratio);
  for (let step = 0; step <= 50; step++) {
    const candidate = step === 0 ? color : mixHex(color, toward, step / 50);
    if (passes(candidate)) return candidate;
  }
  return toward;
}
