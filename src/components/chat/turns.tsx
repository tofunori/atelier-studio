// Composants de tour du chat (plan 015, slice 4) — JSX déplacé verbatim
// depuis le dispatcher de Chat.tsx. Chaque composant est memoizable : état
// (editing, plis, review) et callbacks restent dans Chat, passés en props.
// Clés et classes inchangées : le streaming et l'ancrage ne bougent pas.
import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { activeTurnStatus } from "./activeTurnStatus";
import { useSmoothedStream } from "./useSmoothedStream";
import { CheckIcon } from "lucide-react";
import { AgentEvent } from "../../lib/ws";
import { isStoppedTerminal, type ChatTurnViewModel, type ToolAction } from "../../lib/chat/turnViewModel";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { t } from "../../lib/i18n";
import { normalizeMathDelimiters } from "../../lib/markdown";
import { decorateKbCites } from "./kbCite";
import { kbSourcesSnapshot, requestKbSources, subscribeKbSources } from "../../lib/kbSources";
import { CopyIcon, ForkIcon, ResumeIcon } from "../icons";
import { MD_COMPONENTS, MD_COMPONENTS_STREAMING, MdBody, useMdPlugins } from "./md";
import { DoneDiffToggle, fmtTime, PencilIcon, PinBtn, Working } from "./turnParts";
import type { ChangedFile } from "./changedFiles";
import { summarizeActivity } from "./toolPresentation";
import { ActivityDisclosure, Button, EmptyState, IconButton, RowButton, Tooltip, showError, showSuccess } from "../ui";
import { Bubble, BubbleContent } from "../shadcn/bubble";
import { Message, MessageContent, MessageFooter } from "../shadcn/message";
import { Textarea } from "../shadcn/textarea";
import { annotationCards, isAnnotationLabel } from "../../lib/annotationCards";
import { AnnotationCard } from "./AnnotationCard";

type TimeFormat = "system" | "24h" | "12h" | undefined;
type UserEvent = Extract<AgentEvent, { kind: "user" }>;
type DoneEvent = Extract<AgentEvent, { kind: "done" }>;
export type ReviewState = {
  status: string;
  verdict?: string;
  issues?: { claim: string; problem: string; severity: string; fix?: string }[];
} | null;

function MessageAction(p: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  pressed?: boolean;
}) {
  return (
    <Tooltip label={p.label}>
      <IconButton
        size="s"
        label={p.label}
        onClick={p.onClick}
        className={`msg-action${p.className ? ` ${p.className}` : ""}`}
        aria-pressed={p.pressed}
      >
        {p.children}
      </IconButton>
    </Tooltip>
  );
}

function CopyMessageAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const label = copied ? t("action.copied") : t("action.copy");
  return (
    <MessageAction
      label={label}
      className={copied ? "is-confirmed" : undefined}
      onClick={() => {
        setCopied(true);
        navigator.clipboard.writeText(text).then(() => {
          void showSuccess(t("action.copied"));
        }).catch(() => {
          setCopied(false);
          void showError(t("action.copy-failed"));
        });
      }}
    >
      {copied ? <CheckIcon data-icon="inline-start" aria-hidden="true" /> : <CopyIcon />}
    </MessageAction>
  );
}

export function ChatEmptyState(p: {
  threadId: string | null;
  hasEvents: boolean;
  onNewChat: () => void;
  onOpenProject: () => void;
}) {
  if (!p.threadId) {
    // pilote plan 016 : ex-.empty-card → EmptyState + Button (mêmes libellés,
    // mêmes handlers ; actions empilées alignées à gauche via .ui-empty)
    return (
      <EmptyState
        title={t("chat.empty-ready")}
        actions={
          <>
            <Button onClick={p.onNewChat}>{t("action.new-chat")}</Button>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent("atelier-open-resume", { detail: { provider: "claude" } }))}
            >
              <ResumeIcon /> {t("action.resume-session")}
            </Button>
            <Button onClick={p.onOpenProject}>{t("action.open-project")}</Button>
          </>
        }
      />
    );
  }
  if (!p.hasEvents) return <div className="empty">{t("chat.empty")}</div>;
  return null;
}

