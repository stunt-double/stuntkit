import {
  createElement,
  forwardRef,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type SVGProps,
} from 'react';
import type { BrandMark, BrandSize, BrandVariant } from '../brands.ts';
import { BRAND_SIZES, toBrandComponent } from '../svg.ts';

/** Props for every brand mark component (`ClaudeLogo`, `CursorLogo`, ...). */
export interface BrandIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'color'> {
  /** `color` keeps the brand's fills; `mono` paints the mark in `color`. Default `color`. */
  variant?: BrandVariant;
  /** `sm` (16), `md` (24), `lg` (32), or px or any CSS length. Default `md`. */
  size?: BrandSize | number | string;
  /** Paint for the `mono` variant. Default `currentColor`. */
  color?: string;
  /** An accessible name. Without one (or `aria-label`) the mark is decorative and hidden. */
  title?: string;
}

export type BrandIconComponent = ForwardRefExoticComponent<
  BrandIconProps & RefAttributes<SVGSVGElement>
>;

/** Builds a brand mark component. Decorative by default, like the icons. */
export function createBrandIcon(mark: BrandMark): BrandIconComponent {
  const Brand = forwardRef<SVGSVGElement, BrandIconProps>(
    (
      {
        variant = 'color',
        size = 'md',
        color = 'currentColor',
        title,
        className,
        children,
        ...props
      },
      ref
    ) => {
      const labelled = Boolean(title || props['aria-label'] || props['aria-labelledby']);
      const px =
        typeof size === 'string' && size in BRAND_SIZES ? BRAND_SIZES[size as BrandSize] : size;

      return createElement(
        'svg',
        {
          ref,
          xmlns: 'http://www.w3.org/2000/svg',
          width: px,
          height: px,
          viewBox: '0 0 24 24',
          fill: variant === 'mono' ? color : 'none',
          className: ['continuity-brand', `continuity-brand-${mark.name}`, className]
            .filter(Boolean)
            .join(' '),
          role: labelled ? 'img' : undefined,
          'aria-hidden': labelled ? undefined : true,
          focusable: 'false',
          ...props,
        },
        title ? createElement('title', null, title) : null,
        ...mark[variant].map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs })),
        children
      );
    }
  );
  Brand.displayName = toBrandComponent(mark.name);
  return Brand;
}
