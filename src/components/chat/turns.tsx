// Composants de tour du chat (plan 015, slice 4) — JSX déplacé verbatim
// depuis le dispatcher de Chat.tsx. Chaque composant est memoizable : état
// (editing, plis, review) et callbacks restent dans Chat, passés en props.
// Clés et classes inchangées : le streaming et l'ancrage ne bougent pas.
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { CheckIcon } from "lucide-react";
import { AgentEvent } from "../../lib/ws";
import type { ChatTurnViewModel, ToolAction } from "../../lib/chat/turnViewModel";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { t } from "../../lib/i18n";
import { normalizeMathDelimiters, hardenPartialMarkdown } from "../../lib/markdown";
import { CopyIcon, ForkIcon, ResumeIcon } from "../icons";
import { MD_COMPONENTS, MD_COMPONENTS_STREAMING, useMdPlugins } from "./md";
import { DoneDiffToggle, fmtTime, PinBtn, LiveThinking, ThinkingShimmer, Working, reasoningSummary } from "./turnParts";
import {
  activeToolLabel, activityIconForAction, activityIconForPhase,
  distinctToolActions, summarizeActivity,
} from "./toolPresentation";
import { ActivityDisclosure, Button, EmptyState, IconButton, RowButton, Tooltip, showError, showSuccess } from "../ui";
import { Bubble, BubbleContent } from "../shadcn/bubble";
import { Button as ShadcnButton } from "../shadcn/button";
import { Message, MessageContent, MessageFooter } from "../shadcn/message";
import { Textarea } from "../shadcn/textarea";

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
      {e.imageUrl && <img className="user-img" src={e.imageUrl} alt="" />}
      {e.label && <div className="user-label">{e.label}</div>}
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
              <ShadcnButton
                type="button"
                variant="outline"
                size="sm"
                className="edit-cancel tw:rounded-full tw:px-3"
                onClick={() => p.onEditingChange(null)}
              >
                {t("action.cancel")}
              </ShadcnButton>
              <ShadcnButton
                type="submit"
                size="sm"
                className="edit-send tw:rounded-full tw:px-3"
                disabled={!p.editingText.trim()}
              >
                {t("action.send")}
              </ShadcnButton>
            </div>
          </form>
        </div>
      ) : (
        <Bubble variant="secondary" align="end" className="user-bubble-shell">
          <BubbleContent className="user-bubble tw:rounded-2xl">
            {p.renderBubbleText(e.text)}
          </BubbleContent>
        </Bubble>
      )}
      {p.editingText == null && <MessageFooter className="msg-actions tw:px-0">
        {e.ts && (
          <span className="msg-time">
            {fmtTime(e.ts, p.timeFormat)}
          </span>
        )}
        <CopyMessageAction text={e.text} />
        <MessageAction label={t("action.edit-resend")} onClick={() => p.onEditingChange(e.text)}>
          <span aria-hidden="true">✎</span>
        </MessageAction>
        <MessageAction label={t("chat.revert-title")} onClick={() => p.onRevert(i, e.text, false)}>
          <span aria-hidden="true">↩</span>
        </MessageAction>
        <PinBtn pinned={p.pinned} onClick={() => p.onTogglePin(i, e.text.slice(0, 44))} />
      </MessageFooter>}
    </MessageContent>
    </Message>
  );
});

export function StreamingText(p: { text: string; working: boolean }) {
  const plugins = useMdPlugins();
  return (
    <Message align="start" className="chat-message assistant-message">
    <MessageContent className="msg-wrap">
      <Bubble variant="ghost" className="tw:w-full">
      <BubbleContent className="msg typeset typeset-chat tw:w-full">
        <ReactMarkdown
          remarkPlugins={plugins.remark}
          rehypePlugins={plugins.rehype}
          components={MD_COMPONENTS_STREAMING as any}
        >
          {normalizeMathDelimiters(hardenPartialMarkdown(p.text))}
        </ReactMarkdown>
        {p.working && <span className="stream-caret" />}
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
  onFork: (index: number) => void;
  onTogglePin: (index: number, label: string) => void;
}) {
  const e = p.event;
  const i = p.index;
  const plugins = useMdPlugins();
  return (
    <Message id={`msg-${i}`} align="start" className="chat-message assistant-message">
    <MessageContent className="msg-wrap">
      <Bubble variant="ghost" className="tw:w-full">
      <BubbleContent className="msg typeset typeset-chat tw:w-full">
        <ReactMarkdown
          remarkPlugins={plugins.remark}
          rehypePlugins={plugins.rehype}
          components={MD_COMPONENTS as any}
        >
          {normalizeMathDelimiters(e.text)}
        </ReactMarkdown>
      </BubbleContent>
      </Bubble>
      <MessageFooter className="msg-actions tw:px-0">
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
      </MessageFooter>
    </MessageContent>
    </Message>
  );
});