export const UserTurn = memo(function UserTurn(p: {
  event: UserEvent;
  index: number;
  timeFormat: TimeFormat;
  pinned: boolean;
  /** rend le texte de la bulle (slash-command mis en évidence) — logique Chat */
  renderBubbleText: (text: string) => ReactNode;
  editingText: string | null;
  onEditingChange: (text: string | null) => void;
  onEditSend: (index: number, oldText: string, newText: string) => void;
  onRevert: (index: number, text: string, edit: boolean) => void;
  onTogglePin: (index: number, label: string) => void;
  onOpenPaste: (paste: { name: string; text: string }) => void;
}) {
  const e = p.event;
  const i = p.index;
  const annotationView = !e.imageUrl && !e.notes?.length ? annotationCards(e.text) : { prompt: e.text, cards: [] };
  const attachmentLabels = e.label?.split(" · ").filter(label => p.editingText != null || !isAnnotationLabel(label, annotationView.cards)) ?? [];
  const fileAttachments = e.label && !e.imageUrl && !e.notes?.length ? (
    <div className="user-file-attachments">
      {attachmentLabels.map((label,index) => (
        <span className="user-file-attachment" title={label} key={`${index}:${label}`}>
          <svg width="16" height="18" viewBox="0 0 16 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <path d="M9 1H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6zM9 1v5h5" />
          </svg>
          <span>{label}</span>
        </span>
      ))}
    </div>
  ) : null;
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const textarea = editTextareaRef.current;
    if (!textarea || p.editingText == null) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 48), 160)}px`;
  }, [p.editingText]);
  const submitEdit = () => {
    if (!p.editingText?.trim()) return;
    p.onEditSend(i, e.text, p.editingText);
    p.onEditingChange(null);
  };
  return (
    <Message id={`msg-${i}`} align="end" className="chat-message user-message">
    <MessageContent className="user-wrap">
      {e.notes && e.notes.length > 0 ? (
        // Figure annotée : vignette DISCRÈTE (Thierry a déjà la figure sous les
        // yeux dans la galerie), nom de la figure source, et les badges dessinés
        // sur l'image en clair. Largeur explicite : dans une bulle en
        // shrink-to-fit, une liste sans largeur s'empilait lettre par lettre.
        <div className="user-annot">
          {e.imageUrl && <img className="user-annot-thumb" src={e.imageUrl} alt="" />}
          <div className="user-annot-body">
            {e.label && <div className="user-annot-title">{e.label}</div>}
            <ul className="user-annots">
              {e.notes.map((note) => (
                <li key={note.n}>
                  <span className="user-annot-badge">{note.n}</span>
                  <span>{note.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <>
          {e.imageUrl && <img className="user-img" src={e.imageUrl} alt="" />}
          {e.label && e.imageUrl && <div className="user-label">{e.label}</div>}
        </>
      )}
      {e.kb && e.kb.count > 0 && (
        <div className="user-kb-meta">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <path d="M3.2 12.9V4.1c0-.9.7-1.6 1.6-1.6h8v9.4H4.8c-.9 0-1.6.7-1.6 1s.7 1.6 1.6 1.6h8v-2.6" />
          </svg>
          {t("kb.sent-with", { n: e.kb.count })}
          {e.kb.titles.length > 0 && (
            <span className="user-kb-meta-titles">
              {" · "}
              {e.kb.titles.slice(0, 2).join(", ")}
              {e.kb.count > 2 ? ` +${e.kb.count - 2}` : ""}
            </span>
          )}
        </div>
      )}
      {e.pastes && e.pastes.map((pa, j) => {
        // bulle restaurée : l'archive ne porte que {name, lines} — chip inerte
        const text = pa.text;
        const lineCount = text != null ? text.split("\n").length : pa.lines;
        return (
        <RowButton key={j} className="chip paste-chip"
          onClick={text == null ? undefined : () => p.onOpenPaste({ name: pa.name, text })}>
          <svg className="chip-doc" width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
            <rect x="0.8" y="0.8" width="9.4" height="11.4" rx="1.6" />
            <path d="M3 4.4h5M3 6.8h5M3 9.2h3.4" />
          </svg>
          <span className="chip-label">{pa.name}</span>
          {lineCount != null && <span className="chip-lines">{t("chat.lines", { lines: String(lineCount) })}</span>}
        </RowButton>
        );
      })}
      {p.editingText != null ? (
        <div className="edit-box-shell">
          {fileAttachments}
          <form className="edit-box" onSubmit={(ev) => { ev.preventDefault(); submitEdit(); }}>
            <div className="edit-message-body">
              <label className="sr-only" htmlFor={`edit-message-${i}`}>
                {t("action.edit-resend")}
              </label>
              <Textarea
                ref={editTextareaRef}
                id={`edit-message-${i}`}
                variant="bare"
                className="edit-message-textarea tw:min-h-12 tw:max-h-40 tw:resize-none"
                autoFocus
                value={p.editingText}
                rows={1}
                onChange={(ev) => p.onEditingChange(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Escape") p.onEditingChange(null);
                  if (ev.key === "Enter" && !ev.shiftKey) {
                    // même garde IME que le composer (fix plan 015)
                    if (ev.nativeEvent.isComposing) return;
                    ev.preventDefault();
                    submitEdit();
                  }
                }}
              />
            </div>
            <div className="edit-actions">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="edit-cancel tw:rounded-full tw:px-3"
                onClick={() => p.onEditingChange(null)}
              >
                {t("action.cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="edit-send tw:rounded-full tw:px-3"
                disabled={!p.editingText.trim()}
              >
                {t("action.send")}
              </Button>
            </div>
          </form>
        </div>
      ) : e.text.trim() || (e.label && !e.imageUrl && !e.notes?.length) ? (
        <Bubble variant="secondary" align="end" className="user-bubble-shell">
          <BubbleContent className="user-bubble tw:rounded-2xl">
            {attachmentLabels.length > 0 && fileAttachments}
            {annotationView.cards.length ? <>
              {annotationView.prompt && <div className="chat-annotation-prompt">{p.renderBubbleText(annotationView.prompt)}</div>}
              {annotationView.cards.map((annotation, index) => <AnnotationCard key={index} annotation={annotation} />)}
            </> : p.renderBubbleText(e.text)}
          </BubbleContent>
        </Bubble>
      ) : null /* pièce jointe seule (figure annotée) : pas de bulle vide */}
      {p.editingText == null && <MessageFooter className="msg-actions tw:px-0">
        {e.ts && (
          <span className="msg-time">
            {fmtTime(e.ts, p.timeFormat)}
          </span>
        )}
        <CopyMessageAction text={e.text} />
        <MessageAction label={t("action.edit-resend")} onClick={() => p.onEditingChange(e.text)}>
          <PencilIcon />
        </MessageAction>
        <MessageAction label={t("chat.revert-title")} onClick={() => p.onRevert(i, e.text, false)}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.5 3.5 5 8l4.5 4.5" />
            <path d="M5 8h5a3 3 0 0 1 0 6H8.5" />
          </svg>
        </MessageAction>
        <PinBtn pinned={p.pinned} onClick={() => p.onTogglePin(i, e.text.slice(0, 44))} />
      </MessageFooter>}
    </MessageContent>
    </Message>
  );
});


// Titres réels pour les citations [kb:…] (plan 052) : lecture du store
// partagé ; si un texte cite la base avant tout chargement, on demande la
// liste (TTL 30 s — no-op sinon).
function useKbCiteSources(text: string) {
  const sources = useSyncExternalStore(subscribeKbSources, kbSourcesSnapshot);
  useEffect(() => {
    if (text.includes("[kb:")) requestKbSources();
  }, [text]);
  return sources;
}

export function StreamingText(p: { text: string; working: boolean; streamKey?: string }) {
  const plugins = useMdPlugins();
  const text = useSmoothedStream(p.text, p.working, p.streamKey);
  const kbCiteSources = useKbCiteSources(text);
  return (
    <Message align="start" className="chat-message assistant-message">
    <MessageContent className="msg-wrap">
      <Bubble variant="ghost" className="tw:w-full">
      <BubbleContent className="msg chat-md is-streaming tw:w-full">
        <MdBody
          text={decorateKbCites(normalizeMathDelimiters(text), kbCiteSources)}
          streaming={p.working}
          components={MD_COMPONENTS_STREAMING as any}
          remarkPlugins={plugins.remark}
          rehypePlugins={plugins.rehype}
        />
      </BubbleContent>
      </Bubble>
    </MessageContent>
    </Message>
  );
}

export const AssistantText = memo(function AssistantText(p: {
  event: Extract<AgentEvent, { kind: "text" }>;
  index: number;
  timeFormat: TimeFormat;
  pinned: boolean;
  showActions?: boolean;
  onFork: (index: number) => void;
  onTogglePin: (index: number, label: string) => void;
  /** Clé de rangée : reprend la frappe là où la bulle streaming l'a laissée
   * quand le done la remplace par ce texte final (relais anti-« tout d'un
   * coup », 2026-08-25). Absente ou sans relais → texte entier, zéro coût. */
  streamKey?: string;
}) {
  const e = p.event;
  const i = p.index;
  const plugins = useMdPlugins();
  const lisse = useSmoothedStream(e.text, false, p.streamKey);
  const enFinition = lisse !== e.text;
  const kbCiteSources = useKbCiteSources(e.text);
  return (
    <Message id={`msg-${i}`} align="start" className="chat-message assistant-message">
    <MessageContent className="msg-wrap">
      <Bubble variant="ghost" className="tw:w-full">
      <BubbleContent className="msg chat-md tw:w-full">
        <MdBody
          text={decorateKbCites(normalizeMathDelimiters(lisse), kbCiteSources)}
          streaming={enFinition}
          components={(enFinition ? MD_COMPONENTS_STREAMING : MD_COMPONENTS) as any}
          remarkPlugins={plugins.remark}
          rehypePlugins={plugins.rehype}
        />
      </BubbleContent>
      </Bubble>
      {p.showActions !== false && !enFinition && <MessageFooter className="msg-actions is-persistent tw:px-0">
        {"ts" in e && e.ts && (
          <span className="msg-time">
            {fmtTime(e.ts, p.timeFormat)}
          </span>
        )}
        <CopyMessageAction text={e.text} />
        <MessageAction label={t("action.fork")} onClick={() => p.onFork(i)}>
          <ForkIcon />
        </MessageAction>
        <PinBtn pinned={p.pinned} onClick={() => p.onTogglePin(i, e.text.replace(/[#*>`]/g, "").trim().slice(0, 44))} />
      </MessageFooter>}
    </MessageContent>
    </Message>
  );
});

