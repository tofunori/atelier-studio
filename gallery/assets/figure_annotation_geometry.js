(function (root) {
  'use strict';

  const MIN_SIZE = 3;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const point = (p, width, height) => ({ x: clamp(p.x, 0, width), y: clamp(p.y, 0, height) });
  const kind = stroke => stroke.tool || stroke.type;

  function bounds(stroke) {
    return {
      x: Math.min(stroke.x1, stroke.x2),
      y: Math.min(stroke.y1, stroke.y2),
      width: Math.abs(stroke.x2 - stroke.x1),
      height: Math.abs(stroke.y2 - stroke.y1),
    };
  }

  function segmentDistance(stroke, p) {
    const dx = stroke.x2 - stroke.x1;
    const dy = stroke.y2 - stroke.y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? clamp(((p.x - stroke.x1) * dx + (p.y - stroke.y1) * dy) / lengthSquared, 0, 1) : 0;
    return Math.hypot(p.x - stroke.x1 - t * dx, p.y - stroke.y1 - t * dy);
  }

  function hit(stroke, p, tolerance = 0) {
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
  function move(stroke, dx, dy, width, height) {
    const box = bounds(stroke);
    const tx = clamp(dx, -box.x, width - box.x - box.width);
    const ty = clamp(dy, -box.y, height - box.y - box.height);
    return { ...stroke, x1: stroke.x1 + tx, y1: stroke.y1 + ty, x2: stroke.x2 + tx, y2: stroke.y2 + ty };
  }

  function resize(stroke, p, width, height) {
    const end = point(p, width, height);
    return { ...stroke, x2: end.x, y2: end.y };
  }

  function create(tool, start, end, width, height) {
    if (!['rect', 'ellipse', 'arrow'].includes(tool)) return null;
    const a = point(start, width, height);
    const b = point(end, width, height);
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (tool === 'arrow' ? Math.hypot(dx, dy) < MIN_SIZE : dx < MIN_SIZE || dy < MIN_SIZE) return null;
    return { tool, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }

  root.FigureAnnotationGeometry = Object.freeze({ bounds, hit, move, resize, create });
})(typeof globalThis !== 'undefined' ? globalThis : window);
