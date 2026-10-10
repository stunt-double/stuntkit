# @stunt-double/icons

The Continuity icon pack: 235 stroked icons drawn on a 24 unit grid with a 2 unit margin, at stroke width 1.5 with square caps and mitred joins. Ships as framework-free geometry, standalone SVG files and React components.

```tsx
import { ArrowRightIcon } from '@stunt-double/icons/react';

<ArrowRightIcon size={16} />
<ArrowRightIcon title="Next" />
```

Extracted from [Stunt Double](https://stuntdouble.io), where it is the icon set across the product and the brand.

## Install

```sh
pnpm add @stunt-double/icons
# or: npm install @stunt-double/icons
```

Until the `@stunt-double` scope is available on npm, packages are published to [GitHub Packages](https://github.com/orgs/stunt-double/packages): add `@stunt-double:registry=https://npm.pkg.github.com` and a GitHub token with `read:packages` to your `.npmrc`.

No dependencies. React 18 or later is an optional peer, needed only for `@stunt-double/icons/react`.

## React

Every icon is a component named in PascalCase with an `Icon` suffix (`arrow-right` is `ArrowRightIcon`). The props match lucide-react's, so moving a call site across is a rename of the import:

| Prop                  | Default        | What                                                                     |
| --------------------- | -------------- | ------------------------------------------------------------------------ |
| `size`                | `24`           | Width and height, in px or any CSS length                                |
| `color`               | `currentColor` | Stroke colour                                                            |
| `strokeWidth`         | `1.5`          | Stroke width in grid units                                               |
| `absoluteStrokeWidth` | `false`        | Hold the stroke at `strokeWidth` px whatever the size                    |
| `title`               |                | An accessible name. Without one (or `aria-label`) the icon is decorative |

Any other SVG attribute passes through to the `<svg>`. Icons are `aria-hidden` by default; with a `title`, `aria-label` or `aria-labelledby` they become `role="img"`. Each one carries the classes `continuity-icon` and `continuity-icon-<name>`.

`iconComponents` maps every kebab-case name to its component, for icons chosen from data, and `createIcon(name, node)` builds a component from your own geometry.

## SVG files

Each icon is a standalone file, stroked in `currentColor` so it takes the colour of the text around it:

```ts
import arrowRight from '@stunt-double/icons/svg/arrow-right.svg';
```

`@stunt-double/icons/icons.json` lists every icon with its category, search tags, the lucide-react names it replaces and its file name.

## Geometry

The root entry has no framework code: each icon's elements as data, the manifest, and a serialiser to SVG markup.

```ts
import { ICON_MANIFEST, iconNodes, iconToSvg } from '@stunt-double/icons';

iconToSvg(iconNodes.arrowRight, { size: 32, color: '#111' });
```

`iconLayers(name, node)` groups an icon's elements into the parts it is made of, bottom first, for exploded or layered views.

## Adding or changing an icon

Edit the geometry in `src/nodes.ts` and its entry in `src/manifest.ts`, then regenerate the components, SVG files and `icons.json`:

```sh
pnpm --filter @stunt-double/icons generate
```

The tests fail while any generated file is stale, or while any icon reaches outside the 2 to 22 unit area.

## Licence

[Apache-2.0](./LICENSE), copyright 2026 Turnout Labs Ltd.
