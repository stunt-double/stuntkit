import type { BrandMark, BrandSize, BrandVariant } from './brands.ts';
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

/** Each element as an indented SVG tag, with `currentColor` paint swapped for `color`. */
function elements(node: IconNode, color: string): string {
  return node
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
}

export function iconToSvg(node: IconNode, options: IconSvgOptions = {}): string {
  const {
    size = ICON_DEFAULTS.size,
    strokeWidth = ICON_DEFAULTS.strokeWidth,
    color = 'currentColor',
  } = options;
  const body = elements(node, color);
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

/** Named brand mark sizes in px. Kept here, not in `./brands.ts`, so the serialiser stays import-free. */
export const BRAND_SIZES: Record<BrandSize, number> = { sm: 16, md: 24, lg: 32 };

export interface BrandSvgOptions {
  /** `color` keeps the brand's fills; `mono` paints the mark in `color`. Default `color`. */
  variant?: BrandVariant;
  /** A named size or px. Default `md`. */
  size?: BrandSize | number;
  /** Paint for the `mono` variant. Default `currentColor`. */
  color?: string;
}

/** Serialises a brand mark to standalone SVG markup, as in the package's `svg/brands/` files. */
export function brandToSvg(mark: BrandMark, options: BrandSvgOptions = {}): string {
  const { variant = 'color', size = 'md', color = 'currentColor' } = options;
  const px = typeof size === 'number' ? size : BRAND_SIZES[size];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="${variant === 'mono' ? escape(color) : 'none'}">`,
    elements(mark[variant], color),
    '</svg>',
    '',
  ].join('\n');
}

/** `claude-code` to `ClaudeCodeLogo`, the brand component name. */
export const toBrandComponent = (name: string) => toComponent(name).replace(/Icon$/, 'Logo');