/** Capsule résultat (plan 020, étape 5) — UNIQUEMENT des données attribuables
 * au tour : statut terminal, fichiers réellement modifiés (diff à la demande),
 * review si lancée et annulation du tour. La télémétrie tokens/coût reste hors
 * de l'interface. Vocabulaire honnête : « Tour terminé », jamais « réussi ». */
export function ResultCapsule(p: {
  event: DoneEvent;
  isLastDone: boolean;
  threadId: string | null;
  review: ReviewState;
  /** carte enrichie « N fichiers modifiés » — dérivée par l'appelant depuis
   * les events `edit` du tour, rendue seulement pour le dernier tour terminé. */
  changedFiles?: ChangedFile[];
}) {
  const e = p.event;
  const minimalSuccess = e.ok;
  const stopped = isStoppedTerminal(e);
  return (
    <div id={p.isLastDone ? "last-done" : undefined}
      className={`done result-capsule ${e.ok || stopped ? "" : "warn"}`}>
      <div className={`capsule-head ${minimalSuccess ? "is-success-minimal" : ""}`}>
        {/* Le repli « Worked for… » porte déjà le succès. On ne garde un
            glyphe visible que pour l'interruption ; le succès reste annoncé
            aux lecteurs d'écran sans créer une ligne ✓ isolée. */}
        {e.ok ? (
          <span className="sr-only">{t("chat.turn-done")}</span>
        ) : stopped ? null : (
          <span className="capsule-status warn" title={t("chat.turn-interrupted")}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
            <span className="sr-only">{t("chat.turn-interrupted")}</span>
          </span>
        )}
        {/* Actions retirées (Thierry, 2026-08-21) : « Vérifier ce tour » (plus
            de déclenchement manuel — les réglages autoReview restent) et
            « Annuler le tour », doublon strict de l'action déjà portée par la
            bulle du message user, qui flottait en absolu par-dessus la carte
            des fichiers. L'annulation FICHIERS vit dans cette carte. */}
      </div>
      {/* Badge et détail de revue retirés (2026-08-21) : la barre Reviewer en
          haut de la timeline porte déjà le MÊME verdict (mêmes clés i18n), le
          compte d'issues, le nombre de vérifications et le bouton Corriger.
          Deux widgets branchés sur le même objet `review`, visibles ensemble
          sans le moindre clic. */}
      <DoneDiffToggle event={e} threadId={p.threadId} changedFiles={p.isLastDone ? p.changedFiles : undefined} />
    </div>
  );
}

