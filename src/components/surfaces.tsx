// Définition partagée des surfaces de travail de l'atelier — un seul point de
// vérité pour Rail (activity bar : clic → bascule la surface) ET AtelierPane
// (typage de l'état `surface`) ; zéro duplication des icônes.
// Tailles à 19px (viewBox 16x16 inchangée) : mêmes icônes qu'avant, rendues
// plus grandes pour s'aligner sur les icônes Chats/Surlignés du rail (19px).
import { BookIcon, BranchIcon } from "./icons";
import { ServerCogIcon } from "lucide-react";

export type Surface = "atelier" | "browser" | "terminal" | "git" | "biblio" | "generateur" | "narval";

export const SURFACES: {
  id: Surface;
  labelKey: "atelier.surface" | "atelier.browser" | "atelier.terminal" | "atelier.git" | "atelier.biblio" | "atelier.generateur" | "atelier.narval";
  icon: React.ReactNode;
}[] = [
  {
    id: "atelier",
    labelKey: "atelier.surface",
    icon: (
      <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="1.5" y="1.5" width="5.2" height="5.2" rx="1" />
        <rect x="9.3" y="1.5" width="5.2" height="5.2" rx="1" />
        <rect x="1.5" y="9.3" width="5.2" height="5.2" rx="1" />
        <rect x="9.3" y="9.3" width="5.2" height="5.2" rx="1" />
      </svg>
    ),
  },
  {
    id: "browser",
    labelKey: "atelier.browser",
    icon: (
      <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="8" cy="8" r="6.2" />
        <path d="M1.8 8h12.4M8 1.8c2.2 2 2.2 10.4 0 12.4M8 1.8c-2.2 2-2.2 10.4 0 12.4" />
      </svg>
    ),
  },
  {
    id: "terminal",
    labelKey: "atelier.terminal",
    icon: (
      <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2" />
        <path d="M4.5 6l2.2 2-2.2 2M8.5 10.5h3" />
      </svg>
    ),
  },
  {
    id: "git",
    labelKey: "atelier.git",
    icon: <BranchIcon size={19} />,
  },
  {
    id: "biblio",
    labelKey: "atelier.biblio",
    icon: <BookIcon size={19} />,
  },
  {
    id: "narval",
    labelKey: "atelier.narval",
    icon: <ServerCogIcon width={19} height={19} strokeWidth={1.3} />,
  },
  {
    id: "generateur",
    labelKey: "atelier.generateur",
    icon: (
      <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1.6l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
        <path d="M13 9.4l.55 1.65 1.65.55-1.65.55-.55 1.65-.55-1.65-1.65-.55 1.65-.55z" />
      </svg>
    ),
  },
];
