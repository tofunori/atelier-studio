// Helpers de mentions du composer (plan 015, slice 5) — déplacés VERBATIM
// depuis Chat.tsx : pilules @fichier et validation des /skills.
export function mentionLabel(path: string) {
  const clean = path.replace(/^@/, "").replace(/\/+$/, "");
  const name = clean.split("/").filter(Boolean).pop() ?? clean;
  return `@${name || clean}${path.endsWith("/") ? "/" : ""}`;
}

export function isValidSkill(token: string, commands: { name: string }[]): boolean {
  const name = token.replace(/^\//, "");
  return commands.some((cmd) => cmd.name === name);
}
