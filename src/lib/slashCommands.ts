export const ATELIER_NATIVE_SLASH_COMMANDS = [
  "goal",
  "loop",
  "clear",
  "compact",
  "review",
  "context",
  "status",
  "model",
  "permissions",
  "plan",
  "diff",
  "usage",
] as const;

export type AtelierNativeSlashCommand = (typeof ATELIER_NATIVE_SLASH_COMMANDS)[number];

export type ParsedSlashCommand = {
  name: AtelierNativeSlashCommand;
  args: string;
  raw: string;
};

const NATIVE_COMMANDS = new Set<string>(ATELIER_NATIVE_SLASH_COMMANDS);

/** Parse uniquement les commandes natives Atelier. Les skills `/nom` restent
 * du texte destiné au provider et ne sont donc jamais interceptés ici. */
export function parseNativeSlashCommand(input: string): ParsedSlashCommand | null {
  const raw = input.trim();
  const match = /^\/([\w:-]+)(?:\s+([\s\S]*))?$/.exec(raw);
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (!NATIVE_COMMANDS.has(name)) return null;
  return {
    name: name as AtelierNativeSlashCommand,
    args: (match[2] ?? "").trim(),
    raw,
  };
}

export function permissionModeFromSlash(value: string): string | null {
  switch (value.trim().toLowerCase()) {
    case "full":
    case "full-access":
    case "bypass":
    case "bypasspermissions":
      return "bypassPermissions";
    case "edits":
    case "accept-edits":
    case "acceptedits":
      return "acceptEdits";
    case "ask":
    case "default":
    case "auto":
      return "default";
    case "plan":
    case "read-only":
    case "readonly":
      return "plan";
    default:
      return null;
  }
}
