// Définition partagée des surfaces de travail de l'atelier — un seul point de
// vérité pour Rail (activity bar : clic → bascule la surface) ET AtelierPane
// (typage de l'état `surface`) ; zéro duplication des icônes.
// Tailles à 19px (viewBox 16x16 inchangée) : mêmes icônes qu'avant, rendues
// plus grandes pour s'aligner sur les icônes Chats/Surlignés du rail (19px).
import { BookIcon, BranchIcon } from "./icons";

import { BookMarkedIcon, BracketsIcon, ClockIcon, FileTextIcon, GalleryVerticalEndIcon, GlobeIcon, HistoryIcon, LayoutGridIcon, PinIcon, SparklesIcon, SquareTerminalIcon } from "lucide-react";
export type Surface = "atelier" | "browser" | "terminal" | "git" | "historique" | "resultats" | "biblio" | "connaissances" | "generateur" | "calculs" | "preuves" | "noyau" | "documents";

export const SURFACES: {
  id: Surface;
  labelKey: "atelier.surface" | "atelier.browser" | "atelier.terminal" | "atelier.git" | "atelier.historique" | "atelier.resultats" | "atelier.biblio" | "atelier.connaissances" | "atelier.generateur" | "atelier.calculs" | "atelier.preuves" | "atelier.noyau" | "atelier.documents";
  icon: React.ReactNode;
}[] = [
  {
    id: "atelier",
    labelKey: "atelier.surface",
    icon: (
      <LayoutGridIcon size={19} />
    ),
  },
  {
    // Documents : traitement de texte .docx (créer, relire, suivis signés).
    id: "documents",
    labelKey: "atelier.documents",
    icon: (
      <FileTextIcon size={19} />
    ),
  },
  {
    id: "browser",
    labelKey: "atelier.browser",
    icon: (
      <GlobeIcon size={19} />
    ),
  },
  {
    id: "terminal",
    labelKey: "atelier.terminal",
    icon: (
      <SquareTerminalIcon size={19} />
    ),
  },
  {
    id: "git",
    labelKey: "atelier.git",
    icon: <BranchIcon size={19} />,
  },
  {
    // Historique du projet (2026-11-09) : horloge à flèche de retour.
    id: "historique",
    labelKey: "atelier.historique",
    icon: (
      <HistoryIcon size={19} />
    ),
  },
  {
    // Résultats du projet (2026-11-10) : la pile de ce qu'il a produit.
    id: "resultats",
    labelKey: "atelier.resultats",
    icon: (
      <GalleryVerticalEndIcon size={19} />
    ),
  },
  {
    id: "biblio",
    labelKey: "atelier.biblio",
    icon: <BookIcon size={19} />,
  },
  {
    // Base de connaissances (plan 050) : livre + nœud, distinct du BookIcon
    // de la bibliothèque Zotero.
    id: "connaissances",
    labelKey: "atelier.connaissances",
    icon: (
      <BookMarkedIcon size={19} />
    ),
  },
  {
    // Preuves (plan Preuves) : passages épinglés depuis Zotero/gbrain,
    // groupés par phrase de manuscrit appuyée — même glyphe épingle que
    // PassageCard/chat/PassageCard.tsx (identité visuelle du concept).
    id: "preuves",
    labelKey: "atelier.preuves",
    icon: (
      <PinIcon size={19} />
    ),
  },
  {
    // Calculs (plan 2026-09-06) : cadran — calculs longs local/NAS/Slurm,
    // dont l'ancienne surface Narval devient la « vue Slurm ».
    id: "calculs",
    labelKey: "atelier.calculs",
    icon: (
      <ClockIcon size={19} />
    ),
  },
  {
    // Noyau Python persistant du fil actif (chantier 5) : crochets de cellule,
    // même glyphe que la case du compositeur.
    id: "noyau",
    labelKey: "atelier.noyau",
    icon: (
      <BracketsIcon size={19} />
    ),
  },
  {
    id: "generateur",
    labelKey: "atelier.generateur",
    icon: (
      <SparklesIcon size={19} />
    ),
  },
];
