// Figure annotée dans un tour utilisateur : vignette, nom de la figure et
// badges numérotés, rien d'autre : le texte envoyé à l'agent (chemins, version,
// consignes) reste hors de l'écran (piste A choisie par Thierry, 2026-10-20).
import { useEffect, useMemo, useState } from "react";
import { parseFigureNotes } from "../../lib/figureAnnotation";
import type { FigureEnvelope } from "../../lib/figureEnvelope";
import { localImagePreviewUrl } from "../../lib/localImage";

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
  const notes = useMemo(() => parseFigureNotes(p.envelope.text), [p.envelope.text]);
  const thumb = useThumb(p.imageUrl, p.imagePath);
  return (
    <div className="user-annot">
      {thumb ? <img className="user-annot-thumb" src={thumb} alt="" /> : <span className="user-annot-thumb" aria-hidden="true" />}
      <div className="user-annot-body">
        <div className="user-annot-title" title={p.envelope.name}>{p.envelope.name}</div>
        {notes.length > 0 && (
          <ul className="user-annots">
            {notes.map((note) => (
              <li key={note.n}>
                <span className="user-annot-badge">{note.n}</span>
                <span>{note.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
