---
name: stunt-double-icons
description: Use when adding or replacing icons with @stunt-double/icons (the Continuity icon pack), including migrating from lucide-react, rendering icons as React components, SVG files or raw markup (emails, OG images, canvas), picking an icon by meaning with icons.json, and making icons accessible.
---

# Continuity icons (`@stunt-double/icons`)

235 stroked icons on a 24 unit grid (stroke 1.5, square caps, mitred joins). Framework-free geometry at the root, standalone SVG files, and React components at `/react`. React 18+ is an optional peer.

Install: `pnpm add @stunt-double/icons`. Until the scope is on npm it is on GitHub Packages: the project `.npmrc` needs `@stunt-double:registry=https://npm.pkg.github.com` and a token with `read:packages`.

## Pick the entry

| Need                                                 | Import                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| React UI                                             | `import { ArrowRightIcon } from '@stunt-double/icons/react'`    |
| Icon chosen from data (a CMS, a config)              | `iconComponents['arrow-right']` from `/react`                   |
| A file for a bundler, CSS or static HTML             | `@stunt-double/icons/svg/arrow-right.svg`                       |
| Markup without React (email, Satori, canvas, server) | `iconToSvg(iconNodes.arrowRight, { size: 32, color: '#111' })`  |
| Search by meaning, or a lucide name                  | `@stunt-double/icons/icons.json` (category, tags, lucide names) |

Names are kebab-case for files and maps (`arrow-right`), PascalCase plus `Icon` for components (`ArrowRightIcon`), camelCase in `iconNodes` (`arrowRight`).

## Migrating from lucide-react

Props match lucide-react (`size`, `color`, `strokeWidth`, `absoluteStrokeWidth`), so a migration is an import rename. Look each lucide name up in `icons.json` rather than guessing: an entry lists the lucide names it replaces. When nothing matches, say so and pick the nearest by tags; do not draw a new icon inline.

## Accessibility

Icons are decorative (`aria-hidden`) by default. An icon that is the only content of a control needs a name, either on the control (`<button aria-label="Next">`) or on the icon (`<ArrowRightIcon title="Next" />`, which makes it `role="img"`). Do not name an icon that sits beside visible text.

## Styling

Stroked in `currentColor`, so icons follow the surrounding text colour. Every component carries `continuity-icon` and `continuity-icon-<name>` classes for targeting. Use `absoluteStrokeWidth` to hold a 1.5px stroke at large sizes.

## Custom geometry

`createIcon(name, node)` builds a component from your own elements on the same grid (keep them inside 2 to 22 units). `iconLayers(name, node)` splits an icon into its parts for layered or exploded views.
