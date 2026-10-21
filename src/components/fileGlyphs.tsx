// Glyphes de type de fichier (lot 3, TRANS-04 / SHELL-26 / CHAT-01) : UN seul
// jeu, au trait, grille 16, currentColor — partagé par l'explorateur, les
// onglets de la barre, l'accueil, le menu @ et la carte « fichiers modifiés ».
// Aucune couleur de marque : le type se lit à la forme ; la couleur vient du
// parent (--text-muted au repos). Le trait est rendu par primitives.css.
import type { ReactElement } from "react";

import { fileKind, type FileKind } from "../lib/fileKind";

export type { FileKind };

const PATHS: Record<FileKind, ReactElement> = {
  folder: <path d="M2 4.5c0-.6.4-1 1-1h3l1.5 1.5H13c.6 0 1 .4 1 1v5.5c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z" />,
  code: <path d="M6 4.5L2.5 8 6 11.5M10 4.5L13.5 8 10 11.5" />,
  note: <><path d="M4 2h5.5L13 5.5V14H4z" /><path d="M9.5 2v3.5H13M6 8.5h4M6 11h4" /></>,
  tex: <><path d="M4 2h5.5L13 5.5V14H4z" /><path d="M9.5 2v3.5H13M6.5 8.5h3M8 8.5v3.5" /></>,
  image: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M4.5 10.5l2.5-3 2 2.2L11 7.5l2 3" /></>,
  pdf: <><path d="M4 2h5.5L13 5.5V14H4z" /><path d="M9.5 2v3.5H13M6 11.5h4" /></>,
  data: <><ellipse cx="8" cy="4" rx="5" ry="2" /><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" /></>,
  terminal: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M5 6.5L7 8l-2 1.5M8.5 10h2.5" /></>,
  local: <><rect x="2" y="3" width="12" height="8" rx="1.5" /><path d="M5.5 13.5h5" /></>,
  file: <path d="M4 2h5.5L13 5.5V14H4zM9.5 2v3.5H13" />,
};

export function FileGlyph(p: { kind?: FileKind; name?: string; size?: number; className?: string }) {
  const kind = p.kind ?? fileKind(p.name ?? "");
  const size = p.size ?? 14;
  return (
    <svg className={p.className} width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" data-file-kind={kind}>
      {PATHS[kind]}
    </svg>
  );
}