/** Formatage compact des tokens (« 8,1k ») — jamais de valeur inventée. */
function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
}

/** Capsule résultat (plan 020, étape 5) — UNIQUEMENT des données attribuables
 * au tour : statut terminal, fichiers réellement modifiés (diff à la demande),
 * usage enregistré (« Usage indisponible » sinon), review si lancée, annulation
 * du tour. Vocabulaire honnête : « Tour terminé », jamais « réussi ». */
export function ResultCapsule(p: {
  event: DoneEvent;
  isLastDone: boolean;
  threadId: string | null;
  review: ReviewState;
  reviewOpen: boolean;
  onStartReview: () => void;
  onToggleReviewOpen: () => void;
  /** annule le tour (revert au message user) — null si non attribuable */
  onRevertTurn: (() => void) | null;
}) {
  const e = p.event;
  const review = p.review;
  const usage = e.usage;
  return (
    <div id={p.isLastDone ? "last-done" : undefined}
      className={`done result-capsule ${e.ok ? "" : "warn"}`}>
      <div className="capsule-head">
        {/* glyphe + libellé sr-only : le record reste lisible aux lecteurs
            d'écran sans texte « Tour terminé » à l'écran (demande Thierry) */}
        <span className={`capsule-status ${e.ok ? "ok" : "warn"}`} title={e.ok ? t("chat.turn-done") : t("chat.turn-interrupted")}>
          {e.ok ? "✓" : "✗"}
          <span className="sr-only">{e.ok ? t("chat.turn-done") : t("chat.turn-interrupted")}</span>
        </span>
        {usage && usage.output != null ? (
          <span className="capsule-meta">
            {`${fmtTokens(usage.output)} tokens${usage.cost != null ? ` · ${usage.cost.toFixed(2).replace(".", ",")} $` : ""}`}
          </span>
        ) : (
          // honnêteté sans bruit : l'absence d'usage reste un fait annoncé
          // aux lecteurs d'écran, pas une ligne visible
          <span className="sr-only">{t("chat.usage-unavailable")}</span>
        )}
        <span className="capsule-actions">
          {p.isLastDone && p.onRevertTurn && (
            <Button variant="ghost" className="capsule-act" title={t("chat.revert-title")}
              onClick={p.onRevertTurn}>
              {t("chat.revert-turn")}
            </Button>
          )}
          {p.isLastDone && !review && (
            <Button
              variant="ghost"
              className="done-verify"
              title={t("review.verify")}
              onClick={p.onStartReview}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z" />
                <path d="M5.8 8l1.6 1.6L10.5 6.3" />
              </svg>
              {t("review.verify-now")}
            </Button>
          )}
        </span>
      </div>
      {p.isLastDone && review && (
        <RowButton
          className={`review-badge v-${review.status === "running" ? "running" : review.verdict}`}
          disabled={!review.issues?.length}
          aria-expanded={p.reviewOpen}
          onClick={() => review.issues?.length && p.onToggleReviewOpen()}
        >
          {review.status === "running" ? t("review.running")
            : review.verdict === "ok" ? t("review.ok")
            : review.verdict === "issues" ? t("review.issues", { n: review.issues?.length ?? 0 })
            : t("review.inconclusive")}
        </RowButton>
      )}
      {p.isLastDone && p.reviewOpen && review?.issues?.length ? (
        <div className="review-detail">
          {review.issues.map((iss, k) => (
            <div key={k} className={`review-issue s-${iss.severity}`}>
              <div className="ri-claim">« {iss.claim} »</div>
              <div className="ri-problem">{iss.problem}</div>
            </div>
          ))}
        </div>
      ) : null}
      <DoneDiffToggle event={e} threadId={p.threadId} />
    </div>
  );
}

/** Repli de fin de tour aligné sur Synara : durée et chevron seulement. */
export function ActivityFold(p: {
  fold: { key: string; hasDetail: boolean; ms: number | null; status: "worked" | "stopped" | "failed" };
  open: boolean;
  /** durée formatée du travail (fmtWorkDur) — null si non mesurable */
  duration: string | null;
  onToggle: () => void;
}) {
  const label = p.duration != null
    ? t(
        p.fold.status === "stopped" ? "chat.stopped-after" : p.fold.status === "failed" ? "chat.failed-after" : "chat.worked-for",
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
      label={<span className="turn-fold-label">{label}</span>}
    />
  );
}

function activeEventLabel(turn: ChatTurnViewModel, events: AgentEvent[]): ReactNode {
  const state = turn.activeState;
  if (!state) return t("chat.thinking");
  if (state.kind === "waiting") return t("chat.activity-awaiting");
  if (state.kind === "reasoning") {
    const summary = reasoningSummary(state.texts[state.texts.length - 1] ?? "");
    return summary || t("chat.thinking");
  }
  if (state.kind === "thinking") return <ThinkingShimmer />;
  if (state.kind === "activity") {
    const event = events[state.eventIndex];
    if (event?.kind === "activity") return [event.title, event.detail].filter(Boolean).join(" · ");
    if (event?.kind === "tool" || event?.kind === "tool_update") return activeToolLabel(event);
  }
  return t("chat.thinking");
}

