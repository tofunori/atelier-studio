// Pièces de tour du chat (plan 015, slice 4) — déplacées verbatim depuis
// Chat.tsx : diff de fin de tour, ré-édition d'un edit, thinking, indicateur
// Working, carte d'activité, épingle. Aucune logique modifiée.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BrainCircuitIcon } from "lucide-react";
import { AgentEvent } from "../../lib/ws";
import { wsSend } from "../../lib/wsBus";
import { t } from "../../lib/i18n";
import { diffLineClass, openFileRef } from "./md";
import { Tick } from "./toolPresentation";
import { ActivityDisclosure, Button, IconButton, RowButton, Tooltip } from "../ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../shadcn/alert-dialog";

const AtelierDiffView = lazy(() => import("../AtelierDiffView"));
type ChatDiffPayload = { diff: string; before?: string; after?: string; binary?: boolean };

export function DoneDiffToggle({ event, threadId }: {
  event: Extract<AgentEvent, { kind: "done" }>;
  threadId: string | null;
}) {
  const files = event.filesChanged ?? [];
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [diffs, setDiffs] = useState<Record<string, ChatDiffPayload>>({});

  useEffect(() => {
    const onDiff = (ev: Event) => {
      const msg = (ev as CustomEvent).detail;
      if (!msg.path || !files.includes(msg.path)) return;
      if (event.projectRoot && msg.projectRoot !== event.projectRoot) return;
      setDiffs((current) => ({ ...current, [msg.path]: {
        diff: String(msg.diff ?? ""),
        before: typeof msg.before === "string" ? msg.before : undefined,
        after: typeof msg.after === "string" ? msg.after : undefined,
        binary: Boolean(msg.binary),
      } }));
      setLoading((current) => {
        const next = new Set(current);
        next.delete(msg.path);
        return next;
      });
    };
    window.addEventListener("git-diff", onDiff);
    return () => window.removeEventListener("git-diff", onDiff);
  }, [event.projectRoot]);

  if (!files.length) return null;
  return (
    <>
    <div className="turn-diff">
      <RowButton
        className="turn-diff-toggle"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (!next) return;
          const missing = files.filter((path) => !diffs[path] && !loading.has(path));
          if (!missing.length) return;
          setLoading((current) => new Set([...current, ...missing]));
          for (const path of missing) {
            const sent = wsSend({
              type: "gitDiff",
              requestId: crypto.randomUUID(),
              threadId,
              projectRoot: event.projectRoot,
              path,
              baseSha: event.checkpoint?.snapshotSha,
              scope: "changes",
            });
            if (!sent) setLoading((current) => {
              const following = new Set(current);
              following.delete(path);
              return following;
            });
          }
        }}
      >
        <span>{t("chat.files-modified", { count: files.length })}</span>
        <Tick open={open} />
      </RowButton>
      {event.checkpoint ? (
        <Button
          variant="danger"
          className="turn-diff-undo"
          title={t("checkpoint.files-title")}
          onClick={() => setConfirmOpen(true)}
        >
          {t("checkpoint.undo-files")}
        </Button>
      ) : null}
      {open && <div className="turn-diff-files">
        {files.map((path) => {
          const payload = diffs[path];
          return <section key={path} className="turn-diff-file">
            <div className="turn-diff-file-head">{path}</div>
            {loading.has(path) && !payload ? (
              <div className="turn-diff-body"><span className="muted">{t("common.loading")}</span></div>
            ) : payload?.binary ? (
              <div className="turn-diff-body"><span className="muted">{t("git.binary-changed")}</span></div>
            ) : payload && payload.before !== undefined && payload.after !== undefined ? (
              <Suspense fallback={<div className="turn-diff-body"><span className="muted">{t("common.loading")}</span></div>}>
                <AtelierDiffView before={payload.before} after={payload.after} path={path} compact />
              </Suspense>
            ) : payload?.diff.trim() ? (
              <pre className="turn-diff-body turn-diff-raw">{payload.diff.split("\n").map((line, idx) => (
                <span key={idx} className={diffLineClass(line)}>{line || " "}</span>
              ))}</pre>
            ) : (
              <div className="turn-diff-body"><span className="muted">{t("git.diff-empty")}</span></div>
            )}
          </section>;
        })}
      </div>}
    </div>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("checkpoint.files-title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("checkpoint.files-confirm")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              wsSend({
                type: "revert",
                scope: "files",
                threadId,
                turnId: "meta" in event && event.meta && "turnId" in event.meta ? event.meta.turnId : undefined,
                snapshotSha: event.checkpoint?.snapshotSha,
              });
              setConfirmOpen(false);
            }}
          >
            {t("checkpoint.undo-files")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ligne « fichier édité » : nom + ±lignes, clic = diff du fichier déplié
export function EditLine({ event, threadId }: {
  event: Extract<AgentEvent, { kind: "edit" }>;
  threadId: string | null;
}) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, ChatDiffPayload>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const onDiff = (ev: Event) => {
      const msg = (ev as CustomEvent).detail;
      if (!msg.path) return;
      if (event.projectRoot && msg.projectRoot !== event.projectRoot) return;
      if (msg.error) {
        setErrors((current) => ({ ...current, [msg.path]: String(msg.error) }));
        setLoading((current) => (current === msg.path ? null : current));
        return;
      }
      setDiffs((d) => ({ ...d, [msg.path]: {
        diff: String(msg.diff ?? ""),
        before: typeof msg.before === "string" ? msg.before : undefined,
        after: typeof msg.after === "string" ? msg.after : undefined,
        binary: Boolean(msg.binary),
      } }));
      setErrors((current) => {
        const next = { ...current };
        delete next[msg.path];
        return next;
      });
      setLoading((l) => (l === msg.path ? null : l));
    };
    window.addEventListener("git-diff", onDiff);
    return () => window.removeEventListener("git-diff", onDiff);
  }, [event.projectRoot]);

  if (!event.files?.length) return null;
  return (
    <div className="edit-lines">
      {event.files.map((f) => {
        const base = f.path.split("/").pop() || f.path;
        const open = openPath === f.path;
        const diff = diffs[f.path];
        const error = errors[f.path];
        // avant/après portés par l'événement (input du tool) : diff immédiat,
        // sans aller-retour git — sinon fallback historique gitDiff à la demande
        const snippet = f.newText !== undefined ? { before: f.oldText ?? "", after: f.newText } : null;
        return (
          <div key={f.path} className="edit-line">
            <div className="edit-line-row" title={f.path}>
              <RowButton
                className="edit-line-open"
                onClick={() => openFileRef(f.path, { diff: true, baseSha: event.baseSha })}
                title={`${t("action.open-file", { ref: f.path })} · diff avant/après`}
              >
                <PencilIcon />
                <span className="edit-line-verb">{t("chat.edited")}</span>
                <span className="edit-line-file">{base}</span>
                {f.add != null && <span className="edit-line-add">+{f.add}</span>}
                {f.del != null && <span className="edit-line-del">-{f.del}</span>}
              </RowButton>
              <IconButton
                label="diff"
                title="diff"
                className="edit-line-difftoggle"
                aria-expanded={open}
                onClick={() => {
                  const next = open ? null : f.path;
                  setOpenPath(next);
                  if (!next || snippet || diffs[f.path] != null || loading === f.path) return;
                  setErrors((current) => {
                    const following = { ...current };
                    delete following[f.path];
                    return following;
                  });
                  setLoading(f.path);
                  const sent = wsSend({
                    type: "gitDiff",
                    requestId: crypto.randomUUID(),
                    threadId,
                    projectRoot: event.projectRoot,
                    path: f.path,
                    baseSha: event.baseSha,
                    scope: "changes",
                  });
                  if (!sent) setLoading(null);
                  else window.setTimeout(() => {
                    setLoading((current) => {
                      if (current !== f.path) return current;
                      setErrors((existing) => ({ ...existing, [f.path]: t("chat.diff-timeout") }));
                      return null;
                    });
                  }, 8000);
                }}
              >
                <Tick open={open} />
              </IconButton>
            </div>
            {open && (
              <div className="turn-diff-body">
                {snippet ? (
                  <Suspense fallback={<span className="muted">{t("common.loading")}</span>}>
                    <AtelierDiffView before={snippet.before} after={snippet.after} path={f.path} compact />
                  </Suspense>
                ) : loading === f.path && diff == null ? (
                  <span className="muted">{t("common.loading")}</span>
                ) : error ? (
                  <span className="muted">{error}</span>
                ) : diff?.binary ? (
                  <span className="muted">{t("git.binary-changed")}</span>
                ) : diff && diff.before !== undefined && diff.after !== undefined ? (
                  <Suspense fallback={<span className="muted">{t("common.loading")}</span>}>
                    <AtelierDiffView before={diff.before} after={diff.after} path={f.path} compact />
                  </Suspense>
                ) : diff?.diff.trim() ? (
                  <pre className="turn-diff-raw">{diff.diff.split("\n").map((line, idx) => (
                    <span key={idx} className={diffLineClass(line)}>{line || " "}</span>
                  ))}</pre>
                ) : (
                  <span className="muted">{t("git.diff-empty")}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.3 2.3l2.4 2.4L5.4 13H3v-2.4z" />
    </svg>
  );
}

// bloc `pre` du message final : language-mermaid → diagramme (jamais en
// streaming, cf. MD_COMPONENTS_STREAMING plus bas), sinon bloc de code coloré
// habituel.
export function fmtTime(ts: number, fmt?: "system" | "24h" | "12h") {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (fmt === "24h") opts.hour12 = false;
  if (fmt === "12h") opts.hour12 = true;
  return new Date(ts).toLocaleTimeString([], opts);
}

/** « Williamson et al. - 2025 - Temperature… .pdf » → « Williamson et al. 2025 » ; sinon nom court. */
export function citeLabel(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const m = /^(.{2,60}?)\s+-\s+(\d{4})\s+-\s+/.exec(base);
  if (m) return `${m[1]} ${m[2]}`;
  return base.length > 34 ? base.slice(0, 33) + "…" : base;
}

export function formatPermInput(tool: string, input: Record<string, unknown>): { lang: string; text: string } {
  const one = (v: unknown) => String(v ?? "").slice(0, 400);
  if (tool === "Bash") return { lang: "bash", text: one((input as any).command) };
  if ((input as any).file_path) return { lang: "", text: one((input as any).file_path) };
  const s = JSON.stringify(input, null, 1);
  return { lang: "json", text: s.length > 400 ? s.slice(0, 400) + "…" : s };
}

export function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  // La pensée se déroule PENDANT le tour, puis se replie quand la réponse
  // arrive : on ne voyait que 140 caractères d'un texte qui en fait des
  // dizaines de milliers. `manuel` garde la main dès que Thierry clique —
  // son choix survit à la fin du tour, et repart en automatique au suivant.
  const [manuel, setManuel] = useState<boolean | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef(live);
  const open = manuel ?? live;
  const normalized = text.trim();
  const preview = normalized.replace(/\s+/g, " ").slice(-140);

  useEffect(() => {
    // nouveau tour : on redonne la main à l'automatique
    if (live && !liveRef.current) setManuel(null);
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    // en direct, on suit le fil : la dernière ligne reste sous les yeux
    if (!open || !live) return;
    const node = bodyRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [open, live, normalized]);

  if (!normalized) return null;
  return (
    <div className={`thinking ${live ? "live" : ""} ${open ? "open" : ""}`}>
      <RowButton
        className="thinking-head"
        aria-expanded={open}
        onClick={() => setManuel(!open)}
      >
        <BrainCircuitIcon className="thinking-icon" aria-hidden="true" />
        <span className="thinking-label">{live ? t("chat.thinking-live") : t("chat.thinking")}</span>
        {!open && <span className="thinking-preview">{preview}</span>}
        <Tick open={open} />
      </RowButton>
      {open && <div className="thinking-body" ref={bodyRef}>{normalized}</div>}
    </div>
  );
}

export function reasoningSummary(text: string): string {
  const lines = text
    .replace(/<!--[\s\S]*?-->/gu, "")
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith("<!--"));
  const line = lines[lines.length - 1];
  if (!line) return "";
  const cleaned = line
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^\*\*(.+)\*\*$/u, "$1")
    .replace(/^__(.+)__$/u, "$1")
    .replace(/^`(.+)`$/u, "$1")
    .trim()
    .replace(/^reasoning(?:\s+(?:update|trace|summary))?\b[\s:.-]*/iu, "")
    .replace(/^running\b[\s:.-]*/iu, "")
    .trim();
  return cleaned || line;
}

/** Synara consolide les mises à jour reasoning consécutives et montre la
 * dernière phrase utile. Le journal complet reste accessible au clic. */
export function ReasoningTrace({ texts }: { texts: string[] }) {
  const [open, setOpen] = useState(false);
  const normalized = texts.map((text) => text.trim()).filter(Boolean);
  const latest = normalized[normalized.length - 1] ?? "";
  const summary = reasoningSummary(latest);
  if (!summary) return null;
  return (
    <div className="reasoning-trace">
      <RowButton
        className="reasoning-trace-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="reasoning-trace-summary">{summary}</span>
        <Tick open={open} />
      </RowButton>
      {open ? <div className="reasoning-trace-body">{normalized.join("\n\n")}</div> : null}
    </div>
  );
}

function workDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** 842 → « 842 », 8 214 → « 8.2k », 128 400 → « 128k » (tabular-nums en CSS,
 * point décimal quel que soit le locale — même rendu que Claude Code). */
function fmtTokenCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, "")}k`;
}

export function Working(
  { since, tokens, note }: { since: number; tokens?: number | null; note?: string | null },
) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const duration = workDuration(Date.now() - since);
  return (
    <div className="working working-header">
      <span className="working-label">
        {t("chat.working-elapsed", { duration })}
        {tokens != null && tokens > 0 ? (
          <span className="working-tokens">{t("chat.working-tokens", { n: fmtTokenCount(tokens) })}</span>
        ) : null}
        {note ? <span className="working-note">{note}</span> : null}
      </span>
      <div className="working-divider" aria-hidden="true" />
    </div>
  );
}

/** Indicateur unique placé à la position courante du tour : il remplace les
 * sentinelles `thinking` vides et répétées du provider. Statique — le balayage
 * (650 ms toutes les 4 s) tournait en même temps que l'anneau de `Working`
 * juste au-dessus, or le contrat §9 n'autorise qu'UNE boucle par surface. */
export function ThinkingShimmer({ text = t("chat.thinking") }: { text?: string }) {
  return <span className="thinking-shimmer">{text}</span>;
}

export function LiveThinking({ thought }: { thought?: string | null } = {}) {
  // La pensée se DÉROULE pendant le travail : une fenêtre de quelques lignes
  // calée sur la fin, plutôt que les 120 derniers caractères sur une ligne.
  // Bornée en hauteur — Grok émet des centaines de morceaux et le fil ne doit
  // pas se faire pousser hors de l'écran par du raisonnement.
  // Repliable (façon Hermes « Thought › ») : ouverte par défaut — la pensée
  // vivante est la narration du moment — mais Thierry peut la replier en une
  // ligne d'aperçu pour suivre le tour sans le monologue.
  const texte = (thought ?? "").trim();
  const [replie, setReplie] = useState(false);
  // « plein » : Thierry a demandé toute la pensée — la fenêtre de 4 lignes ne
  // borne plus. Le choix est le sien (bouton « tout afficher »), la borne
  // reste le défaut : Grok émet des centaines de morceaux et le fil ne doit
  // pas se faire pousser hors de l'écran sans consentement.
  const [plein, setPlein] = useState(false);
  const [deborde, setDeborde] = useState(false);
  const flux = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = flux.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setDeborde(el.scrollHeight > el.clientHeight + 1);
  }, [texte, replie, plein]);
  // Pas de compteur de « segments » ici (demande Thierry 2026-08-15) : le CLI
  // caviarde le texte du raisonnement en headless (≥2.1.8, issue #20127) et un
  // compte qui monte n'est pas un substitut acceptable. Le libellé reste sobre ;
  // le tooltip explique pourquoi le contenu n'apparaît pas.
  if (!texte) {
    return (
      <div className="thinking-live-indicator" role="status" aria-live="polite"
        title={t("chat.thinking-progress-hint")}>
        <BrainCircuitIcon className="thinking-icon" aria-hidden="true" />
        <ThinkingShimmer />
      </div>
    );
  }
  const apercu = texte.replace(/\s+/g, " ").slice(-120);
  return (
    <div className="thinking-live-indicator has-text" role="status" aria-live="polite">
      <RowButton
        className="thinking-live-head"
        aria-expanded={!replie}
        onClick={() => setReplie((v) => !v)}
      >
        <BrainCircuitIcon className="thinking-icon" aria-hidden="true" />
        <span className="thinking-label">{t("chat.thinking-live")}</span>
        {replie && <span className="thinking-preview">{apercu}</span>}
        <Tick open={!replie} />
      </RowButton>
      {!replie && (
        <div ref={flux} className={`thinking-live-stream${plein ? " plein" : ""}`}>{texte}</div>
      )}
      {!replie && (plein || deborde) && (
        <RowButton className="thinking-more" onClick={() => setPlein((v) => !v)}>
          {t(plein ? "chat.thinking-show-window" : "chat.thinking-show-all")}
        </RowButton>
      )}
    </div>
  );
}

export function ActivityCard({ event, live }: { event: Extract<AgentEvent, { kind: "activity" }>; live: boolean }) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? live;
  const steps = event.steps ?? [];
  const status = event.status === "failed" ? "failed" : live || event.status === "running" ? "running" : "completed";
  return (
    <ActivityDisclosure open={open} status={status}
      onToggle={() => setManualOpen((v) => !(v ?? live))}
      label={<><span className="activity-title">{event.title}</span>{event.detail && <span className="activity-detail">{event.detail}</span>}</>}
      meta={steps.length > 0 ? t("chat.actions-used", { count: steps.length }) : undefined}>
        <div className="activity-steps">
          {steps.map((step, idx) => (
            <div key={`${step.title}-${idx}`} className={`activity-step ${step.status ?? "running"}`}>
              <span className="activity-step-dot" aria-hidden="true" />
              <span className="activity-step-title">{step.title}</span>
              {step.detail && <span className="activity-step-detail">{step.detail}</span>}
            </div>
          ))}
        </div>
    </ActivityDisclosure>
  );
}

export function PinBtn({ pinned, onClick }: { pinned: boolean; onClick: () => void }) {
  const label = pinned ? t("action.unpin-chapter") : t("action.pin-chapter");
  return (
    <Tooltip label={label}>
      <IconButton
        size="s"
        label={label}
        onClick={onClick}
        aria-pressed={pinned}
        className={`msg-action${pinned ? " is-active" : ""}`}
      >
        <svg data-icon="inline-start" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <path d="M9.5 2.5l4 4-3 1-2.5 4.5-4-4L8.5 5.5l1-3z" />
          <path d="M5.5 10.5L2.5 13.5" />
        </svg>
      </IconButton>
    </Tooltip>
  );
}
