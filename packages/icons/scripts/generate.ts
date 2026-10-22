// Builds the generated parts of the pack from its two sources of truth,
// `src/nodes.ts` (geometry) and `src/manifest.ts` (names, tags, lucide
// aliases):
//
//   src/react/icons.ts   the React components, one `createIcon` per icon
//   svg/<name>.svg       a standalone file per icon, for designers
//   svg/icons.json       the machine-readable manifest
//
// and from `src/brands.ts` (AI provider marks):
//
//   src/react/brands.ts                        a `createBrandIcon` per mark
//   svg/brands/<name>-<variant>-<size>.svg     colour and mono, at sm, md and lg
//
// and from `figma/nodes.ts` (where each lives in the Figma library):
//
//   figma/icons/<name>.figma.ts    a Code Connect template per icon
//   figma/brands/<name>.figma.ts   one per mark, mapping its Mono/Color variant
//
// and, for the agent skill, `skills/stunt-double-icons/references/catalogue.md`
// at the repository root: every icon and mark, so an agent can pick one by
// meaning or lucide name without installing the package.
//
// `node scripts/generate.ts` writes them. The unit test calls `validate` and
// `staleFiles`, so a geometry edit cannot ship without its generated files.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

import { FIGMA_BRAND_NODES, FIGMA_FILE, FIGMA_ICON_NODES } from '../figma/nodes.ts';
import { BRAND_MARKS } from '../src/brands.ts';
import { ICON_CATEGORIES, ICON_MANIFEST, type IconManifestEntry } from '../src/manifest.ts';
import * as nodes from '../src/nodes.ts';
import {
  BRAND_SIZES,
  brandToSvg,
  ICON_DEFAULTS,
  iconToSvg,
  toBrandComponent,
  toCamel,
  toComponent,
} from '../src/svg.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG_DIR = 'svg';
const BRAND_DIR = `${SVG_DIR}/brands`;
const BRAND_VARIANTS = ['color', 'mono'] as const;
const brandFile = (name: string, variant: string, size: string) => `${name}-${variant}-${size}.svg`;
const FIGMA_ICON_DIR = 'figma/icons';
const FIGMA_BRAND_DIR = 'figma/brands';
const COMMAND = '`pnpm --filter @stunt-double/icons generate`';
const CATALOGUE_PATH = '../../skills/stunt-double-icons/references/catalogue.md';

const geometry = nodes as unknown as Record<string, unknown>;
const nodeKey = (entry: IconManifestEntry) => entry.node ?? toCamel(entry.name);
const node = (entry: IconManifestEntry) => geometry[nodeKey(entry)] as nodes.IconNode;

/** Every problem with the sources, as readable lines. Empty means sound. */
export function validate(): string[] {
  const errors: string[] = [];
  const names = new Set<string>();
  const lucide = new Map<string, string>();
  const used = new Set<string>();

  for (const entry of ICON_MANIFEST) {
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(entry.name))
      errors.push(`${entry.name}: name is not kebab-case`);
    if (names.has(entry.name)) errors.push(`${entry.name}: listed twice`);
    names.add(entry.name);
    if (!ICON_CATEGORIES.includes(entry.category))
      errors.push(`${entry.name}: unknown category ${entry.category}`);

    const key = nodeKey(entry);
    if (!Array.isArray(geometry[key]))
      errors.push(`${entry.name}: no geometry exported as \`${key}\` in nodes.ts`);
    used.add(key);

    for (const alias of entry.lucide) {
      if (lucide.has(alias))
        errors.push(`lucide ${alias}: mapped to both ${lucide.get(alias)} and ${entry.name}`);
      lucide.set(alias, entry.name);
    }
  }

  for (const [key, value] of Object.entries(geometry)) {
    if (Array.isArray(value) && !used.has(key))
      errors.push(`nodes.ts \`${key}\` has no manifest entry`);
  }

  const brands = new Set<string>();
  for (const mark of BRAND_MARKS) {
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(mark.name))
      errors.push(`brand ${mark.name}: name is not kebab-case`);
    if (brands.has(mark.name)) errors.push(`brand ${mark.name}: listed twice`);
    brands.add(mark.name);
    if (mark.mono.some(([, attrs]) => 'fill' in attrs))
      errors.push(`brand ${mark.name}: mono paths must not set their own fill`);
    if (mark.color.some(([, attrs]) => !('fill' in attrs)))
      errors.push(`brand ${mark.name}: every colour path needs a fill`);
  }

  for (const [kind, nodeIds, known] of [
    ['icon', FIGMA_ICON_NODES, names],
    ['brand', FIGMA_BRAND_NODES, brands],
  ] as const) {
    for (const name of known)
      if (!(name in nodeIds)) errors.push(`${kind} ${name}: no Figma node in figma/nodes.ts`);
    for (const [name, id] of Object.entries(nodeIds)) {
      if (!known.has(name)) errors.push(`figma/nodes.ts ${kind} ${name}: not in the pack`);
      if (!/^\d+:\d+$/.test(id)) errors.push(`figma/nodes.ts ${kind} ${name}: bad node id ${id}`);
    }
  }
  return errors;
}

