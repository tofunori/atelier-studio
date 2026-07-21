import type { ProviderId } from "./settings";

const AGENT_ALIASES: Record<string, ProviderId> = {
  claude: "claude",
  codex: "codex",
  kimi: "kimi",
  grok: "grok",
  opencode: "opencode",
};

export type LinkedAgentMention = {
  provider: ProviderId;
  label: string;
  task: string;
};

export function parseLinkedAgentMention(prompt: string): LinkedAgentMention | null {
  const match = /(^|\s)@(Claude|Codex|Kimi|Grok|OpenCode)(?=\s|$|[.,!?;:])/i.exec(prompt);
  if (!match) return null;
  return {
    provider: AGENT_ALIASES[match[2].toLowerCase()],
    label: match[2],
    task: `${prompt.slice(0, match.index)}${match[1]}${prompt
      .slice(match.index + match[0].length)
      .replace(/^[.,!?;:]\s*/, "")}`.trim(),
  };
}
