import { useMemo } from "react";
import { sanitizeSvg } from "../sanitizeSvg.ts";

type Props = {
  raw: string;
  name: string;
};

export function SvgViewer(p: Props) {
  const safe = useMemo(() => sanitizeSvg(p.raw), [p.raw]);
  return (
    <div className="viewer-svg">
      <div className="viewer-toolbar">
        <span className="viewer-meta">{p.name} · scripts désactivés</span>
      </div>
      <div
        className="viewer-svg-stage"
        // sanitized SVG only — scripts stripped
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    </div>
  );
}
