// Pièces de tour du chat (plan 015, slice 4) — déplacées verbatim depuis
// Chat.tsx : diff de fin de tour, ré-édition d'un edit, thinking, indicateur
// Working, carte d'activité, épingle. Aucune logique modifiée.
import { lazy, memo, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { BrainCircuitIcon } from "lucide-react";
import { AgentEvent } from "../../lib/ws";
import { wsSend } from "../../lib/wsBus";
import { t } from "../../lib/i18n";
import { diffLineClass, openFileRef } from "./md";
import { Tick } from "./toolPresentation";
import { ActivityDisclosure, IconButton, RowButton, Tooltip } from "../ui";
import { ChangedFilesCard } from "./ChangedFilesCard";
import type { ChangedFile } from "./changedFiles";

const AtelierDiffView = lazy(() => import("../AtelierDiffView"));
type ChatDiffPayload = { diff: string; before?: string; after?: string; binary?: boolean };

export function DoneDiffToggle({ event, threadId, changedFiles }: {
  event: Extract<AgentEvent, { kind: "done" }>;
  threadId: string | null;
  /** carte enrichie « N fichiers modifiés » (icône + nom + +/−), rendue
   * au-dessus du repli — partage le même mécanisme d'ouverture/fetch, aucune
   * requête gitDiff dupliquée (plan hermes-work-display, tâche 5). */
  changedFiles?: ChangedFile[];
}) {
  const files = event.filesChanged ?? [];
  // Ouverture PAR FICHIER (demande Thierry 2026-08-21) : chaque ligne de la
  // carte ouvre son propre diff sous elle — c'est le SEUL point d'entrée.
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());
  const open = openPaths.size > 0;
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

  const hasGitFiles = files.length > 0;
  const showCard = !!changedFiles && changedFiles.length > 0;
  // La carte reçoit sa dérivation dès qu'elle est non vide (edits seuls
  // suffisent) — le repli/toggle historique ne rend rien tant qu'aucun
  // chemin git n'est disponible pour ouvrir un diff (plan hermes-work-display
  // phase 2, F4/F3).
  if (!hasGitFiles && !showCard) return null;
  // fetch des diffs manquants — une seule demande gitDiff par fichier, quel
  // que soit le point d'entrée (ligne de la carte, « Voir le diff », repli).
  const requestDiffs = (paths: string[]) => {
    const missing = paths.filter((path) => !diffs[path] && !loading.has(path));
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
  };
  const openDiffs = () => {
    setOpenPaths(new Set(files));
    requestDiffs(files);
  };
  const toggleFileDiff = (path: string) => {
    setOpenPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    if (!openPaths.has(path)) requestDiffs([path]);
  };
  /** Corps du diff d'un fichier — même rendu où qu'il soit inséré (sous sa
   * ligne dans la carte, ou dans la liste du repli historique). */
  const fileDiffBody = (path: string) => {
    const payload = diffs[path];
    if (loading.has(path) && !payload) {
      return <div className="turn-diff-body"><span className="muted">{t("common.loading")}</span></div>;
    }
    if (payload?.binary) {
      return <div className="turn-diff-body"><span className="muted">{t("git.binary-changed")}</span></div>;
    }
    if (payload && payload.before !== undefined && payload.after !== undefined) {
      return (
        <Suspense fallback={<div className="turn-diff-body"><span className="muted">{t("common.loading")}</span></div>}>
          <AtelierDiffView before={payload.before} after={payload.after} path={path} compact />
        </Suspense>
      );
    }
    if (payload?.diff.trim()) {
      return (
        <pre className="turn-diff-body turn-diff-raw">{payload.diff.split("\n").map((line, idx) => (
          <span key={idx} className={diffLineClass(line)}>{line || " "}</span>
        ))}</pre>
      );
    }
    return <div className="turn-diff-body"><span className="muted">{t("git.diff-empty")}</span></div>;
  };
  // « Annuler les fichiers » retiré (Thierry 2026-08-21) : l'annulation du
  // TOUR, portée par la bulle du message user, restaure déjà les fichiers
  // (elle envoie le checkpoint) — c'en était un sous-ensemble.
  return (
    <>
    {showCard && (
      <ChangedFilesCard
        files={changedFiles!}
        // Un chemin absent de `filesChanged` (gitignoré, hors projectRoot,
        // réécrit à l'identique) ne recevra JAMAIS de réponse gitDiff : le
        // rendre cliquable le figeait sur « Chargement… » pour de bon.
        canDiff={(path) => files.includes(path)}
        onToggleFile={hasGitFiles ? toggleFileDiff : null}
        openPaths={openPaths}
        renderFileDiff={fileDiffBody}
      />
    )}
    {hasGitFiles && (
    <div className="turn-diff">
      {/* Repli historique : il ne sert que si la carte est absente (aucun
          fichier dérivé) — sinon le compte serait dit deux fois. */}
      {!showCard && (
        <RowButton
          className="turn-diff-toggle"
          aria-expanded={open}
          onClick={() => {
            if (open) { setOpenPaths(new Set()); return; }
            openDiffs();
          }}
        >
          <span>{t("chat.files-modified", { count: files.length })}</span>
          <Tick open={open} />
        </RowButton>
      )}
      {/* Repli historique (sans carte) : la liste complète des diffs ouverts.
          Avec la carte, chaque diff vit sous SA ligne. */}
      {!showCard && open && <div className="turn-diff-files">
        {files.filter((path) => openPaths.has(path)).map((path) => {
          return <section key={path} className="turn-diff-file">
            <div className="turn-diff-file-head">{path}</div>
            {fileDiffBody(path)}
          </section>;
        })}
      </div>}
    </div>
    )}
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

/** Puce ou numéro en tête de ligne — le raisonnement des modèles est écrit en
 * listes, et les rendre en bloc brut laissait les marqueurs traîner dans le
 * texte au lieu de structurer la lecture (comparaison Hermes 2026-08-21). */
const THINKING_MARKER = /^(\s*)([-*•]|\d{1,3}[.)])\s+/;

/** Gras et code inline SANS parseur markdown : le raisonnement streame par
 * centaines de morceaux, on ne repasse pas un arbre markdown à chaque chunk.
 * Les `**` littéraux traînaient à l'écran, c'est ce que ça règle. */
function thinkingInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) != null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] != null) parts.push(<strong key={key++}>{match[1]}</strong>);
    else parts.push(<code key={key++}>{match[2]}</code>);
    last = match.index + match[0].length;
  }
  if (!parts.length) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Le raisonnement, mis en forme : une ligne = un paragraphe, un marqueur de
 * liste passe en colonne avec retrait pendu (les lignes qui reviennent à la
 * ligne s'alignent sous le texte, pas sous le numéro). Romain, jamais
 * italique : c'est de la prose à lire, pas une citation. */
/** Une ligne, mémoïsée : le raisonnement streame par centaines de morceaux et
 * seule la DERNIÈRE ligne change — sans ce memo, chaque chunk relançait les
 * regex et le diff React sur les N lignes déjà figées (audit 2026-08-21). */
const ThinkingLine = memo(function ThinkingLine({ line }: { line: string }) {
  if (!line.trim()) return <div className="thinking-gap" />;
  const marker = THINKING_MARKER.exec(line);
  if (marker) {
    // Niveau d'imbrication : l'indentation d'origine porte la hiérarchie du
    // raisonnement, la perdre aplatissait sous-points et points principaux.
    const depth = Math.min(3, Math.floor(marker[1].length / 2));
    return (
      <p className="thinking-item" style={depth ? { marginLeft: `${depth * 14}px` } : undefined}>
        <span className="thinking-marker">{marker[2]}</span>
        <span className="thinking-item-body">{thinkingInline(line.slice(marker[0].length))}</span>
      </p>
    );
  }
  return <p className="thinking-para">{thinkingInline(line)}</p>;
});

export function ThinkingProse({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  return (
    <div className={className ? `thinking-prose ${className}` : "thinking-prose"}>
      {lines.map((line, index) => <ThinkingLine key={index} line={line} />)}
    </div>
  );
}

export function ThinkingBlock(
  { text, live, collapsedByDefault = false }:
    { text: string; live: boolean; collapsedByDefault?: boolean },
) {
  // La pensée se déroule PENDANT le tour, puis se replie quand la réponse
  // arrive : on ne voyait que 140 caractères d'un texte qui en fait des
  // dizaines de milliers. `manuel` garde la main dès que Thierry clique —
  // son choix survit à la fin du tour, et repart en automatique au suivant.
  const [manuel, setManuel] = useState<boolean | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef(live);
  // Vue de la transcription (2026-08-21) : « Réflexion en cours »/« Détaillé »
  // passent collapsedByDefault=false et veulent le flux complet AUSSI sur les
  // blocs passés — le défaut suit donc la vue, plus le seul direct.
  const open = manuel ?? !collapsedByDefault;
  const normalized = text.trim();

  useEffect(() => {
    // nouveau tour : on redonne la main à l'automatique
    if (live && !liveRef.current) setManuel(null);
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    // La dernière ligne reste sous les yeux : en direct dans le corps déplié,
    // et TOUJOURS dans la fenêtre repliée (elle ne montre que la fin).
    const node = bodyRef.current;
    if (!node) return;
    if (open && !live) return;
    node.scrollTop = node.scrollHeight;
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
        <Tick open={open} />
      </RowButton>
      {/* Une pensée TERMINÉE se réduit à sa seule ligne (demande Thierry
          2026-08-22) : la fenêtre de 4 lignes n'a de sens que tant que le
          raisonnement s'écrit — après coup, elle n'apporte qu'un pavé de
          texte figé, répété à chaque bloc, qui fait grossir le fil par
          à-coups. Un clic rouvre le flux entier. En vue « Réflexion en
          cours »/« Détaillé », `open` est vrai d'office : rien n'est caché. */}
      {open ? (
        <div className="thinking-body" ref={bodyRef}>
          <ThinkingProse text={normalized} />
        </div>
      ) : null}
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

/** Révélation différée d'une note d'attente (façon Hermes DRAFTING_REVEAL_MS) :
 *  assez longue pour qu'un appel dont les arguments arrivent en quelques frames
 *  ne strobose jamais une ligne, assez courte pour qu'une vraie attente soit
 *  nommée presque immédiatement. */
const NOTE_REVEAL_MS = 200;

export function Working(
  { since, tokens, note }: { since: number; tokens?: number | null; note?: string | null },
) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // La note n'apparaît qu'après NOTE_REVEAL_MS de STABILITÉ : changer de note
  // repart à zéro (attente continue, pas un reset à chaque événement).
  const [noteShown, setNoteShown] = useState<string | null>(null);
  useEffect(() => {
    if (!note) {
      setNoteShown(null);
      return;
    }
    const id = setTimeout(() => setNoteShown(note), NOTE_REVEAL_MS);
    return () => clearTimeout(id);
  }, [note]);
  const duration = workDuration(Date.now() - since);
  return (
    <div className="working working-header">
      {/* Façon Hermes : le pulse + le temps suffisent — « Travaille depuis »
          ne disait rien que le pulse ne dise déjà (demande Thierry 2026-08-21). */}
      <span className="working-label" aria-label={t("chat.working")}>
        {duration}
        {tokens != null && tokens > 0 ? (
          <span className="working-tokens">{t("chat.working-tokens", { n: fmtTokenCount(tokens) })}</span>
        ) : null}
        {noteShown ? <span className="working-note">{noteShown}</span> : null}
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

export function LiveThinking(
  { thought, collapsedByDefault = false, quietSeconds = null, showElapsed = true,
    collapsed = null, onToggleCollapsed }:
    { thought?: string | null; collapsedByDefault?: boolean;
      /** silence depuis le dernier progrès — ≥ 2 s remplace le shimmer muet
       * par « en attente · Ns » (une ligne, jamais de narration en double) */
      quietSeconds?: number | null;
      /** false tant que rien ne s'est passé avant cette pensée : le chrono du
       * tour, juste au-dessus, compte alors exactement la même chose */
      showElapsed?: boolean;
      /** repli contrôlé par l'appelant (survit aux démontages entre outils) */
      collapsed?: boolean | null;
      onToggleCollapsed?: (next: boolean) => void } = {},
) {
  // La pensée dépliée COULE en flux complet (façon Hermes « Thinking ⌄ 25s »,
  // demande Thierry 2026-08-21) : plus de fenêtre bornée ni de « tout
  // afficher » — le suivi du bas est assuré par la timeline (ancrage LegendList)
  // et le repli en une ligne d'aperçu reste à un clic (préférence
  // thinkingCollapsed pour ceux qui veulent le calme par défaut).
  const texte = (thought ?? "").trim();
  // Repli contrôlé quand l'appelant le porte (ActiveTurnTail) : sinon l'état
  // mourait à chaque appel d'outil, qui démonte l'indicateur — Thierry
  // dépliait la pensée et elle se refermait toute seule (audit 2026-08-21).
  const [replieLocal, setReplieLocal] = useState(collapsedByDefault);
  const replie = collapsed ?? replieLocal;
  const setReplie = (next: boolean) => {
    if (onToggleCollapsed) onToggleCollapsed(next);
    else setReplieLocal(next);
  };
  // Chrono du bloc de pensée : depuis la première pensée non vide de ce
  // montage (un passage par les outils démonte/remonte l'indicateur, ce qui
  // borne naturellement le compteur au bloc courant).
  const penseeDepuisRef = useRef<number | null>(null);
  if (texte && penseeDepuisRef.current == null) penseeDepuisRef.current = Date.now();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!texte) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [texte !== ""]);
  const penseeSecs = penseeDepuisRef.current != null
    ? Math.max(0, Math.floor((Date.now() - penseeDepuisRef.current) / 1000))
    : 0;
  // Pas de compteur de « segments » ici (demande Thierry 2026-08-15) : le CLI
  // caviarde le texte du raisonnement en headless (≥2.1.8, issue #20127) et un
  // compte qui monte n'est pas un substitut acceptable. Le libellé reste sobre ;
  // le tooltip explique pourquoi le contenu n'apparaît pas.
  if (!texte) {
    // Sans texte, on ne SAIT pas que le modèle réfléchit : afficher
    // « Réflexion » était une affirmation gratuite (« ya réflexion mais ya
    // aucune réflexion là », Thierry 2026-08-21). Le pulse et le chrono du
    // tour, juste au-dessus, disent déjà qu'on travaille ; seule une attente
    // qui dure gagne une ligne, et elle dit ce qu'elle mesure.
    if (quietSeconds != null && quietSeconds >= 2) {
      return (
        <div className="thinking-live-indicator" role="status" aria-live="polite"
          title={t("chat.thinking-progress-hint")}>
          <span className="turn-quiet">{t("chat.quiet-wait", { s: quietSeconds })}</span>
        </div>
      );
    }
    return null;
  }
  return (
    <div className="thinking-live-indicator has-text" role="status" aria-live="polite">
      <RowButton
        className="thinking-live-head"
        aria-expanded={!replie}
        onClick={() => setReplie(!replie)}
      >
        <BrainCircuitIcon className="thinking-icon" aria-hidden="true" />
        <span className="thinking-label">{t("chat.thinking-live")}</span>
        <Tick open={!replie} />
        {showElapsed && penseeSecs > 0 && <span className="thinking-elapsed">{penseeSecs} s</span>}
      </RowButton>
      {/* Réduit = petite fenêtre de quelques lignes calée sur la fin (demande
          Thierry 2026-08-21) ; déplié = flux complet façon Hermes. */}
      <ThinkingTail texte={texte} windowed={replie} />
    </div>
  );
}

function ThinkingTail({ texte, windowed }: { texte: string; windowed: boolean }) {
  const flux = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = flux.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [texte, windowed]);
  return (
    <div ref={flux} className={`thinking-live-stream${windowed ? " windowed" : " plein"}`}>
      <ThinkingProse text={texte} />
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
