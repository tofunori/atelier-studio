import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { open } from "@tauri-apps/plugin-dialog";
import { AgentEvent } from "../lib/ws";

const PERMISSION_MODES = [
  { id: "bypassPermissions", label: "Full access" },
  { id: "acceptEdits", label: "Accept edits" },
  { id: "default", label: "Ask (default)" },
  { id: "plan", label: "Plan mode" },
];

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

function fmtTime(ts: number, fmt?: "system" | "24h" | "12h") {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (fmt === "24h") opts.hour12 = false;
  if (fmt === "12h") opts.hour12 = true;
  return new Date(ts).toLocaleTimeString([], opts);
}

function Working({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(1, Math.round((Date.now() - since) / 1000));
  return (
    <div className="working">
      <span className="working-label">Working</span> for {secs}s
    </div>
  );
}

type Suggestion = { insert: string; label: string; hint?: string };

function PinBtn({ pinned, onClick }: { pinned: boolean; onClick: () => void }) {
  return (
    <button title={pinned ? "Désépingler le chapitre" : "Épingler comme chapitre"} onClick={onClick}
      style={pinned ? { color: "#e8823a" } : undefined}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M9.5 2.5l4 4-3 1-2.5 4.5-4-4L8.5 5.5l1-3z" />
        <path d="M5.5 10.5L2.5 13.5" />
      </svg>
    </button>
  );
}

export default function Chat(p: {
  events: AgentEvent[];
  workingSince: number | null;
  commands: { name: string; source: string }[];
  files: string[];
  injectText: string | null;
  onInjected: () => void;
  attachments: { name: string; lines: string | null; text: string; imageUrl?: string }[];
  onRemoveAttachment: (index: number) => void;
  onQuote: (text: string) => void;
  onPasteImage: (dataURL: string) => void;
  onStop: () => void;
  onRevert: (index: number, text: string, edit: boolean) => void;
  onEditSend: (index: number, oldText: string, newText: string) => void;
  defaults: {
    defaultProvider: "claude" | "codex";
    defaultModel: { claude: string; codex: string };
    defaultEffort: { claude: string; codex: string };
    defaultPermissionMode: string;
    timeFormat?: "system" | "24h" | "12h";
  };
  pins: { index: number; label: string }[];
  onTogglePin: (index: number, label: string) => void;
  disabled: boolean;
  onSubmit: (
    prompt: string,
    provider: "claude" | "codex",
    model: string,
    effort: string,
    permissionMode: string,
    mode: "steer" | "queue",
  ) => void;
}) {
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [permissionMode, setPermissionMode] = useState("bypassPermissions");

  // appliquer les défauts des réglages (au montage et quand ils changent)
  useEffect(() => {
    setProvider(p.defaults.defaultProvider);
    setModel(p.defaults.defaultModel[p.defaults.defaultProvider] ?? "");
    setEffort(p.defaults.defaultEffort[p.defaults.defaultProvider] ?? "");
    setPermissionMode(p.defaults.defaultPermissionMode);
  }, [p.defaults]);
  const [selIdx, setSelIdx] = useState(0);
  const [quote, setQuote] = useState<{ x: number; y: number; text: string } | null>(null);
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);

  // « Add to chat » sur sélection de texte dans les messages
  function onMessagesMouseUp() {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!text || !sel || sel.rangeCount === 0) {
        setQuote(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setQuote({ x: rect.left + rect.width / 2, y: rect.top, text });
    }, 0);
  }

  // texte injecté depuis l'extérieur (annotation atelier, sélection…)
  useEffect(() => {
    if (p.injectText != null) {
      setText(p.injectText);
      p.onInjected();
    }
  }, [p.injectText]);

  // autocomplétion : "/xxx" en début de message → skills ; "@xxx" (dernier mot) → fichiers
  let suggestions: Suggestion[] = [];
  const slashMatch = /^\/([\w:-]*)$/.exec(text);
  const atMatch = /(^|\s)@([\w./-]*)$/.exec(text);
  if (slashMatch) {
    const q = slashMatch[1].toLowerCase();
    suggestions = p.commands
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 12)
      .map((c) => ({ insert: `/${c.name} `, label: `/${c.name}`, hint: c.source }));
  } else if (atMatch) {
    const q = atMatch[2].toLowerCase();
    suggestions = p.files
      .filter((f) => f.toLowerCase().includes(q))
      .slice(0, 12)
      .map((f) => ({
        insert: text.slice(0, atMatch.index) + atMatch[1] + `@${f} `,
        label: f,
      }));
  }

  function applySuggestion(s: Suggestion) {
    setText(s.insert);
    setSelIdx(0);
  }

  async function attachFiles() {
    const picked = await open({ multiple: true });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${paths.map((p) => `@${p}`).join(" ")} `);
  }
  return (
    <div className="chat">
      <div className="messages" onMouseUp={onMessagesMouseUp}>
        {p.events.length === 0 && (
          <div className="empty">Salut ! Comment je peux t'aider aujourd'hui ?</div>
        )}
        {p.events.map((e, i) => {
          if (e.kind === "user")
            return (
              <div key={i} id={`msg-${i}`} className="user-wrap">
                {e.imageUrl && <img className="user-img" src={e.imageUrl} alt="" />}
                {e.label && <div className="user-label">{e.label}</div>}
                {editing?.index === i ? (
                  <div className="edit-box">
                    <textarea
                      autoFocus
                      value={editing.text}
                      rows={Math.min(8, Math.max(2, editing.text.split("\n").length))}
                      onChange={(ev) => setEditing({ index: i, text: ev.target.value })}
                      onKeyDown={(ev) => {
                        if (ev.key === "Escape") setEditing(null);
                        if (ev.key === "Enter" && !ev.shiftKey) {
                          ev.preventDefault();
                          if (editing.text.trim()) {
                            p.onEditSend(i, e.text, editing.text);
                            setEditing(null);
                          }
                        }
                      }}
                    />
                    <div className="edit-actions">
                      <button type="button" className="edit-cancel" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="edit-send"
                        onClick={() => {
                          if (editing.text.trim()) {
                            p.onEditSend(i, e.text, editing.text);
                            setEditing(null);
                          }
                        }}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="user-bubble">{e.text}</div>
                )}
                <div className="msg-actions">
                  {e.ts && (
                    <span className="msg-time">
                      {fmtTime(e.ts, p.defaults.timeFormat)}
                    </span>
                  )}
                  <button title="Copier" onClick={() => navigator.clipboard.writeText(e.text)}>⧉</button>
                  <button title="Éditer et renvoyer" onClick={() => setEditing({ index: i, text: e.text })}>✎</button>
                  <button title="Revert : rembobiner avant ce message" onClick={() => p.onRevert(i, e.text, false)}>↩</button>
                  <PinBtn pinned={p.pins.some((c) => c.index === i)} onClick={() => p.onTogglePin(i, e.text.slice(0, 44))} />
                </div>
              </div>
            );
          if (e.kind === "text")
            return (
              <div key={i} id={`msg-${i}`} className="msg-wrap">
                <div className="msg">
                  <ReactMarkdown>{e.text}</ReactMarkdown>
                </div>
                <div className="msg-actions">
                  {"ts" in e && e.ts && (
                    <span className="msg-time">
                      {fmtTime(e.ts, p.defaults.timeFormat)}
                    </span>
                  )}
                  <button title="Copier" onClick={() => navigator.clipboard.writeText(e.text)}>⧉</button>
                  <PinBtn pinned={p.pins.some((c) => c.index === i)} onClick={() => p.onTogglePin(i, e.text.replace(/[#*>`]/g, "").trim().slice(0, 44))} />
                </div>
              </div>
            );
          if (e.kind === "tool")
            return (
              <div key={i} className="tool">
                <span className="tool-tick">▸</span> {e.name}
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
        {p.workingSince != null && (
          <div className="working-row">
            <Working since={p.workingSince} />
            <button type="button" className="stop-btn" title="Interrompre" onClick={p.onStop}>
              ■ Stop
            </button>
          </div>
        )}
      </div>
      {p.pins.length > 0 && (
        <div className="chapters">
          {p.pins.map((c) => (
            <div
              key={c.index}
              className="chapter-tick"
              title={c.label}
              onClick={() =>
                document.getElementById(`msg-${c.index}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <span className="chapter-bar" />
              <span className="chapter-label">{c.label}</span>
            </div>
          ))}
        </div>
      )}
      {quote && (
        <button
          className="quote-pill"
          style={{ left: quote.x, top: quote.y - 40 }}
          onMouseDown={(e) => {
            e.preventDefault();
            p.onQuote(quote.text);
            setQuote(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z" />
          </svg>
          &nbsp;Add to chat
        </button>
      )}
      <form
        className="composer"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!text.trim()) return;
          p.onSubmit(text, provider, model, effort, permissionMode, "steer");
          setText("");
        }}
      >
        {suggestions.length > 0 && (
          <ul className="suggest">
            {suggestions.map((s, i) => (
              <li
                key={s.label}
                className={i === selIdx ? "sel" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
              >
                <span>{s.label}</span>
                {s.hint && <span className="hint">{s.hint}</span>}
              </li>
            ))}
          </ul>
        )}
        {p.attachments.length > 0 && (
          <div className="chips-row">
            {p.attachments.map((a, i) =>
              a.imageUrl ? (
                <div key={i} className="img-chip">
                  <img src={a.imageUrl} alt={a.name} />
                  <button type="button" className="img-chip-x" onClick={() => p.onRemoveAttachment(i)}>
                    ✕
                  </button>
                  <span className="img-chip-name">{a.name}</span>
                </div>
              ) : (
                <div key={i} className="chip">
                  <span className="chip-label">{a.name}</span>
                  {a.lines && <span className="chip-lines">(lines {a.lines})</span>}
                  <button type="button" className="ghost" onClick={() => p.onRemoveAttachment(i)}>
                    ✕
                  </button>
                </div>
              ),
            )}
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            for (const item of e.clipboardData.items) {
              if (item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;
                const reader = new FileReader();
                reader.onload = () => p.onPasteImage(String(reader.result));
                reader.readAsDataURL(file);
                return;
              }
            }
          }}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelIdx((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
                applySuggestion(suggestions[Math.min(selIdx, suggestions.length - 1)]);
                return;
              }
              if (e.key === "Escape") {
                setText((t) => t + " ");
                return;
              }
            }
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
          <button type="button" className="ghost" title="Joindre des fichiers" onClick={attachFiles}>
            +
          </button>
          <select
            className="bare access"
            value={permissionMode}
            onChange={(e) => setPermissionMode(e.target.value)}
          >
            {PERMISSION_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
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
          {p.workingSince != null ? (
            <>
              <button
                type="button"
                className="queue-btn"
                disabled={p.disabled || !text.trim()}
                title="Mettre en file : envoyé après le tour en cours"
                onClick={() => {
                  if (!text.trim()) return;
                  p.onSubmit(text, provider, model, effort, permissionMode, "queue");
                  setText("");
                }}
              >
                ⏱ Queue
              </button>
              <button className="send steer" disabled={p.disabled} title="Steer : injecté immédiatement dans le tour en cours">
                ↑
              </button>
            </>
          ) : (
            <button className="send" disabled={p.disabled} title="Envoyer">
              ↑
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