/** Repli de fin de tour aligné sur Synara : durée et chevron seulement. */
export function ActivityFold(p: {
  fold: { key: string; hasDetail: boolean; ms: number | null; status: "worked" | "stopped" | "failed" };
  open: boolean;
  /** durée formatée du travail (fmtWorkDur) — null si non mesurable */
  duration: string | null;
  actions?: ToolAction[];
  plugins?: PluginCatalogEntry[];
  /** Horodatage optionnel de l'activité, visible uniquement si activé. */
  stamp?: ReactNode;
  onToggle: () => void;
}) {
  const activity = p.actions?.length ? summarizeActivity(p.actions, p.plugins) : null;
  const stopped = p.fold.status === "stopped";
  // An intentional stop with no tool detail has no useful terminal summary:
  // keep the partial answer and composer, but leave no status row behind.
  if (stopped && !p.fold.hasDetail) return null;
  const label = stopped
    ? (activity?.label ?? t("chat.activity"))
    : p.duration != null
    ? t(
        p.fold.status === "failed" ? "chat.failed-after" : "chat.worked-for",
        { duration: p.duration },
      )
    : t("chat.activity");
  if (!p.fold.hasDetail) {
    return (
      <div className={`ui-activity is-summary turn-fold-static is-${p.fold.status === "failed" ? "failed" : "completed"}`}>
        <span className="ui-activity-label turn-fold-label">{label}</span>
      </div>
    );
  }
  return (
    <ActivityDisclosure
      summary
      open={p.open}
      onToggle={p.onToggle}
      status={p.fold.status === "failed" ? "failed" : "completed"}
      icon={activity?.icon}
      meta={p.stamp ?? (activity ? label : undefined)}
      label={<span className="turn-fold-label">{activity?.label ?? label}</span>}
    />
  );
}

