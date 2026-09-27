import type {FigureShape, FigureStroke, Point} from "../contracts/gallery";
function installFigureAnnotationGeometryApi(root) {
  'use strict';

  const MIN_SIZE = 3;
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
  const point = (p, width, height) => ({ x: clamp(p.x, 0, width), y: clamp(p.y, 0, height) });
  const kind = (stroke) => stroke.tool || stroke.type;

  function bounds(stroke: { x1: number; x2: number; y1: number; y2: number; }) {
    return {
      x: Math.min(stroke.x1, stroke.x2),
      y: Math.min(stroke.y1, stroke.y2),
      width: Math.abs(stroke.x2 - stroke.x1),
      height: Math.abs(stroke.y2 - stroke.y1),
    };
  }

  function segmentDistance(stroke: { x2: number; x1: number; y2: number; y1: number; }, p: { x: number; y: number; }) {
    const dx = stroke.x2 - stroke.x1;
    const dy = stroke.y2 - stroke.y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? clamp(((p.x - stroke.x1) * dx + (p.y - stroke.y1) * dy) / lengthSquared, 0, 1) : 0;
    return Math.hypot(p.x - stroke.x1 - t * dx, p.y - stroke.y1 - t * dy);
  }

  function hit(stroke, p: { x: number; y: number; }, tolerance = 0) {
    const padding = Math.max(0, tolerance);
    if (kind(stroke) === 'arrow') return segmentDistance(stroke, p) <= padding;
    const box = bounds(stroke);
    if (kind(stroke) === 'ellipse') {
      const rx = box.width / 2 + padding;
      const ry = box.height / 2 + padding;
      if (!rx || !ry) return segmentDistance(stroke, p) <= padding;
      return ((p.x - box.x - box.width / 2) / rx) ** 2 + ((p.y - box.y - box.height / 2) / ry) ** 2 <= 1;
    }
    return p.x >= box.x - padding && p.x <= box.x + box.width + padding
      && p.y >= box.y - padding && p.y <= box.y + box.height + padding;
  }

  // Translation clamps the whole shape, preserving its size and arrow direction.
  // Callers use strokes created/resized within the same canvas dimensions.
  function move<T extends FigureShape>(stroke: T, dx: number, dy: number, width: number, height: number): T {
    const box = bounds(stroke);
    const tx = clamp(dx, -box.x, width - box.x - box.width);
    const ty = clamp(dy, -box.y, height - box.y - box.height);
    return { ...stroke, x1: stroke.x1 + tx, y1: stroke.y1 + ty, x2: stroke.x2 + tx, y2: stroke.y2 + ty };
  }

  function resize<T extends FigureShape>(stroke: T, p: Point, width: number, height: number): T {
    const end = point(p, width, height);
    return { ...stroke, x2: end.x, y2: end.y };
  }

  function create(tool: string, start: Point, end: Point, width: number, height: number): FigureStroke | null {
    if (!['rect', 'ellipse', 'arrow'].includes(tool)) return null;
    const a = point(start, width, height);
    const b = point(end, width, height);
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (tool === 'arrow' ? Math.hypot(dx, dy) < MIN_SIZE : dx < MIN_SIZE || dy < MIN_SIZE) return null;
    return { tool: tool as FigureShape["tool"], x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }

  const publicApi = Object.freeze({ bounds, hit, move, resize, create });
  root.FigureAnnotationGeometry = publicApi;
  return publicApi;
}
installFigureAnnotationGeometryApi(typeof globalThis !== 'undefined' ? globalThis : window);
export type FigureAnnotationGeometryApi = ReturnType<typeof installFigureAnnotationGeometryApi>;
