import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { AgentEvent } from "../lib/ws";

const MODELS: Record<string, { id: string; label: string }[]> = {
  claude: [
    { id: "", label: "Modèle par défaut" },
    { id: "claude-fable-5", label: "Fable 5" },
    { id: "claude-opus-4-8", label: "Opus 4.8" },
    { id: "claude-sonnet-5", label: "Sonnet 5" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ],
  codex: [
    { id: "", label: "Modèle par défaut" },
    { id: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
    { id: "gpt-5.2", label: "GPT-5.2" },
    { id: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex mini" },
  ],
};

const EFFORTS: Record<string, string[]> = {
  claude: ["", "low", "medium", "high", "xhigh", "max"],
  codex: ["", "minimal", "low", "medium", "high", "xhigh"],
};

export default function Chat(p: {
  events: AgentEvent[];
  disabled: boolean;
  onSubmit: (
    prompt: string,
    provider: "claude" | "codex",
    model: string,
    effort: string,
  ) => void;
}) {
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  return (
    <div className="chat">
      <div className="messages">
        {p.events.length === 0 && (
          <div className="empty">Salut ! Comment je peux t'aider aujourd'hui ?</div>
        )}
        {p.events.map((e, i) => {
          if (e.kind === "text")
            return (
              <div key={i} className="msg">
                <ReactMarkdown>{e.text}</ReactMarkdown>
              </div>
            );
          if (e.kind === "tool")
            return (
              <div key={i} className="tool">
                🔧 {e.name}
              </div>
            );
          if (e.kind === "error")
            return (
              <div key={i} className="error">
                ⚠ {e.message}
              </div>
            );
          return (
            <div key={i} className="done">
              {e.ok ? "✓ terminé" : "✗ échec"}
            </div>
          );
        })}
      </div>
      <form
        className="composer"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!text.trim()) return;
          p.onSubmit(text, provider, model, effort);
          setText("");
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          disabled={p.disabled}
          rows={2}
          placeholder="Demande n'importe quoi — /skills et CLAUDE.md chargés"
        />
        <div className="composer-bar">
          <button type="button" className="ghost" title="Joindre (bientôt)">
            +
          </button>
          <span className="access">🛡 Full access</span>
          <span className="flex" />
          <span className="model-pick">
            <span className={`dot ${provider}`} />
            <select
              className="bare"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as any);
                setModel("");
                setEffort("");
              }}
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
            <select className="bare" value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS[provider].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              className="bare dim"
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
            >
              {EFFORTS[provider].map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl === "" ? "effort auto" : lvl}
                </option>
              ))}
            </select>
          </span>
          <button className="send" disabled={p.disabled} title="Envoyer">
            ↑
          </button>
        </div>
      </form>
    </div>
  );
}
