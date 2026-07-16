// ChatTimeline (plan 015, correction 3) : composant de PRODUCTION de la
// timeline — barre du reviewer, liste des tours (streaming/outils/résultats),
// indicateur Working, chapitres épinglés, bouton « aller au dernier message ».
// JSX déplacé VERBATIM depuis Chat.tsx ; les bundles sont déstructurés vers les
// noms locaux d'origine pour garantir l'équivalence pixel.
import React, { type MutableRefObject, type ReactNode, type RefObject } from "react";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { Tick } from "./toolPresentation";
import { AgentEvent } from "../../lib/ws";
import type { ProjectedTimelineItem, ToolAction, TurnPhase } from "../../lib/chat/turnViewModel";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { transitionScrollPolicy } from "../../lib/chat/scrollPolicy";
import { t } from "../../lib/i18n";
import { isValidSkill } from "./mentions";
import { CloseIcon, MinusIcon, ZapIcon } from "../icons";
import {
  ChatEmptyState, UserTurn, StreamingText, AssistantText, ResultCapsule,
  ActivityFold, ActivityGroup, ActiveTurnHeader, ActiveTurnTail, type ReviewState,
} from "./turns";
import { ResearchHome, type ResearchHomeBundle } from "../ResearchHome";
import { ThinkingBlock, EditLine, ActivityCard, LiveThinking, Working, formatPermInput } from "./turnParts";
import { HarnessInteraction } from "./HarnessInteraction";
import { ProposedPlanCard } from "./ProposedPlanCard";
import { Button, IconButton, RowButton, ScrollToBottomButton } from "../ui";
import { Input } from "../shadcn/input";
import { Popover, PopoverContent } from "../shadcn/popover";
import {
  AgentActivityGroup,
  type AgentDisplay,
  type AgentToolAction,
} from "./AgentActivity";

type RenderedItem =
  | ProjectedTimelineItem
  | { type: "actions"; actions: ToolAction[]; index: number; key: string }
  | { type: "agents"; actions: AgentToolAction[]; index: number; key: string };

type TimelineVirtualItem =
  | { type: "empty"; key: "timeline-empty" }
  | { type: "rendered"; key: string; item: RenderedItem }
  | { type: "working"; key: "message-working" };

export type TimelineThread = {
  threadId: string | null;
  events: AgentEvent[];
  workingSince: number | null;
  /** tokens de sortie du tour en cours — affichés à côté du temps écoulé */
  liveTokens: number | null;
  phase: TurnPhase;
};
export type TimelineReview = {
  review: ReviewState & { checks?: number; checkedTools?: string[]; checkedFiles?: string[] } | null;
  reviewMin: boolean; setReviewMin: React.Dispatch<React.SetStateAction<boolean>>;
  setReview: React.Dispatch<React.SetStateAction<any>>;
  barOpen: boolean; setBarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  fixing: boolean; setFixing: React.Dispatch<React.SetStateAction<boolean>>;
  reviewOpen: boolean; setReviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
};
export type TimelineList = {
  renderedEvents: RenderedItem[];
  openFolds: Set<string>; setOpenFolds: React.Dispatch<React.SetStateAction<Set<string>>>;
  openToolGroups: Set<string>; setOpenToolGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  renderToolLine: (e: ToolAction, key: React.Key) => ReactNode;
  fmtWorkDur: (ms: number) => string;
  plugins: PluginCatalogEntry[];
  onOpenAgent: (agent: AgentDisplay) => void;
};
export type TimelineMsg = {
  editing: { index: number; text: string } | null;
  setEditing: React.Dispatch<React.SetStateAction<{ index: number; text: string } | null>>;
  pins: { index: number; label: string; color?: string; style?: string }[];
  onTogglePin: (index: number, label: string) => void;
  onRevert: (index: number, text: string, edit: boolean) => void;
  onEditSend: (index: number, oldText: string, newText: string) => void;
  onFork: (index: number) => void;
  setPasteView: (v: { name: string; text: string } | null) => void;
  commands: { name: string; source: string }[];
  defaults: { timeFormat?: "system" | "24h" | "12h" };
  onQuote: (text: string) => void;
};
export type TimelineScroll = {
  messagesRef: RefObject<HTMLDivElement | null>;
  onMessagesMouseUp: (e: React.MouseEvent) => void;
};
export type TimelineWorking = { onStop: () => void };
export type TimelineChapters = {
  tickPos: Record<number, number>;
  resolvePinEl: (index: number, label: string, anchor?: string) => HTMLElement | null | undefined;
  pinMenu: { index: number; x: number; y: number } | null;
  setPinMenu: React.Dispatch<React.SetStateAction<{ index: number; x: number; y: number } | null>>;
  onStylePin: (index: number, patch: { color?: string; style?: string; label?: string }) => void;
};
export type TimelineEmpty = {
  onNewChat: () => void;
  onOpenProject: () => void;
  /** Research Home (plan 017) — remplace l'empty-card générique si fourni */
  home?: ResearchHomeBundle | null;
};

