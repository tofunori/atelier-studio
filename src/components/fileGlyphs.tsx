// Glyphes de type de fichier (lot 3, TRANS-04 / SHELL-26 / CHAT-01 ; variante C
// du 2026-11-13) : UN seul jeu, celui de la famille d'icônes de l'app (Lucide),
// partagé par l'explorateur, les onglets de la barre, l'accueil, le menu @ et
// la carte « fichiers modifiés ». Une silhouette par type ; cinq types de
// travail (PDF, Word, LaTeX, tableur, données) portent une teinte sourde des
// jetons d'état (data-file-tint → --file-tint-*, App.css). Le reste prend la
// couleur du parent (--text-muted au repos). Le trait est rendu par primitives.css.
import {
  BookMarkedIcon, BookOpenTextIcon, BracesIcon, CodeXmlIcon, DatabaseIcon, FileArchiveIcon, FileCodeIcon,
  FileIcon, FilePenLineIcon, FileTypeIcon, FolderIcon, ImageIcon, MonitorIcon, NotebookPenIcon,
  NotepadTextIcon, PresentationIcon, SheetIcon, SquareTerminalIcon, type LucideIcon,
} from "lucide-react";

import { fileKind, fileTint, type FileKind } from "../lib/fileKind";

export type { FileKind };

const GLYPHS: Record<FileKind, LucideIcon> = {
  folder: FolderIcon,
  pdf: BookOpenTextIcon,
  word: FilePenLineIcon,
  note: NotepadTextIcon,
  tex: FileTypeIcon,
  bib: BookMarkedIcon,
  sheet: SheetIcon,
  json: BracesIcon,
  data: DatabaseIcon,
  html: CodeXmlIcon,
  code: FileCodeIcon,
  notebook: NotebookPenIcon,
  terminal: SquareTerminalIcon,
  image: ImageIcon,
  slides: PresentationIcon,
  archive: FileArchiveIcon,
  local: MonitorIcon,
  file: FileIcon,
};

export function FileGlyph(p: { kind?: FileKind; name?: string; size?: number; className?: string }) {
  const kind = p.kind ?? fileKind(p.name ?? "");
  const Glyph = GLYPHS[kind];
  const className = p.className ? `file-glyph ${p.className}` : "file-glyph";
  return <Glyph className={className} size={p.size ?? 14} data-file-kind={kind} data-file-tint={fileTint(kind)} />;
}
