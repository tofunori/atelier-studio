import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function GalleryPlaceholder() {
  return (
    <div className="screen">
      <h1 className="screen-title">Gallery</h1>
      <p className="screen-sub">
        Index et prévisualisations arrivent au jalon G. La gateway expose déjà
        <code> /remote/v1/gallery/…</code>.
      </p>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Bientôt disponible</EmptyTitle>
          <EmptyDescription>Les prévisualisations de la galerie seront accessibles ici.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
