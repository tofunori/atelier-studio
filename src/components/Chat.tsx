import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { open } from "@tauri-apps/plugin-dialog";
import { AgentEvent } from "../lib/ws";
import { ProviderIcon } from "./icons";

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
    { id: "claude-sonnet-5[1m]", label: "Sonnet 5 · 1M" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ],
  codex: [
    { id: "", label: "Modèle par défaut" },
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    { id: "gpt-5.3-codex-spark", label: "Codex Spark" },
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

function isValidSkill(token: string, commands: { name: string }[]): boolean {
  const name = token.replace(/^\//, "");
  return commands.some((cmd) => cmd.name === name);
}

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
  layout: "split" | "chat" | "atelier";
  onToggleExpand: () => void;
  usage: { context: number; output: number; cost: number | null; turns: number | null } | null;
  onRevert: (index: number, text: string, edit: boolean) => void;
  onFork: (index: number) => void;
  onEditSend: (index: number, oldText: string, newText: string) => void;
  defaults: {
    defaultProvider: "claude" | "codex";
    defaultModel: { claude: string; codex: string };
    defaultEffort: { claude: string; codex: string };
    defaultPermissionMode: string;
    timeFormat?: "system" | "24h" | "12h";
    customModels?: { provider: "claude" | "codex"; id: string }[];
    modelEfforts?: Record<string, string>;
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
  const taRef = useRef<HTMLTextAreaElement>(null);
  // resync la hauteur quand le texte change autrement que par frappe
  // (suggestion appliquée, envoi qui vide la boîte…)
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [text]);
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [permissionMode, setPermissionMode] = useState("bypassPermissions");

  function effortFor(pv: "claude" | "codex", modelId: string): string {
    return (
      p.defaults.modelEfforts?.[pv + ":" + modelId] ??
      p.defaults.defaultEffort[pv] ??
      ""
    );
  }

  // appliquer les défauts des réglages (au montage et quand ils changent)
  useEffect(() => {
    const pv = p.defaults.defaultProvider;
    const m = p.defaults.defaultModel[pv] ?? "";
    setProvider(pv);
    setModel(m);
    setEffort(effortFor(pv, m));
    setPermissionMode(p.defaults.defaultPermissionMode);
  }, [p.defaults]);
  const [selIdx, setSelIdx] = useState(0);
  const [quote, setQuote] = useState<{ x: number; y: number; text: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [favModels, setFavModels] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("atelier-studio.favModels") ?? "[]"); }
    catch { return []; }
  });
  function toggleFavModel(key: string) {
    setFavModels((f) => {
      const n = f.includes(key) ? f.filter((x) => x !== key) : [...f, key];
      localStorage.setItem("atelier-studio.favModels", JSON.stringify(n));
      return n;
    });
  }
  function modelsFor(pv: "claude" | "codex") {
    const customs = (p.defaults.customModels ?? [])
      .filter((m) => m.provider === pv)
      .map((m) => ({ id: m.id, label: m.id }));
    return [...MODELS[pv], ...customs];
  }
  function sortByFav<T extends { id: string }>(list: T[], prov: string): T[] {
    return [...list].sort((a, b) => {
      const fa = favModels.includes(prov + ":" + a.id) ? 0 : 1;
      const fb = favModels.includes(prov + ":" + b.id) ? 0 : 1;
      return fa - fb;
    });
  }

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);
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
      <button className="expand-btn" title={p.layout === "chat" ? "Restaurer le split (⌘0)" : "Chat pleine largeur (⌘1)"}
        onClick={p.onToggleExpand}>
        {p.layout === "chat" ? (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M6 2H2v4M10 14h4v-4M2 6l4-4M14 10l-4 4"/></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 6V2h4M14 10v4h-4M2 2l4.5 4.5M14 14l-4.5-4.5"/></svg>
        )}
      </button>
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
                  <div className="user-bubble">
                    {(() => {
                      const m = /^(\/[\w:-]+)([\s\S]*)$/.exec(e.text);
                      if (m && isValidSkill(m[1], p.commands)) {
                        return (
                          <>
                            <span className="slash-cmd">{m[1]}</span>
                            {m[2]}
                          </>
                        );
                      }
                      return e.text;
                    })()}
                  </div>
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
                  <button title="Fork : nouveau chat à partir d'ici" onClick={() => p.onFork(i)}>⑂</button>
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
        <div className="ta-wrap">
        <div className="ta-backdrop" aria-hidden="true">
          {(() => {
            const m = /^(\/[\w:-]+)([\s\S]*)$/.exec(text);
            if (m && isValidSkill(m[1], p.commands)) {
              return (
                <>
                  <span className="slash-cmd-inline">{m[1]}</span>
                  {m[2]}
                </>
              );
            }
            return text;
          })()}
        </div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onScroll={(e) => {
            const bd = e.currentTarget.parentElement?.querySelector(".ta-backdrop");
            if (bd) bd.scrollTop = e.currentTarget.scrollTop;
          }}
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
        </div>
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
          {p.usage && (
            <span className="ctx-ring-wrap">
              {(() => {
                const WINDOW = model.includes("[1m]") ? 1_000_000 : 200_000;
                const pct = Math.min(100, Math.round((p.usage.context / WINDOW) * 100));
                const r = 6.5, c = 2 * Math.PI * r;
                return (
                  <>
                    <svg className="ctx-ring" width="18" height="18" viewBox="0 0 18 18">
                      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--bg-ctl)" strokeWidth="2.4" />
                      <circle cx="9" cy="9" r={r} fill="none"
                        stroke={pct > 80 ? "#e06c75" : pct > 60 ? "#e0b74a" : "var(--muted)"}
                        strokeWidth="2.4" strokeLinecap="round"
                        strokeDasharray={`${(pct / 100) * c} ${c}`}
                        transform="rotate(-90 9 9)" />
                    </svg>
                    <span className="ctx-pop">
                      <b>Fenêtre de contexte</b>
                      <span>{pct}% · {Math.round(p.usage.context / 1000)}k / {WINDOW === 1_000_000 ? "1M" : "200k"} utilisés</span>
                      <span>Sortie dernier tour : {Math.round(p.usage.output / 1000 * 10) / 10}k tokens</span>
                      {p.usage.turns != null && <span>Tours de session : {p.usage.turns}</span>}
                      {p.usage.cost != null && <span>Coût session : ${p.usage.cost.toFixed(2)}</span>}
                    </span>
                  </>
                );
              })()}
            </span>
          )}
          <span className="model-pick" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="mp-btn"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <ProviderIcon provider={provider} />
              <span>{modelsFor(provider).find((m) => m.id === model)?.label ?? "Modèle par défaut"}</span>
              <span className="mp-dim">{effort === "" ? "auto" : effort}</span>
            </button>
            {menuOpen && (
              <div className="mp-menu">
                {(["claude", "codex"] as const).map((pv, pi) => (
                  <div key={pv}>
                    {pi > 0 && <div className="mp-sep" />}
                    <div className="mp-hd">
                      <ProviderIcon provider={pv} size={11} /> {pv === "claude" ? "Claude" : "Codex"}
                    </div>
                    {sortByFav(modelsFor(pv), pv).map((m) => {
                      const key = pv + ":" + m.id;
                      const active = provider === pv && model === m.id;
                      const fav = favModels.includes(key);
                      return (
                        <div
                          key={key}
                          className="mp-item"
                          onClick={() => {
                            setProvider(pv);
                            setModel(m.id);
                            setEffort(effortFor(pv, m.id));
                          }}
                        >
                          <ProviderIcon provider={pv} />
                          <span>{m.label}</span>
                          <span className="mp-end">
                            {active && <span className="mp-check">✓</span>}
                            <span
                              className={`mp-star ${fav ? "on" : ""}`}
                              title={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
                              onClick={(e) => { e.stopPropagation(); toggleFavModel(key); }}
                            >
                              {fav ? "★" : "☆"}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="mp-sep" />
                <div className="mp-hd">Effort</div>
                {EFFORTS[provider].map((lvl) => (
                  <div key={lvl} className="mp-item" onClick={() => setEffort(lvl)}>
                    <span>{lvl === "" ? "Auto (défaut)" : lvl.charAt(0).toUpperCase() + lvl.slice(1)}</span>
                    {effort === lvl && <span className="mp-check">✓</span>}
                  </div>
                ))}
              </div>
            )}
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
