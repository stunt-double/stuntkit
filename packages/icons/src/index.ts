// The Continuity icon pack, framework free: geometry, the manifest and SVG
// serialisation. React components are in `@stunt-double/icons/react`, and the
// standalone files in `@stunt-double/icons/svg/<name>.svg`. AI provider marks
// are `BRAND_MARKS`, with files in `svg/brands/<name>-<variant>-<size>.svg`.

export { BRAND_MARKS, type BrandMark, type BrandSize, type BrandVariant } from './brands.ts';
export { ICON_LAYERS, iconLayers } from './layers.ts';
export {
  ICON_CATEGORIES,
  ICON_MANIFEST,
  type IconCategory,
  type IconManifestEntry,
} from './manifest.ts';
export * as iconNodes from './nodes.ts';
export type { IconElement, IconNode } from './nodes.ts';
export {
  BRAND_SIZES,
  ICON_DEFAULTS,
  brandToSvg,
  iconToSvg,
  toBrandComponent,
  toCamel,
  toComponent,
  type BrandSvgOptions,
  type IconSvgOptions,
} from './svg.ts';
