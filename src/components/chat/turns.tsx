// Composants de tour du chat (plan 015, slice 4) — JSX déplacé verbatim
// depuis le dispatcher de Chat.tsx. Chaque composant est memoizable : état
// (editing, plis, review) et callbacks restent dans Chat, passés en props.
// Clés et classes inchangées : le streaming et l'ancrage ne bougent pas.
import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { AgentEvent } from "../../lib/ws";
import type { ChatTurnViewModel, ToolAction } from "../../lib/chat/turnViewModel";
import type { PluginCatalogEntry } from "../../lib/plugins";
import { t } from "../../lib/i18n";
import { normalizeMathDelimiters } from "../../lib/markdown";
import { decorateKbCites } from "./kbCite";
import { kbSourcesSnapshot, requestKbSources, subscribeKbSources } from "../../lib/kbSources";
import { CopyIcon, ForkIcon, ResumeIcon } from "../icons";
import { MD_COMPONENTS, MD_COMPONENTS_STREAMING, MdBody, useMdPlugins } from "./md";
import { DoneDiffToggle, fmtTime, PencilIcon, PinBtn, Working } from "./turnParts";
import type { ChangedFile } from "./changedFiles";
import {
  activityIconForAction, activitySegments,
  distinctToolActions, summarizeActivity, Tick, tickerRows, turnProgressSignature,
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

/** Moteur pur du typewriter (2026-08-24) : révélation à DÉBIT CONSTANT
 * ADAPTATIF au lieu du drainage proportionnel. Le 12 %/tick accélérait
 * brutalement à chaque gros delta du CLI puis décélérait en exponentielle —
 * un rythme de pompe, chunk après chunk. Ici le débit visible suit le débit
 * d'arrivée réel (EMA ~2 s), majoré par un rattrapage borné (τ = 600 ms sur
 * le retard) pour ne jamais diverger, avec un plancher pour ne jamais geler.
 * Pur et à horloge injectée : testable sans rAF réel. */
export interface StreamPace {
  /** Caractères révélés (index dans le texte cible). */
  revealed: number;
  /** Reliquat fractionnaire de caractères entre deux ticks. */
  fractional: number;
  /** Débit d'arrivée estimé (chars/s, EMA). 0 = pas encore mesuré. */
  rate: number;
  /** Horodatage de la dernière croissance RETENUE pour la mesure (-1 = jamais). */
  lastGrowthAt: number;
  /** Longueur du texte à cette dernière croissance retenue. */
  lastLen: number;
  /** Horodatage du dernier tick de révélation. */
  lastTickAt: number;
}

/** Rattrapage : le retard se résorbe avec cette constante de temps (ms). */
const PACE_CATCHUP_MS = 600;
/** Plancher (chars/s) : la révélation ne gèle jamais. */
const PACE_FLOOR_CPS = 90;
/** Constante de temps de l'EMA du débit d'arrivée (ms). */
const PACE_RATE_TAU_MS = 2000;
/** Deux deltas à moins de 50 ms = même rafale : mesurés ensemble au suivant. */
const PACE_COALESCE_MS = 50;

export function newStreamPace(initialLen: number): StreamPace {
  return { revealed: initialLen, fractional: 0, rate: 0, lastGrowthAt: -1, lastLen: initialLen, lastTickAt: 0 };
}

/** Note l'arrivée de texte et met à jour l'estimation de débit. */
export function paceGrowth(p: StreamPace, len: number, now: number): void {
  if (len <= p.lastLen) {
    p.lastLen = len;
    return;
  }
  if (p.lastGrowthAt < 0) {
    p.lastGrowthAt = now;
    p.lastLen = len;
    return;
  }
  const dt = now - p.lastGrowthAt;
  // Rafale coalescée : dt quasi nul donnerait un débit instantané absurde.
  // On laisse la croissance s'accumuler ; la prochaine mesure la couvrira.
  if (dt < PACE_COALESCE_MS) return;
  const inst = ((len - p.lastLen) * 1000) / dt;
  const alpha = 1 - Math.exp(-dt / PACE_RATE_TAU_MS);
  p.rate = p.rate === 0 ? inst : p.rate + alpha * (inst - p.rate);
  p.lastGrowthAt = now;
  p.lastLen = len;
}

/** Un tick de révélation. Retourne true si `revealed` a avancé. */
export function paceStep(p: StreamPace, full: string, now: number): boolean {
  const dt = Math.min(Math.max(now - p.lastTickAt, 0), 250);
  p.lastTickAt = now;
  const total = full.length;
  if (p.revealed >= total) {
    p.fractional = 0;
    return false;
  }
  const backlog = total - p.revealed;
  const cps = Math.max(p.rate, (backlog * 1000) / PACE_CATCHUP_MS, PACE_FLOOR_CPS);
  p.fractional += (cps * dt) / 1000;
  const step = Math.floor(p.fractional);
  if (step <= 0) return false;
  p.fractional -= step;
  let next = Math.min(total, p.revealed + step);
  // Snap à la fin du mot en cours (plan 067) : un mot apparaît entier, son
  // fade (rehypeWordFade) joue une fois — jamais un mot tronqué qui grandit
  // sans animation. S'arrêter sur un caractère non blanc (en plein mot OU
  // juste avant lui) complète le mot. Cap +24 pour les runs sans blanc
  // (URLs, code) : la progression reste garantie.
  if (next < total && !/\s/.test(full[next] ?? " ")) {
    const cap = Math.min(total, next + 24);
    while (next < cap && !/\s/.test(full[next])) next += 1;
  }
  p.revealed = next;
  return true;
}

/** Typewriter : le CLI Claude livre le texte par morceaux à l'échelle de la
 * phrase (mesuré : ~6 text_delta pour 5 phrases, même avec
 * --include-partial-messages) — affichés bruts, ils donnent une impression de
 * sauts, pas de streaming. On découple donc le rythme réseau du rythme visuel
 * (même principe que smoothStream du Vercel AI SDK) : le texte cible
 * s'accumule, une boucle rAF révèle le retard au débit d'arrivée estimé
 * (voir paceStep). Fin de tour : flush immédiat. Au montage, le texte déjà
 * présent s'affiche sans replay (reprise de fil). Sous
 * prefers-reduced-motion, aucun typewriter : le texte brut passe tel quel. */
export function useSmoothedStream(text: string, working: boolean): string {
  const reduceMotion = typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pace = useRef<StreamPace | null>(null);
  if (pace.current == null) pace.current = newStreamPace(text.length);
  const target = useRef(text);
  const frame = useRef<number | null>(null);
  const [, force] = useState(0);
  target.current = text;

  useEffect(() => {
    if (reduceMotion) return;
    const p = pace.current!;
    const cancel = () => {
      if (frame.current != null) { cancelAnimationFrame(frame.current); frame.current = null; }
    };
    if (!working) {
      cancel();
      p.fractional = 0;
      if (p.revealed !== target.current.length) {
        p.revealed = target.current.length;
        force((n) => n + 1);
      }
      return cancel;
    }
    paceGrowth(p, text.length, performance.now());
    const tick = (time: number) => {
      frame.current = null;
      if (paceStep(p, target.current, time)) force((n) => n + 1);
      if (p.revealed < target.current.length) {
        frame.current = requestAnimationFrame(tick);
      }
    };
    if (frame.current == null && p.revealed < target.current.length) {
      frame.current = requestAnimationFrame(tick);
    }
    return cancel;
  }, [text, working, reduceMotion]);

  if (reduceMotion || !working) return text;
  return text.slice(0, Math.min(pace.current.revealed, text.length));
}

export function StreamingText(p: { text: string; working: boolean }) {
  const plugins = useMdPlugins();
  const text = useSmoothedStream(p.text, p.working);
  const kbCiteSources = useKbCiteSources(text);
  return (
    <Message align="start" className="chat-message assistant-message">
    <MessageContent className="msg-wrap">
      <Bubble variant="ghost" className="tw:w-full">
      {/* is-streaming : fondu d'entrée des nouveaux blocs (chunk-in) ; le
          caret est re-monté à chaque lot (key) pour « respirer » au rythme
          du flux — one-shot par événement, pas de boucle (§9). */}
      <BubbleContent className="msg chat-md is-streaming tw:w-full">
        <MdBody
          text={decorateKbCites(normalizeMathDelimiters(text), kbCiteSources)}
          streaming={p.working}
          components={MD_COMPONENTS_STREAMING as any}
          remarkPlugins={plugins.remark}
          rehypePlugins={plugins.rehype}
        />
        {/* keyé sur le texte CIBLE (pas révélé) : le caret « respire » à
            l'arrivée des données, pas à chaque tick du typewriter. */}
        {p.working && <span key={p.text.length} className="stream-caret" />}
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
  const kbCiteSources = useKbCiteSources(e.text);
  return (
    <Message id={`msg-${i}`} align="start" className="chat-message assistant-message">
    <MessageContent className="msg-wrap">
      <Bubble variant="ghost" className="tw:w-full">
      <BubbleContent className="msg chat-md tw:w-full">
        <MdBody
          text={decorateKbCites(normalizeMathDelimiters(e.text), kbCiteSources)}
          streaming={false}
          components={MD_COMPONENTS as any}
          remarkPlugins={plugins.remark}
          rehypePlugins={plugins.rehype}
        />
      </BubbleContent>
      </Bubble>
      <MessageFooter className="msg-actions is-persistent tw:px-0">
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
  return (
    <div id={p.isLastDone ? "last-done" : undefined}
      className={`done result-capsule ${e.ok ? "" : "warn"}`}>
      <div className={`capsule-head ${minimalSuccess ? "is-success-minimal" : ""}`}>
        {/* Le repli « Worked for… » porte déjà le succès. On ne garde un
            glyphe visible que pour l'interruption ; le succès reste annoncé
            aux lecteurs d'écran sans créer une ligne ✓ isolée. */}
        {e.ok ? (
          <span className="sr-only">{t("chat.turn-done")}</span>
        ) : (
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

/** Dernier élément satisfaisant un prédicat, sans copier le tableau. */
function findLast<T, U extends T>(items: T[], is: (item: T) => item is U): U | undefined {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (is(items[i])) return items[i] as U;
  }
  return undefined;
}

/** Une seule ligne d'activité courante, comme Codex. Les segments terminés
 * restent à leur place dans le transcript au lieu d'être aspirés ici. */
export function ActiveTurnHeader(p: {
  turn: ChatTurnViewModel;
  since: number;
  tokens?: number | null;
  open?: boolean;
  onToggle?: () => void;
  renderToolLine?: (action: ToolAction, key: React.Key) => ReactNode;
  /** lignes de travail déjà déposées à l'écran pour ce tour (pas les appels
   * d'outil : cinq lectures d'affilée n'en forment qu'une) */
  visibleRuns?: number;
}) {
  // Bilan cumulatif du tour ENTIER (toutes tranches, pas seulement l'active) :
  // il vit sous le chrono pendant toute la durée du tour, pensée comprise —
  // le travail déjà fait ne disparaît jamais de l'écran (parti pris Hermes).
  // La ligne est un disclosure : clic → la liste des appels du tour.
  const groups = p.turn.actionGroups.filter((group) => group.actions.length > 0);
  const actions = groups.flatMap((group) => group.actions);
  const segments = activitySegments(actions);
  const open = p.open ?? false;
  return (
    <div className="working-stack active-turn-header" data-turn-id={p.turn.turnId ?? p.turn.key}>
      <div className="working-row"><Working since={p.turn.startedAtMs ?? p.since} tokens={p.tokens} /></div>
      {/* Une seule ligne déposée = le cumul la répète mot pour mot ; il ne
          devient une vue d'ensemble qu'à partir de deux (doublon signalé trois
          fois par Thierry le 2026-08-21 — les deux premières corrections
          comptaient les APPELS d'outil, pas les lignes affichées). */}
      {(p.visibleRuns ?? 0) >= 2 && segments.length > 0 && (
        <>
          <RowButton className="turn-cumulative" onClick={p.onToggle} aria-expanded={open}>
            {segments.map((segment, i) => (
              <span key={i} className={segment.live ? "turn-cumulative-live" : undefined}>
                {i > 0 && <span className="turn-cumulative-sep" aria-hidden> · </span>}
                {segment.text}
              </span>
            ))}
            <Tick open={open} />
          </RowButton>
          {open && p.renderToolLine && (
            <div className="tool-group-list turn-cumulative-detail">
              {distinctToolActions(actions).map((action, offset) => p.renderToolLine!(action, offset))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Fenêtre d'une ligne sur la liste croissante des actions du tour : chaque
 * nouvelle action fait glisser la précédente vers le haut, hors du cadre —
 * un tour qui touche trente fichiers tique sur place au lieu de défiler.
 * Adapté de Hermes Desktop (ToolRunTicker, nousresearch/hermes-agent, MIT). */
export function ToolRunTicker({ rows }: { rows: { key: string; label: string }[] }) {
  const label = rows[rows.length - 1]?.label ?? "";
  return (
    // role="status" + aria-live="polite" : la ligne qui tique est du même
    // échafaudage que « en attente · Ns » — annoncée aux lecteurs d'écran
    // (façon Hermes StatusRow), sans crier sur le reste du fil.
    <span className="tool-ticker" role="status" aria-live="polite">
      <span
        className="tool-ticker-reel"
        style={{ "--tick-i": rows.length - 1 } as React.CSSProperties}
      >
        {rows.map((row) => (
          <span key={row.key} className="tool-ticker-row" aria-hidden={row.label !== label}>{row.label}</span>
        ))}
      </span>
    </span>
  );
}

export function ActiveTurnTail(p: {
  turn: ChatTurnViewModel;
  events: AgentEvent[];
  onStop: () => void;
}) {
  const state = p.turn.activeState;
  // La queue ne narre plus RIEN du travail : chaque run vit à sa place dans le
  // fil et c'est SA ligne qui tique (parti pris Hermes, 2026-08-21). Il ne
  // reste ici que le silence chronométré — quand ni outil, ni pensée, ni
  // réponse ne parle — et le rappel d'interruption.
  const lastStreamingEvent = findLast(p.events, (e): e is Extract<AgentEvent, { kind: "streaming" }> => e.kind === "streaming");
  const answerLength = lastStreamingEvent?.text.length ?? 0;
  const actions = p.turn.actionGroups.flatMap((group) => group.actions);
  const signature = turnProgressSignature(
    actions,
    currentThought(p.turn, p.events).length,
    answerLength,
  );
  const quietSinceRef = useRef(Date.now());
  const prevSignatureRef = useRef(signature);
  // « en attente » n'a de sens qu'après un PREMIER progrès : avant, son compte
  // est identique au chrono du tour juste au-dessus — horodateur en double.
  const hadProgressRef = useRef(false);
  if (prevSignatureRef.current !== signature) {
    prevSignatureRef.current = signature;
    quietSinceRef.current = Date.now();
    hadProgressRef.current = true;
  }
  const [, forceQuietTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceQuietTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const quietSeconds = Math.floor((Date.now() - quietSinceRef.current) / 1000);
  const running = distinctToolActions(actions).some((action) => (
    action.kind === "tool_update" && /^(running|pending|in[-_]?progress)$/i.test(action.status ?? "")
  ));
  const silencieux = state?.kind !== "answering" && state?.kind !== "waiting"
    && !running && hadProgressRef.current && quietSeconds >= 2;

  return (
    <div className="working-stack active-turn-tail" data-turn-id={p.turn.turnId ?? p.turn.key}>
      {/* Le silence chronométré vit SUR la ligne d'interruption, jamais sur une
          ligne à lui : montée puis démontée, elle poussait tout le fil vers le
          haut et le relâchait à chaque aller-retour (le fil est ancré en bas —
          « ça remonte et ça descend », Thierry 2026-08-22). Le slot est donc
          toujours là, à droite d'une ligne qui existe déjà : seul le TEXTE
          apparaît, la géométrie ne bouge pas. Région live montée en permanence
          = la bonne façon de faire annoncer un changement de contenu. */}
      <div className="turn-tail-row">
        <RowButton className="stop-hint" title={t("action.interrupt")} onClick={p.onStop}>
          <kbd>esc</kbd> {t("action.interrupt")}
        </RowButton>
        <span
          className={`turn-quiet${silencieux ? " is-on" : ""}`}
          role="status"
          aria-live="polite"
        >
          {silencieux ? t("chat.quiet-wait", { s: quietSeconds }) : ""}
        </span>
      </div>
    </div>
  );
}

export function ActivityGroup(p: {
  actions: ToolAction[];
  plugins?: PluginCatalogEntry[];
  open: boolean;
  onToggle: () => void;
  renderToolLine: (action: ToolAction, offset: number) => ReactNode;
  stamp?: ReactNode;
  /** run EN COURS du tour actif : la ligne tique au lieu d'afficher un résumé
   * figé. C'est la ligne du run qui vit (parti pris Hermes) — il n'existe pas
   * d'autre endroit où l'action courante s'affiche, donc jamais de doublon. */
  live?: boolean;
  /** dernière action REÇUE, même terminée : entre deux outils rapides, plus
   * rien n'est « en cours » et le fil paraissait mort (Thierry 2026-08-21). */
}) {
  const distinctActions = distinctToolActions(p.actions);
  const summary = summarizeActivity(distinctActions, p.plugins);
  const updates = distinctActions.filter((a): a is Extract<AgentEvent, { kind: "tool_update" }> => a.kind === "tool_update");
  const failed = updates.some((a) => a.status === "failed" || (a.exitCode != null && a.exitCode !== 0));
  const running = updates.some((a) => /^(running|pending|in[-_]?progress)$/i.test(a.status ?? ""));
  const status = failed ? "failed" : p.live ? "running" : "completed";
  // Le nom technique (Bash, Read, execute_command…) n'est jamais le libellé
  // principal. Une action reste compréhensible avant d'ouvrir son détail brut.
  return (
    <ActivityDisclosure open={p.open} onToggle={p.onToggle} status={status} shimmer={p.live && running}
      icon={p.live ? activityIconForAction(distinctActions[distinctActions.length - 1], p.plugins) : summary.icon}
      label={p.live ? <ToolRunTicker rows={tickerRows(distinctActions)} /> : summary.label}
      meta={p.stamp}>
        <div className="tool-group-list">
          {distinctActions.map((action, offset) => p.renderToolLine(action, offset))}
        </div>
    </ActivityDisclosure>
  );
}