/** Dernière pensée du tour EN COURS. Deux sources selon le provider : l'état
 * actif quand le raisonnement est encore vivant, sinon le dernier bloc
 * `thinking` durable — Grok clôt chaque bloc, ce qui efface le live. On
 * s'arrête au premier signe qu'un tour précédent est terminé. */
export function currentThought(turn: ChatTurnViewModel | null, events: AgentEvent[]): string {
  const state = turn?.activeState;
  // TOUTES les tranches de pensée depuis la dernière narration (pas seulement
  // la dernière contiguë) : Ox Alpha alterne pensée/outils en petits blocs —
  // ne garder que le dernier bloc laissait un fragment (« W. », vécu
  // 2026-08-21). À l'intérieur d'une tranche, recollage SANS séparateur (Grok
  // coupe en plein mot) ; entre tranches séparées par des outils, un
  // paragraphe.
  // Instant RÉEL d'un événement : le réducteur recolle les morceaux de pensée
  // dans le bloc existant sans toucher à son `ts` d'origine, mais il remplace
  // son `meta` par celui du dernier morceau — c'est là que vit l'heure vraie.
  const timeOf = (event: AgentEvent): number => {
    const meta = (event as { meta?: { ts?: number } }).meta;
    return meta?.ts ?? (event as { ts?: number }).ts ?? 0;
  };
  // Bornes du tour + dernière narration assistant.
  let start = 0;
  let answerIdx = -1;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.kind === "user" || event.kind === "done" || event.kind === "error") { start = i + 1; break; }
    if (answerIdx < 0 && (event.kind === "text" || event.kind === "streaming")) answerIdx = i;
  }
  const answerTs = answerIdx >= 0 ? timeOf(events[answerIdx]) : 0;
  const stretches: string[][] = [];
  let current: string[] | null = null;
  for (let i = start; i < events.length; i += 1) {
    const event = events[i];
    if (event.kind === "thinking_live" || event.kind === "thinking") {
      if (!event.text) continue;
      // Une pensée située AVANT la réponse n'appartient au fil vivant que si
      // elle a continué de grossir APRÈS : Grok pense encore une fois la
      // réponse écrite, et le réducteur range ces morceaux dans le bloc
      // d'avant le texte sans le déplacer. Sinon c'est du raisonnement clos,
      // qui vit dans son bloc durable.
      if (answerIdx >= 0 && i < answerIdx && timeOf(event) <= answerTs) { current = null; continue; }
      if (!current) { current = []; stretches.push(current); }
      current.push(event.text);
      continue;
    }
    // Outil ou autre : clôt la tranche courante, la collecte continue.
    current = null;
  }
  const joined = stretches.map((blocks) => blocks.join("")).join("\n\n");
  if (joined.trim()) return joined;
  return state?.kind === "reasoning" ? state.texts.join("") : "";
}

