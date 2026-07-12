export function GalleryPlaceholder() {
  return (
    <div className="screen">
      <h1 className="screen-title">Gallery</h1>
      <p className="screen-sub">
        Index et prévisualisations arrivent au jalon G. La gateway expose déjà
        <code> /remote/v1/gallery/…</code>.
      </p>
      <div className="empty">Bientôt disponible</div>
    </div>
  );
}
