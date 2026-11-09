// Pile de feuilles : l'accueil de tous les projets (rangée du bas de la
// colonne et bouton du rail replié). Module à part pour que le rail ne tire
// pas le chunk de la colonne.
export function AllProjectsGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="5.5" width="11" height="8" rx="1.5" />
      <path d="M4 3.5h8M5.5 1.8h5" />
    </svg>
  );
}
