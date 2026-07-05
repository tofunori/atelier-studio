import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AgentEvent } from "../lib/ws";
import { eventLabel, t } from "../lib/i18n";
import {
  CloseIcon,
  CollapseIcon,
  CopyIcon,
  ExpandIcon,
  ForkIcon,
  PlusIcon,
  ProviderIcon,
  ResumeIcon,
} from "./icons";

const PERMISSION_MODES = [
  { id: "bypassPermissions", labelKey: "permission.full" },
  { id: "acceptEdits", labelKey: "permission.accept-edits" },
  { id: "default", labelKey: "action.ask-default" },
  { id: "plan", labelKey: "permission.plan" },
];

const MODELS: Record<string, { id: string; label: string }[]> = {
  claude: [
    { id: "", label: "__default" },
    { id: "claude-fable-5", label: "Fable 5" },
    { id: "claude-opus-4-8", label: "Opus 4.8" },
    { id: "claude-sonnet-5", label: "Sonnet 5" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ],
  codex: [
    { id: "", label: "__default" },
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

// réf. fichier type "main.tex:31", "sections/method.tex:60-74", "script.py"
const FILE_REF = /^[\w~./-]*[\w-]\.(tex|py|jl|md|r|R|bib|json|toml|yaml|yml|sh|js|ts|tsx|jsx|css|html|txt|csv|sql|rs|mjs|ipynb)(:\d+(?:-\d+)?)?$/;

function openFileRef(ref: string) {
  const m = /^(.+?)(?::(\d+(?:-\d+)?))?$/.exec(ref.trim());
  if (!m) return;
  window.dispatchEvent(new CustomEvent("chat-open-file", { detail: { rel: m[1], line: m[2] ?? null } }));
}

// texte complet des enfants markdown (string, tableau, éléments imbriqués)
function mdText(children: any): string {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(mdText).join("");
  if (typeof children === "object" && children.props) return mdText(children.props.children);
  return "";
}

// composants markdown : liens externes stylés + réfs fichier:ligne cliquables
const MD_COMPONENTS = {
  pre: (props: any) => {
    const child = props.children?.props ?? {};
    const lang = /language-(\w+)/.exec(String(child.className ?? ""))?.[1] ?? "";
    const raw = mdText(child.children);
    return (
      <div className="codeblock">
        <div className="codeblock-bar">
          <span className="codeblock-lang">{lang}</span>
          <button type="button" className="codeblock-copy"
            onClick={(e) => {
              navigator.clipboard.writeText(raw);
              const b = e.currentTarget; b.textContent = t("chat.output-copied");
              setTimeout(() => { b.textContent = t("chat.output-copy"); }, 1200);
            }}>{t("chat.output-copy")}</button>
        </div>
        <pre>{props.children}</pre>
      </div>
    );
  },
  table: (props: any) => (
    <div className="md-table"><table>{props.children}</table></div>
  ),
  a: (props: any) => {
    const label = mdText(props.children);
    const href = String(props.href ?? "");
    const ref = FILE_REF.test(label) ? label : FILE_REF.test(href) ? href : null;
    if (ref)
      return (
        <button className="file-ref" onClick={() => openFileRef(ref)} title={t("action.open-file", { ref })}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1.8h5.2L13 5.6v8.6H4z" /><path d="M9 1.8v4h4" />
          </svg>
          {label}
        </button>
      );
    return (
      <a
        className="md-link"
        href={href}
        onClick={(e) => { e.preventDefault(); if (/^https?:/.test(href)) openUrl(href); }}
      >
        {props.children}
      </a>
    );
  },
  code: (props: any) => {
    const txt = mdText(props.children);
    if (!props.className && FILE_REF.test(txt) && txt.includes(":"))
      return (
        <button className="file-ref" onClick={() => openFileRef(txt)} title={t("action.open-file", { ref: txt })}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1.8h5.2L13 5.6v8.6H4z" /><path d="M9 1.8v4h4" />
          </svg>
          {txt}
        </button>
      );
    return <code className={props.className}>{props.children}</code>;
  },
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
      <span className="working-spin" aria-hidden="true" />
      <span className="working-label">{t("chat.working")}</span> {t("chat.working-for", { secs })}
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
    <button title={pinned ? t("action.unpin-chapter") : t("action.pin-chapter")} onClick={onClick}
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
  threadId: string | null;
  onPasteImage: (dataURL: string) => void;
  onStop: () => void;
  goal: string | null;
  onClearGoal: () => void;
  layout: "split" | "chat" | "atelier";
  onToggleExpand: () => void;
  usage: { context: number; output: number; cost: number | null; turns: number | null } | null;
  onRevert: (index: number, text: string, edit: boolean) => void;
  onFork: (index: number) => void;
  onEditSend: (index: number, oldText: string, newText: string) => void;
  onNewChat: () => void;
  onOpenProject: () => void;
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
    // champ vide : hauteur CSS fixe, sans mesure — sous WebKit le placeholder
    // compte dans scrollHeight et gonfle la boîte au montage (largeur pas prête)
    if (text === "") {
      ta.style.height = "";
      return;
    }
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

  // ---- marques persistantes (Highlight / Underline) sur les réponses ----
  type Mark = { text: string; kind: "hl" | "ul" };
  const [marks, setMarks] = useState<Mark[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.threadId) { setMarks([]); return; }
    try {
      setMarks(JSON.parse(localStorage.getItem("atelier-studio.marks." + p.threadId) ?? "[]"));
    } catch { setMarks([]); }
  }, [p.threadId]);
  function saveMarks(next: Mark[]) {
    setMarks(next);
    if (p.threadId) localStorage.setItem("atelier-studio.marks." + p.threadId, JSON.stringify(next));
  }
  function toggleMark(text: string, kind: "hl" | "ul") {
    const t = text.trim();
    if (!t) return;
    const existing = marks.find((m) => m.text === t && m.kind === kind);
    saveMarks(existing ? marks.filter((m) => m !== existing) : [...marks, { text: t, kind }]);
  }
  // applique les marques via la CSS Custom Highlight API (aucune chirurgie DOM)
  useEffect(() => {
    const H = (window as any).Highlight;
    const reg = (CSS as any).highlights;
    if (!H || !reg || !messagesRef.current) return;
    const find = (needle: string): Range[] => {
      const out: Range[] = [];
      const root = messagesRef.current!;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      // concatène les nœuds texte par message pour retrouver le passage même s'il
      // traverse du gras/des liens : on cherche nœud par nœud (couvre la majorité)
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const idx = (n.textContent ?? "").indexOf(needle);
        if (idx >= 0) {
          const r = document.createRange();
          r.setStart(n, idx);
          r.setEnd(n, idx + needle.length);
          out.push(r);
        }
      }
      return out;
    };
    const hl = new H(), ul = new H();
    for (const m of marks) for (const r of find(m.text)) (m.kind === "hl" ? hl : ul).add(r);
    reg.set("chat-hl", hl);
    reg.set("chat-ul", ul);
    return () => { reg.delete("chat-hl"); reg.delete("chat-ul"); };
  }, [marks, p.events]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);

  useEffect(() => {
    if (!plusOpen) return;
    const close = () => setPlusOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [plusOpen]);
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
  function modelLabel(model: { label: string }) {
    return model.label === "__default" ? t("chat.model-default") : model.label;
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
  const [openToolGroups, setOpenToolGroups] = useState<Set<number>>(new Set());

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

  const renderedEvents: (
    | { type: "event"; event: AgentEvent; index: number }
    | { type: "tools"; tools: Extract<AgentEvent, { kind: "tool" }>[]; index: number }
  )[] = [];
  for (let i = 0; i < p.events.length; i++) {
    const e = p.events[i];
    if (e.kind !== "tool") {
      renderedEvents.push({ type: "event", event: e, index: i });
      continue;
    }
    let end = i + 1;
    while (end < p.events.length && p.events[end].kind === "tool") end++;
    const tools = p.events.slice(i, end) as Extract<AgentEvent, { kind: "tool" }>[];
    if (tools.length >= 4) renderedEvents.push({ type: "tools", tools, index: i });
    else tools.forEach((tool, offset) => renderedEvents.push({ type: "event", event: tool, index: i + offset }));
    i = end - 1;
  }
  const currentTool = [...p.events].reverse().find((e) => e.kind === "tool_update" || e.kind === "tool");
  const currentToolName =
    currentTool?.kind === "tool_update" ? eventLabel(currentTool.name) :
    currentTool?.kind === "tool" ? eventLabel(currentTool.name) : "";
  const selectedModel = modelsFor(provider).find((m) => m.id === model);
  const selectedModelLabel = selectedModel ? modelLabel(selectedModel) : model;
  const modelButtonLabel = model ? selectedModelLabel : t("chat.model-auto");
  const modelSuffix = effort ? ` · ${effort}` : "";

  return (
    <div className="chat">
      <button className="expand-btn" title={p.layout === "chat" ? t("action.restore-split-chat") : t("chat.full")}
        onClick={p.onToggleExpand}>
        {p.layout === "chat" ? <CollapseIcon /> : <ExpandIcon />}
      </button>
      <div className="messages" ref={messagesRef} onMouseUp={onMessagesMouseUp}>
        {!p.threadId && (
          <div className="empty-card">
            <div className="empty-title">{t("chat.empty-ready")}</div>
            <div className="empty-actions">
              <button type="button" className="empty-action" onClick={p.onNewChat}>
                {t("action.new-chat")}
              </button>
              <button
                type="button"
                className="empty-action"
                onClick={() => window.dispatchEvent(new CustomEvent("atelier-open-resume", { detail: { provider: "claude" } }))}
              >
                <ResumeIcon /> {t("action.resume-session")}
              </button>
              <button type="button" className="empty-action" onClick={p.onOpenProject}>
                {t("action.open-project")}
              </button>
            </div>
          </div>
        )}
        {p.threadId && p.events.length === 0 && (
          <div className="empty">{t("chat.empty")}</div>
        )}
        {renderedEvents.map((item) => {
          if (item.type === "tools") {
            const open = openToolGroups.has(item.index);
            return (
              <div key={`tools-${item.index}`} className="tool-group">
                <button
                  type="button"
                  className="tool-group-row"
                  onClick={() =>
                    setOpenToolGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.index)) next.delete(item.index);
                      else next.add(item.index);
                      return next;
                    })
                  }
                >
                  <span className="tool-tick">{open ? "▾" : "▸"}</span>
                  {t("chat.tools-used", { count: item.tools.length })}
                </button>
                {open && (
                  <div className="tool-group-list">
                    {item.tools.map((tool, offset) => (
                      <div key={offset} className="tool">
                        <span className="tool-tick">▸</span> {eventLabel(tool.name)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          const e = item.event;
          const i = item.index;
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
                        {t("action.cancel")}
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
                        {t("action.send")}
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
                  <button title={t("action.copy")} onClick={() => navigator.clipboard.writeText(e.text)}>
                    <CopyIcon />
                  </button>
                  <button title={t("action.edit-resend")} onClick={() => setEditing({ index: i, text: e.text })}>✎</button>
                  <button title={t("chat.revert-title")} onClick={() => p.onRevert(i, e.text, false)}>↩</button>
                  <PinBtn pinned={p.pins.some((c) => c.index === i)} onClick={() => p.onTogglePin(i, e.text.slice(0, 44))} />
                </div>
              </div>
            );
          if (e.kind === "streaming")
            return (
              <div key={i} className="msg-wrap">
                <div className="msg">
                  <ReactMarkdown components={MD_COMPONENTS as any}>{e.text}</ReactMarkdown>
                  <span className="stream-caret" />
                </div>
              </div>
            );
          if (e.kind === "text")
            return (
              <div key={i} id={`msg-${i}`} className="msg-wrap">
                <div className="msg">
                  <ReactMarkdown components={MD_COMPONENTS as any}>{e.text}</ReactMarkdown>
                </div>
                <div className="msg-actions">
                  {"ts" in e && e.ts && (
                    <span className="msg-time">
                      {fmtTime(e.ts, p.defaults.timeFormat)}
                    </span>
                  )}
                  <button title={t("action.copy")} onClick={() => navigator.clipboard.writeText(e.text)}>
                    <CopyIcon />
                  </button>
                  <button title={t("action.fork")} onClick={() => p.onFork(i)}>
                    <ForkIcon />
                  </button>
                  <PinBtn pinned={p.pins.some((c) => c.index === i)} onClick={() => p.onTogglePin(i, e.text.replace(/[#*>`]/g, "").trim().slice(0, 44))} />
                </div>
              </div>
            );
          if (e.kind === "tool")
            return (
              <div key={i} className="tool">
                <span className="tool-tick">▸</span> {eventLabel(e.name)}
              </div>
            );
          if (e.kind === "tool_update") {
            const output = e.output.length > 6000 ? "[...]\n" + e.output.slice(-6000) : e.output;
            return (
              <div key={i} className="tool-output">
                <div className="tool-output-head">
                  <span className="tool-tick">▸</span>
                  <span>{eventLabel(e.name)}</span>
                  {e.status && <span className="tool-status">{e.status}</span>}
                </div>
                {output.trim() && <pre>{output}</pre>}
              </div>
            );
          }
          if (e.kind === "todos")
            return (
              <div key={i} className="todos">
                {e.items.map((todo, idx) => (
                  <div key={idx} className={todo.completed ? "todo done" : "todo"}>
                    <span className="todo-box">{todo.completed ? "✓" : ""}</span>
                    <span>{todo.text}</span>
                  </div>
                ))}
              </div>
            );
          if (e.kind === "error")
            return (
              <div key={i} className="error">
                ⚠ {e.message}
              </div>
            );
          if (e.kind === "done")
            return (
              <div key={i} className="done">
                {e.ok ? t("chat.done-ok") : t("chat.done-fail")}
              </div>
            );
          return null;
        })}
        {p.workingSince != null && (
          <div className="working-stack">
            <div className="working-row">
              <Working since={p.workingSince} />
            </div>
            {currentToolName && (
              <div className="working-tool">
                <span className="working-spin" aria-hidden="true" />
                <span>{currentToolName}</span>
              </div>
            )}
            <button type="button" className="stop-btn" title={t("action.interrupt")} onClick={p.onStop}>
              ■ {t("action.stop")}
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
        <div className="sel-toolbar" style={{ left: quote.x, top: quote.y - 44 }}>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              toggleMark(quote.text, "hl");
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M10.5 2.5l3 3L6 13H3v-3z" /><path d="M9 4l3 3" />
            </svg>
            {t("chat.highlight")}
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              toggleMark(quote.text, "ul");
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M4 2.5v5a4 4 0 008 0v-5" /><path d="M3.5 13.5h9" />
            </svg>
            {t("chat.underline")}
          </button>
          <button
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
            {t("action.add-to-chat")}
          </button>
        </div>
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
        {p.goal && (
          <div className="goal-pill" title={p.goal}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="8" cy="8" r="6.2" />
              <circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />
            </svg>
            <span className="goal-label">{t("chat.goal")}</span>
            <span className="goal-cond">{p.goal.slice(0, 80)}{p.goal.length > 80 ? "…" : ""}</span>
            <button type="button" className="ghost" title={t("chat.goal-clear")}
              onClick={p.onClearGoal}><CloseIcon /></button>
          </div>
        )}
        {p.attachments.length > 0 && (
          <div className="chips-row">
            {p.attachments.map((a, i) =>
              a.imageUrl ? (
                <div key={i} className="img-chip">
                  <img src={a.imageUrl} alt={a.name} />
                  <button type="button" className="img-chip-x" onClick={() => p.onRemoveAttachment(i)}>
                    <CloseIcon />
                  </button>
                  <span className="img-chip-name">{a.name}</span>
                </div>
              ) : (
                <div key={i} className="chip">
                  <span className="chip-label">{a.name}</span>
                  {a.lines && <span className="chip-lines">{t("chat.lines", { lines: a.lines })}</span>}
                  <button type="button" className="ghost" onClick={() => p.onRemoveAttachment(i)}>
                    <CloseIcon />
                  </button>
                </div>
              ),
            )}
          </div>
        )}
        <div className={`ta-wrap ${(() => {
          const m = /^(\/[\w:-]+)/.exec(text);
          return m && isValidSkill(m[1], p.commands) ? "slash-active" : "";
        })()}`}>
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
          rows={1}
          placeholder={t("chat.placeholder")}
        />
        </div>
        <div className="composer-bar">
          <span className="plus-wrap" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ghost" title={t("action.add-file-image")} onClick={() => setPlusOpen((v) => !v)}>
              <PlusIcon />
            </button>
            {plusOpen && (
              <div className="mp-menu plus-up">
                <div className="mp-item" onClick={() => { setPlusOpen(false); attachFiles(); }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M13.5 7.5l-5 5a3.2 3.2 0 0 1-4.5-4.5l5.5-5.5a2.2 2.2 0 0 1 3.1 3.1l-5.5 5.5a1.1 1.1 0 0 1-1.6-1.6l5-5" />
                  </svg>
                  <span>{t("action.add-file-image")}</span>
                </div>
                <div className="mp-item" onClick={() => setPermissionMode(permissionMode === "plan" ? "bypassPermissions" : "plan")}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M2.5 4h2M6.5 4h7M2.5 8h2M6.5 8h7M2.5 12h2M6.5 12h7" />
                  </svg>
                  <span>Plan mode</span>
                  <span className={`toggle ${permissionMode === "plan" ? "on" : ""}`}>
                    <span className="knob" />
                  </span>
                </div>
              </div>
            )}
          </span>
          <select
            className={`bare access ${permissionMode === "plan" ? "accent" : ""}`}
            value={permissionMode}
            onChange={(e) => setPermissionMode(e.target.value)}
          >
            {PERMISSION_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {t(m.labelKey as any)}
              </option>
            ))}
          </select>
          <span className="flex" />
          {p.usage && (
            <span className="ctx-ring-wrap">
              {(() => {
                const WINDOW = (p.usage as any).window
                  ?? (model.includes("[1m]") ? 1_000_000 : 200_000);
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
                      <b>{t("chat.context-window")}</b>
                      <span>{t("chat.context-used", { pct, used: Math.round(p.usage.context / 1000), window: WINDOW >= 1_000_000 ? "1M" : Math.round(WINDOW / 1000) + "k" })}</span>
                      <span>{t("chat.last-output", { tokens: Math.round(p.usage.output / 1000 * 10) / 10 })}</span>
                      {p.usage.turns != null && <span>{t("chat.session-turns", { turns: p.usage.turns })}</span>}
                      {p.usage.cost != null && <span>{t("chat.cost", { cost: p.usage.cost.toFixed(2) })}</span>}
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
              <span className={!model ? "mp-dim" : undefined}>{modelButtonLabel}{modelSuffix}</span>
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
                          <span>{modelLabel(m)}</span>
                          <span className="mp-end">
                            {active && <span className="mp-check">✓</span>}
                            <span
                              className={`mp-star ${fav ? "on" : ""}`}
                              title={fav ? t("action.remove-favorite") : t("action.add-favorite")}
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
                {provider === "claude" && (
                  <>
                    <div className="mp-sep" />
                    <div className="mp-hd">{t("chat.context")}</div>
                    {[
                      { id: "200k", label: t("chat.context-200k"), on: !model.includes("[1m]") },
                      { id: "1m", label: "1M", on: model.includes("[1m]") },
                    ].map((ctx) => (
                      <div key={ctx.id} className="mp-item"
                        onClick={() => {
                          if (ctx.id === "1m" && !model.includes("[1m]")) {
                            setModel((model || "claude-sonnet-5") + "[1m]");
                          } else if (ctx.id === "200k" && model.includes("[1m]")) {
                            setModel(model.replace(/\[1m\]$/, ""));
                          }
                        }}>
                        <span>{ctx.label}</span>
                        {ctx.on && <span className="mp-check">✓</span>}
                      </div>
                    ))}
                  </>
                )}
                <div className="mp-sep" />
                <div className="mp-hd">{t("chat.effort")}</div>
                {EFFORTS[provider].map((lvl) => {
                  const labels: Record<string, string> = {
                    "": t("common.auto-default"), low: "Low", medium: "Medium", high: "High",
                    xhigh: "Extra High", max: "Max", minimal: "Minimal",
                  };
                  return (
                    <div key={lvl} className="mp-item" onClick={() => setEffort(lvl)}>
                      <span>{labels[lvl] ?? lvl}</span>
                      {effort === lvl && <span className="mp-check">✓</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </span>
          {p.workingSince != null ? (
            <>
              <button
                type="button"
                className="queue-btn"
                disabled={p.disabled || !text.trim()}
                title={t("action.queue-title")}
                onClick={() => {
                  if (!text.trim()) return;
                  p.onSubmit(text, provider, model, effort, permissionMode, "queue");
                  setText("");
                }}
              >
                ⏱ {t("action.queue")}
              </button>
              <button className="send steer" disabled={p.disabled} title={t("action.send-now")}>
                ↑
              </button>
            </>
          ) : (
            <button className="send" disabled={p.disabled} title={t("action.send")}>
              ↑
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
