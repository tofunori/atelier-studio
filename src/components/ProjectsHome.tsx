// Accueil des projets — variante A « Reprendre » (maquette choisie par Thierry
// le 2026-11-09, après le « bureau » du 2026-11-08). Le dernier projet ouvert
// en grand : première page du PDF compilé, revue, échéance, agents en cours et
// ses trois derniers fils ; les autres projets en liste compacte, toujours
// visible. ⌘1 reprend le projet, ⌘2 à ⌘9 ouvrent les suivants, Échap revient
// au projet courant. Chargé à la demande (budget de l'entrée) ; les vignettes
// viennent du serveur Rust (`projectCards`, atelier-runtime/src/project_home.rs).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { t } from "../lib/i18n";
import { wsSend } from "../lib/wsBus";
import { projectActivity, projectName, type ProjectDue } from "../lib/projectsHome";
import { activityText, dueText } from "../lib/projectsHomeText";
import { Button, InlineNotice, RowButton, Select } from "./ui";
import { LazyDialog } from "./ui/LazyDialog";
import { Input } from "./shadcn/input";
import { Field, FieldGroup, FieldLabel } from "./shadcn/field";
import type { ProjMeta } from "./Rail";
import "../styles/projects-home.css";

import { ClockIcon, FolderIcon, MessageSquareIcon, PlusIcon } from "lucide-react";
type ThreadLike = {
  id?: string;
  title?: string;
  projectRoot: string;
  updatedAt?: string | null;
  status?: string;
  /** fil d'un sous-agent : jamais listé dans « Fils récents » */
  agentLink?: unknown;
};

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

/** projets dont on demande la vignette : le grand + les premiers de la liste */
const CARD_REQUESTS = 6;
/** ⌘1 (le grand) à ⌘9 */
const SHORTCUTS = 9;
const RECENT_CHATS = 3;

const folderGlyph = (size = 14) => <FolderIcon size={size} />;
const PlusGlyph = () => <PlusIcon size={14} />;
const ClockGlyph = () => <ClockIcon size={12} />;
const ChatGlyph = () => <MessageSquareIcon size={12} />;

function Sheet(p: { card?: ProjectCard; small?: boolean }) {
  const size = p.small ? " is-mini" : "";
  if (p.card?.thumb) {
    return (
      <div className={`ph-sheet${size}`}>
        <img src={p.card.thumb} alt="" draggable={false} />
      </div>
    );
  }
  return <div className={`ph-sheet is-empty${size}`}>{folderGlyph(p.small ? 12 : 20)}</div>;
}