/** A parserless Code Connect template, published with `figma connect publish`. */
function codeConnect(options: {
  nodeId: string;
  source: string;
  component: string;
  id: string;
  body?: string;
  example: string;
}): string {
  return [
    `// url=${FIGMA_FILE}?node-id=${options.nodeId.replace(':', '-')}`,
    `// source=${options.source}`,
    `// component=${options.component}`,
    `// Generated by ${COMMAND} from \`figma/nodes.ts\`. Do not edit by hand.`,
    '',
    "import figma from 'figma';",
    '',
    ...(options.body ? [options.body, ''] : []),
    'export default {',
    `  example: figma.code\`${options.example}\`,`,
    `  imports: ["import { ${options.component} } from '@stunt-double/icons/react';"],`,
    `  id: '${options.id}',`,
    '  metadata: { nestable: true },',
    '};',
    '',
  ].join('\n');
}

async function format(source: string, filepath: string): Promise<string> {
  const config = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(source, { ...config, filepath });
}

/** Every generated file, keyed by its path relative to the package root. */
export async function buildFiles(): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  const components = ICON_MANIFEST.map(
    (entry) =>
      `export const ${toComponent(entry.name)} = /*#__PURE__*/ createIcon('${entry.name}', nodes.${nodeKey(entry)});`
  );
  const registry = ICON_MANIFEST.map((entry) => `  '${entry.name}': ${toComponent(entry.name)},`);
  const componentsPath = 'src/react/icons.ts';
  files.set(
    componentsPath,
    await format(
      [
        `// Generated by ${COMMAND} from \`nodes.ts\` and \`manifest.ts\`. Do not edit by hand.`,
        '',
        "import * as nodes from '../nodes.ts';",
        "import { createIcon, type IconComponent } from './create-icon.ts';",
        '',
        ...components,
        '',
        '/** Every icon by its kebab-case name, for lookups from data. */',
        'export const iconComponents: Record<string, IconComponent> = {',
        ...registry,
        '};',
        '',
      ].join('\n'),
      path.join(ROOT, componentsPath)
    )
  );

  for (const entry of ICON_MANIFEST) {
    files.set(`${SVG_DIR}/${entry.name}.svg`, iconToSvg(node(entry)));
  }

  const brandPath = 'src/react/brands.ts';
  files.set(
    brandPath,
    await format(
      [
        `// Generated by ${COMMAND} from \`brands.ts\`. Do not edit by hand.`,
        '',
        "import * as brands from '../brands.ts';",
        "import { createBrandIcon, type BrandIconComponent } from './create-brand-icon.ts';",
        '',
        ...BRAND_MARKS.map(
          (mark) =>
            `export const ${toBrandComponent(mark.name)} = /*#__PURE__*/ createBrandIcon(brands.${toCamel(mark.name)});`
        ),
        '',
        '/** Every brand mark by its kebab-case name, for lookups from data. */',
        'export const brandComponents: Record<string, BrandIconComponent> = {',
        ...BRAND_MARKS.map((mark) => `  '${mark.name}': ${toBrandComponent(mark.name)},`),
        '};',
        '',
      ].join('\n'),
      path.join(ROOT, brandPath)
    )
  );

  for (const mark of BRAND_MARKS) {
    for (const variant of BRAND_VARIANTS) {
      for (const size of Object.keys(BRAND_SIZES) as (keyof typeof BRAND_SIZES)[]) {
        files.set(
          `${BRAND_DIR}/${brandFile(mark.name, variant, size)}`,
          brandToSvg(mark, { variant, size })
        );
      }
    }
  }

  for (const entry of ICON_MANIFEST) {
    const component = toComponent(entry.name);
    const templatePath = `${FIGMA_ICON_DIR}/${entry.name}.figma.ts`;
    files.set(
      templatePath,
      await format(
        codeConnect({
          nodeId: FIGMA_ICON_NODES[entry.name],
          source: componentsPath,
          component,
          id: `icon-${entry.name}`,
          example: `<${component} />`,
        }),
        path.join(ROOT, templatePath)
      )
    );
  }

  for (const mark of BRAND_MARKS) {
    const component = toBrandComponent(mark.name);
    const templatePath = `${FIGMA_BRAND_DIR}/${mark.name}.figma.ts`;
    files.set(
      templatePath,
      await format(
        codeConnect({
          nodeId: FIGMA_BRAND_NODES[mark.name],
          source: brandPath,
          component,
          id: `brand-${mark.name}`,
          // `color` is the component's default, so only `mono` is written out.
          body: "const variant = figma.selectedInstance.getEnum('Variant', { Mono: 'mono', Color: 'color' });",
          example: `<${component}\${variant === 'mono' ? ' variant="mono"' : ''} />`,
        }),
        path.join(ROOT, templatePath)
      )
    );
  }

  const manifest = {
    $comment: `Generated by ${COMMAND}. Do not edit by hand.`,
    grid: {
      viewBox: '0 0 24 24',
      padding: 2,
      strokeWidth: ICON_DEFAULTS.strokeWidth,
      strokeLinecap: ICON_DEFAULTS.strokeLinecap,
      strokeLinejoin: ICON_DEFAULTS.strokeLinejoin,
      color: 'currentColor',
    },
    categories: ICON_CATEGORIES,
    icons: ICON_MANIFEST.map((entry) => ({
      name: entry.name,
      component: toComponent(entry.name),
      category: entry.category,
      tags: entry.tags,
      lucide: entry.lucide,
      file: `${entry.name}.svg`,
    })),
    brands: {
      sizes: BRAND_SIZES,
      variants: BRAND_VARIANTS,
      marks: BRAND_MARKS.map((mark) => ({
        name: mark.name,
        title: mark.title,
        component: toBrandComponent(mark.name),
        files: Object.fromEntries(
          BRAND_VARIANTS.map((variant) => [
            variant,
            Object.fromEntries(
              Object.keys(BRAND_SIZES).map((size) => [
                size,
                `brands/${brandFile(mark.name, variant, size)}`,
              ])
            ),
          ])
        ),
      })),
    },
  };
  const manifestPath = `${SVG_DIR}/icons.json`;
  files.set(manifestPath, await format(JSON.stringify(manifest), path.join(ROOT, manifestPath)));

  const list = (words: readonly string[]) => words.join(', ');
  const catalogue = [
    '# Icon catalogue',
    '',
    `<!-- Generated by ${COMMAND} from \`manifest.ts\` and \`brands.ts\`. Do not edit by hand. -->`,
    '',
    'Every Continuity icon by category: the kebab-case name (file `svg/<name>.svg`, key in `iconComponents`), the React component, its search tags and the lucide-react names it replaces. Search here by meaning or lucide name before choosing an icon.',
    '',
    ...ICON_CATEGORIES.flatMap((category) => {
      const entries = ICON_MANIFEST.filter((entry) => entry.category === category);
      return [
        `## ${category} (${entries.length})`,
        '',
        '| Name | Component | Tags | Replaces lucide |',
        '| --- | --- | --- | --- |',
        ...entries.map(
          (e) =>
            `| \`${e.name}\` | \`${toComponent(e.name)}\` | ${list(e.tags)} | ${list(e.lucide)} |`
        ),
        '',
      ];
    }),
    '## Brand marks',
    '',
    'Filled AI provider and coding agent logos: the component, the `brandComponents` key and the files `svg/brands/<name>-<color|mono>-<sm|md|lg>.svg`.',
    '',
    '| Name | Title | Component |',
    '| --- | --- | --- |',
    ...BRAND_MARKS.map((m) => `| \`${m.name}\` | ${m.title} | \`${toBrandComponent(m.name)}\` |`),
    '',
  ].join('\n');
  files.set(CATALOGUE_PATH, await format(catalogue, path.join(ROOT, CATALOGUE_PATH)));

  return files;
}

