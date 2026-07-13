import { useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import { MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";

type Props = {
  url: string;
  name: string;
  meta?: string;
};

type Point = { x: number; y: number };

type Gesture = {
  distance: number;
  midpoint: Point;
  pan: Point;
  scale: number;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function ImageViewer(p: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const dragRef = useRef<{ origin: Point; pan: Point } | null>(null);
  const scaleRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const [scale, setScaleState] = useState(1);
  const [pan, setPanState] = useState<Point>({ x: 0, y: 0 });

  const clampPan = (next: Point, nextScale: number): Point => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || nextScale <= 1) return { x: 0, y: 0 };

    const maxX = Math.max(0, (image.clientWidth * nextScale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.clientHeight * nextScale - stage.clientHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const updateTransform = (nextScale: number, nextPan = panRef.current) => {
    const safeScale = clampScale(nextScale);
    const safePan = clampPan(nextPan, safeScale);
    scaleRef.current = safeScale;
    panRef.current = safePan;
    setScaleState(safeScale);
    setPanState(safePan);
  };

  const zoomBy = (factor: number) => updateTransform(scaleRef.current * factor);
  const resetView = () => updateTransform(1, { x: 0, y: 0 });

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
  };

  const beginPinch = () => {
    const [a, b] = [...pointersRef.current.values()];
    if (!a || !b) return;
    gestureRef.current = {
      distance: Math.max(1, distance(a, b)),
      midpoint: midpoint(a, b),
      pan: panRef.current,
      scale: scaleRef.current,
    };
    dragRef.current = null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const point = { x: e.clientX, y: e.clientY };
    pointersRef.current.set(e.pointerId, point);

    if (pointersRef.current.size === 2) beginPinch();
    else if (pointersRef.current.size === 1) {
      dragRef.current = { origin: point, pan: panRef.current };
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2 && gestureRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      if (!a || !b) return;
      const start = gestureRef.current;
      const nextMidpoint = midpoint(a, b);
      const nextScale = clampScale(start.scale * (distance(a, b) / start.distance));
      const stageRect = stageRef.current?.getBoundingClientRect();
      const center = stageRect
        ? { x: stageRect.left + stageRect.width / 2, y: stageRect.top + stageRect.height / 2 }
        : { x: 0, y: 0 };
      const ratio = nextScale / start.scale;
      const nextPan = {
        x: nextMidpoint.x - center.x - (start.midpoint.x - center.x - start.pan.x) * ratio,
        y: nextMidpoint.y - center.y - (start.midpoint.y - center.y - start.pan.y) * ratio,
      };
      updateTransform(nextScale, nextPan);
      return;
    }

    if (pointersRef.current.size === 1 && dragRef.current && scaleRef.current > 1) {
      updateTransform(scaleRef.current, {
        x: dragRef.current.pan.x + e.clientX - dragRef.current.origin.x,
        y: dragRef.current.pan.y + e.clientY - dragRef.current.origin.y,
      });
    }
  };

  const endPointer = (e: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    gestureRef.current = null;

    const [remaining] = [...pointersRef.current.values()];
    dragRef.current = remaining ? { origin: remaining, pan: panRef.current } : null;
  };

  return (
    <div className="viewer-image" onWheel={onWheel}>
      <div className="viewer-toolbar">
        <ButtonGroup aria-label="Zoom de l’image">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Agrandir" onClick={() => zoomBy(1.2)}><ZoomInIcon /></Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Réduire" onClick={() => zoomBy(1 / 1.2)}><ZoomOutIcon /></Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Taille réelle" onClick={resetView}><MaximizeIcon /></Button>
        </ButtonGroup>
        <Badge variant="outline">{Math.round(scale * 100)} %</Badge>
        {p.meta && <Badge variant="secondary">{p.meta}</Badge>}
      </div>
      <div
        ref={stageRef}
        className="viewer-image-stage"
        data-zoomed={scale > 1 ? "true" : "false"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <img
          ref={imageRef}
          src={p.url}
          alt={p.name}
          style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})` }}
          draggable={false}
        />
      </div>
    </div>
  );
}
