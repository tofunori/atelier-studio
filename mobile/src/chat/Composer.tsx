import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group.tsx";
import { ArrowUpIcon, PaperclipIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

const MAX_HEIGHT = 120;
const MIN_HEIGHT = 44;

type Props = {
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttach?: () => void;
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
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      <InputGroup className="composer-input-group min-h-11 w-full min-w-0 max-w-full overflow-hidden">
        {p.onAttach && (
          <InputGroupAddon align="inline-start" className="composer-attach-addon">
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="ghost"
              className="composer-attach"
              aria-label="Joindre un fichier"
              disabled={p.disabled}
              onClick={p.onAttach}
            >
              <PaperclipIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          ref={taRef}
          className="composer-textarea field-sizing-fixed min-h-11 max-h-[120px] w-0 min-w-0 max-w-full flex-1 overflow-x-hidden [overflow-wrap:anywhere]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={p.busy ? "Agent en cours…" : "Message"}
          rows={1}
          enterKeyHint="send"
          disabled={p.disabled}
          aria-label="Message"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            size="icon-sm"
            variant={p.busy ? "ghost" : "default"}
            className="composer-send"
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
            {p.busy ? <SquareIcon /> : <ArrowUpIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
