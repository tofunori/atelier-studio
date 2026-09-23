import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronRight, MessageCircle, Plus, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useThreadEvents } from "../hooks/useThreadEvents";
import type { ThreadEventStore } from "../lib/threadEventStore";
import { usePromptText, type PromptSource } from "../lib/chatDraftStore";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { RowButton } from "./ui/RowButton";
import "./ReadingChatOverlay.css";

type Props = {
  threadId: string | null; store: ThreadEventStore; topLayer: boolean;
  prompt?: string; onPromptChange?(value: string): void;
  /** Brouillon du composer lu dans le store (prioritaire) : pas de rendu d'App par frappe. */
  promptSource?: PromptSource;
  count: number; disabled: boolean; working: boolean;
  onSend(annotationsOnly: boolean): void; onClear(): void;
  onAttach?(): void; files?: string[];
  feedback?: string;
};
export function ReadingChatOverlay(props: Props) {
  const {threadId, store, topLayer, count, disabled, working} = props;
  const events = useThreadEvents(store, threadId);
  const sourcedPrompt = usePromptText(props.promptSource);
  const prompt = props.promptSource ? sourcedPrompt : (props.prompt ?? "");
  const setPrompt = (value: string) => (props.promptSource ? props.promptSource.set(value) : props.onPromptChange?.(value));
  const latest = [...events].reverse().find(event => event.kind === "text" || event.kind === "streaming");
  const [expanded, setExpanded] = useState(false);
  const composer = useRef<HTMLDivElement>(null), annotations = useRef<HTMLDivElement>(null);
  useEffect(() => { setExpanded(false); }, [threadId]);
  // The fullscreen iframe itself lives in the browser top layer. These two
  // small popovers must join it; a large z-index alone cannot cover that iframe.
  useEffect(() => {
    if (!topLayer) return;
    const nodes = [composer.current, annotations.current].filter((node): node is HTMLDivElement => !!node);
    nodes.forEach(node => node.showPopover?.());
    return () => nodes.forEach(node => { try { node.hidePopover?.(); } catch { /* detached */ } });
  }, [topLayer, count > 0]);
  return <>
    {count > 0 && <div ref={annotations} popover={topLayer ? "manual" : undefined} className="reading-annotation-queue" role="group" aria-label="Annotations en attente">
      <span>{count} annotation{count > 1 ? "s" : ""}</span>
      <IconButton onClick={props.onClear} title="Retirer du brouillon" label="Retirer les annotations du brouillon"><X /></IconButton>
      <IconButton className="reading-send" disabled={disabled} onClick={() => props.onSend(true)} title="Envoyer les annotations" label="Envoyer les annotations"><ArrowUp /></IconButton>
    </div>}
    <div ref={composer} popover={topLayer ? "manual" : undefined} className="reading-chat-overlay">
      <RowButton className="reading-latest-toggle" aria-expanded={expanded} aria-controls="reading-latest-response" onClick={() => setExpanded(value => !value)}>
        <MessageCircle /><span>{working ? "Réponse en cours…" : "Dernière réponse"}</span><ChevronRight className={expanded ? "expanded" : ""} />
      </RowButton>
      {expanded && <section id="reading-latest-response" className="reading-latest-response" aria-label="Dernière réponse">
        {latest && "text" in latest ? <ReactMarkdown>{latest.text}</ReactMarkdown> : <p>Aucune réponse pour le moment.</p>}
      </section>}
      <form className="reading-chat-input" onSubmit={event => {event.preventDefault(); props.onSend(false);}}>
        {props.onAttach && <IconButton label="Joindre un fichier" onClick={props.onAttach}><Plus /></IconButton>}
        <textarea aria-label="Écrire au chat depuis la lecture" placeholder="Écrire au chat…" rows={1} value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => {
          if(event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing){event.preventDefault(); if(!disabled && (prompt.trim() || count || props.files?.length)) props.onSend(false);}
        }} />
        <Button className="reading-send" type="submit" variant="ghost" size="icon-sm" aria-label="Envoyer au chat" disabled={disabled || (!prompt.trim() && !count && !props.files?.length)}><ArrowUp /></Button>
      </form>
      {!!props.files?.length && <div className="reading-chat-files">{props.files.join(" · ")}</div>}
      {props.feedback && <div className="reading-chat-files" role="status">{props.feedback}</div>}
    </div>
  </>;
}
