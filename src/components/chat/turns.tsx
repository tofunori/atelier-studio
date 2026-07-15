// Composants de tour du chat (plan 015, slice 4) — JSX déplacé verbatim
// depuis le dispatcher de Chat.tsx. Chaque composant est memoizable : état
// (editing, plis, review) et callbacks restent dans Chat, passés en props.
// Clés et classes inchangées : le streaming et l'ancrage ne bougent pas.
import { memo, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { CheckIcon } from "lucide-react";
import { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { normalizeMathDelimiters, hardenPartialMarkdown } from "../../lib/markdown";
import { CopyIcon, ForkIcon, ResumeIcon } from "../icons";
import { MD_COMPONENTS, MD_COMPONENTS_STREAMING, useMdPlugins } from "./md";
import { DoneDiffToggle, fmtTime, PinBtn } from "./turnParts";
import { groupIconCat, summarizeTools } from "./toolPresentation";
import { ActivityDisclosure, Button, EmptyState, IconButton, Tooltip, showError, showSuccess } from "../ui";
import { Bubble, BubbleContent } from "../shadcn/bubble";
import { Message, MessageContent, MessageFooter } from "../shadcn/message";

type TimeFormat = "system" | "24h" | "12h" | undefined;
type UserEvent = Extract<AgentEvent, { kind: "user" }>;
type DoneEvent = Extract<AgentEvent, { kind: "done" }>;
type ToolAction = Extract<AgentEvent, { kind: "tool" | "tool_update" }>;
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
  return (
    <Message id={`msg-${i}`} align="end" className="chat-message user-message">
    <MessageContent className="user-wrap">
      {e.imageUrl && <img className="user-img" src={e.imageUrl} alt="" />}
      {e.label && <div className="user-label">{e.label}</div>}
      {e.pastes && e.pastes.map((pa, j) => (
        <button key={j} type="button" className="chip paste-chip"
          onClick={() => p.onOpenPaste({ name: pa.name, text: pa.text })}>
          <svg className="chip-doc" width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
            <rect x="0.8" y="0.8" width="9.4" height="11.4" rx="1.6" />
            <path d="M3 4.4h5M3 6.8h5M3 9.2h3.4" />
          </svg>
          <span className="chip-label">{pa.name}</span>
          <span className="chip-lines">{t("chat.lines", { lines: String(pa.text.split("\n").length) })}</span>
        </button>
      ))}
      {p.editingText != null ? (
        <div className="edit-box">
          <textarea
            autoFocus
            value={p.editingText}
            rows={Math.min(8, Math.max(2, p.editingText.split("\n").length))}
            onChange={(ev) => p.onEditingChange(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") p.onEditingChange(null);
              if (ev.key === "Enter" && !ev.shiftKey) {
                // même garde IME que le composer (fix plan 015)
                if (ev.nativeEvent.isComposing) return;
                ev.preventDefault();
                if (p.editingText!.trim()) {
                  p.onEditSend(i, e.text, p.editingText!);
                  p.onEditingChange(null);
                }
              }
            }}
          />
          <div className="edit-actions">
            <button type="button" className="edit-cancel" onClick={() => p.onEditingChange(null)}>
              {t("action.cancel")}
            </button>
            <button
              type="button"
              className="edit-send"
              onClick={() => {
                if (p.editingText!.trim()) {
                  p.onEditSend(i, e.text, p.editingText!);
                  p.onEditingChange(null);
                }
              }}
            >
              {t("action.send")}
            </button>
          </div>
        </div>
      ) : (
        <Bubble variant="secondary" align="end" className="user-bubble-shell">
          <BubbleContent className="user-bubble tw:rounded-[var(--radius-control)]">
            {p.renderBubbleText(e.text)}
          </BubbleContent>
        </Bubble>
      )}
      <MessageFooter className="msg-actions tw:px-0">
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
      </MessageFooter>
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
            <button type="button" className="capsule-act" title={t("chat.revert-title")}
              onClick={p.onRevertTurn}>
              {t("chat.revert-turn")}
            </button>
          )}
          {p.isLastDone && !review && (
            <button
              type="button"
              className="done-verify"
              title={t("review.verify")}
              onClick={p.onStartReview}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z" />
                <path d="M5.8 8l1.6 1.6L10.5 6.3" />
              </svg>
              {t("review.verify-now")}
            </button>
          )}
        </span>
      </div>
      {p.isLastDone && review && (
        <button
          type="button"
          className={`review-badge v-${review.status === "running" ? "running" : review.verdict}`}
          disabled={!review.issues?.length}
          aria-expanded={p.reviewOpen}
          onClick={() => review.issues?.length && p.onToggleReviewOpen()}
        >
          {review.status === "running" ? t("review.running")
            : review.verdict === "ok" ? t("review.ok")
            : review.verdict === "issues" ? t("review.issues", { n: review.issues?.length ?? 0 })
            : t("review.inconclusive")}
        </button>
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
  fold: { key: string; ms: number | null };
  open: boolean;
  /** durée formatée du travail (fmtWorkDur) — null si non mesurable */
  duration: string | null;
  onToggle: () => void;
}) {
  return (
    <ActivityDisclosure summary open={p.open} onToggle={p.onToggle}
      label={<span className="turn-fold-label">
        {p.duration != null ? t("chat.worked-for", { duration: p.duration }) : t("chat.activity")}
      </span>}
    />
  );
}

export function ActivityGroup(p: {
  actions: ToolAction[];
  open: boolean;
  onToggle: () => void;
  renderToolLine: (action: ToolAction, offset: number) => ReactNode;
}) {
  const updates = p.actions.filter((a): a is Extract<AgentEvent, { kind: "tool_update" }> => a.kind === "tool_update");
  const failed = updates.some((a) => a.status === "failed" || (a.exitCode != null && a.exitCode !== 0));
  const running = updates.some((a) => a.status === "running" || a.status === "pending");
  const status = failed ? "failed" : running ? "running" : "completed";
  const durationMs = updates.reduce((sum, a) => sum + (a.durationMs ?? 0), 0);
  const duration = durationMs >= 1000 ? `${Math.round(durationMs / 100) / 10}s` : durationMs ? `${durationMs}ms` : null;
  // Le nom technique (Bash, Read, execute_command…) n'est jamais le libellé
  // principal. Une action reste compréhensible avant d'ouvrir son détail brut.
  const summary = summarizeTools([p.actions[p.actions.length - 1]]);
  return (
    <ActivityDisclosure open={p.open} onToggle={p.onToggle} status={status}
      icon={groupIconCat(p.actions)} label={summary}
      meta={duration ?? (status === "running" ? t("chat.working") : "")}>
        <div className="tool-group-list">
          {p.actions.map((action, offset) => p.renderToolLine(action, offset))}
        </div>
    </ActivityDisclosure>
  );
}
