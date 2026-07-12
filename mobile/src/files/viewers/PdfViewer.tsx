type Props = {
  url: string;
  name: string;
};

/**
 * Uses browser/WKWebView built-in PDF rendering via <object>/<iframe>.
 * Position resume is best-effort via hash page (limited in mobile WebKit).
 */
export function PdfViewer(p: Props) {
  return (
    <div className="viewer-pdf">
      <div className="viewer-toolbar">
        <span className="viewer-meta">{p.name}</span>
        <a className="btn btn-ghost" href={p.url} target="_blank" rel="noreferrer">
          Ouvrir
        </a>
      </div>
      <object data={p.url} type="application/pdf" className="viewer-pdf-frame" aria-label={p.name}>
        <iframe title={p.name} src={p.url} className="viewer-pdf-frame" />
      </object>
    </div>
  );
}
