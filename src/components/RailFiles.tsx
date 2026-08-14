// Fichiers ouverts dans le rail compact (plan 056) — « ce que j'ai en main »,
// entre les projets (où je suis) et l'activité (ce qui tourne sans moi).
// À 48 px, le glyphe du type ne suffit pas : quatre .tex se ressemblent tous.
// D'où le monogramme, en MINUSCULES pour ne pas se confondre avec les projets,
// qui sont en capitales.
import { useState } from "react";
import { t } from "../lib/i18n";
import { SURFACES, type Surface } from "./surfaces";
import { LazyDropdownMenu } from "./ui/LazyDropdownMenu";
import { RowButton } from "./ui/RowButton";

export const MAX_TILES = 8;

export type RailFile = {
  id: string;
  title: string;
  url?: string;
  /** onglet du pane : document, surface, agent ou IDE (plan 057) */
  kind?: "document" | "surface" | "agent" | "ide";
  surface?: Surface;
};

/** Deux premières lettres du nom, sans extension ni séparateurs. */
export function monogram(title: string): string {
  const base = String(title ?? "").split("/").pop() ?? "";
  const stem = base.replace(/\.[^.]+$/, "");
  const letters = stem.replace(/[^\p{L}\p{N}]/gu, "");
  return (letters.slice(0, 2) || "··").toLowerCase();
}

export function extensionOf(file: RailFile): string {
  const source = file.url && file.url.includes(".") ? file.url : file.title;
  return (/\.([a-z0-9]+)(?:[?#].*)?$/i.exec(String(source ?? ""))?.[1] ?? "").toLowerCase();
}

/** Famille de glyphe — on en montre quatre, le reste tombe sur « document ». */
export function kindOf(file: RailFile): "tex" | "code" | "note" | "image" | "doc" {
  const ext = extensionOf(file);
  if (ext === "tex" || ext === "bib") return "tex";
  if (["py", "r", "js", "ts", "tsx", "mjs", "jl", "sh", "json", "toml", "yml", "yaml"].includes(ext)) return "code";
  if (["md", "txt", "org"].includes(ext)) return "note";
  if (["png", "jpg", "jpeg", "svg", "pdf", "webp", "gif"].includes(ext)) return "image";
  return "doc";
}

function KindGlyph({ kind }: { kind: ReturnType<typeof kindOf> }) {
  const common = {
    className: "rail-file-kind", viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const, "aria-hidden": true,
  };
  if (kind === "code") return <svg {...common}><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /></svg>;
  if (kind === "note") return <svg {...common}><path d="M4 7h16M4 12h16M4 17h9" /></svg>;
  if (kind === "image") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m5 17 5-6 3 3.5 2-2 4 4.5" /></svg>;
  if (kind === "tex") return <svg {...common}><path d="M5 6h14M12 6v12" /></svg>;
  return <svg {...common}><path d="M7 3h7l4 4v14H7z" /></svg>;
}

/** Icône d'un onglet qui n'est pas un fichier : la surface porte la sienne. */
export function tileIcon(file: RailFile) {
  if (file.kind === "surface") {
    const found = SURFACES.find((surface) => surface.id === file.surface);
    if (found) return found.icon;
  }
  if (file.kind === "agent") {
    return (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h16v11H8l-4 3z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 7 6 12l3 5M15 7l3 5-3 5" />
    </svg>
  );
}

export default function RailFiles(p: {
  files: RailFile[];
  activeFile: string | null;
  onSelectFile: (id: string) => void;
  onCloseFile: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (p.files.length === 0) return null;

  const visible = p.files.slice(0, MAX_TILES);
  const overflow = p.files.slice(MAX_TILES);

  const tile = (file: RailFile, index: number) => (
    <RowButton
      key={file.id}
      className={`rail-file ${file.id === p.activeFile ? "on" : ""}`}
      title={`${file.title} — ⌥${index + 1}`}
      onClick={() => p.onSelectFile(file.id)}
      onAuxClick={(event: React.MouseEvent) => {
        // clic milieu = fermer : une croix à 34 px mangerait le monogramme
        if (event.button !== 1) return;
        event.preventDefault();
        p.onCloseFile(file.id);
      }}
    >
      {file.kind === "surface" || file.kind === "agent" || file.kind === "ide" ? (
        <span className="rail-file-surface">{tileIcon(file)}</span>
      ) : (
        <>
          <span className="rail-file-mono">{monogram(file.title)}</span>
          <KindGlyph kind={kindOf(file)} />
        </>
      )}
    </RowButton>
  );

  return (
    <div className="rail-files" aria-label={t("rail.files")}>
      {visible.map(tile)}
      {overflow.length > 0 && (
        <LazyDropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          align="start"
          label={t("rail.files")}
          trigger={<RowButton className="rail-file-more">+{overflow.length}</RowButton>}
          items={overflow.map((file) => ({
            key: file.id,
            label: file.title,
            onSelect: () => p.onSelectFile(file.id),
          }))}
        />
      )}
    </div>
  );
}
