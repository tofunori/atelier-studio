// Le panneau d'apparence du projet ne s'ouvre qu'au clic (menu du rail,
// « Personnaliser ») : chargé à la demande, il sort du JS d'entrée, qui est à
// son budget (coordinateur et fils, 2026-11-09).
import { lazy, Suspense, type ComponentProps } from "react";
import type { ProjectStyleMenu as ProjectStyleMenuPanel } from "./ProjectStyleMenu";

const Loaded = lazy(() =>
  import("./ProjectStyleMenu").then((module) => ({ default: module.ProjectStyleMenu })),
);

export function ProjectStyleMenu(props: ComponentProps<typeof ProjectStyleMenuPanel>) {
  return (
    <Suspense fallback={null}>
      <Loaded {...props} />
    </Suspense>
  );
}
