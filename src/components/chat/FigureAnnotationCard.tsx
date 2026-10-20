// Figure annotée dans un tour utilisateur : vignette, nom de la figure et
// badges numérotés. Le texte envoyé à l'agent (chemins, version, consignes)
// n'apparaît plus dans la bulle ; la source et la version restent consultables
// sous une ligne repliée (piste B, 2026-10-20).
import { useEffect, useId, useMemo, useState } from "react";
import { figureSourceLabel, parseFigureEnvelope } from "../../lib/figureAnnotation";
import type { FigureEnvelope } from "../../lib/figureEnvelope";
import { localImagePreviewUrl } from "../../lib/localImage";
import { t } from "../../lib/i18n";
import { RowButton } from "../ui";

/** Vignette : URL déjà servie (envoi en direct), sinon l'image annotée lue sur
 *  le disque (tour rechargé depuis l'historique). */
function useThumb(imageUrl: string | undefined, path: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(imageUrl ?? null);
  useEffect(() => {
    if (imageUrl) { setUrl(imageUrl); return; }
    setUrl(null);
    if (!path) return;
    let cancelled = false;
    let owned: string | null = null;
    localImagePreviewUrl(path).then((value) => {
      if (value.startsWith("blob:")) owned = value;
      if (cancelled) { if (owned) URL.revokeObjectURL(owned); return; }
      setUrl(value);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (owned) URL.revokeObjectURL(owned);
    };
  }, [imageUrl, path]);
  return url;
}

export function FigureAnnotationCard(p: { envelope: FigureEnvelope; imageUrl?: string; imagePath?: string }) {
  const figure = useMemo(() => parseFigureEnvelope(p.envelope.text) ?? { preview: p.envelope.preview, notes: [] },
    [p.envelope.text, p.envelope.preview]);
  const thumb = useThumb(p.imageUrl, p.imagePath);
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const hasDetails = Boolean(figure.source || figure.version);
  return (
    <div className="user-annot-block">
      <div className="user-annot">
        {thumb ? <img className="user-annot-thumb" src={thumb} alt="" /> : <span className="user-annot-thumb" aria-hidden="true" />}
        <div className="user-annot-body">
          <div className="user-annot-title" title={figure.source ?? figure.preview}>{p.envelope.name}</div>
          {figure.notes.length > 0 && (
            <ul className="user-annots">
              {figure.notes.map((note) => (
                <li key={note.n}>
                  <span className="user-annot-badge">{note.n}</span>
                  <span>{note.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {hasDetails && (
        <>
          <RowButton className="user-annot-toggle" aria-expanded={open} aria-controls={detailsId}
            onClick={() => setOpen((value) => !value)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6.5 4.5 10 8l-3.5 3.5" />
            </svg>
            <span>{t("chat.figure-details")}</span>
          </RowButton>
          {open && (
            <dl className="user-annot-meta" id={detailsId}>
              {figure.source && <>
                <dt>{t("chat.figure-source")}</dt>
                <dd>{figureSourceLabel(figure.source)}</dd>
              </>}
              {figure.version && <>
                <dt>{t("chat.figure-version")}</dt>
                <dd>{figure.version}{figure.hash && <> · <span className="user-annot-hash" title={figure.hash}>{figure.hash.slice(0, 8)}</span></>}</dd>
              </>}
            </dl>
          )}
        </>
      )}
    </div>
  );
}
