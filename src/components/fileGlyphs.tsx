// Glyphes de type de fichier (lot 3, TRANS-04 / SHELL-26 / CHAT-01) : UN seul
// jeu, celui de la famille d'icônes de l'app (Lucide), currentColor — partagé par l'explorateur, les
// onglets de la barre, l'accueil, le menu @ et la carte « fichiers modifiés ».
// Aucune couleur de marque : le type se lit à la forme ; la couleur vient du
// parent (--text-muted au repos). Le trait est rendu par primitives.css.
import {
  CodeIcon, DatabaseIcon, FileIcon, FileTextIcon, FileTypeIcon, FolderIcon, ImageIcon, MonitorIcon,
  NotepadTextIcon, SquareTerminalIcon, type LucideIcon,
} from "lucide-react";

import { fileKind, type FileKind } from "../lib/fileKind";

export type { FileKind };

const GLYPHS: Record<FileKind, LucideIcon> = {
  folder: FolderIcon,
  code: CodeIcon,
  note: NotepadTextIcon,
  tex: FileTypeIcon,
  image: ImageIcon,
  pdf: FileTextIcon,
  data: DatabaseIcon,
  terminal: SquareTerminalIcon,
  local: MonitorIcon,
  file: FileIcon,
};

export function FileGlyph(p: { kind?: FileKind; name?: string; size?: number; className?: string }) {
  const kind = p.kind ?? fileKind(p.name ?? "");
  const Glyph = GLYPHS[kind];
  return <Glyph className={p.className} size={p.size ?? 14} data-file-kind={kind} />;
}
