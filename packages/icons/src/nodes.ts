/**
 * Continuity icon geometry. Every icon is drawn on a 24 unit square with a
 * 2 unit margin, stroked in `currentColor` at 1.5 with square caps and
 * mitred joins.
 *
 * This module is pure data with no imports, so the icon build script and the
 * unit tests can read it under `node --test` without a bundler. The React
 * components in `./react/icons.ts`, the SVG files in `svg/` and `icons.json`
 * are generated from it (`pnpm --filter @stunt-double/icons generate`): edit
 * here, never there.
 */

type IconTag = 'path' | 'circle' | 'rect' | 'ellipse';

/** One SVG element: its tag and attributes, in React's camelCase spelling. */
export type IconElement = readonly [IconTag, Readonly<Record<string, string | number>>];

/** An icon's elements, drawn in order inside the 24 unit viewBox. */
export type IconNode = readonly IconElement[];

/**
 * A point is a filled square the width of a heavy stroke: the pixel face's
 * unit, not a round dot. Used where a mark must hold at 16px (the dot of an
 * `i`, an ellipsis, a grip).
 */
const POINT = { width: 2.5, height: 2.5, fill: 'currentColor', stroke: 'none' } as const;

/* ── Arrows ─────────────────────────────────────────────────────────── */

export const arrowRight: IconNode = [
  ['path', { d: 'M4 12h16' }],
  ['path', { d: 'M14 6l6 6-6 6' }],
];
export const arrowLeft: IconNode = [
  ['path', { d: 'M20 12H4' }],
  ['path', { d: 'M10 6l-6 6 6 6' }],
];
export const arrowUp: IconNode = [
  ['path', { d: 'M12 20V4' }],
  ['path', { d: 'M6 10l6-6 6 6' }],
];
export const arrowDown: IconNode = [
  ['path', { d: 'M12 4v16' }],
  ['path', { d: 'M6 14l6 6 6-6' }],
];
export const arrowUpRight: IconNode = [
  ['path', { d: 'M6 18L18 6' }],
  ['path', { d: 'M9 6h9v9' }],
];
export const arrowDownRight: IconNode = [
  ['path', { d: 'M6 6l12 12' }],
  ['path', { d: 'M18 9v9H9' }],
];
export const arrowUpDown: IconNode = [
  ['path', { d: 'M8 20V4' }],
  ['path', { d: 'M4 8l4-4 4 4' }],
  ['path', { d: 'M16 4v16' }],
  ['path', { d: 'M12 16l4 4 4-4' }],
];
export const arrowDownUp: IconNode = [
  ['path', { d: 'M8 4v16' }],
  ['path', { d: 'M4 16l4 4 4-4' }],
  ['path', { d: 'M16 20V4' }],
  ['path', { d: 'M12 8l4-4 4 4' }],
];
export const chevronRight: IconNode = [['path', { d: 'M9.5 5l7 7-7 7' }]];
export const chevronLeft: IconNode = [['path', { d: 'M14.5 5l-7 7 7 7' }]];
export const chevronUp: IconNode = [['path', { d: 'M5 14.5l7-7 7 7' }]];
export const chevronDown: IconNode = [['path', { d: 'M5 9.5l7 7 7-7' }]];
export const chevronsUpDown: IconNode = [
  ['path', { d: 'M7 9l5-5 5 5' }],
  ['path', { d: 'M7 15l5 5 5-5' }],
];
export const chevronsDownUp: IconNode = [
  ['path', { d: 'M7 4l5 5 5-5' }],
  ['path', { d: 'M7 20l5-5 5 5' }],
];
export const cornerDownLeft: IconNode = [
  ['path', { d: 'M20 4v10H5' }],
  ['path', { d: 'M9 10l-4 4 4 4' }],
];
export const externalLink: IconNode = [
  ['path', { d: 'M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4' }],
  ['path', { d: 'M14 4h6v6' }],
  ['path', { d: 'M20 4l-9 9' }],
];
export const trendingUp: IconNode = [
  ['path', { d: 'M3 17l6-6 4 4 7-7' }],
  ['path', { d: 'M15 8h5v5' }],
];
export const trendingDown: IconNode = [
  ['path', { d: 'M3 7l6 6 4-4 7 7' }],
  ['path', { d: 'M15 16h5v-5' }],
];
export const refresh: IconNode = [
  ['path', { d: 'M4 12a8 8 0 0 1 14-5.3L20 9' }],
  ['path', { d: 'M20 4v5h-5' }],
  ['path', { d: 'M20 12a8 8 0 0 1-14 5.3L4 15' }],
  ['path', { d: 'M4 20v-5h5' }],
];
export const rotateCcw: IconNode = [
  ['path', { d: 'M4 12a8 8 0 1 0 2.35-5.65L4 9' }],
  ['path', { d: 'M4 4v5h5' }],
];
export const rotateCw: IconNode = [
  ['path', { d: 'M20 12a8 8 0 1 1-2.35-5.65L20 9' }],
  ['path', { d: 'M20 4v5h-5' }],
];
export const repeat: IconNode = [
  ['path', { d: 'M4 12V7h15' }],
  ['path', { d: 'M16 4l3 3-3 3' }],
  ['path', { d: 'M20 12v5H5' }],
  ['path', { d: 'M8 14l-3 3 3 3' }],
];
export const history: IconNode = [
  ['path', { d: 'M4 12a8 8 0 1 0 2.35-5.65L4 9' }],
  ['path', { d: 'M4 4v5h5' }],
  ['path', { d: 'M12 8v4l3 3' }],
];
export const shrink: IconNode = [
  ['path', { d: 'M4 20l6-6' }],
  ['path', { d: 'M5 14h5v5' }],
  ['path', { d: 'M20 4l-6 6' }],
  ['path', { d: 'M19 10h-5V5' }],
];
export const expand: IconNode = [
  ['path', { d: 'M10 14l-6 6' }],
  ['path', { d: 'M4 15v5h5' }],
  ['path', { d: 'M14 10l6-6' }],
  ['path', { d: 'M20 9V4h-5' }],
];
export const navigation: IconNode = [['path', { d: 'M3 11l18-8-8 18-2-8z' }]];

/* ── Actions ────────────────────────────────────────────────────────── */

