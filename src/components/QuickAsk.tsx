import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { t } from "../lib/i18n";
import { ProviderIcon, ZapIcon } from "./icons";
import { wsSend } from "../lib/wsBus";

type QaMsg = { role: "user" | "assistant"; text: string; streaming?: boolean };
type QaRecent = { qaId: string; ts: number; msgs: QaMsg[] };
const RECENTS_KEY = "atelier-studio.qaRecents";

function loadRecents(): QaRecent[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"); } catch { return []; }
}
function saveRecent(qaId: string, msgs: QaMsg[]) {
  if (!msgs.some((m) => m.role === "assistant")) return;
  const clean = msgs.map((m) => ({ role: m.role, text: m.text }));
  const rest = loadRecents().filter((r) => r.qaId !== qaId);
  localStorage.setItem(RECENTS_KEY, JSON.stringify([{ qaId, ts: Date.now(), msgs: clean }, ...rest].slice(0, 20)));
}
type QaModel = { provider: "claude" | "codex"; model: string; effort: string; label: string };

const QA_MODELS: QaModel[] = [
  { provider: "claude", model: "claude-haiku-4-5-20251001", effort: "", label: "Haiku 4.5" },
  { provider: "claude", model: "claude-sonnet-5", effort: "low", label: "Sonnet 5" },
  { provider: "codex", model: "gpt-5.4-mini", effort: "low", label: "GPT-5.4 mini" },
  { provider: "codex", model: "gpt-5.5", effort: "medium", label: "GPT-5.5" },
];

