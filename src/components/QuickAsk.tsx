import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { t } from "../lib/i18n";
import { ProviderIcon, ZapIcon } from "./icons";
import { wsSend } from "../lib/wsBus";

type QaMsg = { role: "user" | "assistant"; text: string; streaming?: boolean };
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
  const [qaId, setQaId] = useState(() => crypto.randomUUID());
  const [msgs, setMsgs] = useState<QaMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelIdx, setModelIdx] = useState(() => {
    const n = Number(localStorage.getItem("atelier-studio.qaModel") ?? "0");
    return Number.isFinite(n) && n >= 0 && n < QA_MODELS.length ? n : 0;
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // ouverture : reset de session, pré-remplissage du brouillon
  useEffect(() => {
    if (!open) return;
    setQaId(crypto.randomUUID());
    setMsgs([]);
    setText(draft);
    setBusy(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

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
    <div className="qa-overlay" onClick={onClose}>
      <div className="qa-pop" onClick={(e) => e.stopPropagation()}>
        <div className="qa-head">
          <span className="qa-zap"><ZapIcon /></span>
          <span>{t("qa.title")}</span>
          <span className="qa-eph">{t("qa.ephemeral")}</span>
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
        <div className="qa-body" ref={bodyRef}>
          {msgs.length === 0 && <div className="qa-empty">{t("qa.hint")}</div>}
          {msgs.map((msg, i) => (
            <div key={i} className={`qa-msg ${msg.role}`}>
              {msg.role === "assistant" ? (
                <>
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                  {!msg.streaming && !msg.text.startsWith("⚠") && (
                    <button className="qa-inject-one" title={t("qa.inject")}
                      onClick={() => { onInject(msg.text); onClose(); }}>
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
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="qa-foot">
          <button disabled={!lastAnswer} onClick={() => { if (lastAnswer) { onInject(lastAnswer.text); onClose(); } }}>
            ↰ {t("qa.inject")}
          </button>
          <button disabled={msgs.length === 0} onClick={() => {
            onPromote(qaId, msgs.find((x) => x.role === "user")?.text.slice(0, 40) ?? "Quick Ask");
            onClose();
          }}>
            ⤴ {t("qa.promote")}
          </button>
          <span className="qa-esc">esc</span>
        </div>
      </div>
    </div>
  );
}