export function ChatTimeline(p: {
  thread: TimelineThread;
  rev: TimelineReview;
  list: TimelineList;
  msg: TimelineMsg;
  scroll: TimelineScroll;
  working: TimelineWorking;
  chapters: TimelineChapters;
  empty: TimelineEmpty;
  selection: {
    quote: { x: number; y: number; text: string } | null;
    setQuote: React.Dispatch<React.SetStateAction<{ x: number; y: number; text: string } | null>>;
    quoteHasHl: boolean;
    quoteHasUl: boolean;
    addMark: (text: string, kind: "hl" | "ul") => void;
    removeMark: (text: string, kind: "hl" | "ul") => void;
  };
}) {
  const { threadId, events, workingSince, liveTokens, phase } = p.thread;
  const { review, reviewMin, setReviewMin, setReview, barOpen, setBarOpen, fixing, setFixing, reviewOpen, setReviewOpen } = p.rev;
  const {
    renderedEvents, openFolds, setOpenFolds, openToolGroups, setOpenToolGroups,
    renderToolLine, fmtWorkDur, plugins, onOpenAgent,
  } = p.list;
  const { editing, setEditing, pins, onTogglePin, onRevert, onEditSend, onFork, setPasteView, commands, defaults, onQuote } = p.msg;
  const { messagesRef, onMessagesMouseUp } = p.scroll;
  const { onStop } = p.working;
  const { tickPos, resolvePinEl, pinMenu, setPinMenu, onStylePin } = p.chapters;
  const { onNewChat, onOpenProject } = p.empty;
  const { quote, setQuote, quoteHasHl, quoteHasUl, addMark, removeMark } = p.selection;
  void onQuote; void openFolds; // utilisés par des handlers/branches copiés verbatim
  const timelineListRef = React.useRef<LegendListRef>(null);
  const timelineWrapRef = React.useRef<HTMLDivElement>(null);
  const [autoFollow, setAutoFollow] = React.useState(true);
  const [isScrolledFromBottom, setIsScrolledFromBottom] = React.useState(false);
  const phaseRef = React.useRef<TurnPhase>(phase);
  const virtualItems = React.useMemo<TimelineVirtualItem[]>(() => {
    const rows: TimelineVirtualItem[] = [];
    if (!threadId || events.length === 0) rows.push({ type: "empty", key: "timeline-empty" });
    for (const item of renderedEvents) {
      if (item.type === "event" && item.event.kind === "goal") continue;
      const key = item.type === "event" ? `event-${item.index}` : item.type === "fold" ? item.fold.key : item.key;
      rows.push({ type: "rendered", key, item });
    }
    if (workingSince != null && !renderedEvents.some((item) => item.type === "active-turn-header")) {
      rows.push({ type: "working", key: "message-working" });
    }
    return rows;
  }, [events.length, renderedEvents, threadId, workingSince]);
  const listExtraData = React.useMemo(() => ({
    editing,
    openToolGroups,
    pins,
    reviewOpen,
    workingSince,
  }), [editing, openToolGroups, pins, reviewOpen, workingSince]);
  const virtualIndexForEvent = React.useCallback((eventIndex: number) => (
    virtualItems.findIndex((row) => row.type === "rendered" && row.item.type === "event" && row.item.index === eventIndex)
  ), [virtualItems]);
  let finalAnswerIndex = -1;
  if (phase === "final_answer") {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index].kind === "streaming" || events[index].kind === "text") {
        finalAnswerIndex = index;
        break;
      }
    }
  }
  const finalAnswerVirtualIndex = finalAnswerIndex >= 0 ? virtualIndexForEvent(finalAnswerIndex) : -1;

  React.useEffect(() => {
    const listScrollRef = timelineListRef.current?.getNativeScrollRef();
    const native = listScrollRef instanceof HTMLDivElement
      ? listScrollRef
      : timelineWrapRef.current?.querySelector<HTMLDivElement>(".messages") ?? null;
    (messagesRef as MutableRefObject<HTMLDivElement | null>).current = native;
    if (!native) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        setAutoFollow(false);
        setIsScrolledFromBottom(true);
      }
    };
    const onScroll = () => {
      const distance = native.scrollHeight - native.clientHeight - native.scrollTop;
      const awayFromBottom = distance > 32;
      setIsScrolledFromBottom((current) => current === awayFromBottom ? current : awayFromBottom);
      if (!awayFromBottom) setAutoFollow(true);
    };
    native.addEventListener("wheel", onWheel, { passive: true });
    native.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      native.removeEventListener("wheel", onWheel);
      native.removeEventListener("scroll", onScroll);
      (messagesRef as MutableRefObject<HTMLDivElement | null>).current = null;
    };
  }, [messagesRef, threadId]);

  React.useEffect(() => {
    phaseRef.current = phase;
    setAutoFollow(true);
    setIsScrolledFromBottom(false);
  }, [threadId]);

  React.useEffect(() => {
    const decision = transitionScrollPolicy(
      { follow: autoFollow, phase: phaseRef.current },
      { type: "phase-changed", phase },
    );
    phaseRef.current = decision.phase;
    if (decision.follow !== autoFollow) setAutoFollow(decision.follow);
    if (decision.effect === "anchor-final" && finalAnswerVirtualIndex >= 0) {
      requestAnimationFrame(() => {
        void timelineListRef.current?.scrollToIndex({ index: finalAnswerVirtualIndex, animated: true, viewPosition: 0 });
      });
    }
  }, [autoFollow, finalAnswerVirtualIndex, phase]);

  const scrollToBottom = React.useCallback(() => {
    setAutoFollow(true);
    setIsScrolledFromBottom(false);
    void timelineListRef.current?.scrollToEnd({ animated: true });
  }, []);
  return (
    <>
      {threadId && review && reviewMin && (
        <RowButton
          className={`reviewer-strip v-${review.status === "running" ? "running" : review.verdict}`}
          title={t("review.expand")}
          aria-label={
            review.status === "running"
              ? t("review.running")
              : review.verdict === "ok"
              ? t("review.ok")
              : review.verdict === "issues"
              ? t("review.issues", { n: review.issues?.length ?? 0 })
              : t("review.inconclusive")
          }
          onClick={() => setReviewMin(false)}
        />
      )}
      {threadId && review && !reviewMin && (
        <div className="reviewer-wrap">
          <div
            className={`reviewer-bar v-${review.status === "running" ? "running" : review.verdict} ${review.status === "done" ? "clickable" : ""}`}
          >
            <RowButton
              className="rb-main"
              onClick={() => review.status === "done" && setBarOpen((v) => !v)}
            >
              <svg className="rb-ico" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z" />
                {review.verdict === "ok" && <path d="M5.8 8l1.6 1.6L10.5 6.3" />}
              </svg>
              <span className="rb-name">Reviewer</span>
              <span className="rb-dot">·</span>
              {fixing ? (
                <span className="rb-verdict running"><span className="rb-spin" /> {t("review.fixing")}</span>
              ) : review.status === "running" ? (
                <span className="rb-verdict running"><span className="rb-spin" /> {t("review.running")}</span>
              ) : review.verdict === "ok" ? (
                <span className="rb-verdict ok">{t("review.ok-bar")}</span>
              ) : review.verdict === "issues" ? (
                <span className="rb-verdict warn">{t("review.issues", { n: review.issues?.length ?? 0 })}</span>
              ) : (
                <span className="rb-verdict">{t("review.inconclusive")}</span>
              )}
              {review.status === "done" && !fixing && review.checks != null && review.checks > 0 && (
                <>
                  <span className="rb-dot">·</span>
                  <span className="rb-checks">{t("review.checks", { n: review.checks })}</span>
                </>
              )}
              {review.status === "done" ? <span className="rb-chevron"><Tick open={barOpen} /></span> : null}
            </RowButton>
            <IconButton size="s" className="rb-min" title={t("review.minimize")} label={t("review.minimize")} onClick={(e) => { e.stopPropagation(); setBarOpen(false); setReviewMin(true); }}><MinusIcon size={11} /></IconButton>
            <IconButton size="s" className="rb-close" title={t("review.close")} label={t("review.close")} onClick={(e) => { e.stopPropagation(); setReview(null); }}><CloseIcon size={11} /></IconButton>
          </div>
          {barOpen && review.status === "done" ? (
            <div className="reviewer-menu">
              {review.issues?.length ? (
                <>
                  {review.issues.map((iss, k) => (
                    <div key={k} className={`rm-issue s-${iss.severity}`}>
                      <div className="rm-claim">« {iss.claim} »</div>
                      <div className="rm-problem">{iss.problem}</div>
                      {iss.fix && <div className="rm-fix">→ {iss.fix}</div>}
                    </div>
                  ))}
                  <Button
                    variant="primary"
                    className="rm-correct"
                    disabled={fixing}
                    onClick={() => {
                      setFixing(true);
                      setBarOpen(false);
                      window.dispatchEvent(new CustomEvent("correct-issues", { detail: { threadId: threadId, issues: review.issues } }));
                    }}
                  >
                    {fixing ? t("review.fixing") : t("review.correct")}
                  </Button>
                </>
              ) : (
                <div className="rm-ok">{t("review.ok-detail")}</div>
              )}
              {(review.checkedTools?.length || review.checkedFiles?.length) ? (
                <div className="rm-checked">
                  <div className="rm-checked-h">{t("review.checked-against")}</div>
                  {review.checkedFiles?.map((f, k) => (
                    <div key={"f" + k} className="rm-checked-row"><span className="rm-ck-kind">fichier</span> {f}</div>
                  ))}
                  {review.checkedTools?.map((tl, k) => (
                    <div key={"t" + k} className="rm-checked-row"><span className="rm-ck-kind">outil</span> {tl}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      <div ref={timelineWrapRef} className="timeline-scroll-wrap">
      <LegendList
        key={threadId ?? "atelier-home"}
        ref={timelineListRef}
        data={virtualItems}
        extraData={listExtraData}
        keyExtractor={(row) => row.key}
        estimatedItemSize={90}
        estimatedListSize={{ height: 800, width: 760 }}
        alwaysRender={{ bottom: 12 }}
        recycleItems={false}
        initialScrollAtEnd
        alignItemsAtEnd
        maintainScrollAtEnd={autoFollow}
        maintainScrollAtEndThreshold={0.1}
        maintainVisibleContentPosition
        className="messages"
        aria-label={t("chat.jump-bottom")}
        onMouseUp={onMessagesMouseUp}
        renderItem={({ item: row }) => {
          if (row.type === "empty") {
            return (
              <div className="timeline-virtual-row" id="timeline-empty" data-message-id="timeline-empty">
            {!threadId && p.empty.home ? (
              // plan 017 : l'accueil remplace l'empty-card UNIQUEMENT sans thread
              // actif ; il s'efface dès qu'un thread est sélectionné
              <ResearchHome model={p.empty.home.model} actions={p.empty.home.actions} />
            ) : (
              <ChatEmptyState
                threadId={threadId}
                hasEvents={events.length > 0}
                onNewChat={onNewChat}
                onOpenProject={onOpenProject}
              />
            )}
              </div>
            );
          }
          if (row.type === "working") {
            return (
              <div className="timeline-virtual-row" id="message-working" data-message-id="message-working">
                <div className="working-stack">
                  <div className="working-row">
                    <Working since={workingSince!} tokens={liveTokens} />
                  </div>
                  <LiveThinking />
                  <RowButton className="stop-hint" title={t("action.interrupt")} onClick={onStop}>
                    <kbd>esc</kbd> {t("action.interrupt")}
                  </RowButton>
                </div>
              </div>
            );
          }
          const item = row.item;
          const messageId = item.type === "event" ? `message-${item.index}` : `message-${row.key}`;
          return (
          <div className="timeline-virtual-row" id={messageId} data-message-id={messageId}>
          {(() => {
          if (item.type === "fold") {
            const { fold, open } = item;
            return (
              <ActivityFold
                key={fold.key}
                fold={fold}
                open={open}
                duration={fold.ms != null ? fmtWorkDur(fold.ms) : null}
                onToggle={() =>
                  setOpenFolds((prev) => {
                    const next = new Set(prev);
                    if (next.has(fold.key)) next.delete(fold.key);
                    else next.add(fold.key);
                    return next;
                  })
                }
              />
            );
          }
          if (item.type === "active-turn-header") {
            return (
              <ActiveTurnHeader
                key={item.key}
                turn={item.turn}
                since={workingSince ?? Date.now()}
                tokens={liveTokens}
              />
            );
          }
          if (item.type === "active-turn-tail") {
            const open = openToolGroups.has(item.key);
            return (
              <ActiveTurnTail
                key={item.key}
                turn={item.turn}
                events={events}
                open={open}
                onToggle={() => setOpenToolGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.key)) next.delete(item.key);
                  else next.add(item.key);
                  return next;
                })}
                onStop={onStop}
                plugins={plugins}
                renderToolLine={renderToolLine}
              />
            );
          }
          if (item.type === "actions") {
            const open = openToolGroups.has(item.key);
            return (
              <ActivityGroup
                key={item.key}
                actions={item.actions}
                plugins={plugins}
                open={open}
                onToggle={() =>
                  setOpenToolGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.key)) next.delete(item.key);
                    else next.add(item.key);
                    return next;
                  })
                }
                renderToolLine={renderToolLine}
              />
            );
          }
          if (item.type === "agents") {
            return (
              <AgentActivityGroup
                key={item.key}
                actions={item.actions}
                onOpenAgent={onOpenAgent}
              />
            );
          }
          const e = item.event;
          const i = item.index;
          if (e.kind === "user")
            return (
              <UserTurn
                key={i}
                event={e}
                index={i}
                timeFormat={defaults.timeFormat}
                pinned={pins.some((c) => c.index === i)}
                renderBubbleText={(text) => {
                  const m = /^(\/[\w:-]+)([\s\S]*)$/.exec(text);
                  if (m && isValidSkill(m[1], commands)) {
                    return (
                      <>
                        <span className="slash-cmd">{m[1]}</span>
                        {m[2]}
                      </>
                    );
                  }
                  return text;
                }}
                editingText={editing?.index === i ? editing.text : null}
                onEditingChange={(text) => setEditing(text == null ? null : { index: i, text })}
                onEditSend={onEditSend}
                onRevert={onRevert}
                onTogglePin={onTogglePin}
                onOpenPaste={setPasteView}
              />
            );
          if (e.kind === "streaming")
            return <StreamingText key={i} text={e.text} working={workingSince != null} />;
          if (e.kind === "text")
            return (
              <AssistantText
                key={i}
                event={e}
                index={i}
                timeFormat={defaults.timeFormat}
                pinned={pins.some((c) => c.index === i)}
                onFork={onFork}
                onTogglePin={onTogglePin}
              />
            );
          if (e.kind === "thinking_live" || e.kind === "thinking")
            return <ThinkingBlock key={i} text={e.text} live={e.kind === "thinking_live"} />;
          if (e.kind === "activity")
            return <ActivityCard key={e.id} event={e} live={workingSince != null && e.status === "running"} />;
          if (e.kind === "permission")
            return (
              <div key={i} className={`perm-card ${e.answered != null ? "answered" : ""}`}>
                <div className="perm-head">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z"/></svg>
                  <span>{t("perm.ask", { tool: e.toolName })}</span>
                </div>
                {e.input ? <pre className="perm-input">{formatPermInput(e.toolName, e.input)}</pre> : null}
                {e.answered == null ? (
                  <div className="perm-actions">
                    <Button variant="primary" className="perm-allow" onClick={() => window.dispatchEvent(new CustomEvent("permission-answer", { detail: { threadId: threadId, requestId: e.requestId, allow: true } }))}>{t("perm.allow")}</Button>
                    <Button variant="secondary" className="perm-deny" onClick={() => window.dispatchEvent(new CustomEvent("permission-answer", { detail: { threadId: threadId, requestId: e.requestId, allow: false } }))}>{t("perm.deny")}</Button>
                  </div>
                ) : (
                  <div className="perm-verdict">{e.answered ? t("perm.allowed") : t("perm.denied")}</div>
                )}
              </div>
            );
          if (e.kind === "interaction")
            return <HarnessInteraction key={e.requestId} event={e} threadId={threadId} />;
          if (e.kind === "proposed_plan")
            return <ProposedPlanCard key={e.planId} event={e} threadId={threadId} />;
          if (e.kind === "tool" || e.kind === "tool_update") return renderToolLine(e, i);
          if (e.kind === "edit") return <EditLine key={i} event={e} threadId={threadId} />;
          if (e.kind === "todos")
            return (
              <div key={i} className="todos">
                {e.items.map((todo, idx) => (
                  <div key={idx} className={todo.completed ? "todo done" : todo.active ? "todo active" : "todo"}>
                    <span className="todo-box">{todo.completed ? "✓" : ""}</span>
                    <span>{todo.text}</span>
                  </div>
                ))}
              </div>
            );
          // goal : aucune carte dans le transcript — l'état vit dans la barre
          // épinglée au composer (GoalBar), alimentée par le même événement
          if (e.kind === "goal") return null;
          if (e.kind === "error")
            return (
              <div key={i} className="error">
                ⚠ {e.message}
              </div>
            );
          if (e.kind === "done") {
            const isLastDone = !events.slice(i + 1).some((x) => x.kind === "done");
            // « Annuler le tour » = revert au message user du tour (capacité
            // existante onRevert, nouvelle destination — plan 020, étape 5)
            let userIdx = -1;
            for (let k = i - 1; k >= 0; k--) {
              if (events[k].kind === "user") { userIdx = k; break; }
            }
            const turnUser = userIdx >= 0
              ? (events[userIdx] as Extract<AgentEvent, { kind: "user" }>)
              : null;
            return (
              <ResultCapsule
                key={i}
                event={e}
                isLastDone={isLastDone}
                onRevertTurn={turnUser ? () => onRevert(userIdx, turnUser.text, false) : null}
                threadId={threadId}
                review={review}
                reviewOpen={reviewOpen}
                onStartReview={() => {
                  setReview({ status: "running" });
                  window.dispatchEvent(new CustomEvent("request-review", { detail: { threadId: threadId } }));
                }}
                onToggleReviewOpen={() => setReviewOpen((v) => !v)}
              />
            );
          }
          return null;
          })()}
          </div>
          );
        }}
      />
      <ScrollToBottomButton
        label={t("chat.jump-bottom")}
        show={isScrolledFromBottom}
        working={workingSince != null}
        onClick={scrollToBottom}
      />
      {pins.length > 0 && (
        <div className={`chapters${threadId && review ? " below-reviewer" : ""}`}>
          {[...pins].sort((a, b) => (tickPos[a.index] ?? a.index) - (tickPos[b.index] ?? b.index)).map((c) => (
            <div
              key={c.index}
              className="chapter-tick"
              onClick={() => {
                const index = virtualIndexForEvent(c.index);
                if (index >= 0) {
                  void timelineListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 }).then(() => {
                    resolvePinEl(c.index, c.label, (c as any).anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPinMenu({ index: c.index, x: e.clientX, y: e.clientY });
              }}
            >
              <span
                className={`chapter-bar st-${c.style ?? "bar"}`}
                style={c.color ? { borderColor: c.color, background: `color-mix(in srgb, ${c.color} 25%, transparent)` } : undefined}
              />
              <span className="chapter-label">{c.label}</span>
            </div>
          ))}
        </div>
      )}
      {pinMenu && (
        <Popover open onOpenChange={(next) => { if (!next) setPinMenu(null); }}>
        <PopoverContent
          className="pin-menu"
          side="bottom"
          align="start"
          sideOffset={2}
          anchor={() => ({
            getBoundingClientRect: () => ({
              x: pinMenu.x, y: pinMenu.y, left: pinMenu.x, top: pinMenu.y,
              right: pinMenu.x, bottom: pinMenu.y, width: 0, height: 0,
              toJSON: () => ({}),
            }),
          })}
        >
          <Input
            className="pin-rename"
            defaultValue={pins.find((x) => x.index === pinMenu.index)?.label ?? ""}
            placeholder={t("chat.pin-rename")}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) onStylePin(pinMenu.index, { label: v });
                setPinMenu(null);
              }
              if (e.key === "Escape") setPinMenu(null);
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              const cur = pins.find((x) => x.index === pinMenu.index)?.label ?? "";
              if (v && v !== cur) onStylePin(pinMenu.index, { label: v });
            }}
          />
          <div className="swatches" style={{ padding: "6px 10px" }}>
            {["#e05d5d", "#e8823a", "#e0b74a", "#22b07d", "#3b82f6", "#8b5cf6"].map((col) => (
              <span key={col} className="swatch" style={{ background: col }}
                onClick={() => { onStylePin(pinMenu.index, { color: col }); setPinMenu(null); }} />
            ))}
            <span className="swatch none" onClick={() => { onStylePin(pinMenu.index, { color: undefined }); setPinMenu(null); }}>∅</span>
          </div>
          <div className="pin-styles" style={{ display: "flex", gap: 6, padding: "2px 10px 8px" }}>
            {[
              { id: "bar", el: <span className="chapter-bar st-bar" style={{ background: "var(--fg2)" }} /> },
              { id: "dot", el: <span className="chapter-bar st-dot" style={{ background: "var(--fg2)" }} /> },
              { id: "square", el: <span className="chapter-bar st-square" style={{ background: "var(--fg2)" }} /> },
              { id: "flag", el: <span className="chapter-bar st-flag" style={{ background: "var(--fg2)" }} /> },
            ].map((st) => (
              <RowButton key={st.id} className="pin-style-btn"
                onClick={() => { onStylePin(pinMenu.index, { style: st.id }); setPinMenu(null); }}>
                {st.el}
              </RowButton>
            ))}
          </div>
          <RowButton className="pin-unpin" onClick={() => {
            const pin = pins.find((x) => x.index === pinMenu.index);
            if (pin) onTogglePin(pinMenu.index, pin.label);
            setPinMenu(null);
          }}>
            {t("chat.unpin")}
          </RowButton>
        </PopoverContent>
        </Popover>
      )}
      {quote && (
        <div className="sel-toolbar" style={{ left: quote.x, top: quote.y - 44 }}>
          <RowButton
            onMouseDown={(e) => {
              e.preventDefault();
              if (quoteHasHl) removeMark(quote.text, "hl"); else addMark(quote.text, "hl");
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M10.5 2.5l3 3L6 13H3v-3z" /><path d="M9 4l3 3" />
            </svg>
            {quoteHasHl ? t("chat.remove-highlight") : t("chat.highlight")}
          </RowButton>
          <RowButton
            onMouseDown={(e) => {
              e.preventDefault();
              if (quoteHasUl) removeMark(quote.text, "ul"); else addMark(quote.text, "ul");
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M4 2.5v5a4 4 0 008 0v-5" /><path d="M3.5 13.5h9" />
            </svg>
            {quoteHasUl ? t("chat.remove-underline") : t("chat.underline")}
          </RowButton>
          <RowButton
            onMouseDown={(e) => {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent("quick-ask-open", { detail: { context: quote.text } }));
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <ZapIcon />
            {t("qa.title")}
          </RowButton>
          <RowButton
            onMouseDown={(e) => {
              e.preventDefault();
              onQuote(quote.text);
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M14 8c0 3-2.7 5.2-6 5.2-.8 0-1.6-.1-2.3-.4L2.5 14l1-2.6C2.6 10.5 2 9.3 2 8c0-3 2.7-5.2 6-5.2S14 5 14 8z" />
            </svg>
            {t("action.add-to-chat")}
          </RowButton>
        </div>
      )}
      </div>
    </>
  );
}