export default function QuickAsk({
  open,
  minimized,
  draft,
  context,
  onMinimize,
  onRestore,
  onClose,
  onInject,
  onPromote,
}: {
  open: boolean;
  minimized: boolean;
  draft: string;
  context?: string;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  onInject: (text: string) => void;
  onPromote: (qaId: string, title: string) => void;
}) {
  const [qaId, setQaId] = useState<string>(() => crypto.randomUUID());
  const [msgs, setMsgs] = useState<QaMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState("");
  const [modelIdx, setModelIdx] = useState(() => {
    const n = Number(localStorage.getItem("atelier-studio.qaModel") ?? "0");
    return Number.isFinite(n) && n >= 0 && n < QA_MODELS.length ? n : 0;
  });
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [promoteErr, setPromoteErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem("atelier-studio.qaBox") ?? "null"); }
    catch { return null; }
  });
  function saveBox(b: { x: number; y: number; w: number; h: number }) {
    setBox(b);
    localStorage.setItem("atelier-studio.qaBox", JSON.stringify(b));
  }
  function startDrag(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const el = popRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const move = (ev: MouseEvent) => {
      saveBox({
        x: Math.min(window.innerWidth - 120, Math.max(0, ev.clientX - ox)),
        y: Math.min(window.innerHeight - 80, Math.max(0, ev.clientY - oy)),
        w: r.width, h: r.height,
      });
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = popRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const move = (ev: MouseEvent) => {
      saveBox({
        x: r.left, y: r.top,
        w: Math.max(380, ev.clientX - r.left),
        h: Math.max(240, ev.clientY - r.top),
      });
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  const bodyRef = useRef<HTMLDivElement>(null);

  // ouverture : reset de session, pré-remplissage du brouillon
  const wasMin = useRef(false);
  useEffect(() => {
    if (!open) { wasMin.current = minimized; return; }
    if (wasMin.current) { wasMin.current = false; inputRef.current?.focus(); return; }
    setQaId(crypto.randomUUID());
    setMsgs([]);
    setText(draft);
    setCtx(context ?? "");
    setBusy(false);
    setRecentsOpen(false);
    setPromoteErr(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function close() {
    saveRecent(qaId, msgs);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onErr = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.qaId === qaId) setPromoteErr(d.message);
    };
    window.addEventListener("qa-promote-error", onErr);
    return () => window.removeEventListener("qa-promote-error", onErr);
  }, [open, qaId]);

  // contexte ajouté depuis le chat principal pendant qu'une conversation vit
  useEffect(() => {
    const onAdd = (e: Event) => {
      const txt = ((e as CustomEvent).detail?.text as string) ?? "";
      if (txt) setCtx(txt);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener("qa-add-context", onAdd);
    return () => window.removeEventListener("qa-add-context", onAdd);
  }, []);

  // événements de la session éphémère
  useEffect(() => {
    const onEvent = (e: Event) => {
      const { qaId: id, event } = (e as CustomEvent).detail;
      if (id !== qaId) return;
      setMsgs((prev) => {
        const list = [...prev];
        const last = list[list.length - 1];
        if (event.kind === "delta") {
          if (last?.streaming) list[list.length - 1] = { ...last, text: last.text + event.text };
          else list.push({ role: "assistant", text: event.text, streaming: true });
          return list;
        }
        if (event.kind === "stream_set") {
          if (last?.streaming) list[list.length - 1] = { ...last, text: event.text };
          else list.push({ role: "assistant", text: event.text, streaming: true });
          return list;
        }
        if (event.kind === "text") {
          if (last?.streaming) list[list.length - 1] = { role: "assistant", text: event.text };
          else list.push({ role: "assistant", text: event.text });
          return list;
        }
        if (event.kind === "done" || event.kind === "error") {
          if (last?.streaming) list[list.length - 1] = { ...last, streaming: false };
          if (event.kind === "error") list.push({ role: "assistant", text: `⚠ ${event.message}` });
        }
        return list;
      });
      if (event.kind === "done" || event.kind === "error") setBusy(false);
    };
    window.addEventListener("qa-event", onEvent);
    return () => window.removeEventListener("qa-event", onEvent);
  }, [qaId]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs]);
  if (minimized) return null;
  if (!open) return null;

  const m = QA_MODELS[modelIdx];

  function ask() {
    const q = text.trim();
    if (!q || busy) return;
    setMsgs((prev) => [...prev, { role: "user", text: q }]);
    setText("");
    setBusy(true);
    const prompt = ctx
      ? `Contexte (extrait d'une autre conversation) :\n"""\n${ctx}\n"""\n\n${q}`
      : q;
    if (ctx) setCtx("");
    wsSend({ type: "quickAsk", qaId, prompt, provider: m.provider, model: m.model, effort: m.effort });
  }

  const lastAnswer = [...msgs].reverse().find((x) => x.role === "assistant" && !x.text.startsWith("⚠"));

  return (
    <div className={`qa-overlay ${box ? "free" : ""}`} onClick={box ? undefined : close}>
      <div
        className={`qa-pop ${box ? "free" : ""}`}
        ref={popRef}
        onClick={(e) => e.stopPropagation()}
        style={box ? { position: "fixed", left: box.x, top: box.y, width: box.w, height: box.h, maxHeight: "none" } : undefined}
      >
        <div className="qa-head" onMouseDown={startDrag} style={{ cursor: "move" }}>
          <span className="qa-zap"><ZapIcon /></span>
          <span>{t("qa.title")}</span>
          <button className="qa-recents-btn" title={t("qa.recents")}
            onClick={() => setRecentsOpen((v) => !v)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <circle cx="8" cy="8" r="6.2" /><path d="M8 4.5V8l2.5 1.5" />
            </svg>
          </button>
          <button
            className="qa-recents-btn"
            title={t("qa.clear")}
            onClick={() => {
              setQaId(crypto.randomUUID());
              setMsgs([]);
              setCtx("");
              setText("");
              setBusy(false);
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <path d="M3 4h10M6.5 4V2.8c0-.4.3-.8.8-.8h1.4c.5 0 .8.4.8.8V4M4.5 4l.7 8.4c0 .5.4.8.9.8h3.8c.5 0 .9-.3.9-.8L11.5 4" />
            </svg>
          </button>
          <button className="qa-min" title="—" onClick={onMinimize}>—</button>
          <button
            className="qa-model"
            title={t("qa.switch-model")}
            onClick={() => {
              const next = (modelIdx + 1) % QA_MODELS.length;
              setModelIdx(next);
              localStorage.setItem("atelier-studio.qaModel", String(next));
            }}
          >
            <ProviderIcon provider={m.provider} />
            {m.label}
          </button>
        </div>
        {recentsOpen && (
          <div className="qa-recents">
            {loadRecents().length === 0 && <div className="qa-empty">{t("qa.no-recents")}</div>}
            {loadRecents().map((r) => (
              <button key={r.qaId} className="qa-recent-row" onClick={() => {
                setQaId(r.qaId);
                setMsgs(r.msgs);
                setRecentsOpen(false);
              }}>
                <span className="qa-recent-q">{r.msgs.find((m) => m.role === "user")?.text.slice(0, 60) ?? "—"}</span>
                <span className="qa-recent-ts">{new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </button>
            ))}
          </div>
        )}
        <div className="qa-body" ref={bodyRef}>
          {msgs.length === 0 && <div className="qa-empty">{t("qa.hint")}</div>}
          {msgs.map((msg, i) => (
            <div key={i} className={`qa-msg ${msg.role}`}>
              {msg.role === "assistant" ? (
                <>
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                  {!msg.streaming && !msg.text.startsWith("⚠") && (
                    <button className="qa-inject-one" title={t("qa.inject")}
                      onClick={() => { onInject(msg.text); close(); }}>
                      ↰
                    </button>
                  )}
                </>
              ) : (
                <span>{msg.text}</span>
              )}
            </div>
          ))}
          {busy && msgs[msgs.length - 1]?.role !== "assistant" && (
            <div className="qa-busy" aria-label="…">
              <span /><span /><span />
            </div>
          )}
        </div>
        {ctx && (
          <div className="qa-ctx" title={ctx}>
            <span className="qa-ctx-txt">{ctx.slice(0, 90)}{ctx.length > 90 ? "…" : ""}</span>
            <button type="button" onClick={() => setCtx("")}>✕</button>
          </div>
        )}
        <textarea
          ref={inputRef}
          className="qa-input"
          rows={Math.min(6, Math.max(1, text.split("\n").length, Math.ceil(text.length / 60)))}
          value={text}
          placeholder={t("qa.placeholder")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
            if (e.key === "Escape") close();
          }}
        />
        <div className="qa-foot">
          <button disabled={!lastAnswer} onClick={() => { if (lastAnswer) { onInject(lastAnswer.text); close(); } }}>
            ↰ {t("qa.inject")}
          </button>
          <button disabled={msgs.length === 0 || busy} onClick={() => {
            saveRecent(qaId, msgs);
            onPromote(qaId, msgs.find((x) => x.role === "user")?.text.slice(0, 40) ?? "Quick Ask");
            onClose();
          }}>
            ⤴ {t("qa.promote")}
          </button>
          {promoteErr && <span className="qa-promote-err">{promoteErr}</span>}
          <span className="qa-esc">esc</span>
        </div>
        <div className="qa-resize" onMouseDown={startResize} />
      </div>
    </div>
  );
}
