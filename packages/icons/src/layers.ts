/**
 * How an icon comes apart in an exploded view: its elements grouped into the parts the object is
 * really made of, bottom first. A chip is its pins, its package and its die;
 * an actor is the frame and the person standing in it. Pure data, like
 * `./nodes.ts`, so the tests can check every index under `node --test`.
 *
 * An icon not listed here parts in two: its first element (the container,
 * the outline) as the base and everything drawn on it above.
 */

import type { IconNode } from './nodes.ts';

export const ICON_LAYERS: Readonly<Record<string, readonly (readonly number[])[]>> = {
  // The frame marks, then who or what is on camera.
  actor: [
    [0, 1, 2, 3],
    [4, 5],
  ],
  evidence: [
    [0, 1, 2, 3],
    [4, 5],
  ],
  // The sheet, the step already ticked, the step to come.
  checklist: [[0], [1, 2], [3, 4]],
  // The bubble, then the quote it holds.
  interview: [[0], [1, 2]],
  // Trigger, condition, step: the graph in the order it runs.
  automation: [[0, 1], [2, 3], [4]],
  // The pins, the package, the die.
  worker: [[2, 3, 4, 5, 6, 7, 8, 9], [0], [1]],
  // The case and its band, then the handle.
  project: [[0, 2], [1]],
  // The notebook and its rings, then what is written in it.
  knowledge: [
    [0, 1, 2, 3],
    [4, 5],
  ],
  // The stand, the screen, the recording point.
  'live-view': [[1, 2], [0], [3]],
  // The frame, the eye on it, the point it is fixed on.
  'design-review': [[0], [1], [2]],
  // The links, the page they start from, the pages they reach.
  topology: [[3, 4], [0], [1, 2]],
};

/** The icon's elements as layers, bottom first. */
export function iconLayers(name: string, node: IconNode): IconNode[] {
  const groups = ICON_LAYERS[name];
  if (groups) return groups.map((group) => group.map((index) => node[index]!));
  if (node.length < 2) return [node];
  return [node.slice(0, 1), node.slice(1)];
}
