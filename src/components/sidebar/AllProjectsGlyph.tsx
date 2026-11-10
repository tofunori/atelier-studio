import { GalleryVerticalEndIcon } from "lucide-react";
// Pile de feuilles : l'accueil de tous les projets (rangée du bas de la
// colonne et bouton du rail replié). Module à part pour que le rail ne tire
// pas le chunk de la colonne.
export function AllProjectsGlyph({ size = 14 }: { size?: number }) {
  return (
    <GalleryVerticalEndIcon size={size} />
  );
}
