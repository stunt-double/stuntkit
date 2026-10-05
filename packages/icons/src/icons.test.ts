import assert from 'node:assert/strict';
import { test } from 'node:test';

import { staleFiles, validate } from '../scripts/generate.ts';
import { ICON_MANIFEST } from './manifest.ts';
import * as nodes from './nodes.ts';
import { toCamel } from './svg.ts';

test('manifest and geometry agree', () => {
  assert.deepEqual(validate(), []);
});

test('generated components, SVGs and icons.json are current', async () => {
  assert.deepEqual(await staleFiles(), [], 'run `pnpm --filter @stunt-double/icons generate`');
});

/** Every absolute point a path's commands land on (control points and arc bulges aside). */
function pathPoints(d: string): [number, number][] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const arity: Record<string, number> = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    a: 7,
    z: 0,
  };
  const points: [number, number][] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = '';
  let i = 0;
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) command = tokens[i++]!;
    const lower = command.toLowerCase();
    const relative = command === lower;
    const n = arity[lower];
    assert.ok(n !== undefined, `unsupported path command ${command}`);
    if (lower === 'z') {
      x = startX;
      y = startY;
      continue;
    }
    const args = tokens.slice(i, i + n).map(Number);
    i += n;
    if (lower === 'h') x = relative ? x + args[0]! : args[0]!;
    else if (lower === 'v') y = relative ? y + args[0]! : args[0]!;
    else {
      const [ex, ey] = args.slice(-2) as [number, number];
      x = relative ? x + ex : ex;
      y = relative ? y + ey : ey;
    }
    if (lower === 'm') {
      startX = x;
      startY = y;
      // Coordinates after a moveto are implicit linetos.
      command = relative ? 'l' : 'L';
    }
    points.push([x, y]);
  }
  return points;
}

test('geometry stays inside the 24 unit square, off its 2 unit margin', () => {
  const inside = (v: number) => v >= 2 && v <= 22;
  for (const entry of ICON_MANIFEST) {
    const node = (nodes as unknown as Record<string, nodes.IconNode>)[
      entry.node ?? toCamel(entry.name)
    ]!;
    for (const [tag, attrs] of node) {
      const a = attrs as Record<string, number | string>;
      const n = (key: string) => Number(a[key] ?? 0);
      const extents: number[] =
        tag === 'path'
          ? pathPoints(String(a.d)).flat()
          : tag === 'circle'
            ? [n('cx') - n('r'), n('cx') + n('r'), n('cy') - n('r'), n('cy') + n('r')]
            : tag === 'ellipse'
              ? [n('cx') - n('rx'), n('cx') + n('rx'), n('cy') - n('ry'), n('cy') + n('ry')]
              : [n('x'), n('x') + n('width'), n('y'), n('y') + n('height')];
      for (const v of extents) {
        assert.ok(inside(v), `${entry.name}: ${tag} reaches ${v}, outside 2 to 22`);
      }
    }
  }
});

test('every exploded layer map names a real icon and uses each element exactly once', async () => {
  const { ICON_LAYERS } = await import('./layers.ts');
  for (const [name, groups] of Object.entries(ICON_LAYERS)) {
    const entry = ICON_MANIFEST.find((icon) => icon.name === name);
    assert.ok(entry, `${name}: not in the manifest`);
    const node = (nodes as unknown as Record<string, nodes.IconNode>)[
      entry.node ?? toCamel(entry.name)
    ]!;
    const used = groups.flat().sort((a, b) => a - b);
    assert.deepEqual(
      used,
      node.map((_, index) => index),
      `${name}: layers must cover elements 0 to ${node.length - 1} once each`
    );
  }
});
