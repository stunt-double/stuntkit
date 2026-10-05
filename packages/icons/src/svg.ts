import type { IconNode } from './nodes.ts';

/**
 * Serialises an icon to standalone SVG markup, as in the package's `svg/`
 * files. Kept free of runtime imports (the one import is type-only) so the
 * build script can load it under plain `node`.
 */

/** The attributes every Continuity icon is drawn with. */
export const ICON_DEFAULTS = {
  size: 24,
  strokeWidth: 1.5,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
} as const;

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** `strokeDasharray` to `stroke-dasharray`: node attributes use React's spelling. */
const attribute = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export interface IconSvgOptions {
  size?: number;
  strokeWidth?: number;
  /** Paint colour. `currentColor` keeps the file recolourable once placed. */
  color?: string;
}

export function iconToSvg(node: IconNode, options: IconSvgOptions = {}): string {
  const {
    size = ICON_DEFAULTS.size,
    strokeWidth = ICON_DEFAULTS.strokeWidth,
    color = 'currentColor',
  } = options;
  const body = node
    .map(([tag, attrs]) => {
      const list = Object.entries(attrs)
        .map(([key, value]) => {
          const text =
            key === 'fill' || key === 'stroke'
              ? String(value).replace('currentColor', color)
              : String(value);
          return ` ${attribute(key)}="${escape(text)}"`;
        })
        .join('');
      return `  <${tag}${list}/>`;
    })
    .join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${escape(color)}" stroke-width="${strokeWidth}" stroke-linecap="${ICON_DEFAULTS.strokeLinecap}" stroke-linejoin="${ICON_DEFAULTS.strokeLinejoin}">`,
    body,
    '</svg>',
    '',
  ].join('\n');
}

/** `arrow-right` to `arrowRight`, the `./nodes.ts` export name. */
export const toCamel = (name: string) =>
  name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** `arrow-right` to `ArrowRightIcon`, the component name. */
export const toComponent = (name: string) => {
  const camel = toCamel(name);
  return `${camel[0]!.toUpperCase()}${camel.slice(1)}Icon`;
};
