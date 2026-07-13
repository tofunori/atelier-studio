import { useState, type WheelEvent } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import { MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";

type Props = {
  url: string;
  name: string;
  meta?: string;
};

export function ImageViewer(p: Props) {
  const [scale, setScale] = useState(1);

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    setScale((s) => Math.min(5, Math.max(0.5, s * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  return (
    <div className="viewer-image" onWheel={onWheel}>
      <div className="viewer-toolbar">
        <ButtonGroup aria-label="Zoom de l’image">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Agrandir" onClick={() => setScale((s) => Math.min(5, s * 1.2))}><ZoomInIcon /></Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Réduire" onClick={() => setScale((s) => Math.max(0.5, s / 1.2))}><ZoomOutIcon /></Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Taille réelle" onClick={() => setScale(1)}><MaximizeIcon /></Button>
        </ButtonGroup>
        <Badge variant="outline">{Math.round(scale * 100)} %</Badge>
        {p.meta && <Badge variant="secondary">{p.meta}</Badge>}
      </div>
      <div className="viewer-image-stage">
        <img
          src={p.url}
          alt={p.name}
          style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
          draggable={false}
        />
      </div>
    </div>
  );
}