/** Chemin lisible : le dossier personnel devient « ~ ». */
function shortPath(root: string): string {
  return root.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
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
  /** ouvre un fil du projet mis en avant */
  onOpenThread?: (threadId: string, root: string) => void;
  onProjectSettings?: (root: string) => void;
  onOpenFolder: () => void;
  onCreated: (root: string, due: ProjectDue | null) => void;
  onClose: () => void;
}) {
  const lead = p.projects[0] ?? null;
  const others = p.projects.slice(1);
  const cards = useProjectCards(p.projects.slice(0, CARD_REQUESTS), p.connected);
  const [creating, setCreating] = useState(!!p.startWithNewProject);
  const screenRef = useRef<HTMLElement | null>(null);
  const now = useMemo(() => new Date(), []);
  // valeurs lues par l'écouteur clavier (posé une seule fois)
  const handlers = useRef(p);
  const creatingRef = useRef(creating);
  useLayoutEffect(() => {
    handlers.current = p;
    creatingRef.current = creating;
  });

  useEffect(() => {
    // le focus va à l'écran (Tab mène au projet) : aucun anneau d'emblée
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
        const root = handlers.current.projects[Number(digit[1]) - 1];
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
  const lastActivity = (root: string) =>
    activityText(Math.max(projectActivity(root, p.meta[root], p.threads), cards[root]?.modifiedAt ?? 0), now);
  const recentChats = lead
    ? p.threads
      .filter((th) => th.projectRoot === lead && th.id && !th.agentLink)
      .map((th) => ({ th, at: th.updatedAt ? Date.parse(th.updatedAt) || 0 : 0 }))
      .sort((a, b) => b.at - a.at)
      .slice(0, RECENT_CHATS)
    : [];

  return (
    <section ref={screenRef} tabIndex={-1} className="ph-screen" aria-label={t("projects.title")}>
      <div className="ph-inner">
        <header className="ph-head">
          <div className="ph-head-text">
            <h1 className="ph-title">{t("projects.title")}</h1>
            {lead && <p className="ph-sub">{t("projects.subtitle")}</p>}
          </div>
          <span className="ph-spacer" />
          <Button onClick={p.onOpenFolder}>
            <span className="ph-btn-ico" aria-hidden="true">{folderGlyph()}</span>
            {t("projects.open-folder")}
          </Button>
          <Button onClick={() => setCreating(true)}>
            <span className="ph-btn-ico is-accent" aria-hidden="true"><PlusGlyph /></span>
            {t("projects.new")}
          </Button>
        </header>

        {!lead ? (
          <p className="ph-empty">{t("projects.none")}</p>
        ) : (() => {
          const meta = p.meta[lead];
          const card = cards[lead];
          const activity = lastActivity(lead);
          const journal = meta?.journal?.trim() || card?.journal;
          const first = [journal, activity && t("projects.modified", { when: activity })].filter(Boolean).join(" · ");
          const due = dueText(meta?.due, now);
          const running = runningCount(lead);
          return (
            <article className="ph-hero" aria-label={projectName(lead, meta?.label)}>
              <RowButton className="ph-hero-sheet" tabIndex={-1} aria-hidden="true" onClick={() => p.onOpen(lead)}>
                <Sheet card={card} />
              </RowButton>
              <div className="ph-hero-body">
                <span className="ph-eyebrow">{t("projects.last-opened")}</span>
                <h2 className="ph-hero-name">{projectName(lead, meta?.label)}</h2>
                <span className="ph-hero-path" title={lead}>{"\u200E" + shortPath(lead)}</span>
                {card?.missing ? (
                  <div className="ph-facts"><span>{t("projects.missing")}</span></div>
                ) : (
                  <div className="ph-facts">
                    {first && <span>{first}</span>}
                    {due && <span><ClockGlyph />{due}</span>}
                    {running > 0 && <span><span className="ph-dot" aria-hidden="true" />{t("projects.running", { n: running })}</span>}
                  </div>
                )}
                {recentChats.length > 0 && (
                  <div className="ph-chats" role="group" aria-label={t("projects.recent-chats")}>
                    <span className="ph-cap">{t("projects.recent-chats")}</span>
                    {recentChats.map(({ th, at }) => (
                      <RowButton key={th.id} className="ph-chat" title={th.title}
                        onClick={() => (p.onOpenThread ? p.onOpenThread(th.id!, lead) : p.onOpen(lead))}>
                        <span className="ph-chat-ico" aria-hidden="true"><ChatGlyph /></span>
                        <span className="ph-chat-title">{th.title || t("projects.untitled-chat")}</span>
                        {th.status === "running" && <span className="ph-dot" aria-hidden="true" />}
                        <span className="ph-chat-when">{activityText(at, now) ?? ""}</span>
                      </RowButton>
                    ))}
                  </div>
                )}
                <div className="ph-hero-actions">
                  <Button aria-keyshortcuts="Meta+1" onClick={() => p.onOpen(lead)}>{t("projects.resume")}</Button>
                  <span className="ph-kbd is-shown" aria-hidden="true">⌘1</span>
                  <span className="ph-spacer" />
                  {p.onProjectSettings && (
                    <Button variant="ghost" className="ph-quiet" onClick={() => p.onProjectSettings!(lead)}>{t("projects.settings")}</Button>
                  )}
                </div>
              </div>
            </article>
          );
        })()}

        {others.length > 0 && (
          <>
            <div className="ph-cap ph-list-cap">
              {t("projects.others")} <span className="ph-num">{others.length}</span>
            </div>
            <div className="ph-list" role="group" aria-label={t("projects.others")}>
              {others.map((root, index) => {
                const meta = p.meta[root];
                const card = cards[root];
                const detail = card?.missing
                  ? t("projects.missing")
                  : dueText(meta?.due, now) ?? meta?.journal?.trim() ?? card?.journal ?? "";
                const shortcut = index + 2 <= SHORTCUTS ? index + 2 : null;
                return (
                  <RowButton key={root} className="ph-row" title={root}
                    aria-keyshortcuts={shortcut ? `Meta+${shortcut}` : undefined}
                    onClick={() => p.onOpen(root)}>
                    <Sheet card={card} small />
                    <span className="ph-row-name">{projectName(root, meta?.label)}</span>
                    <span className="ph-row-detail">{detail}</span>
                    {runningCount(root) > 0 && <span className="ph-dot" aria-hidden="true" />}
                    <span className="ph-row-when">{lastActivity(root) ?? ""}</span>
                    <span className="ph-kbd" aria-hidden="true">{shortcut ? `⌘${shortcut}` : ""}</span>
                  </RowButton>
                );
              })}
            </div>
          </>
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