/** Une seule ligne d'activité courante, comme Codex. Les segments terminés
 * restent à leur place dans le transcript au lieu d'être aspirés ici. */
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

export function ActiveTurnTail(p: {
  turn: ChatTurnViewModel;
  events: AgentEvent[];
  open: boolean;
  onToggle: () => void;
  onStop: () => void;
  plugins?: PluginCatalogEntry[];
  renderToolLine: (action: ToolAction, key: React.Key) => ReactNode;
}) {
  const state = p.turn.activeState;
  const activeGroups = p.turn.activeActionGroups;
  const actions = activeGroups.flatMap((group) => group.actions);
  const distinctActions = distinctToolActions(actions);
  const updates = distinctActions.filter((action): action is Extract<AgentEvent, { kind: "tool_update" }> => action.kind === "tool_update");
  const failed = updates.some((action) => action.status === "failed" || (action.exitCode != null && action.exitCode !== 0));
  const running = updates.some((action) => /^(running|pending|in[-_]?progress)$/i.test(action.status ?? ""));
  const status = failed ? "failed" : running || (state?.kind === "activity" && state.live) ? "running" : "completed";
  const actionCount = activeGroups.length;
  const activeEvent = state?.kind === "activity" ? p.events[state.eventIndex] : null;
  const icon = activeEvent?.kind === "tool" || activeEvent?.kind === "tool_update"
    ? activityIconForAction(activeEvent, p.plugins)
    : activeEvent?.kind === "activity" ? activityIconForPhase(activeEvent.phase) : undefined;
  const labelKey = state?.kind === "activity"
    ? `activity:${state.eventIndex}:${activeEvent?.kind === "tool_update" ? activeEvent.status ?? "" : "started"}`
    : state?.kind ?? "thinking";
  const showsActivity = state?.kind === "activity" || state?.kind === "waiting";

  return (
    <div className="working-stack active-turn-tail" data-turn-id={p.turn.turnId ?? p.turn.key}>
      {state?.kind === "answering" ? null : !showsActivity ? (
        <LiveThinking />
      ) : (
        <ActivityDisclosure
          open={p.open}
          onToggle={p.onToggle}
          status={status}
          shimmer={state?.kind === "activity" && state.live && status === "running"}
          icon={icon}
          label={<span key={labelKey} className="active-activity-transition">{activeEventLabel(p.turn, p.events)}</span>}
          meta={actionCount > 1 ? t("chat.active-action-n", { n: actionCount }) : undefined}
        >
          {activeGroups.length > 0 ? <div className="active-work-detail">
            {activeGroups.map((group) => (
              <div className="tool-group-list" key={group.key}>
                {distinctToolActions(group.actions).map((action, offset) => p.renderToolLine(action, `${group.key}:${offset}`))}
              </div>
            ))}
          </div> : null}
        </ActivityDisclosure>
      )}
      <RowButton className="stop-hint" title={t("action.interrupt")} onClick={p.onStop}>
        <kbd>esc</kbd> {t("action.interrupt")}
      </RowButton>
    </div>
  );
}

export function ActivityGroup(p: {
  actions: ToolAction[];
  plugins?: PluginCatalogEntry[];
  open: boolean;
  onToggle: () => void;
  renderToolLine: (action: ToolAction, offset: number) => ReactNode;
}) {
  const distinctActions = distinctToolActions(p.actions);
  const summary = summarizeActivity(distinctActions, p.plugins);
  const updates = distinctActions.filter((a): a is Extract<AgentEvent, { kind: "tool_update" }> => a.kind === "tool_update");
  const failed = updates.some((a) => a.status === "failed" || (a.exitCode != null && a.exitCode !== 0));
  // Toute ActivityGroup rendue dans la timeline est une tranche déjà fermée:
  // l'unité courante est exclusivement ActiveTurnTail. Codex la rend donc
  // statique même si le provider n'a pas encore terminalisé son tool_update.
  const status = failed ? "failed" : "completed";
  // Le nom technique (Bash, Read, execute_command…) n'est jamais le libellé
  // principal. Une action reste compréhensible avant d'ouvrir son détail brut.
  return (
    <ActivityDisclosure open={p.open} onToggle={p.onToggle} status={status} shimmer={false}
      icon={summary.icon} label={summary.label}
      meta={undefined}>
        <div className="tool-group-list">
          {distinctActions.map((action, offset) => p.renderToolLine(action, offset))}
        </div>
    </ActivityDisclosure>
  );
}
