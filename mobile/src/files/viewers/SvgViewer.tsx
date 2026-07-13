import { useMemo } from "react";
import { sanitizeSvg } from "../sanitizeSvg.ts";
import { Badge } from "@/components/ui/badge.tsx";

type Props = {
  raw: string;
  name: string;
};

export function SvgViewer(p: Props) {
  const safe = useMemo(() => sanitizeSvg(p.raw), [p.raw]);
  return (
    <div className="viewer-svg">
      <div className="viewer-toolbar">
        <Badge variant="secondary">{p.name}</Badge>
        <Badge variant="outline">scripts désactivés</Badge>
      </div>
      <div
        className="viewer-svg-stage"
        // sanitized SVG only — scripts stripped
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    </div>
  );
}
