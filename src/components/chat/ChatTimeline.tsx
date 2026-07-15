// ChatTimeline (plan 015, correction 3) : composant de PRODUCTION de la
// timeline — barre du reviewer, liste des tours (streaming/outils/résultats),
// indicateur Working, chapitres épinglés, bouton « aller au dernier message ».
// JSX déplacé VERBATIM depuis Chat.tsx ; les bundles sont déstructurés vers les
// noms locaux d'origine pour garantir l'équivalence pixel.
import React, { type ReactNode, type RefObject } from "react";
import { Tick } from "./toolPresentation";
import { AgentEvent } from "../../lib/ws";
import { t } from "../../lib/i18n";
import { isValidSkill } from "./mentions";
import { ZapIcon, ArrowDownIcon } from "../icons";
import {
  ChatEmptyState, UserTurn, StreamingText, AssistantText, ResultCapsule,
  ActivityFold, ActivityGroup, type ReviewState,
} from "./turns";
import { ResearchHome, type ResearchHomeBundle } from "../ResearchHome";
import { ThinkingBlock, EditLine, ActivityCard, LiveThinking, ReasoningTrace, Working, formatPermInput } from "./turnParts";
import { HarnessInteraction } from "./HarnessInteraction";
import { JumpNavigation } from "../ui";
import { Input } from "../shadcn/input";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "../shadcn/message-scroller";

export type ToolAction = Extract<AgentEvent, { kind: "tool" | "tool_update" }>;
export type ActiveWorkHeaderItem = {
  type: "active-header";
  key: string;
  since: number;
};
export type ActiveThinkingItem = { type: "active-thinking"; key: string };
export type ActiveReasoningItem = { type: "active-reasoning"; key: string; texts: string[] };
export type ActiveActionCollectionItem = {
  type: "active-actions";
  key: string;
  groups: { type: "actions"; actions: ToolAction[]; index: number; key: string }[];
};
type RenderedItem =
  | { type: "event"; event: AgentEvent; index: number }
  | { type: "actions"; actions: ToolAction[]; index: number; key: string }
  | { type: "fold"; fold: { key: string; start: number; end: number; ms: number | null }; open: boolean }
  | ActiveActionCollectionItem
  | ActiveReasoningItem
  | ActiveWorkHeaderItem
  | ActiveThinkingItem;

export type TimelineThread = { threadId: string | null; events: AgentEvent[]; workingSince: number | null };
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
export type TimelineWorking = { currentWorkName: string; onStop: () => void };
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

