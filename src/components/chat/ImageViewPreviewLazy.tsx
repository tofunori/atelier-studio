// Les aperçus d'image n'apparaissent qu'avec une action d'image de l'agent :
// chargés à la demande, ils sortent du JS d'entrée, qui est à son budget
// (coordinateur et fils, 2026-11-09).
import { lazy, Suspense, type ComponentProps } from "react";
import type { ImageViewPreview as ImageViewPreviewPanel } from "./ImageViewPreview";

const Loaded = lazy(() =>
  import("./ImageViewPreview").then((module) => ({ default: module.ImageViewPreview })),
);

export function ImageViewPreview(props: ComponentProps<typeof ImageViewPreviewPanel>) {
  return (
    <Suspense fallback={null}>
      <Loaded {...props} />
    </Suspense>
  );
}
