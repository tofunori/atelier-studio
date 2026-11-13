// Accueil des projets — variante A « Grille égale » (maquette choisie par
// Thierry le 2026-11-13, après « Reprendre » du 2026-11-09 qui ne montrait
// que le dernier projet en grand). Tous les projets en cartes carrées de même
// taille, du plus récent au plus ancien : première page du PDF compilé ou du
// document le plus récent (Word comme dans la galerie), sinon les premiers
// fichiers du dossier. ⌘1 à ⌘9 ouvrent les neuf premiers, Échap revient au
// projet courant, « ⋯ » (au clic) donne réglages, Finder et retrait. Chargé à
// la demande (budget de l'entrée) ; les cartes viennent du serveur Rust
// (`projectCards`, atelier-runtime/src/project_home.rs).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { t } from "../lib/i18n";
import { wsSend } from "../lib/wsBus";
import { projectActivity, projectName, type ProjectDue } from "../lib/projectsHome";
import { activityText, dueText } from "../lib/projectsHomeText";
import { Button, IconButton, InlineNotice, RowButton, Select } from "./ui";
import { LazyDialog } from "./ui/LazyDialog";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import { Input } from "./shadcn/input";
import { Field, FieldGroup, FieldLabel } from "./shadcn/field";
import type { ProjMeta } from "./Rail";
import "../styles/projects-home.css";

import { EllipsisIcon, FileIcon, FolderIcon, PlusIcon } from "lucide-react";
type ThreadLike = {
  id?: string;
  projectRoot: string;
  updatedAt?: string | null;
  status?: string;
};

/** Première page d'un .docx, telle que `/docx/peek` de la galerie la sert
 *  (atelier_docx::preview) : tailles en points du document. */
type DocxLook = { align?: string; before?: number; after?: number; line?: number; line_exact?: number;
  left?: number; right?: number; first?: number; b?: boolean; i?: boolean; caps?: boolean; size?: number; font?: string; color?: string };
type DocxSeg = { text: string; kind: string; b?: boolean; i?: boolean; u?: boolean; strike?: boolean; sup?: boolean; sub?: boolean;
  font?: string; size?: number; color?: string; media?: string; width?: number; height?: number };
type DocxPara = { id?: string; list?: boolean; cell?: [number, number, number]; segments: DocxSeg[]; look?: DocxLook };
export type DocxPeek = { page: { width: number; height: number; top: number; right: number; bottom: number; left: number };
  paragraphs: DocxPara[] };

/** Réponse du serveur pour une carte (voir project_home.rs). */
export type ProjectCard = {
  root: string;
  missing?: boolean;
  tex?: string | null;
  pdf?: string | null;
  thumb?: string | null;
  /** document montré quand il n'y a pas de PDF compilé (relatif au projet) */
  doc?: string | null;
  docx?: DocxPeek | null;
  /** premiers éléments du dossier, quand il n'a aucun document */
  files?: { name: string; dir: boolean }[];
  journal?: string | null;
  modifiedAt?: number | null;
};

/** cartes demandées au serveur (MAX_CARDS de project_home.rs) */
const CARD_REQUESTS = 24;
/** ⌘1 à ⌘9 */
const SHORTCUTS = 9;

const folderGlyph = (size = 14) => <FolderIcon size={size} />;
const PlusGlyph = () => <PlusIcon size={14} />;

const PT = 4 / 3;
const pt = (v: number) => `${(v * PT).toFixed(2)}px`;
const docFont = (name?: string) => (name ? `"${name.replace(/["\\]/g, "")}", Georgia, serif` : undefined);
const docColor = (c?: string) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : undefined);

function runStyle(r: { b?: boolean; i?: boolean; caps?: boolean; size?: number; font?: string; color?: string }): CSSProperties {
  return {
    fontSize: r.size ? pt(r.size) : undefined,
    fontFamily: docFont(r.font),
    fontWeight: r.b ? 600 : undefined,
    fontStyle: r.i ? "italic" : undefined,
    textTransform: r.caps ? "uppercase" : undefined,
    color: docColor(r.color),
  };
}

function DocxSegment({ seg }: { seg: DocxSeg }) {
  // les images ne sont pas servies ici : une réserve grise à leur taille
  if (seg.media) return <span className="ph-dx-media" style={{ width: seg.width ?? 0, height: seg.height ?? 0 }} />;
  if (seg.kind === "tab") return <span className="ph-dx-tab" />;
  if (seg.kind === "break") return <br />;
  if (seg.kind === "object" && seg.text === "\uFFFC") return null;
  const style = runStyle(seg);
  if (seg.u || seg.strike) style.textDecoration = seg.u ? "underline" : "line-through";
  const body = seg.sup ? <sup>{seg.text}</sup> : seg.sub ? <sub>{seg.text}</sub> : seg.text;
  return <span style={style}>{body}</span>;
}

