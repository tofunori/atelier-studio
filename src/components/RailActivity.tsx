// Zone d'activité du rail (plan 055) — « ce qui tourne sans toi ». Les
// surfaces étant montées dans la barre du haut, la colonne de gauche ne dit
// plus que deux choses : où je suis (les projets) et ce qui vit (ici).
// Règle de fond : AUCUNE progression inventée. Un agent n'a pas de
// pourcentage — son anneau tourne, il ne se remplit pas.
import { useEffect, useState, useSyncExternalStore } from "react";
import { t } from "../lib/i18n";
import { articleImportSnapshot, fileName, openArticleDialog, subscribeArticleImport } from "../lib/articleImports";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import { RowButton } from "./ui/RowButton";

export const MAX_PASTILLES = 5;
/** Un succès s'efface ; un échec attend qu'on le regarde. */
export const DONE_LINGER_MS = 10_000;

export type ActivityItem = {
  id: string;
  kind: "agent" | "article";
  label: string;
  /** null = indéterminé (l'anneau tourne au lieu de se remplir) */
  ratio: number | null;
  state: "running" | "done" | "failed";
  projectColor?: string;
  detail: string;
  onOpen: () => void;
};

function ring(ratio: number | null, state: ActivityItem["state"]) {
  const circumference = 2 * Math.PI * 15;
  const stroke = state === "failed"
    ? "color-mix(in srgb, var(--u-hot, #e06c75) 60%, transparent)"
    : state === "done"
      ? "color-mix(in srgb, var(--ok, #79b892) 60%, transparent)"
      : "var(--accent)";
  const dash = ratio === null
    ? `${circumference * 0.22} ${circumference}`
    : `${circumference * Math.min(1, Math.max(0, ratio))} ${circumference}`;
  return (
    <svg className="rail-act-ring" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="none" stroke="var(--bg-ctl)" strokeWidth="2" />
      {state !== "done" && state !== "failed" && (
        <circle cx="17" cy="17" r="15" fill="none" stroke={stroke} strokeWidth="2"
          strokeLinecap="round" strokeDasharray={dash} />
      )}
      {(state === "done" || state === "failed") && (
        <circle cx="17" cy="17" r="15" fill="none" stroke={stroke} strokeWidth="2" />
      )}
    </svg>
  );
}

function glyph(item: ActivityItem) {
  if (item.state === "failed") {
    return <path d="M6 6l12 12M18 6L6 18" />;
  }
  if (item.state === "done") {
    return <path d="M4 12l5 5L20 6" />;
  }
  if (item.kind === "article") {
    return <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>;
  }
  return <path d="M4 5h16v11H8l-4 3z" />;
}

/** Les conversions d'article, converties en pastilles. Exporté pour les tests. */
export function articleItems(
  jobs: { requestId: string; path: string; phase: string; message: string | null }[],
): ActivityItem[] {
  return jobs.map((job) => ({
    id: job.requestId,
    kind: "article" as const,
    label: fileName(job.path),
    // MinerU ne compte pas les pages : la conversion est indéterminée, mais
    // l'écriture qui suit est brève et se montre pleine.
    ratio: job.phase === "writing" ? 0.9 : null,
    state: job.phase === "error" ? "failed" : "running",
    detail: t(job.phase === "error" ? "rail.act-failed" : "rail.act-converting"),
    onOpen: () => openArticleDialog(job.requestId),
  }));
}

export default function RailActivity(p: {
  /** projets dont un agent travaille — la donnée que le rail avait déjà */
  running: Set<string>;
  meta: Record<string, { color?: string; label?: string }>;
  onSelectProject: (root: string) => void;
}) {
  const imports = useSyncExternalStore(subscribeArticleImport, articleImportSnapshot);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setTick] = useState(0);

  const agents: ActivityItem[] = [...p.running].map((root) => ({
    id: `agent:${root}`,
    kind: "agent" as const,
    label: root.split("/").pop() ?? root,
    ratio: null,
    state: "running" as const,
    projectColor: p.meta[root]?.color,
    detail: t("rail.act-agent"),
    onOpen: () => p.onSelectProject(root),
  }));
  const items = [...agents, ...articleItems(imports.jobs)];

  // rafraîchit l'affichage pendant qu'un anneau tourne (le temps écoulé vit
  // dans le store, pas ici — on ne fait que redessiner)
  useEffect(() => {
    if (!items.some((item) => item.state === "running")) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [items.length, items.some((item) => item.state === "running")]);

  if (items.length === 0) return null;

  const visible = items.slice(0, MAX_PASTILLES);
  const overflow = items.length - visible.length;

  return (
    <div className="rail-activity" aria-label={t("rail.activity")}>
      {visible.map((item) => (
        <RowButton
          key={item.id}
          className={`rail-act ${item.state}`}
          style={{ "--act-c": item.projectColor ?? "var(--accent)" } as React.CSSProperties}
          title={`${item.label} — ${item.detail}`}
          onClick={item.onOpen}
        >
          {ring(item.ratio, item.state)}
          <svg className="rail-act-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {glyph(item)}
          </svg>
          {item.projectColor && <span className="rail-act-tick" />}
        </RowButton>
      ))}
      {overflow > 0 && (
        <LazyDropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          align="start"
          label={t("rail.activity")}
          trigger={<RowButton className="rail-act-more">+{overflow}</RowButton>}
          items={items.slice(MAX_PASTILLES).map((item) => ({
            key: item.id,
            label: `${item.label} — ${item.detail}`,
            onSelect: item.onOpen,
          }))}
        />
      )}
    </div>
  );
}