/** Chronomètre unique : les outils restent dans la chronologie du tour. */
export function ActiveTurnHeader(p: {
  turn: ChatTurnViewModel;
  since: number;
  tokens?: number | null;
}) {
  return (
    <div className="working-stack active-turn-header" data-turn-id={p.turn.turnId ?? p.turn.key}>
      <div className="working-row"><Working since={p.turn.startedAtMs ?? p.since} tokens={p.tokens} /></div>
    </div>
  );
}

/** Libellé courant sans rouleau vertical : un appel bref ne fait plus
 * défiler les anciens noms avant de rendre le résumé des résultats. */
export function ToolRunTicker(
  { rows }: { rows: { key: string; label: string; pre?: string; code?: string; post?: string }[] },
) {
  const row = rows[rows.length - 1];
  if (!row) return null;
  return (
    <span className="tool-ticker" role="status" aria-live="polite">
      <span className="tool-ticker-row">
        {row.code != null
          ? <>{row.pre}<code className="tool-ticker-code">{row.code}</code>{row.post}</>
          : row.label}
      </span>
    </span>
  );
}


export function ActiveTurnTail(p: {
  turn: ChatTurnViewModel;
  events: AgentEvent[];
  lastEventAt?: number | null;
  onStop: () => void;
  since?: number;
}) {
  const fallbackSince = useRef(Date.now());
  const status = activeTurnStatus(p.turn, p.events);

  return (
    <div className="working-stack active-turn-tail" data-turn-id={p.turn.turnId ?? p.turn.key}>
      {/* Stable live status: a quiet provider is still working until the turn
          settles. Keep this slot mounted so updates never shift the timeline. */}
      <TurnActivityStatus label={status.label} kind={status.kind} since={p.turn.startedAtMs ?? p.since ?? fallbackSince.current} />
    </div>
  );
}

export function TurnActivityStatus({ label, since, kind = "processing" }: { label: string; since: number; kind?: string }) {
  const settled = kind === "failed" || kind === "interrupted";
  return (
    <div className={`turn-tail-row${settled ? " is-settled" : ""}`} data-activity-state={kind}>
        <svg className="turn-activity-glyph" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 2.5c.8 4.3 3.2 6.7 7.5 7.5-4.3.8-6.7 3.2-7.5 7.5C9.2 13.2 6.8 10.8 2.5 10 6.8 9.2 9.2 6.8 10 2.5Z" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span
          className="turn-quiet is-on turn-working-shimmer"
          role="status"
          aria-live="polite"
        >
          {label}
        </span>
      <Working since={since} compact />
    </div>
  );
}