function DocxParagraph({ para }: { para: DocxPara }) {
  const l = para.look ?? {};
  const style: CSSProperties = {
    ...runStyle({ ...l, size: l.size || 11 }),
    textAlign: l.align === "both" ? "justify" : (l.align as CSSProperties["textAlign"]) || undefined,
    marginTop: l.before ? pt(l.before) : undefined,
    marginBottom: l.after ? pt(l.after) : undefined,
    paddingLeft: l.left ? pt(l.left) : undefined,
    paddingRight: l.right ? pt(l.right) : undefined,
    textIndent: l.first ? pt(l.first) : undefined,
    lineHeight: l.line_exact ? pt(l.line_exact) : ((l.line || 1) * 1.2).toFixed(3),
  };
  return (
    <p style={style}>
      {para.list && <span className="ph-dx-bullet">•</span>}
      {para.segments.length ? para.segments.map((seg, i) => <DocxSegment key={i} seg={seg} />) : "\u200B"}
    </p>
  );
}

/** Première page Word dessinée à l'échelle, le haut à pleine largeur et coupé
 *  en bas, comme la vignette Word de la galerie (#212). */
function DocxPage({ peek }: { peek: DocxPeek }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<string | undefined>(undefined);
  const width = peek.page.width * PT;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      if (!el.clientWidth) return;
      // la feuille de la carte est le papier : la page la remplit en largeur
      setTransform(`scale(${(el.clientWidth / width).toFixed(4)})`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);
  // paragraphes de tableau regroupés en cellules, comme dans la galerie
  const blocks: ReactElement[] = [];
  let rows: DocxPara[][][] = [];
  let table = -1;
  const flush = (key: string) => {
    if (table < 0) return;
    blocks.push(
      <table key={key} className="ph-dx-table"><tbody>
        {rows.map((cells, r) => <tr key={r}>{cells.map((paras, c) => <td key={c}>{paras.map((q, i) => <DocxParagraph key={i} para={q} />)}</td>)}</tr>)}
      </tbody></table>,
    );
    rows = [];
    table = -1;
  };
  peek.paragraphs.forEach((para, index) => {
    if (para.cell) {
      const [t, r, c] = para.cell;
      if (t !== table) { flush(`t${index}`); table = t; }
      rows[r] ??= [];
      rows[r][c] ??= [];
      rows[r][c].push(para);
      return;
    }
    flush(`t${index}`);
    blocks.push(<DocxParagraph key={index} para={para} />);
  });
  flush("end");
  const pg = peek.page;
  return (
    <div ref={box} className="ph-docx">
      <div className="ph-dx-page" style={{ width: pt(pg.width), height: pt(pg.height),
        padding: `${pt(pg.top)} ${pt(pg.right)} 0 ${pt(pg.left)}`, transform, opacity: transform ? 1 : 0 }}>
        {blocks}
      </div>
    </div>
  );
}

