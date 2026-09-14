import assert from 'node:assert/strict';
import test from 'node:test';
import '../../assets/figure_annotation_geometry.js';

const geometry = globalThis.FigureAnnotationGeometry;
const { bounds, hit, move, resize, create } = geometry;

test('reversed boxes retain endpoints and expose normalized bounds', () => {
  for (const tool of ['rect', 'ellipse']) {
    const shape = create(tool, { x: 80, y: 70 }, { x: 20, y: 10 }, 100, 100);
    assert.deepEqual(bounds(shape), { x: 20, y: 10, width: 60, height: 60 });
    assert.equal(shape.x1, 80);
    assert.equal(hit(shape, { x: 50, y: 40 }), true);
    assert.equal(hit(shape, { x: 90, y: 40 }), false);
  }
});

test('ellipse corners are outside while rectangle corners are inside', () => {
  const rect = create('rect', { x: 10, y: 10 }, { x: 50, y: 30 }, 100, 100);
  assert.equal(hit(rect, { x: 11, y: 11 }), true);
  assert.equal(hit({ ...rect, tool: 'ellipse' }, { x: 11, y: 11 }), false);
  assert.equal(hit({ ...rect, tool: 'ellipse' }, { x: 51, y: 20 }, 2), true);
});

test('arrows support every direction, horizontal and vertical segments', () => {
  for (const [dx, dy] of [[20, 20], [-20, 20], [-20, -20], [20, -20], [20, 0], [-20, 0], [0, 20], [0, -20]]) {
    const arrow = create('arrow', { x: 50, y: 50 }, { x: 50 + dx, y: 50 + dy }, 100, 100);
    assert.ok(arrow);
    assert.equal(arrow.x2 - arrow.x1, dx);
    assert.equal(arrow.y2 - arrow.y1, dy);
    assert.equal(hit(arrow, { x: 50 + dx / 2, y: 50 + dy / 2 }, 1), true);
    assert.equal(hit(arrow, { x: 50 + dx * 2, y: 50 + dy * 2 }, 1), false);
  }
});

test('arrow hit tolerance uses distance to finite segment', () => {
  const arrow = create('arrow', { x: 10, y: 20 }, { x: 40, y: 20 }, 100, 100);
  assert.equal(hit(arrow, { x: 25, y: 22 }, 2), true);
  assert.equal(hit(arrow, { x: 25, y: 23 }, 2), false);
  assert.equal(hit(arrow, { x: 43, y: 20 }, 2), false);
});

test('moving clamps at each canvas edge without changing size or direction', () => {
  const original = { tool: 'arrow', x1: 80, y1: 70, x2: 20, y2: 10, color: '#abc' };
  const right = move(original, 500, 500, 100, 100);
  assert.deepEqual(right, { ...original, x1: 100, y1: 100, x2: 40, y2: 40 });
  const left = move(original, -500, -500, 100, 100);
  assert.deepEqual(left, { ...original, x1: 60, y1: 60, x2: 0, y2: 0 });
  assert.deepEqual(original, { tool: 'arrow', x1: 80, y1: 70, x2: 20, y2: 10, color: '#abc' });
});

test('resize preserves anchor and permits crossing it, clamping the endpoint', () => {
  for (const tool of ['rect', 'ellipse', 'arrow']) {
    const original = create(tool, { x: 50, y: 50 }, { x: 80, y: 80 }, 100, 100);
    assert.deepEqual(resize(original, { x: -10, y: 120 }, 100, 100), { tool, x1: 50, y1: 50, x2: 0, y2: 100 });
    assert.equal(original.x2, 80);
  }
});

test('creation clamps both endpoints and rejects tiny boxes and arrows', () => {
  assert.deepEqual(create('rect', { x: -10, y: -20 }, { x: 150, y: 120 }, 100, 80), { tool: 'rect', x1: 0, y1: 0, x2: 100, y2: 80 });
  for (const tool of ['rect', 'ellipse']) {
    assert.equal(create(tool, { x: 10, y: 10 }, { x: 11, y: 90 }, 100, 100), null);
    assert.equal(create(tool, { x: 10, y: 10 }, { x: 90, y: 11 }, 100, 100), null);
  }
  assert.equal(create('arrow', { x: 10, y: 10 }, { x: 11, y: 11 }, 100, 100), null);
  assert.ok(create('arrow', { x: 10, y: 10 }, { x: 13, y: 10 }, 100, 100));
  assert.equal(create('rect', { x: -20, y: -20 }, { x: -10, y: -10 }, 100, 100), null);
});