function TimelineJumpNavigation(p: { lastUserMessageId: string | null }) {
  const { scrollToMessage } = useMessageScroller();
  return (
    <JumpNavigation
      firstLabel={t("chat.jump-last-message")}
      firstIcon={<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.6 9.8L8 5.4l4.4 4.4" /></svg>}
      onFirst={() => {
        if (p.lastUserMessageId) {
          scrollToMessage(p.lastUserMessageId, { behavior: "smooth", align: "start" });
        }
      }}
      lastLabel={t("chat.jump-bottom")}
      lastIcon={<ArrowDownIcon />}
      lastControl={(
        <MessageScrollerButton
          direction="end"
          behavior="smooth"
          className="ui-jumpnav-end"
          title={t("chat.jump-bottom")}
          aria-label={t("chat.jump-bottom")}
        >
          <ArrowDownIcon />
        </MessageScrollerButton>
      )}
    />
  );
}

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
  const { threadId, events, workingSince } = p.thread;
  const { review, reviewMin, setReviewMin, setReview, barOpen, setBarOpen, fixing, setFixing, reviewOpen, setReviewOpen } = p.rev;
  const { renderedEvents, openFolds, setOpenFolds, openToolGroups, setOpenToolGroups, renderToolLine, fmtWorkDur } = p.list;
  const { editing, setEditing, pins, onTogglePin, onRevert, onEditSend, onFork, setPasteView, commands, defaults, onQuote } = p.msg;
  const { messagesRef, onMessagesMouseUp } = p.scroll;
  const { onStop } = p.working;
  const { tickPos, resolvePinEl, pinMenu, setPinMenu, onStylePin } = p.chapters;
  const { onNewChat, onOpenProject } = p.empty;
  const { quote, setQuote, quoteHasHl, quoteHasUl, addMark, removeMark } = p.selection;
  void onQuote; void openFolds; // utilisés par des handlers/branches copiés verbatim
  let lastUserIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === "user") { lastUserIndex = i; break; }
  }
  const lastUserMessageId = lastUserIndex >= 0 ? `message-${lastUserIndex}` : null;
  return (
    <>
      {threadId && review && reviewMin && (
        <button
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
            <button
              type="button"
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
            </button>
            <button type="button" className="rb-min" title={t("review.minimize")} aria-label={t("review.minimize")} onClick={(e) => { e.stopPropagation(); setBarOpen(false); setReviewMin(true); }}>–</button>
            <button type="button" className="rb-close" title={t("review.close")} aria-label={t("review.close")} onClick={(e) => { e.stopPropagation(); setReview(null); }}>✕</button>
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
                  <button
                    className="rm-correct"
                    disabled={fixing}
                    onClick={() => {
                      setFixing(true);
                      setBarOpen(false);
                      window.dispatchEvent(new CustomEvent("correct-issues", { detail: { threadId: threadId, issues: review.issues } }));
                    }}
                  >
                    {fixing ? t("review.fixing") : t("review.correct")}
                  </button>
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
      <MessageScrollerProvider
        key={threadId ?? "atelier-home"}
        autoScroll
        defaultScrollPosition="end"
        scrollEdgeThreshold={80}
      >
      <div className="timeline-scroll-wrap">
      <MessageScroller className="messages-scroller">
      <MessageScrollerViewport
        className="messages"
        ref={messagesRef}
        aria-label={t("chat.jump-bottom")}
        onMouseUp={onMessagesMouseUp}
      >
      <MessageScrollerContent className="messages-content">
        {(!threadId || events.length === 0) && (
          <MessageScrollerItem messageId="timeline-empty">
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
          </MessageScrollerItem>
        )}
        {renderedEvents.map((item) => {
          if (item.type === "event" && item.event.kind === "goal") return null;
          const itemKey = item.type === "event" ? `event-${item.index}` : item.type === "fold" ? item.fold.key : item.key;
          const messageId = item.type === "event" ? `message-${item.index}` : `message-${itemKey}`;
          return (
          <MessageScrollerItem
            key={itemKey}
            messageId={messageId}
          >
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
          if (item.type === "active-header") {
            return <Working key={item.key} since={item.since} />;
          }
          if (item.type === "active-thinking") {
            return <LiveThinking key={item.key} />;
          }
          if (item.type === "active-reasoning") {
            return <ReasoningTrace key={item.key} texts={item.texts} />;
          }
          if (item.type === "active-actions") {
            const expanded = openToolGroups.has(item.key);
            const visibleGroups = expanded || item.groups.length <= 6
              ? item.groups
              : item.groups.slice(-6);
            const hiddenCount = item.groups.length - visibleGroups.length;
            return (
              <div className="active-work-list" key={item.key}>
                {visibleGroups.map((group) => {
                  const open = openToolGroups.has(group.key);
                  return (
                    <ActivityGroup
                      key={group.key}
                      actions={group.actions}
                      open={open}
                      onToggle={() =>
                        setOpenToolGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.key)) next.delete(group.key);
                          else next.add(group.key);
                          return next;
                        })
                      }
                      renderToolLine={renderToolLine}
                    />
                  );
                })}
                {item.groups.length > 6 ? (
                  <button
                    type="button"
                    className="active-work-more"
                    onClick={() =>
                      setOpenToolGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.key)) next.delete(item.key);
                        else next.add(item.key);
                        return next;
                      })
                    }
                  >
                    {expanded ? t("chat.show-less-work") : t("chat.show-more-work", { n: hiddenCount })}
                  </button>
                ) : null}
              </div>
            );
          }
          if (item.type === "actions") {
            const open = openToolGroups.has(item.key);
            return (
              <ActivityGroup
                key={item.key}
                actions={item.actions}
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
                    <button className="perm-allow" onClick={() => window.dispatchEvent(new CustomEvent("permission-answer", { detail: { threadId: threadId, requestId: e.requestId, allow: true } }))}>{t("perm.allow")}</button>
                    <button className="perm-deny" onClick={() => window.dispatchEvent(new CustomEvent("permission-answer", { detail: { threadId: threadId, requestId: e.requestId, allow: false } }))}>{t("perm.deny")}</button>
                  </div>
                ) : (
                  <div className="perm-verdict">{e.answered ? t("perm.allowed") : t("perm.denied")}</div>
                )}
              </div>
            );
          if (e.kind === "interaction")
            return <HarnessInteraction key={e.requestId} event={e} threadId={threadId} />;
          if (e.kind === "tool" || e.kind === "tool_update") return renderToolLine(e, i);
          if (e.kind === "edit") return <EditLine key={i} event={e} threadId={threadId} />;
          if (e.kind === "todos")
            return (
              <div key={i} className="todos">
                {e.items.map((todo, idx) => (
                  <div key={idx} className={todo.completed ? "todo done" : "todo"}>
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
          </MessageScrollerItem>
          );
        })}
        {workingSince != null && !renderedEvents.some((item) => item.type === "active-header") && (
          <MessageScrollerItem messageId="message-working">
          <div className="working-stack">
            <div className="working-row">
              <Working since={workingSince} />
            </div>
            <LiveThinking />
            <button type="button" className="stop-hint" title={t("action.interrupt")} onClick={onStop}>
              <kbd>esc</kbd> {t("action.interrupt")}
            </button>
          </div>
          </MessageScrollerItem>
        )}
      </MessageScrollerContent>
      </MessageScrollerViewport>
      <TimelineJumpNavigation lastUserMessageId={lastUserMessageId} />
      </MessageScroller>
      {pins.length > 0 && (
        <div className={`chapters${threadId && review ? " below-reviewer" : ""}`}>
          {[...pins].sort((a, b) => (tickPos[a.index] ?? a.index) - (tickPos[b.index] ?? b.index)).map((c) => (
            <div
              key={c.index}
              className="chapter-tick"
              onClick={() => {
                resolvePinEl(c.index, c.label, (c as any).anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        <div className="ctx-menu pin-menu" style={{ position: "fixed", left: pinMenu.x, top: pinMenu.y, zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}>
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
              <button key={st.id} type="button" className="pin-style-btn"
                onClick={() => { onStylePin(pinMenu.index, { style: st.id }); setPinMenu(null); }}>
                {st.el}
              </button>
            ))}
          </div>
          <div className="danger" onClick={() => {
            const pin = pins.find((x) => x.index === pinMenu.index);
            if (pin) onTogglePin(pinMenu.index, pin.label);
            setPinMenu(null);
          }}>
            {t("chat.unpin")}
          </div>
        </div>
      )}
      {quote && (
        <div className="sel-toolbar" style={{ left: quote.x, top: quote.y - 44 }}>
          <button
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
          </button>
          <button
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
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent("quick-ask-open", { detail: { context: quote.text } }));
              setQuote(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <ZapIcon />
            {t("qa.title")}
          </button>
          <button
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
          </button>
        </div>
      )}
      </div>
      </MessageScrollerProvider>
    </>
  );
}
