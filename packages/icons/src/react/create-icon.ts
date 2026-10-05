import {
  createElement,
  forwardRef,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type SVGProps,
} from 'react';
import type { IconNode } from '../nodes.ts';
import { ICON_DEFAULTS, toComponent } from '../svg.ts';

/**
 * Props for every Continuity icon. The names match lucide-react's (`size`,
 * `color`, `strokeWidth`, `absoluteStrokeWidth`, `className`), so moving a
 * call site across is a rename of the import and nothing else.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'color'> {
  /** Width and height, in px or any CSS length. Default 24. */
  size?: number | string;
  /** Stroke colour. Default `currentColor`, so the icon takes the text colour. */
  color?: string;
  /** Stroke width in grid units. Default 1.5, which is 1px at 16. */
  strokeWidth?: number | string;
  /** Hold the stroke at `strokeWidth` px whatever the size, instead of scaling with it. */
  absoluteStrokeWidth?: boolean;
  /** An accessible name. Without one (or `aria-label`) the icon is decorative and hidden. */
  title?: string;
}

export type IconComponent = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

/**
 * Builds an icon component from its geometry. Icons are decorative by
 * default (`aria-hidden`); pass `title` or `aria-label` when the icon is the
 * only thing naming a control, and it becomes an `img` with that name.
 */
export function createIcon(name: string, node: IconNode): IconComponent {
  const Icon = forwardRef<SVGSVGElement, IconProps>(
    (
      {
        size = ICON_DEFAULTS.size,
        color = 'currentColor',
        strokeWidth = ICON_DEFAULTS.strokeWidth,
        absoluteStrokeWidth = false,
        title,
        className,
        children,
        ...props
      },
      ref
    ) => {
      const labelled = Boolean(title || props['aria-label'] || props['aria-labelledby']);
      const stroke = absoluteStrokeWidth
        ? (Number(strokeWidth) * 24) / Number.parseFloat(String(size))
        : strokeWidth;

      return createElement(
        'svg',
        {
          ref,
          xmlns: 'http://www.w3.org/2000/svg',
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: color,
          strokeWidth: stroke,
          strokeLinecap: ICON_DEFAULTS.strokeLinecap,
          strokeLinejoin: ICON_DEFAULTS.strokeLinejoin,
          className: ['continuity-icon', `continuity-icon-${name}`, className]
            .filter(Boolean)
            .join(' '),
          role: labelled ? 'img' : undefined,
          'aria-hidden': labelled ? undefined : true,
          focusable: 'false',
          ...props,
        },
        title ? createElement('title', null, title) : null,
        ...node.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs })),
        children
      );
    }
  );
  Icon.displayName = toComponent(name);
  return Icon;
}
