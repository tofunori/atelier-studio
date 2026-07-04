// Icônes providers — approximations sobres (starburst Anthropic, nœud OpenAI)

export function ClaudeIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="#d97757" strokeWidth="1.6" strokeLinecap="round">
      <path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4L3.4 12.6" />
    </svg>
  );
}

export function CodexIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="#c8cdd4" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9L8 1.8z" />
      <path d="M8 5.2l2.4 1.4v2.8L8 10.8 5.6 9.4V6.6L8 5.2z" />
    </svg>
  );
}

export function ProviderIcon({ provider, size = 13 }: { provider: string; size?: number }) {
  return provider === "codex" ? <CodexIcon size={size} /> : <ClaudeIcon size={size} />;
}
