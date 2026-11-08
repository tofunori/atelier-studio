// Écran d'ouverture des projets — variante A « bureau » (maquette validée par
// Thierry le 2026-11-08, inspirée de Lattice en plus sobre). Les trois derniers
// projets en cartes : première page du PDF compilé (ou vignette neutre), nom,
// une ligne grise par information (revue · activité, échéance, agents). ⌘1 à
// ⌘3 ouvrent une carte, Échap revient au projet courant. Chargé à la demande
// (budget de l'entrée) ; les vignettes viennent du serveur Rust
// (`projectCards`, rust/crates/atelier-runtime/src/project_home.rs).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { t, getResolvedLanguage } from "../lib/i18n";
import { wsSend } from "../lib/wsBus";
import { projectActivity, projectName, type ProjectDue } from "../lib/projectsHome";
import { Button, InlineNotice, RowButton, Select } from "./ui";
import { LazyDialog } from "./ui/LazyDialog";
import { Input } from "./shadcn/input";
import { Field, FieldGroup, FieldLabel } from "./shadcn/field";
import type { ProjMeta } from "./Rail";
import "../styles/projects-home.css";

type ThreadLike = { projectRoot: string; updatedAt?: string | null; status?: string };

/** Réponse du serveur pour une carte (voir project_home.rs). */
export type ProjectCard = {
  root: string;
  missing?: boolean;
  tex?: string | null;
  pdf?: string | null;
  thumb?: string | null;
  journal?: string | null;
  modifiedAt?: number | null;
};

const DESK_SIZE = 3;
const DAY = 86_400_000;

