import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { AgentEvent } from "../lib/ws";

export default function Chat(p: {
  events: AgentEvent[];
  disabled: boolean;
  onSubmit: (prompt: string, provider: "claude" | "codex") => void;
}) {
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
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
        className="input"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!text.trim()) return;
          p.onSubmit(text, provider);
          setText("");
        }}
      >
        <select value={provider} onChange={(e) => setProvider(e.target.value as any)}>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={p.disabled}
          placeholder="Demande quelque chose…"
        />
        <button disabled={p.disabled}>↑</button>
      </form>
    </div>
  );
}
