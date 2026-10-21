// Figures captées par le noyau, partagées entre l'aperçu d'une cellule
// (KernelFigure), la barre galerie (FigureGalleryBar) et la visionneuse.

/** Une figure affichée dans la surface du noyau, avec son aperçu. */
export type ShownFigure = { path: string; cell: number | null; thumb: HTMLImageElement | null };

/** Émis quand la visionneuse enregistre une figure, pour que l'aperçu le sache. */
export const FIGURE_SAVED_EVENT = "kernel-figure-saved";

/** Figures affichées dans la surface, dans l'ordre du fil. */
export function figuresIn(scope: ParentNode): ShownFigure[] {
  return [...scope.querySelectorAll<HTMLElement>(".kernel-figure[data-path]")].map((el) => ({
    path: el.dataset.path ?? "",
    cell: el.dataset.cell ? Number(el.dataset.cell) : null,
    thumb: el.querySelector("img"),
  }));
}

// Copie déjà faite, partagée entre l'aperçu et la visionneuse : la même figure
// n'est jamais copiée deux fois dans le projet.
const savedFigures = new Map<string, string>();
export const savedFigure = (path: string) => savedFigures.get(path) ?? null;
export const rememberSavedFigure = (path: string, rel: string) => { savedFigures.set(path, rel); };
