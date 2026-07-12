/**
 * SVG safe for display: strip scripts, event handlers, foreignObject, external refs.
 * Never execute project HTML/SVG in a privileged context.
 */

const FORBIDDEN_TAGS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "use", // can pull external
];

export function sanitizeSvg(raw: string): string {
  let s = raw;
  // remove XML entities that often hide scripts
  s = s.replace(/<!ENTITY[\s\S]*?>/gi, "");
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  for (const tag of FORBIDDEN_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    s = s.replace(re, "");
    s = s.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  // on* handlers
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // javascript: urls
  s = s.replace(/(href|xlink:href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
  // external http(s) in href/src — keep relative only for safety in companion
  s = s.replace(
    /(href|xlink:href|src)\s*=\s*("|')\s*https?:\/\/[^"']*\2/gi,
    '$1="#"',
  );
  return s;
}

export function isSvgSafeEnough(raw: string): boolean {
  const lower = raw.toLowerCase();
  if (lower.includes("<script")) return false;
  if (/on\w+\s*=/.test(lower)) return false;
  return true;
}
