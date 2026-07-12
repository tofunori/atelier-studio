import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

const MAX_HEIGHT = 120;
const MIN_HEIGHT = 44;

type Props = {
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Optional attachment chips — reserved height so layout doesn't jump. */
  shelf?: ReactNode;
  hasShelf?: boolean;
};

export function Composer(p: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, el.scrollHeight));
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  const send = () => {
    const t = text.trim();
    if (!t || p.disabled) return;
    p.onSend(t);
    setText("");
    requestAnimationFrame(resize);
    // light haptic if available
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Mobile: Enter often inserts newline; Cmd/Ctrl+Enter sends when present
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="composer" data-busy={p.busy ? "1" : "0"}>
      <div
        className="composer-shelf"
        data-empty={p.hasShelf ? "0" : "1"}
        aria-hidden={!p.hasShelf}
      >
        {p.shelf}
      </div>
      <div className="composer-row">
        <textarea
          ref={taRef}
          className="composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={p.busy ? "Agent en cours…" : "Message"}
          rows={1}
          enterKeyHint="send"
          disabled={p.disabled}
          aria-label="Message"
        />
        <button
          type="button"
          className={`composer-action btn ${p.busy ? "btn-ghost" : "btn-primary"}`}
          aria-label={p.busy ? "Arrêter" : "Envoyer"}
          disabled={p.disabled || (!p.busy && !text.trim())}
          onClick={() => {
            if (p.busy) {
              p.onStop();
              try {
                navigator.vibrate?.(15);
              } catch {
                /* ignore */
              }
            } else send();
          }}
        >
          {p.busy ? "Stop" : "Envoyer"}
        </button>
      </div>
    </div>
  );
}