/** Paths whose content on disk differs from what the build would write, plus strays. */
export async function staleFiles(): Promise<string[]> {
  const files = await buildFiles();
  const stale: string[] = [];
  for (const [relative, content] of files) {
    const current = await readFile(path.join(ROOT, relative), 'utf8').catch(() => null);
    if (current !== content) stale.push(relative);
  }
  for (const dir of [SVG_DIR, BRAND_DIR, FIGMA_ICON_DIR, FIGMA_BRAND_DIR]) {
    const onDisk = await readdir(path.join(ROOT, dir)).catch(() => []);
    for (const name of onDisk) {
      const relative = `${dir}/${name}`;
      if (!files.has(relative) && relative !== BRAND_DIR)
        stale.push(`${relative} (no longer in the manifest)`);
    }
  }
  return stale;
}

async function main() {
  const errors = validate();
  if (errors.length) {
    process.stderr.write(
      `Icon sources have ${errors.length} problem(s):\n  ${errors.join('\n  ')}\n`
    );
    process.exit(1);
  }
  const files = await buildFiles();
  await rm(path.join(ROOT, SVG_DIR), { recursive: true, force: true });
  await mkdir(path.join(ROOT, BRAND_DIR), { recursive: true });
  for (const dir of [FIGMA_ICON_DIR, FIGMA_BRAND_DIR]) {
    await rm(path.join(ROOT, dir), { recursive: true, force: true });
    await mkdir(path.join(ROOT, dir), { recursive: true });
  }
  for (const [relative, content] of files) {
    await writeFile(path.join(ROOT, relative), content);
  }
  process.stdout.write(
    `Wrote ${ICON_MANIFEST.length} icons and ${BRAND_MARKS.length} brand marks.\n`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