function svg(path: ReactNode, size = 14) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}
const FolderGlyph = (size = 14) =>
  svg(<path d="M2 4.5a1 1 0 0 1 1-1h3l1.4 1.6H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />, size);
const PlusGlyph = () => svg(<path d="M8 3.2v9.6M3.2 8h9.6" />);
const ClockGlyph = () => svg(<><circle cx="8" cy="8" r="5.6" /><path d="M8 5v3.2l2 1.3" /></>, 11);
const ListGlyph = () => svg(<path d="M5.5 4.5h7M5.5 8h7M5.5 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01" />, 13);

function shortDate(at: Date, now: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (at.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return at.toLocaleDateString(getResolvedLanguage() === "en" ? "en" : "fr-CA", opts);
}

/** « il y a 2 h », « hier », « 12 nov. » — null quand on ne sait rien. */
export function activityText(at: number, now: Date): string | null {
  if (!at) return null;
  const ms = now.getTime() - at;
  if (ms < 60_000) return t("home.rel.now");
  if (ms < 3_600_000) return t("home.rel.min", { n: Math.floor(ms / 60_000) });
  if (ms < DAY) return t("home.rel.hours", { n: Math.floor(ms / 3_600_000) });
  if (ms < 2 * DAY) return t("projects.yesterday");
  if (ms < 7 * DAY) return t("home.rel.days", { n: Math.floor(ms / DAY) });
  return shortDate(new Date(at), now);
}

/** Jours calendaires entre aujourd'hui et la date (AAAA-MM-JJ), en heure locale. */
function daysUntil(date: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / DAY);
}

/** « Soumission dans 23 jours », « Échéance aujourd'hui », « Cours le 12 déc. ». */
export function dueText(due: ProjectDue | undefined, now: Date): string | null {
  if (!due?.date) return null;
  const days = daysUntil(due.date, now);
  if (days == null) return null;
  const label = due.label?.trim() || t("projects.due");
  const [y, mo, d] = due.date.split("-").map(Number);
  const date = shortDate(new Date(y, mo - 1, d), now);
  if (days < 0) return t("projects.due-past", { label, date });
  if (days === 0) return t("projects.due-today", { label });
  if (days === 1) return t("projects.due-tomorrow", { label });
  if (days <= 60) return t("projects.due-in", { label, n: days });
  return t("projects.due-on", { label, date });
}

function Sheet(p: { card?: ProjectCard; small?: boolean }) {
  if (p.card?.thumb) {
    return (
      <div className="ph-sheet">
        <img src={p.card.thumb} alt="" draggable={false} />
      </div>
    );
  }
  return <div className="ph-sheet is-empty">{FolderGlyph(p.small ? 12 : 20)}</div>;
}

function useProjectCards(roots: string[], connected: boolean) {
  const [cards, setCards] = useState<Record<string, ProjectCard>>({});
  const key = roots.join("\n");
  useEffect(() => {
    if (!connected || !roots.length) return;
    const requestId = `cards-${Math.random().toString(36).slice(2)}`;
    const onCards = (event: Event) => {
      const msg = (event as CustomEvent).detail as { requestId?: string; cards?: ProjectCard[] };
      if (msg?.requestId !== requestId || !Array.isArray(msg.cards)) return;
      setCards((current) => {
        const next = { ...current };
        for (const card of msg.cards!) if (card && typeof card.root === "string") next[card.root] = card;
        return next;
      });
    };
    window.addEventListener("project-cards", onCards);
    wsSend({ type: "projectCards", roots, requestId });
    return () => window.removeEventListener("project-cards", onCards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, connected]);
  return cards;
}

function NewProjectDialog(p: {
  projects: string[];
  meta: Record<string, ProjMeta>;
  onClose: () => void;
  onCreated: (root: string, due: ProjectDue | null) => void;
}) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const portal = useRef<HTMLElement | null>(null);
  const cleanName = name.trim();

  async function choose() {
    if (!cleanName || busy) return;
    setError("");
    setBusy(true);
    try {
      const parent = await open({ directory: true, multiple: false, title: t("projects.choose-location") });
      if (typeof parent !== "string") return;
      const requestId = `create-${Math.random().toString(36).slice(2)}`;
      const reply = await new Promise<{ root?: string; error?: string }>((resolve) => {
        const timer = window.setTimeout(() => finish({ error: t("projects.create-timeout") }), 20_000);
        function finish(value: { root?: string; error?: string }) {
          window.clearTimeout(timer);
          window.removeEventListener("project-created", onReply);
          resolve(value);
        }
        function onReply(event: Event) {
          const msg = (event as CustomEvent).detail as { requestId?: string; root?: string; error?: string };
          if (msg?.requestId === requestId) finish(msg);
        }
        window.addEventListener("project-created", onReply);
        if (!wsSend({ type: "createProject", parent, name: cleanName, template: template || null, requestId })) {
          finish({ error: t("projects.create-offline") });
        }
      });
      if (reply.root) p.onCreated(reply.root, due ? { date: due } : null);
      else setError(reply.error || t("projects.create-failed"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LazyDialog open title={t("projects.new")} closeLabel={t("action.close")}
      onOpenChange={(v) => { if (!v) p.onClose(); }} className="ph-dialog">
      <form
        ref={(element) => { portal.current = element?.closest<HTMLElement>('[data-slot="dialog-viewport"]') ?? element; }}
        onSubmit={(e) => { e.preventDefault(); void choose(); }}
      >
        <FieldGroup className="ph-fields">
          <Field orientation="horizontal">
            <FieldLabel htmlFor="ph-name">{t("projects.name")}</FieldLabel>
            <Input id="ph-name" autoFocus value={name} placeholder="Chapitre3" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel>{t("projects.from")}</FieldLabel>
            <Select
              compact
              value={template}
              onChange={setTemplate}
              portalContainer={portal}
              alignItemWithTrigger={false}
              options={[
                { value: "", label: t("projects.from-empty") },
                ...p.projects.map((root) => ({
                  value: root,
                  label: t("projects.from-structure", { name: projectName(root, p.meta[root]?.label) }),
                })),
              ]}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="ph-due">{t("projects.due")}</FieldLabel>
            <Input id="ph-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </FieldGroup>
        {error && <InlineNotice tone="error">{error}</InlineNotice>}
        <div className="ph-dialog-actions">
          <Button variant="ghost" onClick={p.onClose}>{t("action.cancel")}</Button>
          <Button type="submit" disabled={!cleanName} loading={busy}>{t("projects.choose-location")}</Button>
        </div>
      </form>
    </LazyDialog>
  );
}

export default function ProjectsHome(p: {
  /** projets, du plus récent au plus ancien */
  projects: string[];
  meta: Record<string, ProjMeta>;
  threads: readonly ThreadLike[];
  connected: boolean;
  /** ouvre la boîte « Nouveau projet » dès l'affichage */
  startWithNewProject?: boolean;
  onOpen: (root: string) => void;
  onOpenFolder: () => void;
  onCreated: (root: string, due: ProjectDue | null) => void;
  onClose: () => void;
}) {
  const desk = p.projects.slice(0, DESK_SIZE);
  const rest = p.projects.slice(DESK_SIZE);
  const cards = useProjectCards(desk, p.connected);
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState(!!p.startWithNewProject);
  const screenRef = useRef<HTMLElement | null>(null);
  const now = useMemo(() => new Date(), []);
  const handlers = useRef(p);
  handlers.current = p;
  const creatingRef = useRef(creating);
  creatingRef.current = creating;
  const deskRef = useRef(desk);
  deskRef.current = desk;

  useEffect(() => {
    // le focus va à l'écran (Tab mène aux cartes) : aucun anneau d'emblée
    if (!creating) screenRef.current?.focus({ preventScroll: true });
  }, [creating]);

  // Capture sur window : passe AVANT le raccourci global ⌘1/⌘2 (disposition
  // chat/atelier d'App, écouté en bulle) et l'arrête tant que l'écran est là.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (creatingRef.current) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (e.metaKey && !e.shiftKey && !e.altKey && digit) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const root = deskRef.current[Number(digit[1]) - 1];
        if (root) handlers.current.onOpen(root);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        handlers.current.onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const runningCount = (root: string) =>
    p.threads.filter((th) => th.projectRoot === root && th.status === "running").length;

  return (
    <section ref={screenRef} tabIndex={-1} className="ph-screen" aria-label={t("projects.recent")}>
      <div className="ph-inner">
        <header className="ph-head">
          <h1 className="ph-title">{t("projects.recent")}</h1>
          <span className="ph-spacer" />
          <Button onClick={p.onOpenFolder}>
            <span className="ph-btn-ico" aria-hidden="true">{FolderGlyph()}</span>
            {t("projects.open-folder")}
          </Button>
          <Button onClick={() => setCreating(true)}>
            <span className="ph-btn-ico is-accent" aria-hidden="true"><PlusGlyph /></span>
            {t("projects.new")}
          </Button>
        </header>

        {desk.length === 0 ? (
          <p className="ph-empty">{t("projects.none")}</p>
        ) : (
          <div className="ph-desk">
            {desk.map((root, index) => {
              const meta = p.meta[root];
              const card = cards[root];
              const activity = activityText(Math.max(projectActivity(root, meta, p.threads), card?.modifiedAt ?? 0), now);
              const first = [meta?.journal?.trim() || card?.journal, activity].filter(Boolean).join(" · ");
              const due = dueText(meta?.due, now);
              const running = runningCount(root);
              const name = projectName(root, meta?.label);
              return (
                <RowButton
                  key={root}
                  className="ph-card"
                  title={root}
                  aria-keyshortcuts={`Meta+${index + 1}`}
                  onClick={() => p.onOpen(root)}
                >
                  <Sheet card={card} />
                  <span className="ph-name">{name}</span>
                  {card?.missing ? (
                    <span className="ph-line">{t("projects.missing")}</span>
                  ) : (
                    <>
                      {first && <span className="ph-line">{first}</span>}
                      {due && <span className="ph-line">{<ClockGlyph />}{due}</span>}
                      {running > 0 && (
                        <span className="ph-line"><span className="ph-dot" aria-hidden="true" />{t("projects.running", { n: running })}</span>
                      )}
                    </>
                  )}
                  <span className="ph-kbd" aria-hidden="true">⌘{index + 1}</span>
                </RowButton>
              );
            })}
          </div>
        )}

        {rest.length > 0 && (
          <div className="ph-more">
            <RowButton className="ph-link" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              <ListGlyph />
              {t("projects.all")} <span className="ph-num">{p.projects.length}</span>
            </RowButton>
          </div>
        )}
        {showAll && rest.length > 0 && (
          <div className="ph-list">
            {rest.map((root) => {
              const meta = p.meta[root];
              const activity = activityText(projectActivity(root, meta, p.threads), now);
              return (
                <RowButton key={root} className="ph-row" title={root} onClick={() => p.onOpen(root)}>
                  <span className="ph-row-ico" aria-hidden="true">{FolderGlyph(13)}</span>
                  <span className="ph-row-name">{projectName(root, meta?.label)}</span>
                  <span className="ph-row-path">{root}</span>
                  <span className="ph-row-when">{activity ?? ""}</span>
                </RowButton>
              );
            })}
          </div>
        )}
      </div>
      {creating && (
        <NewProjectDialog
          projects={p.projects}
          meta={p.meta}
          onClose={() => setCreating(false)}
          onCreated={(root, due) => { setCreating(false); p.onCreated(root, due); }}
        />
      )}
    </section>
  );
}