/** Aperçu de la carte : page PDF, page Word, premiers fichiers, ou rien. */
function Preview({ card }: { card?: ProjectCard }) {
  if (card?.thumb) {
    return (
      <span className="ph-preview">
        <span className="ph-page"><img src={card.thumb} alt="" draggable={false} /></span>
      </span>
    );
  }
  if (card?.docx) return <span className="ph-preview is-docx"><DocxPage peek={card.docx} /></span>;
  if (card?.files?.length) {
    return (
      <span className="ph-preview is-files">
        {card.files.map((f) => (
          <span key={f.name} className="ph-file">
            {f.dir ? <FolderIcon size={12} aria-hidden="true" /> : <FileIcon size={12} aria-hidden="true" />}
            <span className="ph-file-name">{f.name}</span>
          </span>
        ))}
      </span>
    );
  }
  return <span className={`ph-preview is-empty${card ? "" : " is-loading"}`}>{card && folderGlyph(20)}</span>;
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
  onCreated: (root: string, due: ProjectDue | null, label: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const portal = useRef<HTMLElement | null>(null);
  const cleanName = name.trim();

  // Le dossier choisi devient le projet (Thierry, 2026-11-13) : aucun
  // sous-dossier n'est créé ; le nom tapé, facultatif, sert d'étiquette.
  async function choose() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const folder = await open({ directory: true, multiple: false, title: t("projects.choose-folder") });
      if (typeof folder !== "string") return;
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
        if (!wsSend({ type: "createProject", folder, template: template || null, requestId })) {
          finish({ error: t("projects.create-offline") });
        }
      });
      if (reply.root) {
        const label = cleanName && cleanName !== projectName(reply.root) ? cleanName : null;
        p.onCreated(reply.root, due ? { date: due } : null, label);
      }
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
            <Input id="ph-name" autoFocus value={name} placeholder={t("projects.name-placeholder")} onChange={(e) => setName(e.target.value)} />
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
        <p className="ph-dialog-hint">{t("projects.folder-hint")}</p>
        {error && <InlineNotice tone="error">{error}</InlineNotice>}
        <div className="ph-dialog-actions">
          <Button variant="ghost" onClick={p.onClose}>{t("action.cancel")}</Button>
          <Button type="submit" loading={busy}>{t("projects.choose-folder")}</Button>
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
  onProjectSettings?: (root: string) => void;
  /** retire le projet de la liste (le dossier reste où il est) */
  onRemoveProject?: (root: string) => void;
  onOpenFolder: () => void;
  onCreated: (root: string, due: ProjectDue | null, label: string | null) => void;
  onClose: () => void;
}) {
  const cards = useProjectCards(p.projects.slice(0, CARD_REQUESTS), p.connected);
  const [creating, setCreating] = useState(!!p.startWithNewProject);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const screenRef = useRef<HTMLElement | null>(null);
  const now = useMemo(() => new Date(), []);
  // valeurs lues par l'écouteur clavier (posé une seule fois)
  const handlers = useRef(p);
  const blockedRef = useRef(creating);
  useLayoutEffect(() => {
    handlers.current = p;
    blockedRef.current = creating || menuFor != null;
  });

  useEffect(() => {
    // le focus va à l'écran (Tab mène à la première carte) : aucun anneau d'emblée
    if (!creating) screenRef.current?.focus({ preventScroll: true });
  }, [creating]);

  // Capture sur window : passe AVANT le raccourci global ⌘1/⌘2 (disposition
  // chat/atelier d'App, écouté en bulle) et l'arrête tant que l'écran est là.
  // Un menu « ⋯ » ouvert garde Échap pour lui.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (blockedRef.current) return;
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

  return (
    <section ref={screenRef} tabIndex={-1} className="ph-screen" aria-label={t("projects.title")}>
      <div className="ph-inner">
        <header className="ph-head">
          <div className="ph-head-text">
            <h1 className="ph-title">{t("projects.title")}</h1>
            {p.projects.length > 0 && <p className="ph-sub">{t("projects.subtitle")}</p>}
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

        {p.projects.length === 0 ? (
          <p className="ph-empty">{t("projects.none")}</p>
        ) : (
          <ul className="ph-grid" aria-label={t("projects.title")}>
            {p.projects.map((root, index) => {
              const meta = p.meta[root];
              const card = cards[root];
              const name = projectName(root, meta?.label);
              const kind = card?.thumb ? "PDF" : card?.docx ? "Word" : null;
              const detail = card?.missing
                ? t("projects.missing")
                : dueText(meta?.due, now) ?? (meta?.journal?.trim() || card?.journal || kind);
              const line = [index === 0 ? t("projects.last-opened") : null, detail, lastActivity(root)]
                .filter(Boolean).join(" · ");
              const shortcut = index + 1 <= SHORTCUTS ? index + 1 : null;
              const running = runningCount(root);
              const menuOpen = menuFor === root;
              return (
                <li key={root} className={`ph-card${menuOpen ? " is-menu" : ""}`}>
                  <RowButton className="ph-card-open" title={root}
                    aria-keyshortcuts={shortcut ? `Meta+${shortcut}` : undefined}
                    onClick={() => p.onOpen(root)}>
                    <Preview card={card} />
                    <span className="ph-card-body">
                      <span className="ph-card-name">{name}</span>
                      <span className="ph-card-meta">
                        {running > 0 && <span className="ph-dot" title={t("projects.running", { n: running })} />}
                        <span className="ph-card-line">{line}</span>
                      </span>
                    </span>
                  </RowButton>
                  <span className="ph-card-tools">
                    {shortcut && <span className={`ph-kbd${index === 0 ? " is-shown" : ""}`} aria-hidden="true">⌘{shortcut}</span>}
                    <LazyDropdownMenu
                      open={menuOpen}
                      onOpenChange={(v) => setMenuFor(v ? root : null)}
                      align="end"
                      label={name}
                      trigger={
                        <IconButton label={t("action.more")} size="s" className="ph-card-more"
                          aria-haspopup="menu" aria-expanded={menuOpen}>
                          <EllipsisIcon size={14} aria-hidden="true" />
                        </IconButton>
                      }
                      items={[
                        ...(p.onProjectSettings ? [{ key: "settings", label: t("projects.settings"), onSelect: () => p.onProjectSettings!(root) }] : []),
                        ...(card?.missing ? [] : [{ key: "finder", label: t("project.reveal-finder"), onSelect: () => { void revealItemInDir(root).catch(() => {}); } }]),
                        ...(p.onRemoveProject ? [{ key: "remove", label: t("project.remove"), destructive: true, separatorBefore: true, onSelect: () => p.onRemoveProject!(root) }] : []),
                      ]}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {creating && (
        <NewProjectDialog
          projects={p.projects}
          meta={p.meta}
          onClose={() => setCreating(false)}
          onCreated={(root, due, label) => { setCreating(false); p.onCreated(root, due, label); }}
        />
      )}
    </section>
  );
}
