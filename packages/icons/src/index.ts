// The Continuity icon pack, framework free: geometry, the manifest and SVG
// serialisation. React components are in `@stunt-double/icons/react`, and the
// standalone files in `@stunt-double/icons/svg/<name>.svg`.

export { ICON_LAYERS, iconLayers } from './layers.ts';
export {
  ICON_CATEGORIES,
  ICON_MANIFEST,
  type IconCategory,
  type IconManifestEntry,
} from './manifest.ts';
export * as iconNodes from './nodes.ts';
export type { IconElement, IconNode } from './nodes.ts';
export { ICON_DEFAULTS, iconToSvg, toCamel, toComponent, type IconSvgOptions } from './svg.ts';
