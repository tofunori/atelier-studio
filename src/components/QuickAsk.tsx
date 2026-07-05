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
  draft,
  onClose,
  onInject,
  onPromote,
}: {
  open: boolean;
  draft: string;
  onClose: () => void;
  onInject: (text: string) => void;
  onPromote: (qaId: string, title: string) => void;
}) {
  const [qaId, setQaId] = useState<string>(() => crypto.randomUUID());
  const [msgs, setMsgs] = useState<QaMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelIdx, setModelIdx] = useState(() => {
    const n = Number(localStorage.getItem("atelier-studio.qaModel") ?? "0");
    return Number.isFinite(n) && n >= 0 && n < QA_MODELS.length ? n : 0;
  });
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [promoteErr, setPromoteErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // ouverture : reset de session, pré-remplissage du brouillon
  useEffect(() => {
    if (!open) return;
    setQaId(crypto.randomUUID());
    setMsgs([]);
    setText(draft);
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

  // événements de la session éphémère
  useEffect(() => {
    if (!open) return;
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
  }, [open, qaId]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs]);

  if (!open) return null;

  const m = QA_MODELS[modelIdx];

  function ask() {
    const q = text.trim();
    if (!q || busy) return;
    setMsgs((prev) => [...prev, { role: "user", text: q }]);
    setText("");
    setBusy(true);
    wsSend({ type: "quickAsk", qaId, prompt: q, provider: m.provider, model: m.model, effort: m.effort });
  }

  const lastAnswer = [...msgs].reverse().find((x) => x.role === "assistant" && !x.text.startsWith("⚠"));

  return (
    <div className="qa-overlay" onClick={close}>
      <div className="qa-pop" onClick={(e) => e.stopPropagation()}>
        <div className="qa-head">
          <span className="qa-zap"><ZapIcon /></span>
          <span>{t("qa.title")}</span>
          <span className="qa-eph">{t("qa.ephemeral")}</span>
          <button className="qa-recents-btn" title={t("qa.recents")}
            onClick={() => setRecentsOpen((v) => !v)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <circle cx="8" cy="8" r="6.2" /><path d="M8 4.5V8l2.5 1.5" />
            </svg>
          </button>
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
          {busy && <div className="qa-busy">…</div>}
        </div>
        <textarea
          ref={inputRef}
          className="qa-input"
          rows={1}
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
      </div>
    </div>
  );
}
