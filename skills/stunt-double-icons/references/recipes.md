# Recipes

## Migrating from lucide-react

1. List what the project uses: `grep -rhoE "import \{[^}]+\} from 'lucide-react'" src | tr ',{}' '\n' | sed 's/import\|from.*//' | tr -d ' ' | sort -u`.
2. Map each name through `icons.json` (or [catalogue.md](catalogue.md)): an entry's `lucide` array lists the lucide names (without `Icon`) it replaces.
3. Rewrite imports and JSX; props carry over (`size`, `color`, `strokeWidth`, `absoluteStrokeWidth`).
4. Report every name with no match. Do not substitute silently.

A lookup to drive the rewrite:

```ts
import icons from '@stunt-double/icons/icons.json' with { type: 'json' };

const fromLucide = new Map<string, string>();
for (const icon of icons.icons)
  for (const name of icon.lucide) fromLucide.set(name, icon.component);

// fromLucide.get('Trash2') -> 'TrashIcon' (when the manifest lists it)
```

lucide's `LucideIcon` type becomes `IconComponent`, and `LucideProps` becomes `IconProps`, both from `/react`. `className` passes through; lucide's own `lucide` and `lucide-<name>` classes become `continuity-icon` and `continuity-icon-<name>`, so update any CSS that targets them.

## Icons from data

```tsx
import { iconComponents } from '@stunt-double/icons/react';

function NavIcon({ name }: { name: string }) {
  const Icon = iconComponents[name];
  return Icon ? <Icon size={16} /> : null;
}
```

This imports every icon. For tree shaking, import the components you use by name.

## Vue, Svelte, Solid, Angular and server templates

There is no component per framework: render markup from geometry.

```ts
import { iconNodes, iconToSvg } from '@stunt-double/icons';
const html = iconToSvg(iconNodes.arrowRight, { size: 16 }); // stroked in currentColor
```

Vue: `<span class="icon" v-html="html" />`. Svelte: `{@html html}`. The markup is generated from the package's own data, so it is safe to inject. Add `aria-hidden="true"` on the wrapper, or a label on the control around it.

Or import the file through the bundler: `import arrowRight from '@stunt-double/icons/svg/arrow-right.svg?raw'` (Vite) or an SVG loader (`vite-svg-loader`, `@svgr/webpack`).

## Email

Email clients strip inline SVG and ignore `currentColor`. Rasterise at build time with a fixed colour (`iconToSvg(node, { size: 48, color: '#111111' })` through `sharp` or `resvg`) and send a PNG with `alt` text, or host the SVG for clients that accept it.

## Open Graph images (Satori, `next/og`)

Satori renders React-like elements, not the components' `forwardRef` output. Use markup as an image:

```tsx
const svg = iconToSvg(iconNodes.check, { size: 64, color: '#0a0a0a' });
<img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={64} height={64} />;
```

Brand marks the same way with `brandToSvg`.

## Canvas

```ts
const img = new Image();
img.src = `data:image/svg+xml;utf8,${encodeURIComponent(iconToSvg(iconNodes.play, { size: 48, color: '#fff' }))}`;
await img.decode();
ctx.drawImage(img, x, y);
```

## CSS mask (one file, any colour)

```css
.icon-search {
  width: 1em;
  height: 1em;
  background: currentColor;
  mask: url('@stunt-double/icons/svg/search.svg') center / contain no-repeat;
}
```

The bundler must resolve the package path in CSS; otherwise copy the file into your assets.

## Custom icons on the grid

```tsx
import { createIcon } from '@stunt-double/icons/react';
import type { IconNode } from '@stunt-double/icons';

const podNode: IconNode = [
  ['path', { d: 'M12 2.5c3 2 4.5 5 4.5 9.5l-2 3h-5l-2-3c0-4.5 1.5-7.5 4.5-9.5z' }],
  ['path', { d: 'M9.5 15l-2.5 3.5h3M14.5 15l2.5 3.5h-3' }],
  ['circle', { cx: 12, cy: 9, r: 1.5 }],
];
export const LaunchPodIcon = createIcon('launch-pod', podNode);
```

Attributes use React spelling (`strokeDasharray`); `iconToSvg` converts them for markup. Keep every point within 2 to 22 so it lines up with the pack. Prefer proposing the icon upstream when it is generally useful.

## Layered and exploded views

```tsx
import { iconLayers, iconNodes } from '@stunt-double/icons';

const layers = iconLayers('checklist', iconNodes.checklist); // IconNode[] bottom first
// Render each layer as its own <g>, offset or animated apart.
```

Icons without a curated split come apart as their first element (the outline) and the rest.

## Brand marks next to text

```tsx
import { brandComponents } from '@stunt-double/icons/react';

function AgentBadge({ agent, label }: { agent: string; label: string }) {
  const Mark = brandComponents[agent];
  return (
    <span className="badge">
      {Mark && <Mark size="sm" variant="mono" />}
      {label}
    </span>
  );
}
```

Decorative here, since the label names the product. Keys are kebab-case (`claude-code`, `github-copilot`); check [catalogue.md](catalogue.md#brand-marks) for the exact names.
