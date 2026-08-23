// ChatTimeline (plan 015, correction 3) : composant de PRODUCTION de la
// timeline — barre du reviewer, liste des tours (streaming/outils/résultats),
// indicateur Working, chapitres épinglés, bouton « aller au dernier message ».
// JSX déplacé VERBATIM depuis Chat.tsx ; les bundles sont déstructurés vers les
// noms locaux d'origine pour garantir l'équivalence pixel.
import React, { useMemo, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { Tick } from "./toolPresentation";
import { AgentEvent } from "../../lib/ws";
import type { ProjectedTimelineItem, ToolAction, TurnPhase } from "../../lib/chat/turnViewModel";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { transitionScrollPolicy } from "../../lib/chat/scrollPolicy";
import { t } from "../../lib/i18n";
import { findTextRanges } from "../../lib/markRanges";
import type { Mark } from "../../lib/annotations";
import { isValidSkill } from "./mentions";
import { CloseIcon, MinusIcon, ZapIcon } from "../icons";
import {
  ChatEmptyState, UserTurn, StreamingText, AssistantText, ResultCapsule,
  ActivityFold, ActivityGroup, ActiveTurnHeader, ActiveTurnTail, currentThought,
  type ReviewState,
} from "./turns";
import { ResearchHome, type ResearchHomeBundle } from "../ResearchHome";
import { ThinkingBlock, EditLine, ActivityCard, LiveThinking, Working, formatPermInput } from "./turnParts";
import { deriveChangedFiles } from "./changedFiles";
import { doublonsDePensee } from "../../lib/chat/thinkingDedup";
import { highlightCode } from "./md";
import { HarnessInteraction } from "./HarnessInteraction";
import { ProposedPlanCard } from "./ProposedPlanCard";
import { Button, IconButton, RowButton, ScrollToBottomButton } from "../ui";
import { activeMargeIndex, deriveMargeEntries, sameMargeEntries, type MargeEntry } from "../../lib/marge";
import type { Pin } from "../../lib/pins";
import { initialJumpState, nextJumpAction } from "../../lib/margeJump";
import { Input } from "../shadcn/input";
import { Popover, PopoverContent } from "../shadcn/popover";
import {
  AgentActivityGroup,
  type AgentDisplay,
  type AgentToolAction,
} from "./AgentActivity";
import { AgentMessageCard } from "./AgentMessageCard";
import { TimelineStamp } from "./TimelineStamp";

// Identité STABLE (voir le prop maintainScrollAtEnd) : un objet recréé à
// chaque render relance l'animation de suivi en boucle et elle n'atteint
// jamais le bas.
const MAINTAIN_END_ANIMATED = { animated: true } as const;

// Échelle 4 px (système) — l'ancien padding vertical de `.messages` dans
// App.css, déplacé ici pour que LegendList le compte dans son contenu.
const MESSAGES_VERTICAL_PADDING = { paddingTop: 24, paddingBottom: 8 } as const;

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
  liveNote?: string | null;
  /** segments de réflexion (texte caviardé par le CLI headless) */
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
  pins: Pin[];
  onTogglePin: (index: number, label: string) => void;
  onRevert: (index: number, text: string, edit: boolean) => void;
  onEditSend: (index: number, oldText: string, newText: string) => void;
  onFork: (index: number) => void;
  setPasteView: (v: { name: string; text: string } | null) => void;
  commands: { name: string; source: string }[];
  defaults: {
    timeFormat?: "system" | "24h" | "12h";
    transcriptView?: "normal" | "reflexion" | "detaille" | "resume";
    displayTimestamps?: boolean;
  };
  onQuote: (text: string) => void;
};
export type TimelineScroll = {
  messagesRef: RefObject<HTMLDivElement | null>;
  onMessagesMouseUp: (e: React.MouseEvent) => void;
};
export type TimelineWorking = { onStop: () => void };
export type TimelineChapters = {
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
    /** le passage sélectionné porte déjà une annotation */
    quoteAnnotated: boolean;
    addAnnotation: (text: string, note: string) => void;
    removeAnnotation: (text: string) => void;
    /** passages annotés du fil — l'encoche ambre de la marge */
    marks: Mark[];
  };
}) {
  const { threadId, events, workingSince, liveTokens, liveNote, phase } = p.thread;
  // dernier bloc de pensée du fil : le seul qui puisse être « en cours »
  // Bornes du DERNIER tour terminé : c'est le seul qui porte une carte
  // « fichiers modifiés », donc le seul dont les lignes `edit` inline
  // feraient doublon avec elle.
  const { lastDoneIndex, lastDoneUserIndex } = useMemo(() => {
    let done = -1;
    for (let idx = events.length - 1; idx >= 0; idx -= 1) {
      if (events[idx].kind === "done") { done = idx; break; }
    }
    let user = -1;
    for (let idx = done - 1; idx >= 0; idx -= 1) {
      if (events[idx].kind === "user") { user = idx; break; }
    }
    return { lastDoneIndex: done, lastDoneUserIndex: user };
  }, [events]);
  // Dérivé UNE fois par changement d'events, pas à chaque rendu de la ligne :
  // la capsule du dernier tour vit dans les lignes toujours rendues (bas de
  // liste), donc ce calcul retombait sur chaque chunk du tour suivant.
  const lastDoneChangedFiles = useMemo(() => (
    lastDoneIndex < 0
      ? undefined
      : deriveChangedFiles(
          events.slice(lastDoneUserIndex + 1, lastDoneIndex),
          events[lastDoneIndex] as Extract<AgentEvent, { kind: "done" }>,
        )
  ), [events, lastDoneIndex, lastDoneUserIndex]);
  // Identité référentielle : ce scan ne dépend que de `events` — le mémoïser
  // évite un parcours O(n) du fil À CHAQUE rendu (chaque delta du stream fait
  // re-rendre ce composant ; même discipline que les dérivés ci-dessus).
  const lastThinkingIndex = React.useMemo(() => {
    // Instant réel : le réducteur recolle les morceaux dans le bloc existant
    // sans bouger son `ts`, mais remplace son `meta` — un bloc placé AVANT la
    // réponse peut donc être le plus récent (Grok pense encore après avoir
    // répondu). Même règle que `currentThought`, sinon les deux divergent.
    const timeOf = (event: AgentEvent): number => {
      const meta = (event as { meta?: { ts?: number } }).meta;
      return meta?.ts ?? (event as { ts?: number }).ts ?? 0;
    };
    let answerTs: number | null = null;
    for (let idx = events.length - 1; idx >= 0; idx -= 1) {
      const event = events[idx];
      if (!event) continue;
      if (event.kind === "thinking" || event.kind === "thinking_live") {
        if (answerTs != null && timeOf(event) <= answerTs) return -1;
        return idx;
      }
      if (event.kind === "user" || event.kind === "done" || event.kind === "error") return -1;
      if (answerTs == null && (event.kind === "text" || event.kind === "streaming")) {
        answerTs = timeOf(event);
      }
    }
    return -1;
  }, [events]);
  // Une même pensée peut atterrir plusieurs fois dans le fil (bloc du tour,
  // bloc recollé après la réponse, morceau isolé) : on ne rend que le bloc le
  // plus complet de chaque tour — cf. doublonsDePensee.
  const doublonsPensee = useMemo(() => doublonsDePensee(events), [events]);

  const { review, reviewMin, setReviewMin, setReview, barOpen, setBarOpen, fixing, setFixing, reviewOpen } = p.rev;
  const {
    renderedEvents, openFolds, setOpenFolds, openToolGroups, setOpenToolGroups,
    renderToolLine, fmtWorkDur, plugins, onOpenAgent,
  } = p.list;
  const { editing, setEditing, pins, onTogglePin, onRevert, onEditSend, onFork, setPasteView, commands, defaults, onQuote } = p.msg;
  // Vue de la transcription (sélecteur du header, façon Claude Code desktop) :
  // elle remplace l'ancien booléen thinkingCollapsed. « normal » replie la
  // pensée en fenêtre de 4 lignes ; « reflexion » et « detaille » la déplient ;
  // « resume » la masque ; « detaille » déplie aussi les lignes d'outils.
  const vue = defaults.transcriptView ?? "normal";
  const penseeRepliee = vue !== "reflexion" && vue !== "detaille";
  const penseeMasquee = vue === "resume";
  const { messagesRef, onMessagesMouseUp } = p.scroll;
  const { onStop } = p.working;
  const { pinMenu, setPinMenu, onStylePin } = p.chapters;
  const { onNewChat, onOpenProject } = p.empty;
  // Même source que le tour actif : chercher `thinking_live` seul laissait
  // cette ligne vide avec Grok, dont les blocs durables remplacent le live.
  const liveThought = useMemo(() => currentThought(null, events), [events]);
  const { quote, setQuote, quoteAnnotated, addAnnotation, removeAnnotation, marks } = p.selection;
  // éditeur de commentaire : ouvert par « Annoter » ou par un clic sur une pastille
  const [noteDraft, setNoteDraft] = React.useState<{ x: number; y: number; text: string; note: string } | null>(null);
  void onQuote; void openFolds; // utilisés par des handlers/branches copiés verbatim
  const timelineListRef = React.useRef<LegendListRef>(null);
  const timelineWrapRef = React.useRef<HTMLDivElement>(null);
  const [autoFollow, setAutoFollow] = React.useState(true);
  const [isScrolledFromBottom, setIsScrolledFromBottom] = React.useState(false);
  const [isFirstTurnSettling, setIsFirstTurnSettling] = React.useState(false);
  const hadTimelineEventsRef = React.useRef(events.length > 0);
  const phaseRef = React.useRef<TurnPhase>(phase);
  const virtualItems = React.useMemo<TimelineVirtualItem[]>(() => {
    const rows: TimelineVirtualItem[] = [];
    if (!threadId || events.length === 0) rows.push({ type: "empty", key: "timeline-empty" });
    for (const item of renderedEvents) {
      const key = item.type === "event" ? `event-${item.index}` : item.type === "fold" ? item.fold.key : item.key;
      rows.push({ type: "rendered", key, item });
    }
    if (workingSince != null && !renderedEvents.some((item) => item.type === "active-turn-header")) {
      rows.push({ type: "working", key: "message-working" });
    }
    return rows;
  }, [events.length, renderedEvents, threadId, workingSince]);
  // Index de la dernière ligne de travail rendue : c'est elle qui tique tant
  // que le tour n'est pas fini.
  const derniereLigneTravail = React.useMemo(() => {
    // ... et seulement si RIEN ne l'a close depuis : une narration assistant
    // qui suit fige la ligne, comme n'importe quelle tranche terminée.
    for (let i = renderedEvents.length - 1; i >= 0; i -= 1) {
      const row = renderedEvents[i];
      if (row.type === "actions") return row.index;
      if (row.type === "event" && (row.event.kind === "text" || row.event.kind === "streaming")) return -1;
    }
    return -1;
  }, [renderedEvents]);
  // Identité référentielle : LegendList re-rend TOUTES les lignes visibles
  // dès que l'IDENTITÉ de extraData change (Object.is). On ne reconstruit donc
  // l'objet que si une de ses valeurs a réellement bougé — les deltas du
  // stream, qui ne touchent ni editing ni pins ni openToolGroups, ne coûtent
  // alors plus un re-render complet de la liste. `derniereLigneTravail` est
  // inclus volontairement : c'est lui qui fait tiquer la ligne du run en cours.
  const listExtraData = React.useMemo(() => ({
    editing,
    openToolGroups,
    pins,
    reviewOpen,
    workingSince,
  }), [editing, openToolGroups, pins, reviewOpen, workingSince, derniereLigneTravail]);
  // Marge annotée : dérivée des événements déjà projetés. L'ancienne référence
  // est conservée quand la marge ne change pas (les deltas de stream ne créent
  // jamais d'entrée) — même discipline d'identité que listExtraData.
  const margeRef = React.useRef<MargeEntry[]>([]);
  const margeEntries = useMemo(() => {
    const next = deriveMargeEntries(events, pins, marks);
    if (sameMargeEntries(margeRef.current, next)) return margeRef.current;
    margeRef.current = next;
    return next;
  }, [events, pins, marks]);
  // « Où j'en suis » : mesuré au défilement, jamais maintenu à la main. Cadencé
  // par rAF comme le reste du composant, et seules les rangées RÉELLEMENT
  // rendues sont mesurables (liste virtualisée).
  const [hereIndex, setHereIndex] = React.useState<number | null>(null);
  React.useEffect(() => {
    // le scroller natif est posé dans messagesRef par un AUTRE effet : le
    // résoudre ici aussi, sinon l'ordre de montage décide si la mesure marche
    const host = messagesRef.current
      ?? timelineWrapRef.current?.querySelector<HTMLDivElement>(".messages")
      ?? null;
    if (!host || !margeEntries.length) { setHereIndex(null); return; }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const hostTop = host.getBoundingClientRect().top;
      const tops: Record<number, number> = {};
      for (const entry of margeEntries) {
        const row = document.getElementById(`message-${entry.index}`);
        if (row) tops[entry.index] = row.getBoundingClientRect().top - hostTop;
      }
      setHereIndex(activeMargeIndex(margeEntries, tops));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    schedule();
    // la liste virtualisée n'a pas encore posé ses rangées au premier cadre :
    // sans cette seconde passe, rien n'est mesurable et la marge reste muette
    // jusqu'au premier défilement.
    const settle = setTimeout(schedule, 120);
    host.addEventListener("scroll", schedule, { passive: true });
    return () => {
      clearTimeout(settle);
      host.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [messagesRef, margeEntries, threadId, events.length]);
  const virtualIndexForEvent = React.useCallback((eventIndex: number) => (
    virtualItems.findIndex((row) => row.type === "rendered" && row.item.type === "event" && row.item.index === eventIndex)
  ), [virtualItems]);
  // Saut de marge (bug mesuré 2026-08-23) : deux forces ramenaient le lecteur
  // ailleurs que sur la cible. 1) autoFollow restait engagé, et le filet du
  // suivi re-visait le bas du fil ~300 ms après le clic. 2) scrollToIndex
  // atterrit sur une position ESTIMÉE pour les rangées jamais mesurées. On
  // coupe donc le suivi, on saute, puis on recale sur la géométrie réelle une
  // fois le défilement stabilisé (décision pure dans src/lib/margeJump.ts).
  const jumpFrameRef = React.useRef(0);
  React.useEffect(() => () => cancelAnimationFrame(jumpFrameRef.current), []);
  const jumpToEvent = React.useCallback((eventIndex: number) => {
    const index = virtualIndexForEvent(eventIndex);
    if (index < 0) return;
    setAutoFollow(false);
    setIsScrolledFromBottom(true);
    void timelineListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
    cancelAnimationFrame(jumpFrameRef.current);
    const host = messagesRef.current;
    if (!host) return;
    let state = initialJumpState();
    const step = () => {
      jumpFrameRef.current = 0;
      const row = document.getElementById(`message-${eventIndex}`);
      const rowDelta = row
        ? row.getBoundingClientRect().top - host.getBoundingClientRect().top
        : null;
      const [nextState, action] = nextJumpAction(state, { scrollTop: host.scrollTop, rowDelta });
      state = nextState;
      if (action.kind === "done" || action.kind === "abandon") return;
      if (action.kind === "correct") host.scrollTop += action.delta;
      if (action.kind === "rescroll") {
        const again = virtualIndexForEvent(eventIndex);
        if (again >= 0) {
          void timelineListRef.current?.scrollToIndex({ index: again, animated: false, viewPosition: 0 });
        }
      }
      jumpFrameRef.current = requestAnimationFrame(step);
    };
    jumpFrameRef.current = requestAnimationFrame(step);
  }, [virtualIndexForEvent, messagesRef]);
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

  // LegendList aligne les conversations courtes en bas avec un spacer calculé
  // depuis estimatedItemSize, puis le recalcule après la mesure réelle. Lors du
  // tout premier envoi, cette correction faisait bouger le tour d'une frame à
  // l'autre. On laisse la liste mesurer hors vue et on la révèle dès que son
  // dernier élément est stable pendant deux frames consécutives.
  const hasTimelineEvents = events.length > 0;
  React.useLayoutEffect(() => {
    const hadTimelineEvents = hadTimelineEventsRef.current;
    hadTimelineEventsRef.current = hasTimelineEvents;
    if (!hasTimelineEvents) {
      setIsFirstTurnSettling(false);
      return;
    }
    if (hadTimelineEvents) return;

    setIsFirstTurnSettling(true);
    let animationFrame = 0;
    let attempts = 0;
    let stableFrames = 0;
    let previousAnchorTop: number | null = null;
    const revealWhenStable = () => {
      const rows = timelineWrapRef.current?.querySelectorAll<HTMLElement>(".timeline-virtual-row");
      const anchor = rows?.item((rows?.length ?? 0) - 1) ?? null;
      const anchorTop = anchor?.getBoundingClientRect().top ?? null;
      attempts += 1;
      if (anchorTop != null && previousAnchorTop != null && Math.abs(anchorTop - previousAnchorTop) < 0.5) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
      }
      previousAnchorTop = anchorTop;
      if ((anchor && stableFrames >= 2) || attempts >= 10) {
        setIsFirstTurnSettling(false);
        return;
      }
      animationFrame = requestAnimationFrame(revealWhenStable);
    };
    animationFrame = requestAnimationFrame(revealWhenStable);
    return () => cancelAnimationFrame(animationFrame);
  }, [hasTimelineEvents, threadId]);

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

  // Filet du suivi animé : le scrollToEnd animé de LegendList fige sa cible
  // au départ — si le contenu grandit PENDANT l'animation, elle atterrit
  // quelques pixels au-dessus du bas, sous le seuil où le maintain se
  // re-déclenche, et la ligne « esc Interrompre » reste cachée (mesuré au banc
  // #chatbench-livestream : arrêt stable à 32 px du bas, 2026-08-23). Quand le
  // fil est stable depuis un battement et pas exactement au bas, on re-vise la
  // fin — une seule fois par stabilisation, jamais contre l'utilisateur
  // (autoFollow est déjà coupé dès qu'il remonte).
  React.useEffect(() => {
    if (!autoFollow) return;
    let lastScrollHeight = -1;
    const id = window.setInterval(() => {
      const native = messagesRef.current;
      if (!native) return;
      const stable = native.scrollHeight === lastScrollHeight;
      lastScrollHeight = native.scrollHeight;
      const distance = native.scrollHeight - native.clientHeight - native.scrollTop;
      if (stable && distance > 2) {
        timelineListRef.current?.scrollToEnd({ animated: true });
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [autoFollow, messagesRef]);

  // Pastilles numérotées : calculées depuis les Range des passages annotés et
  // rendues dans un calque `position: fixed` — jamais insérées dans le DOM du
  // markdown, que React reconstruit à chaque frame de streaming.
  const [badges, setBadges] = React.useState<{ n: number; x: number; y: number; mark: Mark }[]>([]);
  React.useEffect(() => {
    const host = messagesRef.current;
    if (!host || !marks.length) { setBadges([]); return; }
    let frame = 0;
    const compute = () => {
      frame = 0;
      const bounds = host.getBoundingClientRect();
      const next: { n: number; x: number; y: number; mark: Mark }[] = [];
      marks.forEach((mark, i) => {
        const ranges = findTextRanges(host, mark.text);
        const rects = ranges[ranges.length - 1]?.getClientRects();
        const rect = rects?.[rects.length - 1];
        if (!rect) return;
        // hors du scroller (virtualisation, défilement) : pas de pastille
        if (rect.bottom < bounds.top + 2 || rect.top > bounds.bottom - 2) return;
        next.push({ n: i + 1, x: rect.right, y: rect.top, mark });
      });
      setBadges(next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(compute); };
    compute();
    host.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      host.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [marks, events, messagesRef]);

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
        // animated : le suivi du bas s'interpole au lieu de téléporter le fil
        // d'une hauteur de ligne à chaque wrap — mesuré au banc
        // #chatbench-livestream (12 pas instantanés de 20-63 px sans,
        // demande de fluidité Thierry 2026-08-23). L'objet DOIT être une
        // constante module : recréé à chaque render, il relançait l'animation
        // interne en boucle, qui s'arrêtait à ~32 px du bas — sous le seuil de
        // tolérance — et laissait la ligne « esc Interrompre » cachée.
        maintainScrollAtEnd={autoFollow ? MAINTAIN_END_ANIMATED : false}
        // Padding vertical ICI et pas dans App.css : LegendList l'extrait de
        // ce prop pour son modèle de contenu (extractPadding) — sinon chaque
        // scrollToEnd vise (paddingTop+paddingBottom) px au-dessus du vrai bas.
        style={MESSAGES_VERTICAL_PADDING}
        maintainScrollAtEndThreshold={0.1}
        maintainVisibleContentPosition
        className={`messages${isFirstTurnSettling ? " is-first-turn-settling" : ""}`}
        data-first-turn-settling={isFirstTurnSettling ? "true" : undefined}
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
                    <Working since={workingSince!} tokens={liveTokens} note={liveNote} />
                  </div>
                  {/* En vue Résumé la pensée est masquée : sans texte,
                      LiveThinking retombe sur la seule ligne « en attente ». */}
                  <LiveThinking thought={penseeMasquee ? null : liveThought} collapsedByDefault={penseeRepliee} />
                  <RowButton className="stop-hint" title={t("action.interrupt")} onClick={onStop}>
                    <kbd>esc</kbd> {t("action.interrupt")}
                  </RowButton>
                </div>
              </div>
            );
          }
          const item = row.item;
          const messageId = item.type === "event" ? `message-${item.index}` : `message-${row.key}`;
          // plan 066, L3 : la bulle en streaming change de hauteur à chaque
          // chunk — overflow-anchor:none dessus évite que le navigateur
          // recorrige scrollTop en concurrence avec le suivi du bas de
          // LegendList (maintainScrollAtEnd/maintainVisibleContentPosition,
          // qui gère déjà lui-même l'ancrage). Classe posée par React, JAMAIS
          // un sélecteur de position (:last-child) : les lignes défilent en
          // continu pendant le stream, un tel sélecteur romprait le budget de
          // style récursif — même discipline que typeset.contract.test.ts.
          const isLiveStream = item.type === "event" && item.event.kind === "streaming";
          return (
          <div
            className={`timeline-virtual-row${isLiveStream ? " is-live-stream" : ""}`}
            id={messageId}
            data-message-id={messageId}
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
          if (item.type === "active-turn-header") {
            const cumulativeKey = `cumulative:${item.turn.key}`;
            // Nombre de lignes de travail RÉELLEMENT déposées pour ce tour :
            // c'est ce que l'œil voit, alors que `turn.actionGroups` compte les
            // appels d'outil (cinq lectures d'affilée = une seule ligne). Le
            // cumul ne s'affiche qu'au-dessus de PLUSIEURS lignes, sinon il
            // répète mot pour mot celle qui suit (doublon signalé trois fois).
            const lignesDeposees = renderedEvents.filter((row) => (
              row.type === "actions" && row.index >= item.turn.startIndex
            )).length;
            return (
              <ActiveTurnHeader
                visibleRuns={lignesDeposees}
                key={item.key}
                turn={item.turn}
                since={workingSince ?? Date.now()}
                tokens={liveTokens}
                open={openToolGroups.has(cumulativeKey)}
                onToggle={() => setOpenToolGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(cumulativeKey)) next.delete(cumulativeKey);
                  else next.add(cumulativeKey);
                  return next;
                })}
                renderToolLine={renderToolLine}
              />
            );
          }
          if (item.type === "active-turn-tail") {
            return (
              <ActiveTurnTail
                key={item.key}
                turn={item.turn}
                events={events}
                onStop={onStop}
              />
            );
          }
          if (item.type === "actions") {
            // Vue Détaillé : les lignes d'outils s'ouvrent d'office — le Set
            // devient alors « écarts au défaut » (un clic referme quand même).
            const open = vue === "detaille"
              ? !openToolGroups.has(item.key)
              : openToolGroups.has(item.key);
            // La DERNIÈRE ligne de travail d'un tour en cours est la ligne
            // vivante : elle tique à chaque nouvelle action au lieu d'afficher
            // un résumé figé. C'est le seul endroit où l'action courante
            // s'affiche — donc jamais de doublon avec une queue.
            const live = workingSince != null && item.index === derniereLigneTravail;
            const tss = item.actions.map((a) => ("ts" in a ? a.ts : undefined)).filter((v): v is number => v != null);
            const stamp = defaults.displayTimestamps && tss.length
              ? <TimelineStamp startMs={Math.min(...tss)} endMs={tss.length > 1 ? Math.max(...tss) : null} fmt={defaults.timeFormat} />
              : undefined;
            return (
              <ActivityGroup
                key={item.key}
                actions={item.actions}
                plugins={plugins}
                open={open}
                live={live}
                onToggle={() =>
                  setOpenToolGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.key)) next.delete(item.key);
                    else next.add(item.key);
                    return next;
                  })
                }
                renderToolLine={renderToolLine}
                stamp={stamp}
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
          if (e.kind === "agent_message")
            return (
              <AgentMessageCard
                key={i}
                direction={e.direction}
                peerProvider={e.peerProvider}
                peerTitle={e.peerTitle}
                messageKind={e.messageKind}
                text={e.text}
                status={e.status}
              />
            );
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
          if ((e.kind === "thinking_live" || e.kind === "thinking") && (doublonsPensee.has(i) || penseeMasquee))
            return null;
          if (e.kind === "thinking_live" || e.kind === "thinking") {
            // « en direct » ne peut pas se déduire du KIND : Grok n'envoie
            // jamais de thinking_delta, seulement des thinking complets tous
            // les ~100 caractères. C'est le tour qui tourne encore, et le fait
            // d'être le dernier bloc de pensée, qui font le direct.
            const live = workingSince != null && i === lastThinkingIndex;
            if (live) {
              // À SA PLACE dans le fil, donc au-dessus de la réponse qu'il a
              // servi à écrire — et monté une fois pour tout le tour, ce qui
              // fait survivre le dépliage aux appels d'outil.
              return (
                <LiveThinking
                  key={`live-thinking:${i}`}
                  thought={liveThought}
                  collapsedByDefault={penseeRepliee}
                />
              );
            }
            return (
              <ThinkingBlock
                key={i}
                text={e.text}
                live={false}
                collapsedByDefault={penseeRepliee}
              />
            );
          }
          if (e.kind === "activity")
            return <ActivityCard key={e.id} event={e} live={workingSince != null && e.status === "running"} />;
          if (e.kind === "permission")
            return (
              <div key={i} className={`perm-card ${e.answered != null ? "answered" : ""}`}>
                <div className="perm-head">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z"/></svg>
                  <span>{t("perm.ask", { tool: e.toolName })}</span>
                </div>
                {e.input ? (() => {
                  const { lang, text } = formatPermInput(e.toolName, e.input);
                  return lang ? (
                    <pre className="perm-input"><code className="hljs" dangerouslySetInnerHTML={{ __html: highlightCode(text, lang) }} /></pre>
                  ) : (
                    <pre className="perm-input">{text}</pre>
                  );
                })() : null}
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
          if (e.kind === "edit") {
            // La carte « fichiers modifiés » du dernier tour terminé liste
            // déjà ces fichiers avec leurs +/− et leur diff par fichier : la
            // ligne inline ferait doublon (2026-08-21).
            const coveredByCard = lastDoneIndex >= 0 && i < lastDoneIndex && i > lastDoneUserIndex;
            if (coveredByCard) return null;
            return <EditLine key={i} event={e} threadId={threadId} />;
          }
          if (e.kind === "todos") {
            // Checklist de plan vivante (finition 2026-08-22) : en-tête avec
            // avancement « n/N », coche par tâche, tâche active marquée. Le
            // singleton `todos` est réécrit en place à chaque TodoWrite — les
            // cases se cochent donc en direct pendant le tour.
            const faits = e.items.filter((todo) => todo.completed).length;
            return (
              <div key={i} className="todos-card">
                <div className="todos-head">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2.5 4l1 1 2-2M2.5 8.5l1 1 2-2M2.5 13l1 1 2-2M8 4.5h5.5M8 9h5.5M8 13.5h5.5" />
                  </svg>
                  <span>{t("chat.plan-progress", { done: faits, total: e.items.length })}</span>
                </div>
                <div className="todos">
                  {e.items.map((todo, idx) => (
                    <div key={idx} className={todo.completed ? "todo done" : todo.active ? "todo active" : "todo"}>
                      <span className="todo-box">{todo.completed ? (
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m3.5 8.5 3 3 6-7" />
                        </svg>
                      ) : todo.active ? <span className="todo-dot" aria-hidden="true" /> : null}</span>
                      <span>{todo.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          // goal : aucune carte dans le transcript — l'état vit dans la barre
          // épinglée au composer (GoalBar), alimentée par le même événement
          if (e.kind === "goal") return null;
          if (e.kind === "error")
            return (
              <div key={i} className="error">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 2.2 14.5 13.5H1.5z" />
                  <path d="M8 6.5v3.2M8 11.9v.1" />
                </svg>{" "}
                {e.message}
              </div>
            );
          if (e.kind === "done") {
            const isLastDone = !events.slice(i + 1).some((x) => x.kind === "done");
            // « Annuler le tour » = revert au message user du tour (capacité
            // existante onRevert, nouvelle destination — plan 020, étape 5)
            return (
              <ResultCapsule
                key={i}
                event={e}
                isLastDone={isLastDone}
                threadId={threadId}
                review={review}
                changedFiles={isLastDone ? lastDoneChangedFiles : undefined}
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
      {margeEntries.length > 0 && (
        <div
          className={`tl-marge${threadId && review ? " below-reviewer" : ""}`}
          role="list"
          aria-label={t("chat.marge")}
        >
          {margeEntries.map((entry) => (
            <span role="listitem" key={`${entry.kind}:${entry.index}:${entry.label}`} className="tl-mark-item">
            <RowButton
              className="tl-mark"
              data-mark={entry.kind}
              data-here={entry.index === hereIndex ? "true" : undefined}
              title={entry.label}
              onClick={() => jumpToEvent(entry.index)}
              onContextMenu={(e) => {
                if (entry.kind !== "pin") return;
                e.preventDefault();
                e.stopPropagation();
                setPinMenu({ index: entry.index, x: e.clientX, y: e.clientY });
              }}
            >
              <span className="tl-mark-sign" aria-hidden="true" />
              <span className="tl-mark-label">{entry.label}</span>
            </RowButton>
            </span>
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
      {quote && !noteDraft && (
        <div className="sel-toolbar" style={{ left: quote.x, top: quote.y - 44 }}>
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
            className="sel-annotate"
            onMouseDown={(e) => {
              e.preventDefault();
              const existing = marks.find((m) => m.text === quote.text.trim());
              setNoteDraft({ x: quote.x, y: quote.y, text: quote.text, note: existing?.note ?? "" });
              window.getSelection()?.removeAllRanges();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M13.5 9.5A2 2 0 0111.5 11.5H6l-3 2.5V4A1.5 1.5 0 014.5 2.5h7A2 2 0 0113.5 4.5z" />
              <path d="M6 6.5h4M6 8.5h2.5" />
            </svg>
            {quoteAnnotated ? t("chat.edit-annotation") : t("chat.annotate")}
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
      {badges.map((badge) => (
        <RowButton
          key={badge.mark.text}
          className="anno-badge"
          style={{ left: badge.x, top: badge.y }}
          title={badge.mark.note || t("chat.annotation-no-note")}
          onClick={() => setNoteDraft({
            x: badge.x, y: badge.y + 18, text: badge.mark.text, note: badge.mark.note ?? "",
          })}
        >
          {badge.n}
        </RowButton>
      ))}
      {noteDraft && (
        <div className="anno-editor" style={{ left: noteDraft.x, top: noteDraft.y - 44 }}>
          <div className="anno-editor-src">{noteDraft.text}</div>
          <textarea
            className="anno-editor-note"
            autoFocus
            value={noteDraft.note}
            placeholder={t("chat.annotation-placeholder")}
            onChange={(e) => setNoteDraft({ ...noteDraft, note: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setNoteDraft(null); setQuote(null); }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                addAnnotation(noteDraft.text, noteDraft.note);
                setNoteDraft(null);
                setQuote(null);
              }
            }}
          />
          <div className="anno-editor-row">
            <span className="anno-editor-hint">{t("chat.annotation-hint")}</span>
            <span className="anno-editor-actions">
              {marks.some((m) => m.text === noteDraft.text.trim()) && (
                <IconButton
                  size="s"
                  label={t("chat.annotation-remove")}
                  title={t("chat.annotation-remove")}
                  onClick={() => { removeAnnotation(noteDraft.text); setNoteDraft(null); setQuote(null); }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8" />
                  </svg>
                </IconButton>
              )}
              <IconButton
                size="s"
                className="anno-editor-confirm"
                label={t("chat.annotate")}
                title={t("chat.annotate")}
                onClick={() => { addAnnotation(noteDraft.text, noteDraft.note); setNoteDraft(null); setQuote(null); }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              </IconButton>
            </span>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