export const plus: IconNode = [
  ['path', { d: 'M12 5v14' }],
  ['path', { d: 'M5 12h14' }],
];
export const minus: IconNode = [['path', { d: 'M5 12h14' }]];
export const x: IconNode = [
  ['path', { d: 'M6 6l12 12' }],
  ['path', { d: 'M18 6L6 18' }],
];
export const check: IconNode = [['path', { d: 'M4.5 12.5l4.5 4.5 10-10' }]];
export const search: IconNode = [
  ['circle', { cx: 10.5, cy: 10.5, r: 6.5 }],
  ['path', { d: 'M15.5 15.5l5 5' }],
];
export const searchX: IconNode = [
  ['circle', { cx: 10.5, cy: 10.5, r: 6.5 }],
  ['path', { d: 'M15.5 15.5l5 5' }],
  ['path', { d: 'M8.5 8.5l4 4' }],
  ['path', { d: 'M12.5 8.5l-4 4' }],
];
export const scanSearch: IconNode = [
  ['path', { d: 'M3 8V3h5' }],
  ['path', { d: 'M16 3h5v5' }],
  ['path', { d: 'M21 16v5h-5' }],
  ['path', { d: 'M8 21H3v-5' }],
  ['circle', { cx: 11, cy: 11, r: 3.5 }],
  ['path', { d: 'M13.5 13.5l3 3' }],
];
export const trash: IconNode = [
  ['path', { d: 'M4 6h16' }],
  ['path', { d: 'M9 6V3h6v3' }],
  ['path', { d: 'M6 6v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6' }],
  ['path', { d: 'M10 10v7' }],
  ['path', { d: 'M14 10v7' }],
];
export const copy: IconNode = [
  ['rect', { x: 8, y: 8, width: 13, height: 13, rx: 2 }],
  ['path', { d: 'M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3' }],
];
export const clipboard: IconNode = [
  ['path', { d: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2' }],
  ['rect', { x: 9, y: 3, width: 6, height: 4, rx: 1 }],
];
export const clipboardCheck: IconNode = [...clipboard, ['path', { d: 'M8.5 14l2.5 2.5 4.5-4.5' }]];
export const clipboardList: IconNode = [
  ...clipboard,
  ['path', { d: 'M9 11.5h6' }],
  ['path', { d: 'M9 15h6' }],
  ['path', { d: 'M9 18.5h3' }],
];
export const clipboardCopy: IconNode = [
  ...clipboard,
  ['path', { d: 'M16 14.5H9' }],
  ['path', { d: 'M11.5 12l-2.5 2.5 2.5 2.5' }],
];
export const pencil: IconNode = [
  ['path', { d: 'M4 20v-4L16 4l4 4L8 20z' }],
  ['path', { d: 'M13.5 6.5l4 4' }],
];
export const pencilLine: IconNode = [
  ['path', { d: 'M4 17v-3L14 4l3 3L7 17z' }],
  ['path', { d: 'M11.5 6.5l3 3' }],
  ['path', { d: 'M12 20h8' }],
];
export const edit: IconNode = [
  ['path', { d: 'M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5' }],
  ['path', { d: 'M9 15v-3l8-8 3 3-8 8z' }],
];
export const download: IconNode = [
  ['path', { d: 'M12 3v12' }],
  ['path', { d: 'M7 10l5 5 5-5' }],
  ['path', { d: 'M4 15v5h16v-5' }],
];
export const upload: IconNode = [
  ['path', { d: 'M12 15V3' }],
  ['path', { d: 'M7 8l5-5 5 5' }],
  ['path', { d: 'M4 15v5h16v-5' }],
];
export const send: IconNode = [
  ['path', { d: 'M3 4l18 8-18 8 3-8z' }],
  ['path', { d: 'M6 12h7' }],
];
export const share: IconNode = [
  ['circle', { cx: 17.5, cy: 5.5, r: 2.5 }],
  ['circle', { cx: 6.5, cy: 12, r: 2.5 }],
  ['circle', { cx: 17.5, cy: 18.5, r: 2.5 }],
  ['path', { d: 'M8.7 10.7l6.6-3.9' }],
  ['path', { d: 'M8.7 13.3l6.6 3.9' }],
];
export const link: IconNode = [
  ['path', { d: 'M11 7l2-2a4.24 4.24 0 0 1 6 6l-2 2' }],
  ['path', { d: 'M13 17l-2 2a4.24 4.24 0 0 1-6-6l2-2' }],
  ['path', { d: 'M10 14l4-4' }],
];
export const linkOff: IconNode = [
  ['path', { d: 'M11 7l2-2a4.24 4.24 0 0 1 6 6l-2 2' }],
  ['path', { d: 'M13 17l-2 2a4.24 4.24 0 0 1-6-6l2-2' }],
  ['path', { d: 'M4 4l16 16' }],
];
export const filter: IconNode = [['path', { d: 'M3 4h18l-7 7v8l-4 2V11z' }]];
export const listFilter: IconNode = [
  ['path', { d: 'M3 6h18' }],
  ['path', { d: 'M6 12h12' }],
  ['path', { d: 'M10 18h4' }],
];
export const sliders: IconNode = [
  ['path', { d: 'M3 6h9' }],
  ['path', { d: 'M16 6h5' }],
  ['rect', { x: 12, y: 4, width: 4, height: 4, rx: 1 }],
  ['path', { d: 'M3 12h3' }],
  ['path', { d: 'M10 12h11' }],
  ['rect', { x: 6, y: 10, width: 4, height: 4, rx: 1 }],
  ['path', { d: 'M3 18h11' }],
  ['path', { d: 'M18 18h3' }],
  ['rect', { x: 14, y: 16, width: 4, height: 4, rx: 1 }],
];
export const archive: IconNode = [
  ['rect', { x: 3, y: 4, width: 18, height: 5, rx: 1 }],
  ['path', { d: 'M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9' }],
  ['path', { d: 'M10 13h4' }],
];
export const archiveRestore: IconNode = [
  ['rect', { x: 3, y: 4, width: 18, height: 5, rx: 1 }],
  ['path', { d: 'M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9' }],
  ['path', { d: 'M9 15l3-3 3 3' }],
  ['path', { d: 'M12 12v6' }],
];
export const logOut: IconNode = [
  ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
  ['path', { d: 'M10 12h10' }],
  ['path', { d: 'M16 8l4 4-4 4' }],
];
export const doorOpen: IconNode = [
  ['path', { d: 'M3 21h18' }],
  ['path', { d: 'M15 4h4v17' }],
  ['path', { d: 'M5 21V5l9-2v18z' }],
  ['rect', { x: 9.75, y: 10.75, ...POINT }],
];
export const printer: IconNode = [
  ['path', { d: 'M6 9V3h12v6' }],
  [
    'path',
    {
      d: 'M6 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1',
    },
  ],
  ['path', { d: 'M6 14h12v7H6z' }],
];
export const paperclip: IconNode = [
  [
    'path',
    {
      d: 'M20 11l-8.5 8.5a4.95 4.95 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.67 4.67L9.5 16.83a1.65 1.65 0 0 1-2.33-2.33L15 6.67',
    },
  ],
];
export const gripVertical: IconNode = [
  ['rect', { x: 7.75, y: 4.75, ...POINT }],
  ['rect', { x: 13.75, y: 4.75, ...POINT }],
  ['rect', { x: 7.75, y: 10.75, ...POINT }],
  ['rect', { x: 13.75, y: 10.75, ...POINT }],
  ['rect', { x: 7.75, y: 16.75, ...POINT }],
  ['rect', { x: 13.75, y: 16.75, ...POINT }],
];
export const moreHorizontal: IconNode = [
  ['rect', { x: 3.75, y: 10.75, ...POINT }],
  ['rect', { x: 10.75, y: 10.75, ...POINT }],
  ['rect', { x: 17.75, y: 10.75, ...POINT }],
];
export const moreVertical: IconNode = [
  ['rect', { x: 10.75, y: 3.75, ...POINT }],
  ['rect', { x: 10.75, y: 10.75, ...POINT }],
  ['rect', { x: 10.75, y: 17.75, ...POINT }],
];
export const bookmark: IconNode = [['path', { d: 'M6 3h12v18l-6-6-6 6z' }]];
export const bookmarkPlus: IconNode = [
  ['path', { d: 'M6 3h12v18l-6-6-6 6z' }],
  ['path', { d: 'M12 6v6' }],
  ['path', { d: 'M9 9h6' }],
];
export const tag: IconNode = [
  ['path', { d: 'M3 3h8l10 10-8 8L3 11z' }],
  ['rect', { x: 6.25, y: 6.25, ...POINT }],
];
export const sparkles: IconNode = [
  ['path', { d: 'M10 5q1 7 8 8-7 1-8 8-1-7-8-8 7-1 8-8z' }],
  ['path', { d: 'M18 3v4' }],
  ['path', { d: 'M16 5h4' }],
];
export const wand: IconNode = [
  ['path', { d: 'M3 21l12-12' }],
  ['path', { d: 'M13 7l2-2 4 4-2 2z' }],
  ['path', { d: 'M6 4v4' }],
  ['path', { d: 'M4 6h4' }],
  ['path', { d: 'M19 15v4' }],
  ['path', { d: 'M17 17h4' }],
];
export const play: IconNode = [['path', { d: 'M7 4.5l12 7.5-12 7.5z' }]];
export const playCircle: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M10 8.5l5.5 3.5-5.5 3.5z' }],
];
/** Pause: two bars, outlined like play's triangle so the pair weigh the same. */
export const pause: IconNode = [
  ['rect', { x: 6.5, y: 4.5, width: 3.5, height: 15 }],
  ['rect', { x: 14, y: 4.5, width: 3.5, height: 15 }],
];
/** Stop: the square stop the trace lands on, sharp because it is a mark, not a container. */
export const stop: IconNode = [['rect', { x: 5, y: 5, width: 14, height: 14 }]];
export const hand: IconNode = [
  ['path', { d: 'M7 15.3V6.5a1.5 1.5 0 0 1 3 0V11' }],
  ['path', { d: 'M10 11V4.5a1.5 1.5 0 0 1 3 0V11' }],
  ['path', { d: 'M13 11V5.5a1.5 1.5 0 0 1 3 0V11' }],
  [
    'path',
    {
      d: 'M16 11V7.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.5a5 5 0 0 1-3.54-1.46L4 16.58a1.5 1.5 0 0 1 2.12-2.12L7 15.3',
    },
  ],
];
export const pointer: IconNode = [
  ['path', { d: 'M5 3v15.6l4.5-4 2.9 6.3 2.7-1.2-2.8-6.2 5.7-.2z' }],
];
export const pointerClick: IconNode = [
  ['path', { d: 'M9 9v11.5l3.3-3 2.1 4.5 2-.9-2-4.5 4.1-.2z' }],
  ['path', { d: 'M9 3v2.5' }],
  ['path', { d: 'M3 9h2.5' }],
  ['path', { d: 'M4.8 4.8l1.8 1.8' }],
  ['path', { d: 'M13.2 4.8l-1.8 1.8' }],
  ['path', { d: 'M4.8 13.2l1.8-1.8' }],
];
export const pending: IconNode = [
  ['rect', { x: 3.75, y: 10.75, ...POINT }],
  ['rect', { x: 10.75, y: 10.75, ...POINT }],
  [
    'rect',
    {
      x: 17.75,
      y: 10.75,
      width: 2.5,
      height: 2.5,
      fill: 'currentColor',
      stroke: 'none',
      opacity: 0.35,
    },
  ],
];

/* ── Status ─────────────────────────────────────────────────────────── */

export const circle: IconNode = [['circle', { cx: 12, cy: 12, r: 9 }]];
export const circleDot: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['circle', { cx: 12, cy: 12, r: 3, fill: 'currentColor', stroke: 'none' }],
];
export const circleDashed: IconNode = [
  ['path', { d: 'M13.1 3.07A9 9 0 0 1 17.54 4.91' }],
  ['path', { d: 'M19.09 6.46A9 9 0 0 1 20.93 10.9' }],
  ['path', { d: 'M20.93 13.1A9 9 0 0 1 19.09 17.54' }],
  ['path', { d: 'M17.54 19.09A9 9 0 0 1 13.1 20.93' }],
  ['path', { d: 'M10.9 20.93A9 9 0 0 1 6.46 19.09' }],
  ['path', { d: 'M4.91 17.54A9 9 0 0 1 3.07 13.1' }],
  ['path', { d: 'M3.07 10.9A9 9 0 0 1 4.91 6.46' }],
  ['path', { d: 'M6.46 4.91A9 9 0 0 1 10.9 3.07' }],
];
export const square: IconNode = [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }]];
export const checkCircle: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M8 12l3 3 5-5' }],
];
export const xCircle: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M9 9l6 6' }],
  ['path', { d: 'M15 9l-6 6' }],
];
export const minusCircle: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M8 12h8' }],
];
export const plusCircle: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M12 8v8' }],
  ['path', { d: 'M8 12h8' }],
];
export const info: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M12 11v5.5' }],
  ['rect', { x: 10.75, y: 6.75, ...POINT }],
];
export const help: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M9.5 9.5a2.5 2.5 0 1 1 2.5 2.5V14' }],
  ['rect', { x: 10.75, y: 15.75, ...POINT }],
];
export const alertCircle: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M12 7v6' }],
  ['rect', { x: 10.75, y: 15.25, ...POINT }],
];
export const alertTriangle: IconNode = [
  ['path', { d: 'M12 3.5l9.5 16.5h-19z' }],
  ['path', { d: 'M12 9.5v4.5' }],
  ['rect', { x: 10.75, y: 16, ...POINT }],
];
export const octagonX: IconNode = [
  ['path', { d: 'M8.25 3h7.5L21 8.25v7.5L15.75 21h-7.5L3 15.75v-7.5z' }],
  ['path', { d: 'M9 9l6 6' }],
  ['path', { d: 'M15 9l-6 6' }],
];
export const ban: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M5.64 5.64l12.72 12.72' }],
];
export const badgeCheck: IconNode = [
  [
    'path',
    {
      d: 'M12 3l2.5 2.5h4v4L21 12l-2.5 2.5v4h-4L12 21l-2.5-2.5h-4v-4L3 12l2.5-2.5v-4h4z',
    },
  ],
  ['path', { d: 'M8.5 12l2.5 2.5 4.5-4.5' }],
];
export const flag: IconNode = [
  ['path', { d: 'M5 21V3' }],
  ['path', { d: 'M5 4h14l-4 4.5 4 4.5H5' }],
];
export const bell: IconNode = [
  ['path', { d: 'M6 16v-6a6 6 0 0 1 12 0v6l2 2H4z' }],
  ['path', { d: 'M10 21h4' }],
];
export const bellRing: IconNode = [
  ['path', { d: 'M6 16v-6a6 6 0 0 1 12 0v6l2 2H4z' }],
  ['path', { d: 'M10 21h4' }],
  ['path', { d: 'M2.5 9a9.5 9.5 0 0 1 2.8-5.5' }],
  ['path', { d: 'M21.5 9a9.5 9.5 0 0 0-2.8-5.5' }],
];
export const clock: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M12 7v5l3 3' }],
];
export const calendar: IconNode = [
  ['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }],
  ['path', { d: 'M3 10h18' }],
  ['path', { d: 'M8 3v4' }],
  ['path', { d: 'M16 3v4' }],
];
export const calendarClock: IconNode = [
  ['path', { d: 'M21 10V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5' }],
  ['path', { d: 'M3 10h18' }],
  ['path', { d: 'M8 3v4' }],
  ['path', { d: 'M16 3v4' }],
  ['circle', { cx: 16.5, cy: 16.5, r: 4.5 }],
  ['path', { d: 'M16.5 14.5v2l1.5 1.5' }],
];
export const timer: IconNode = [
  ['circle', { cx: 12, cy: 13.5, r: 7.5 }],
  ['path', { d: 'M12 13.5l3-3' }],
  ['path', { d: 'M10 3h4' }],
  ['path', { d: 'M12 3v3' }],
];
export const gauge: IconNode = [
  ['path', { d: 'M4.2 18.5a9 9 0 1 1 15.6 0' }],
  ['path', { d: 'M12 14l4-4' }],
];

/* ── Interface ──────────────────────────────────────────────────────── */

export const menu: IconNode = [
  ['path', { d: 'M3 6h18' }],
  ['path', { d: 'M3 12h18' }],
  ['path', { d: 'M3 18h18' }],
];
export const settings: IconNode = [
  [
    'path',
    {
      d: 'M10.25 5.48V3.17a9 9 0 0 1 3.5 0v2.31a6.75 6.75 0 0 1 1.62.67l1.64-1.63a9 9 0 0 1 2.47 2.47l-1.63 1.64a6.75 6.75 0 0 1 .67 1.62h2.31a9 9 0 0 1 0 3.5h-2.31a6.75 6.75 0 0 1-.67 1.62l1.63 1.64a9 9 0 0 1-2.47 2.47l-1.64-1.63a6.75 6.75 0 0 1-1.62.67v2.31a9 9 0 0 1-3.5 0v-2.31a6.75 6.75 0 0 1-1.62-.67l-1.64 1.63a9 9 0 0 1-2.47-2.47l1.63-1.64a6.75 6.75 0 0 1-.67-1.62H3.17a9 9 0 0 1 0-3.5h2.31a6.75 6.75 0 0 1 .67-1.62L4.52 6.99a9 9 0 0 1 2.47-2.47l1.64 1.63a6.75 6.75 0 0 1 1.62-.67z',
    },
  ],
  ['circle', { cx: 12, cy: 12, r: 2.75 }],
];
export const layoutDashboard: IconNode = [
  ['rect', { x: 3, y: 3, width: 7.5, height: 9, rx: 1 }],
  ['rect', { x: 13.5, y: 3, width: 7.5, height: 5, rx: 1 }],
  ['rect', { x: 13.5, y: 11, width: 7.5, height: 10, rx: 1 }],
  ['rect', { x: 3, y: 15, width: 7.5, height: 6, rx: 1 }],
];
export const layoutGrid: IconNode = [
  ['rect', { x: 3, y: 3, width: 7.5, height: 7.5, rx: 1 }],
  ['rect', { x: 13.5, y: 3, width: 7.5, height: 7.5, rx: 1 }],
  ['rect', { x: 3, y: 13.5, width: 7.5, height: 7.5, rx: 1 }],
  ['rect', { x: 13.5, y: 13.5, width: 7.5, height: 7.5, rx: 1 }],
];
export const list: IconNode = [
  ['path', { d: 'M9 6h12' }],
  ['path', { d: 'M9 12h12' }],
  ['path', { d: 'M9 18h12' }],
  ['rect', { x: 3.25, y: 4.75, ...POINT }],
  ['rect', { x: 3.25, y: 10.75, ...POINT }],
  ['rect', { x: 3.25, y: 16.75, ...POINT }],
];
export const listChecks: IconNode = [
  ['path', { d: 'M3 6.5L5 8.5l3.5-3.5' }],
  ['path', { d: 'M3 16.5l2 2 3.5-3.5' }],
  ['path', { d: 'M12 6h9' }],
  ['path', { d: 'M12 12h9' }],
  ['path', { d: 'M12 18h9' }],
];
export const squareCheck: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M7.5 12l3 3 6-6' }],
];
export const squareKanban: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M8 7v7' }],
  ['path', { d: 'M12 7v4' }],
  ['path', { d: 'M16 7v10' }],
];
export const appWindow: IconNode = [
  ['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }],
  ['path', { d: 'M3 9h18' }],
  ['rect', { x: 5.25, y: 5.25, ...POINT }],
  ['rect', { x: 8.75, y: 5.25, ...POINT }],
];
export const panelsTopLeft: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M3 9h18' }],
  ['path', { d: 'M9 9v12' }],
];
export const panelRightOpen: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M15 3v18' }],
  ['path', { d: 'M10.5 9l-3 3 3 3' }],
];
export const panelRightClose: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M15 3v18' }],
  ['path', { d: 'M7.5 9l3 3-3 3' }],
];
export const frame: IconNode = [
  ['path', { d: 'M3 8h18' }],
  ['path', { d: 'M3 16h18' }],
  ['path', { d: 'M8 3v18' }],
  ['path', { d: 'M16 3v18' }],
];
export const layers: IconNode = [
  ['path', { d: 'M12 3l9 4.5-9 4.5-9-4.5z' }],
  ['path', { d: 'M3 12l9 4.5 9-4.5' }],
  ['path', { d: 'M3 16.5l9 4.5 9-4.5' }],
];
export const blocks: IconNode = [
  ['rect', { x: 3, y: 3, width: 8, height: 8, rx: 1 }],
  ['rect', { x: 3, y: 13, width: 8, height: 8, rx: 1 }],
  ['rect', { x: 13, y: 13, width: 8, height: 8, rx: 1 }],
  ['path', { d: 'M17 3l4 4-4 4-4-4z' }],
];
export const component: IconNode = [
  ['path', { d: 'M12 3l3 3-3 3-3-3z' }],
  ['path', { d: 'M6 9l3 3-3 3-3-3z' }],
  ['path', { d: 'M18 9l3 3-3 3-3-3z' }],
  ['path', { d: 'M12 15l3 3-3 3-3-3z' }],
];
export const keyboard: IconNode = [
  ['rect', { x: 3, y: 6, width: 18, height: 12, rx: 2 }],
  ['rect', { x: 5.75, y: 9, ...POINT }],
  ['rect', { x: 9.25, y: 9, ...POINT }],
  ['rect', { x: 12.25, y: 9, ...POINT }],
  ['rect', { x: 15.75, y: 9, ...POINT }],
  ['path', { d: 'M8 14.5h8' }],
];
export const command: IconNode = [
  [
    'path',
    {
      d: 'M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3z',
    },
  ],
];
export const hash: IconNode = [
  ['path', { d: 'M4 9h16' }],
  ['path', { d: 'M4 15h16' }],
  ['path', { d: 'M10 3l-2 18' }],
  ['path', { d: 'M16 3l-2 18' }],
];
export const type: IconNode = [
  ['path', { d: 'M4 7V4h16v3' }],
  ['path', { d: 'M12 4v16' }],
  ['path', { d: 'M9 20h6' }],
];
export const textCursorInput: IconNode = [
  ['path', { d: 'M14 7h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-5' }],
  ['path', { d: 'M6 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1' }],
  ['path', { d: 'M10 4v16' }],
  ['path', { d: 'M8 4h4' }],
  ['path', { d: 'M8 20h4' }],
];
export const formInput: IconNode = [
  ['rect', { x: 3, y: 6, width: 18, height: 12, rx: 2 }],
  ['path', { d: 'M7 9.5v5' }],
];
export const sun: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 4 }],
  ['path', { d: 'M12 3v2.25' }],
  ['path', { d: 'M12 18.75V21' }],
  ['path', { d: 'M3 12h2.25' }],
  ['path', { d: 'M18.75 12H21' }],
  ['path', { d: 'M5.64 5.64l1.6 1.6' }],
  ['path', { d: 'M16.76 16.76l1.6 1.6' }],
  ['path', { d: 'M18.36 5.64l-1.6 1.6' }],
  ['path', { d: 'M7.24 16.76l-1.6 1.6' }],
];
export const moon: IconNode = [
  ['path', { d: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z' }],
];
export const contrast: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M12 3a9 9 0 0 1 0 18z', fill: 'currentColor' }],
];
export const palette: IconNode = [
  [
    'path',
    {
      d: 'M12 21a9 9 0 1 1 9-9c0 2.5-2 4-4.5 4H15a2 2 0 0 0-1.5 3.3A1.5 1.5 0 0 1 12 21z',
    },
  ],
  ['rect', { x: 5.75, y: 10.25, ...POINT }],
  ['rect', { x: 8.25, y: 5.75, ...POINT }],
  ['rect', { x: 13.25, y: 5.75, ...POINT }],
];
export const accessibility: IconNode = [
  ['circle', { cx: 12, cy: 5, r: 2 }],
  ['path', { d: 'M4 9h16' }],
  ['path', { d: 'M12 9v5' }],
  ['path', { d: 'M8 21l4-7 4 7' }],
];
export const languages: IconNode = [
  ['path', { d: 'M3 5h9' }],
  ['path', { d: 'M7.5 3v2' }],
  ['path', { d: 'M5 5c1 3.5 3 6 6.5 8' }],
  ['path', { d: 'M10 5c-1 3.5-3 6-6.5 8' }],
  ['path', { d: 'M12 21l4.5-10 4.5 10' }],
  ['path', { d: 'M13.5 18h6' }],
];

/* ── Communication ──────────────────────────────────────────────────── */

const bubble = 'M7 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-4 4z';

export const messageSquare: IconNode = [['path', { d: bubble }]];
export const messageSquareText: IconNode = [
  ['path', { d: bubble }],
  ['path', { d: 'M7 8h10' }],
  ['path', { d: 'M7 12h6' }],
];
export const messageSquareMore: IconNode = [
  ['path', { d: bubble }],
  ['rect', { x: 6.75, y: 8.75, ...POINT }],
  ['rect', { x: 10.75, y: 8.75, ...POINT }],
  ['rect', { x: 14.75, y: 8.75, ...POINT }],
];
export const messageSquarePlus: IconNode = [
  ['path', { d: bubble }],
  ['path', { d: 'M12 7v6' }],
  ['path', { d: 'M9 10h6' }],
];
export const messagesSquare: IconNode = [
  ['path', { d: 'M17 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2' }],
  [
    'path',
    { d: 'M10 18H9a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-6l-3 3z' },
  ],
];
/** A quote: two blocks with 45 degree tails, the same mark `interview` holds. */
export const quote: IconNode = [
  ['path', { d: 'M4 6h5v5H4z' }],
  ['path', { d: 'M9 11v1.5L6 15.5' }],
  ['path', { d: 'M14 6h5v5h-5z' }],
  ['path', { d: 'M19 11v1.5l-3 3' }],
];
export const messageCircle: IconNode = [
  ['path', { d: 'M4.64 15.75A8.5 8.5 0 1 1 7.75 18.86L3.5 20z' }],
];
export const mail: IconNode = [
  ['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }],
  ['path', { d: 'M3 7.5l9 6 9-6' }],
];
export const mailOpen: IconNode = [
  ['path', { d: 'M3 10l9-6 9 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
  ['path', { d: 'M3 10l9 6 9-6' }],
];
export const inbox: IconNode = [
  ['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }],
  ['path', { d: 'M3 13h5l2 2h4l2-2h5' }],
];
export const megaphone: IconNode = [
  ['path', { d: 'M4 9h3l10-5v16L7 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z' }],
  ['path', { d: 'M7 9v6' }],
  ['path', { d: 'M7 15v5h3v-4' }],
  ['path', { d: 'M20.5 10v4' }],
];
export const globe: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M3 12h18' }],
  ['path', { d: 'M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z' }],
];
export const lifeBuoy: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['circle', { cx: 12, cy: 12, r: 4 }],
  ['path', { d: 'M5.64 5.64l3.53 3.53' }],
  ['path', { d: 'M18.36 5.64l-3.53 3.53' }],
  ['path', { d: 'M5.64 18.36l3.53-3.53' }],
  ['path', { d: 'M18.36 18.36l-3.53-3.53' }],
];

/* ── People ─────────────────────────────────────────────────────────── */

export const user: IconNode = [
  ['circle', { cx: 12, cy: 8, r: 4 }],
  ['path', { d: 'M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1' }],
];
export const users: IconNode = [
  ['circle', { cx: 9.5, cy: 8, r: 4 }],
  ['path', { d: 'M3 21v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1' }],
  ['path', { d: 'M15.5 4.25a4 4 0 0 1 0 7.5' }],
  ['path', { d: 'M18 15a3.5 3.5 0 0 1 3 3.5V21' }],
];
export const userPlus: IconNode = [
  ['circle', { cx: 9.5, cy: 8, r: 4 }],
  ['path', { d: 'M3 21v-1a5.5 5.5 0 0 1 5.5-5.5h2a5.5 5.5 0 0 1 5.5 5.5v1' }],
  ['path', { d: 'M18.5 7.5v5' }],
  ['path', { d: 'M16 10h5' }],
];
export const bot: IconNode = [
  ['rect', { x: 5, y: 8, width: 14, height: 12, rx: 2 }],
  ['path', { d: 'M12 8V5' }],
  ['rect', { x: 10.75, y: 2.75, ...POINT }],
  ['path', { d: 'M3 12.5v4' }],
  ['path', { d: 'M21 12.5v4' }],
  ['path', { d: 'M9.5 12.5v2' }],
  ['path', { d: 'M14.5 12.5v2' }],
];
export const brain: IconNode = [
  [
    'path',
    {
      d: 'M12 5A2.5 2.5 0 0 0 7 6a2.5 2.5 0 0 0-2.5 4.5A2.5 2.5 0 0 0 5 15.5a2.5 2.5 0 0 0 3 4 2 2 0 0 0 4-.5',
    },
  ],
  [
    'path',
    {
      d: 'M12 5a2.5 2.5 0 0 1 5 1 2.5 2.5 0 0 1 2.5 4.5 2.5 2.5 0 0 1-.5 5 2.5 2.5 0 0 1-3 4 2 2 0 0 1-4-.5',
    },
  ],
  ['path', { d: 'M12 5v14' }],
  ['path', { d: 'M4.5 10.5H8' }],
  ['path', { d: 'M19.5 10.5H16' }],
  ['path', { d: 'M5 15.5h3' }],
  ['path', { d: 'M19 15.5h-3' }],
];
export const fingerprint: IconNode = [
  ['path', { d: 'M4 17v-5a8 8 0 0 1 14-5.3' }],
  ['path', { d: 'M20 12v2' }],
  ['path', { d: 'M7.5 20v-8a4.5 4.5 0 0 1 9 0v5' }],
  ['path', { d: 'M12 12v9' }],
];

/* ── Security ───────────────────────────────────────────────────────── */

const shieldPath = 'M12 3l8 2.5V12c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V5.5z';

export const shield: IconNode = [['path', { d: shieldPath }]];
export const shieldCheck: IconNode = [
  ['path', { d: shieldPath }],
  ['path', { d: 'M8.5 12l2.5 2.5 4.5-4.5' }],
];
export const shieldOff: IconNode = [
  ['path', { d: shieldPath }],
  ['path', { d: 'M3 3l18 18' }],
];
export const lock: IconNode = [
  ['rect', { x: 4, y: 10, width: 16, height: 11, rx: 2 }],
  ['path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' }],
];
export const lockOpen: IconNode = [
  ['rect', { x: 4, y: 10, width: 16, height: 11, rx: 2 }],
  ['path', { d: 'M8 10V7a4 4 0 0 1 8 0' }],
];
export const key: IconNode = [
  ['circle', { cx: 7.5, cy: 16.5, r: 4.5 }],
  ['path', { d: 'M10.68 13.32L20 4' }],
  ['path', { d: 'M16.5 7.5l2.5 2.5' }],
  ['path', { d: 'M14 10l2 2' }],
];
export const eye: IconNode = [
  ['path', { d: 'M2.5 12a10.2 10.2 0 0 1 19 0 10.2 10.2 0 0 1-19 0z' }],
  ['circle', { cx: 12, cy: 12, r: 3 }],
];
export const eyeOff: IconNode = [
  ['path', { d: 'M2.5 12a10.2 10.2 0 0 1 19 0 10.2 10.2 0 0 1-19 0z' }],
  ['circle', { cx: 12, cy: 12, r: 3 }],
  ['path', { d: 'M4 4l16 16' }],
];

/* ── Files ──────────────────────────────────────────────────────────── */

const page = 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z';
const fold = 'M14 3v6h6';

export const file: IconNode = [
  ['path', { d: page }],
  ['path', { d: fold }],
];
export const fileText: IconNode = [
  ['path', { d: page }],
  ['path', { d: fold }],
  ['path', { d: 'M8 13h8' }],
  ['path', { d: 'M8 17h8' }],
  ['path', { d: 'M8 9h2' }],
];
export const fileCheck: IconNode = [
  ['path', { d: page }],
  ['path', { d: fold }],
  ['path', { d: 'M8.5 15l2.5 2.5 4.5-4.5' }],
];
export const fileChart: IconNode = [
  ['path', { d: page }],
  ['path', { d: fold }],
  ['path', { d: 'M8 18v-3' }],
  ['path', { d: 'M12 18v-6' }],
  ['path', { d: 'M16 18v-4' }],
];
export const fileJson: IconNode = [
  ['path', { d: page }],
  ['path', { d: fold }],
  ['path', { d: 'M10 12H9v2l-1 1 1 1v2h1' }],
  ['path', { d: 'M14 12h1v2l1 1-1 1v2h-1' }],
];
export const fileSearch: IconNode = [
  ['path', { d: 'M20 11V9l-6-6H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4' }],
  ['path', { d: fold }],
  ['circle', { cx: 15, cy: 16, r: 3 }],
  ['path', { d: 'M17.25 18.25l2.75 2.75' }],
];
export const filePen: IconNode = [
  ['path', { d: 'M20 11V9l-6-6H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4' }],
  ['path', { d: fold }],
  ['path', { d: 'M13 21v-2.5l6-6 2.5 2.5-6 6z' }],
];
const folderPath = 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';

export const folder: IconNode = [['path', { d: folderPath }]];
export const folderPlus: IconNode = [
  ['path', { d: folderPath }],
  ['path', { d: 'M12 10v7' }],
  ['path', { d: 'M8.5 13.5h7' }],
];
export const folderKanban: IconNode = [
  ['path', { d: folderPath }],
  ['path', { d: 'M8 10v5' }],
  ['path', { d: 'M12 10v3' }],
  ['path', { d: 'M16 10v7' }],
];
export const bookOpen: IconNode = [
  ['path', { d: 'M3 4h5a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H3z' }],
  ['path', { d: 'M21 4h-5a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h6z' }],
];
export const bookMarked: IconNode = [
  ['path', { d: 'M4 19V5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1 0-4h14' }],
  ['path', { d: 'M9 3v7l2.5-2.5L14 10V3' }],
];
export const library: IconNode = [
  ['rect', { x: 3, y: 3, width: 5, height: 18, rx: 1 }],
  ['rect', { x: 10, y: 3, width: 4, height: 18, rx: 1 }],
  ['path', { d: 'M15.5 5.5l3-1 3.25 15.5-3 .75z' }],
];
export const newspaper: IconNode = [
  ['path', { d: 'M7 17V4h13v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9h4' }],
  ['path', { d: 'M10 8h7' }],
  ['path', { d: 'M10 12h7' }],
  ['path', { d: 'M10 16h4' }],
];
export const scrollText: IconNode = [
  [
    'path',
    { d: 'M17 21H7a3 3 0 0 1-3-3v-1h10v1a3 3 0 0 0 6 0V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v12' },
  ],
  ['path', { d: 'M10 8h6' }],
  ['path', { d: 'M10 12h6' }],
];

/* ── Media ──────────────────────────────────────────────────────────── */

export const image: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['rect', { x: 6.75, y: 6.75, ...POINT }],
  ['path', { d: 'M21 15l-5-5L5 21' }],
];
export const imagePlus: IconNode = [
  ['path', { d: 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7' }],
  ['rect', { x: 6.75, y: 6.75, ...POINT }],
  ['path', { d: 'M21 15l-5-5L5 21' }],
  ['path', { d: 'M18 3v6' }],
  ['path', { d: 'M15 6h6' }],
];
export const camera: IconNode = [
  [
    'path',
    {
      d: 'M3 9a2 2 0 0 1 2-2h2l3-3h4l3 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    },
  ],
  ['circle', { cx: 12, cy: 13.5, r: 4 }],
];
/** Microphone: a capsule on a cradle, for voice input. */
export const mic: IconNode = [
  ['rect', { x: 9, y: 3, width: 6, height: 11, rx: 3 }],
  ['path', { d: 'M5.5 11a6.5 6.5 0 0 0 13 0' }],
  ['path', { d: 'M12 17.5V21' }],
];
export const film: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M7 3v18' }],
  ['path', { d: 'M17 3v18' }],
  ['path', { d: 'M3 12h18' }],
  ['path', { d: 'M3 7.5h4' }],
  ['path', { d: 'M3 16.5h4' }],
  ['path', { d: 'M17 7.5h4' }],
  ['path', { d: 'M17 16.5h4' }],
];
export const clapperboard: IconNode = [
  ['path', { d: 'M3 10h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
  ['path', { d: 'M3 10V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4' }],
  ['path', { d: 'M9 4l-6 6' }],
  ['path', { d: 'M15 4l-6 6' }],
  ['path', { d: 'M21 4l-6 6' }],
];
export const monitorPlay: IconNode = [
  ['rect', { x: 3, y: 4, width: 18, height: 12, rx: 2 }],
  ['path', { d: 'M12 16v4' }],
  ['path', { d: 'M8 20h8' }],
  ['path', { d: 'M10.5 7.5v5l4-2.5z' }],
];
export const penTool: IconNode = [
  ['path', { d: 'M3 21l3.5-10L13 6.5l4.5 4.5L13 17.5z' }],
  ['path', { d: 'M3 21l6-6' }],
  ['circle', { cx: 10.5, cy: 13.5, r: 1.5 }],
  ['path', { d: 'M13 6.5L16.5 3 21 7.5 17.5 11' }],
];
export const ruler: IconNode = [
  ['path', { d: 'M3 16L16 3l5 5L8 21z' }],
  ['path', { d: 'M6.5 12.5l2 2' }],
  ['path', { d: 'M9.5 9.5l2.5 2.5' }],
  ['path', { d: 'M12.5 6.5l2 2' }],
];

/* ── Devices ────────────────────────────────────────────────────────── */

export const monitor: IconNode = [
  ['rect', { x: 3, y: 4, width: 18, height: 12, rx: 2 }],
  ['path', { d: 'M12 16v4' }],
  ['path', { d: 'M8 20h8' }],
];
export const monitorOff: IconNode = [
  ['rect', { x: 3, y: 4, width: 18, height: 12, rx: 2 }],
  ['path', { d: 'M12 16v4' }],
  ['path', { d: 'M8 20h8' }],
  ['path', { d: 'M4 3l16 16' }],
];
export const smartphone: IconNode = [
  ['rect', { x: 6, y: 3, width: 12, height: 18, rx: 2 }],
  ['path', { d: 'M11 17.5h2' }],
];
export const tablet: IconNode = [
  ['rect', { x: 4, y: 3, width: 16, height: 18, rx: 2 }],
  ['path', { d: 'M11 17.5h2' }],
];
export const server: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 8, rx: 2 }],
  ['rect', { x: 3, y: 13, width: 18, height: 8, rx: 2 }],
  ['rect', { x: 5.75, y: 5.75, ...POINT }],
  ['rect', { x: 5.75, y: 15.75, ...POINT }],
];
export const database: IconNode = [
  ['ellipse', { cx: 12, cy: 5.5, rx: 8, ry: 2.5 }],
  ['path', { d: 'M4 5.5v13a8 2.5 0 0 0 16 0v-13' }],
  ['path', { d: 'M4 12a8 2.5 0 0 0 16 0' }],
];

/* ── Data ───────────────────────────────────────────────────────────── */

export const chartBar: IconNode = [
  ['path', { d: 'M3 3v18h18' }],
  ['path', { d: 'M8 17v-5' }],
  ['path', { d: 'M13 17V7' }],
  ['path', { d: 'M18 17V9' }],
];
export const chartColumn: IconNode = [
  ['path', { d: 'M6 20v-6' }],
  ['path', { d: 'M12 20V4' }],
  ['path', { d: 'M18 20v-9' }],
];
export const chartLine: IconNode = [
  ['path', { d: 'M3 3v18h18' }],
  ['path', { d: 'M7 15l4-4 3 3 6-6' }],
];
export const activity: IconNode = [['path', { d: 'M3 12h4l3-8 4 16 3-8h4' }]];
export const target: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['circle', { cx: 12, cy: 12, r: 5.5 }],
  ['circle', { cx: 12, cy: 12, r: 2 }],
];

/* ── Development ────────────────────────────────────────────────────── */

export const terminal: IconNode = [
  ['path', { d: 'M4 17l5-5-5-5' }],
  ['path', { d: 'M12 19h8' }],
];
export const squareTerminal: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M7 9l3 3-3 3' }],
  ['path', { d: 'M12 15h5' }],
];
export const code: IconNode = [
  ['path', { d: 'M15 7l5 5-5 5' }],
  ['path', { d: 'M9 7l-5 5 5 5' }],
];
export const gitBranch: IconNode = [
  ['path', { d: 'M6 3v12.5' }],
  ['circle', { cx: 6, cy: 18, r: 2.5 }],
  ['circle', { cx: 18, cy: 6, r: 2.5 }],
  ['path', { d: 'M18 8.5A9.5 9.5 0 0 1 8.5 18' }],
];
export const gitPullRequest: IconNode = [
  ['circle', { cx: 6, cy: 6, r: 2.5 }],
  ['circle', { cx: 6, cy: 18, r: 2.5 }],
  ['circle', { cx: 18, cy: 18, r: 2.5 }],
  ['path', { d: 'M6 8.5v7' }],
  ['path', { d: 'M18 15.5V9a3 3 0 0 0-3-3h-4.5' }],
  ['path', { d: 'M13 3.5L10.5 6 13 8.5' }],
];
export const workflow: IconNode = [
  ['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }],
  ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }],
  ['path', { d: 'M6.5 10v7.5H14' }],
];
export const network: IconNode = [
  ['rect', { x: 9, y: 3, width: 6, height: 5, rx: 1 }],
  ['rect', { x: 3, y: 16, width: 6, height: 5, rx: 1 }],
  ['rect', { x: 15, y: 16, width: 6, height: 5, rx: 1 }],
  ['path', { d: 'M12 8v4' }],
  ['path', { d: 'M6 16v-4h12v4' }],
];
export const route: IconNode = [
  ['circle', { cx: 6, cy: 18, r: 2.5 }],
  ['circle', { cx: 18, cy: 6, r: 2.5 }],
  ['path', { d: 'M8.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.5' }],
];
export const plug: IconNode = [
  ['path', { d: 'M9 3v5' }],
  ['path', { d: 'M15 3v5' }],
  ['path', { d: 'M6 8h12v4a6 6 0 0 1-12 0z' }],
  ['path', { d: 'M12 18v3' }],
];
export const bug: IconNode = [
  ['rect', { x: 8, y: 7, width: 8, height: 13, rx: 4 }],
  ['path', { d: 'M9.5 7a2.5 2.5 0 0 1 5 0' }],
  ['path', { d: 'M12 12v8' }],
  ['path', { d: 'M8 10L5 7' }],
  ['path', { d: 'M16 10l3-3' }],
  ['path', { d: 'M8 14H4' }],
  ['path', { d: 'M16 14h4' }],
  ['path', { d: 'M8.5 18L5.5 21' }],
  ['path', { d: 'M15.5 18l3 3' }],
];
export const packageBox: IconNode = [
  ['path', { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z' }],
  ['path', { d: 'M4 7.5l8 4.5 8-4.5' }],
  ['path', { d: 'M12 12v9' }],
  ['path', { d: 'M8 5.25l8 4.5' }],
];
export const flask: IconNode = [
  ['path', { d: 'M9 3h6' }],
  ['path', { d: 'M10 3v6l-6 6v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4l-6-6V3' }],
  ['path', { d: 'M4 15h16' }],
];
export const wrench: IconNode = [
  [
    'path',
    {
      d: 'M14.06 12.06l-8 8a1.5 1.5 0 0 1-2.12-2.12l8-8A4.5 4.5 0 0 1 17.94 3.94l-2.29 2.29 2.12 2.12 2.29-2.29A4.5 4.5 0 0 1 14.06 12.06z',
    },
  ],
];
export const rocket: IconNode = [
  ['path', { d: 'M8 13l7-7c1.5-1.5 3.5-2 5-2 0 1.5-.5 3.5-2 5l-7 7z' }],
  ['path', { d: 'M9.5 11.5H5l3-3h4' }],
  ['path', { d: 'M12.5 14.5V19l3-3v-4' }],
  ['path', { d: 'M7 17l-3 3' }],
  ['circle', { cx: 15.5, cy: 8.5, r: 1.5 }],
];
export const zap: IconNode = [['path', { d: 'M13 3L5 13h7l-1 8 8-10h-7z' }]];

/* ── Places and things ──────────────────────────────────────────────── */

export const home: IconNode = [
  ['path', { d: 'M3 12l9-9 9 9' }],
  ['path', { d: 'M5 10v11h14V10' }],
  ['path', { d: 'M10 21v-6h4v6' }],
];
export const building: IconNode = [
  ['path', { d: 'M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16' }],
  ['path', { d: 'M3 21h18' }],
  ['rect', { x: 8.25, y: 6.25, ...POINT }],
  ['rect', { x: 13.25, y: 6.25, ...POINT }],
  ['rect', { x: 8.25, y: 10.25, ...POINT }],
  ['rect', { x: 13.25, y: 10.25, ...POINT }],
  ['path', { d: 'M10 21v-4.5h4V21' }],
];
export const buildings: IconNode = [
  ['path', { d: 'M3 21h18' }],
  ['path', { d: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16' }],
  ['path', { d: 'M15 10h3a2 2 0 0 1 2 2v9' }],
  ['rect', { x: 7.75, y: 6.25, ...POINT }],
  ['rect', { x: 7.75, y: 10.25, ...POINT }],
  ['rect', { x: 7.75, y: 14.25, ...POINT }],
];
export const store: IconNode = [
  ['path', { d: 'M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8' }],
  ['path', { d: 'M3 8V7l2-4h14l2 4v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z' }],
  ['path', { d: 'M10 21v-5h4v5' }],
];
export const mapPin: IconNode = [
  ['path', { d: 'M12 19.3l-4.77-4.78a6.75 6.75 0 1 1 9.54 0z' }],
  ['circle', { cx: 12, cy: 9.75, r: 2.5 }],
];
export const compass: IconNode = [
  ['circle', { cx: 12, cy: 12, r: 9 }],
  ['path', { d: 'M16 8l-2 6-6 2 2-6z' }],
];
export const scale: IconNode = [
  ['path', { d: 'M12 4v17' }],
  ['path', { d: 'M8 21h8' }],
  ['path', { d: 'M5 7h14' }],
  ['path', { d: 'M5 7l-2.5 6h5z' }],
  ['path', { d: 'M19 7l-2.5 6h5z' }],
  ['path', { d: 'M2.5 13a2.5 2.5 0 0 0 5 0' }],
  ['path', { d: 'M16.5 13a2.5 2.5 0 0 0 5 0' }],
];
export const brickWall: IconNode = [
  ['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }],
  ['path', { d: 'M3 9.5h18' }],
  ['path', { d: 'M3 14.5h18' }],
  ['path', { d: 'M12 4v5.5' }],
  ['path', { d: 'M8 9.5v5' }],
  ['path', { d: 'M16 9.5v5' }],
  ['path', { d: 'M12 14.5V20' }],
];
export const lightbulb: IconNode = [
  ['path', { d: 'M9 18v-2.73A6.5 6.5 0 1 1 15 15.27V18z' }],
  ['path', { d: 'M10 21h4' }],
];
export const gift: IconNode = [
  ['rect', { x: 3, y: 8, width: 18, height: 4, rx: 1 }],
  ['path', { d: 'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7' }],
  ['path', { d: 'M12 8v13' }],
  ['path', { d: 'M12 8H8.5a2 2 0 0 1 0-4c2.5 0 3.5 4 3.5 4z' }],
  ['path', { d: 'M12 8h3.5a2 2 0 0 0 0-4c-2.5 0-3.5 4-3.5 4z' }],
];
export const flame: IconNode = [
  [
    'path',
    {
      d: 'M12 21a6 6 0 0 1-6-6c0-3.5 2.5-5.5 3.5-8 1 1.5 2 2.5 2 4.5 1.5-1 2.5-3.5 2.5-8.5 2.5 2.5 4 6.5 4 12a6 6 0 0 1-6 6z',
    },
  ],
];

/* ── Commerce ───────────────────────────────────────────────────────── */

export const creditCard: IconNode = [
  ['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }],
  ['path', { d: 'M3 10h18' }],
  ['path', { d: 'M7 15h3' }],
];
export const shoppingCart: IconNode = [
  ['path', { d: 'M3 4h2.5l2 11h10.5l2.5-8H6.3' }],
  ['circle', { cx: 9, cy: 19.5, r: 1.5 }],
  ['circle', { cx: 17, cy: 19.5, r: 1.5 }],
];
export const shoppingBag: IconNode = [
  ['path', { d: 'M5 7h14v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z' }],
  ['path', { d: 'M9 10V7a3 3 0 0 1 6 0v3' }],
];
export const receipt: IconNode = [
  ['path', { d: 'M5 21V3h14v16l-2 2-2-2-2 2-2-2-2 2-2-2z' }],
  ['path', { d: 'M9 8h6' }],
  ['path', { d: 'M9 12h6' }],
];
export const coins: IconNode = [
  ['circle', { cx: 9, cy: 9, r: 6 }],
  ['path', { d: 'M15 9a6 6 0 1 1-6 6' }],
];
export const truck: IconNode = [
  ['path', { d: 'M5 17.5H3V5h11v12.5' }],
  ['path', { d: 'M9 17.5h6' }],
  ['path', { d: 'M14 9h4l3 3v5.5h-2' }],
  ['circle', { cx: 7, cy: 17.5, r: 2 }],
  ['circle', { cx: 17, cy: 17.5, r: 2 }],
];

/* ── Stunt Double ───────────────────────────────────────────────────── */

/** Frame marks: the four crop corners the brand uses to mark what is on camera. */
const frameMarks: IconNode = [
  ['path', { d: 'M3 8V3h5' }],
  ['path', { d: 'M16 3h5v5' }],
  ['path', { d: 'M21 16v5h-5' }],
  ['path', { d: 'M8 21H3v-5' }],
];

/** An actor: a person inside frame marks, someone on camera. */
export const actor: IconNode = [
  ...frameMarks,
  ['circle', { cx: 12, cy: 9.5, r: 2.5 }],
  ['path', { d: 'M7.5 17.5a4.5 4.5 0 0 1 9 0' }],
];
/** Evidence: a capture inside frame marks. */
export const evidence: IconNode = [
  ...frameMarks,
  ['path', { d: 'M7 16l3.5-3.5 2 2L16 11' }],
  ['rect', { x: 7.25, y: 7.25, ...POINT }],
];
/** A checklist: a sheet with a ticked step and one to come. */
export const checklist: IconNode = [
  ['rect', { x: 4, y: 3, width: 16, height: 18, rx: 2 }],
  ['path', { d: 'M8 8.5l1.5 1.5 3-3' }],
  ['path', { d: 'M14.5 9h2' }],
  ['rect', { x: 8, y: 13.5, width: 3, height: 3 }],
  ['path', { d: 'M14.5 15h2' }],
];
/** A run: play, with the two speed lines of something already moving. */
export const run: IconNode = [
  ['path', { d: 'M9 4.5l12 7.5-12 7.5z' }],
  ['path', { d: 'M3 9h3' }],
  ['path', { d: 'M3 15h3' }],
];
/** An interview: a speech bubble holding a quote mark, because someone said it. */
export const interview: IconNode = [
  ['path', { d: bubble }],
  ['path', { d: 'M9.5 7v2.5L8 11' }],
  ['path', { d: 'M14.5 7v2.5L13 11' }],
];
/** An automation: a trigger, a condition and the step it leads to. */
export const automation: IconNode = [
  ['rect', { x: 3, y: 3, width: 6, height: 6, rx: 1 }],
  ['path', { d: 'M9 6h5' }],
  ['path', { d: 'M17 3l3 3-3 3-3-3z' }],
  ['path', { d: 'M17 9v6' }],
  ['rect', { x: 14, y: 15, width: 6, height: 6, rx: 1 }],
];
/** An insight: the lamp, with the throw of light it casts. */
export const insight: IconNode = [
  ['path', { d: 'M9.5 21v-2a5 5 0 1 1 5 0v2z' }],
  ['path', { d: 'M12 3V2' }],
  ['path', { d: 'M5 6l-1-1' }],
  ['path', { d: 'M19 6l1-1' }],
];
/** Feedback: a comment pin, square at the corner it points from. */
export const feedback: IconNode = [
  ['path', { d: 'M12 3a8 8 0 0 1 0 16H4v-8a8 8 0 0 1 8-8z' }],
  ['path', { d: 'M8.5 9.5h7' }],
  ['path', { d: 'M8.5 13h4' }],
];
/** A worker: the chip a self-hosted browser runs on. */
export const worker: IconNode = [
  ['rect', { x: 6, y: 6, width: 12, height: 12, rx: 2 }],
  ['rect', { x: 9.5, y: 9.5, width: 5, height: 5 }],
  ['path', { d: 'M9.5 3v3' }],
  ['path', { d: 'M14.5 3v3' }],
  ['path', { d: 'M9.5 18v3' }],
  ['path', { d: 'M14.5 18v3' }],
  ['path', { d: 'M3 9.5h3' }],
  ['path', { d: 'M3 14.5h3' }],
  ['path', { d: 'M18 9.5h3' }],
  ['path', { d: 'M18 14.5h3' }],
];
/** A project: the case a production's actors, checklists and runs are kept in. */
export const project: IconNode = [
  ['path', { d: 'M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
  ['path', { d: 'M8 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3' }],
  ['path', { d: 'M3 13h18' }],
];
/** Knowledge: an actor's notebook, what it knows going in. */
export const knowledge: IconNode = [
  ['rect', { x: 6, y: 3, width: 14, height: 18, rx: 2 }],
  ['path', { d: 'M3.5 7.5h5' }],
  ['path', { d: 'M3.5 12h5' }],
  ['path', { d: 'M3.5 16.5h5' }],
  ['path', { d: 'M12 8h5' }],
  ['path', { d: 'M12 12h5' }],
];
/** A take: the stamp that numbers one attempt. */
export const take: IconNode = [
  ['rect', { x: 3, y: 6, width: 18, height: 12, rx: 2 }],
  ['path', { d: 'M7 9.5h3v5H7z' }],
  ['path', { d: 'M13.5 9.5H17v5h-3.5' }],
  ['path', { d: 'M14.5 12H17' }],
];
/** A live view: a screen with the recording point lit. */
export const liveView: IconNode = [
  ['rect', { x: 3, y: 4, width: 18, height: 12, rx: 2 }],
  ['path', { d: 'M12 16v4' }],
  ['path', { d: 'M8 20h8' }],
  ['circle', { cx: 12, cy: 10, r: 2.5, fill: 'currentColor', stroke: 'none' }],
];
/** A design review: a frame being looked at. */
export const designReview: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M6.5 12a6.4 6.4 0 0 1 11 0 6.4 6.4 0 0 1-11 0z' }],
  ['rect', { x: 10.75, y: 10.75, ...POINT }],
];
/** A topology: the map of a site's pages, one node and what it links to. */
export const topology: IconNode = [
  ['rect', { x: 3, y: 9.5, width: 5, height: 5, rx: 1 }],
  ['rect', { x: 16, y: 3, width: 5, height: 5, rx: 1 }],
  ['rect', { x: 16, y: 16, width: 5, height: 5, rx: 1 }],
  ['path', { d: 'M8 12h4' }],
  ['path', { d: 'M16 5.5h-4v13h4' }],
];
/** A step: one numbered move in a run. */
export const step: IconNode = [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M10 9l2-1.5V16' }],
  ['path', { d: 'M10 16h4' }],
];
/** Assist: an actor asking for a hand, a raised pointer. */
export const assist: IconNode = [
  ['path', { d: 'M4 7.5v12.5l3.6-3.2 2.3 5 2.2-1-2.3-5 4.6-.2z' }],
  [
    'path',
    { d: 'M14 3h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3l-2 2V9h-1a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z' },
  ],
];
