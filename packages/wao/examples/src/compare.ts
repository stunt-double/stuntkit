// With/without comparison for @stunt-double/wao.
//
//   pnpm --filter @stunt-double/wao-examples compare
//
// Builds WAO's script, serves the legacy fixture shop in `fixture/`, and loads
// every page twice in Chromium: once as it is, once with WAO injected through
// `context.addInitScript`. Writes the evidence to `results/`.

import Anthropic from '@anthropic-ai/sdk';
import '@stunt-double/wao'; // Types `window.wao`.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';

const here = fileURLToPath(new URL('..', import.meta.url));
const fixtureDir = join(here, 'src/fixture');
const resultsDir = join(here, 'results');
const variants = ['without', 'with'] as const;
type Variant = (typeof variants)[number];

// Always build, so the run reflects the current WAO source.
execSync('pnpm --filter @stunt-double/wao build', { cwd: here, stdio: 'ignore' });
const waoScript = readFileSync(
  fileURLToPath(import.meta.resolve('@stunt-double/wao/script')),
  'utf8'
);

rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(join(resultsDir, 'snapshots'), { recursive: true });
mkdirSync(join(resultsDir, 'screenshots'), { recursive: true });

// ---- helpers ---------------------------------------------------------------

const INTERACTIVE = [
  'link',
  'button',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'tab',
  'menuitem',
  'option',
] as const;

interface Metrics {
  chars: number;
  tokens: number;
  byRole: Record<string, number>;
  interactive: number;
  named: number;
  unnamed: number;
  domInteractive: number;
  landmarks: string[];
}

function snapshotMetrics(yaml: string, domInteractive: number): Metrics {
  const byRole: Record<string, number> = {};
  let named = 0;
  let unnamed = 0;
  const landmarks: string[] = [];
  for (const line of yaml.split('\n')) {
    const m = /^\s*- ([a-z]+)(?: "((?:[^"\\]|\\.)*)")?/.exec(line);
    if (!m) continue;
    const role = m[1];
    if (['main', 'navigation', 'banner', 'contentinfo', 'search'].includes(role)) {
      landmarks.push(role);
    }
    if (!(INTERACTIVE as readonly string[]).includes(role)) continue;
    byRole[role] = (byRole[role] ?? 0) + 1;
    if (m[2]) named++;
    else unnamed++;
  }
  return {
    chars: yaml.length,
    tokens: Math.round(yaml.length / 4),
    byRole,
    interactive: named + unnamed,
    named,
    unnamed,
    domInteractive,
    landmarks,
  };
}

function countDomInteractive(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          'a[href],button,select,textarea,input:not([type=hidden]),[onclick]'
        ),
      ].filter((el) => el.checkVisibility()).length
  );
}

async function settle(page: Page, variant: Variant): Promise<void> {
  await page.waitForLoadState('load');
  if (variant === 'with') await page.waitForFunction(() => !!window.wao);
  await page.waitForTimeout(100);
}

async function newContext(browser: Browser, variant: Variant): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  if (variant === 'with') await context.addInitScript({ content: waoScript });
  return context;
}

async function waoReport(page: Page) {
  return page.evaluate(() => {
    const { changes, issues } = window.wao!.report();
    return {
      changes: changes.map(({ kind, target, attribute, value, source }) => ({
        kind,
        target,
        attribute,
        value,
        source,
      })),
      issues: issues.map(({ kind, target }) => ({ kind, target })),
    };
  });
}

/** Pixel-diffs two PNGs by drawing them on a canvas in a throwaway page. */
async function pixelDiff(browser: Browser, a: Buffer, b: Buffer) {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ([x, y]) => {
      const load = async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      };
      const [p, q] = await Promise.all([load(x), load(y)]);
      if (p.width !== q.width || p.height !== q.height) {
        return { sameSize: false, differing: -1, total: 0 };
      }
      let differing = 0;
      for (let i = 0; i < p.data.length; i += 4) {
        if (
          p.data[i] !== q.data[i] ||
          p.data[i + 1] !== q.data[i + 1] ||
          p.data[i + 2] !== q.data[i + 2] ||
          p.data[i + 3] !== q.data[i + 3]
        ) {
          differing++;
        }
      }
      return { sameSize: true, differing, total: p.width * p.height };
    },
    [a.toString('base64'), b.toString('base64')] as const
  );
  await page.close();
  return result;
}

// ---- fixture server --------------------------------------------------------

const types: Record<string, string> = { '.html': 'text/html', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/^\/$/, '/shop.html');
  try {
    const body = readFileSync(join(fixtureDir, path.replace(/[^\w.-]/g, '')));
    res.writeHead(200, {
      'content-type': `${types[extname(path)] ?? 'text/plain'}; charset=utf-8`,
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const browser = await chromium.launch();

// ---- 1 and 2: per-page snapshot comparison ---------------------------------

const pages = ['shop', 'basket', 'done'];
interface PageResult {
  metrics: Record<Variant, Metrics>;
  report: Awaited<ReturnType<typeof waoReport>>;
  pixels: Awaited<ReturnType<typeof pixelDiff>>;
  yaml: Record<Variant, string>;
}
const pageResults: Record<string, PageResult> = {};

for (const name of pages) {
  const shots = {} as Record<Variant, Buffer>;
  const partial = { metrics: {}, yaml: {} } as unknown as PageResult;
  for (const variant of variants) {
    const context = await newContext(browser, variant);
    const page = await context.newPage();
    await page.goto(`${base}/${name}.html`);
    await settle(page, variant);
    const yaml = await page.locator('body').ariaSnapshot();
    partial.yaml[variant] = yaml;
    partial.metrics[variant] = snapshotMetrics(yaml, await countDomInteractive(page));
    if (variant === 'with') partial.report = await waoReport(page);
    shots[variant] = await page.screenshot({ fullPage: true });
    writeFileSync(join(resultsDir, 'snapshots', `${name}.${variant}.yaml`), yaml + '\n');
    writeFileSync(join(resultsDir, 'screenshots', `${name}.${variant}.png`), shots[variant]);
    await context.close();
  }
  partial.pixels = await pixelDiff(browser, shots.without, shots.with);
  pageResults[name] = partial;
}

// ---- 3: the role-only agent ------------------------------------------------

interface Step {
  label: string;
  role: 'button' | 'link' | 'textbox';
  name: RegExp;
  fill?: string;
  /** Used only when the role locator finds nothing, so the run can continue. */
  css: string;
}

const STEPS: Step[] = [
  { label: 'Accept the cookie banner', role: 'button', name: /accept/i, css: '#cookie .ok' },
  { label: 'Fill the search box', role: 'textbox', name: /search/i, fill: 'kettle', css: '#q' },
  { label: 'Press search', role: 'button', name: /search/i, css: '.go' },
  { label: 'Add the kettle', role: 'button', name: /add.*kettle/i, css: '.add' },
  { label: 'Close the added modal', role: 'button', name: /close/i, css: '.modal .x' },
  { label: 'Open the basket', role: 'link', name: /basket|cart/i, css: 'a[href="basket.html"]' },
  {
    label: 'Fill the email',
    role: 'textbox',
    name: /email/i,
    fill: 'a@example.com',
    css: '#email',
  },
  { label: 'Open the delivery dropdown', role: 'button', name: /delivery/i, css: '#dd-label' },
  { label: 'Choose express', role: 'button', name: /express/i, css: '#dd-list div:last-child' },
  { label: 'Check out', role: 'button', name: /checkout/i, css: '.btn-go' },
];

interface StepResult {
  label: string;
  locator: string;
  reachable: boolean;
}

async function runAgent(variant: Variant) {
  const context = await newContext(browser, variant);
  const page = await context.newPage();
  await page.goto(`${base}/shop.html`);
  await settle(page, variant);
  const results: StepResult[] = [];
  for (const step of STEPS) {
    const loc = page.getByRole(step.role, { name: step.name }).first();
    const reachable = (await loc.count()) > 0;
    const target = reachable ? loc : page.locator(step.css).first();
    if (step.fill !== undefined) await target.fill(step.fill);
    else await target.click();
    await page.waitForTimeout(150);
    await settle(page, variant);
    results.push({
      label: step.label,
      locator: `getByRole('${step.role}', { name: ${step.name} })`,
      reachable,
    });
  }
  const success = await page
    .getByRole('heading', { name: /order confirmed/i })
    .isVisible()
    .catch(() => false);
  await context.close();
  // Success counts only if the role locators did every step on their own.
  return {
    results,
    success: success && results.every((r) => r.reachable),
    completedWithAssist: success,
  };
}

const agent = {
  without: await runAgent('without'),
  with: await runAgent('with'),
};

// Optional: a small LLM loop over the aria snapshot.
async function runLlm(variant: Variant): Promise<{ success: boolean; steps: number }> {
  const client = new Anthropic();
  const context = await newContext(browser, variant);
  const page = await context.newPage();
  await page.goto(`${base}/shop.html`);
  await settle(page, variant);
  const task =
    'Buy the steel kettle: search for it, add it to the basket, open the basket, enter the email a@example.com, choose Express delivery and check out. Finish when the page says the order is confirmed. You see only an accessibility snapshot and act with getByRole(role, name).';
  const messages: Anthropic.Messages.MessageParam[] = [];
  let steps = 0;
  for (; steps < 15; steps++) {
    const snapshot = await page.locator('body').ariaSnapshot();
    messages.push({
      role: 'user',
      content: `${steps === 0 ? task + '\n\n' : ''}Page:\n${snapshot}`,
    });
    const res = await client.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 1000,
      messages,
      tools: [
        {
          name: 'act',
          description: 'Click or fill one element, located by ARIA role and accessible name.',
          input_schema: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['click', 'fill', 'done'] },
              role: { type: 'string' },
              name: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['action'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'act' },
    });
    messages.push({ role: 'assistant', content: res.content });
    const use = res.content.find((c) => c.type === 'tool_use');
    const input = (use?.type === 'tool_use' ? use.input : {}) as Record<string, string>;
    if (!use || input.action === 'done') break;
    let note = 'ok';
    try {
      const loc = page.getByRole(input.role as 'button', { name: input.name, exact: true }).first();
      if (input.action === 'fill') await loc.fill(input.value ?? '', { timeout: 3000 });
      else await loc.click({ timeout: 3000 });
      await page.waitForTimeout(150);
      await settle(page, variant);
    } catch {
      note = 'No such element in the accessibility tree.';
    }
    // The tool result must come first in the next user turn.
    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: use.id, content: note }],
    });
    if (
      await page
        .getByRole('heading', { name: /order confirmed/i })
        .isVisible()
        .catch(() => false)
    ) {
      steps++;
      break;
    }
  }
  const success = await page
    .getByRole('heading', { name: /order confirmed/i })
    .isVisible()
    .catch(() => false);
  await context.close();
  return { success, steps };
}

let llm: Record<Variant, { success: boolean; steps: number }> | undefined;
if (process.env.ANTHROPIC_API_KEY) {
  try {
    llm = { without: await runLlm('without'), with: await runLlm('with') };
  } catch (error) {
    console.error('LLM loop failed:', (error as Error).message.slice(0, 200));
  }
}

// ---- 4: real public sites (read-only) --------------------------------------

const SITES = ['https://www.berkshirehathaway.com/', 'https://news.ycombinator.com/'];
const siteResults: Record<
  string,
  | {
      metrics: Record<Variant, Metrics>;
      changes: number;
      issues: number;
      pixels?: PageResult['pixels'];
    }
  | string
> = {};
for (const url of SITES) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  try {
    const metrics = {} as Record<Variant, Metrics>;
    let changes = 0;
    let issues = 0;
    const shots = {} as Record<Variant, Buffer>;
    for (const variant of variants) {
      const context = await newContext(browser, variant);
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await settle(page, variant);
      const yaml = await page.locator('body').ariaSnapshot({ timeout: 20000 });
      metrics[variant] = snapshotMetrics(yaml, await countDomInteractive(page));
      writeFileSync(
        join(resultsDir, 'snapshots', `site-${host}.${variant}.yaml`),
        yaml.slice(0, 60000) + '\n'
      );
      if (variant === 'with') {
        const report = await waoReport(page);
        changes = report.changes.length;
        issues = report.issues.length;
      }
      shots[variant] = await page.screenshot({ fullPage: false });
      await context.close();
    }
    siteResults[url] = {
      metrics,
      changes,
      issues,
      pixels: await pixelDiff(browser, shots.without, shots.with),
    };
  } catch (error) {
    siteResults[url] = `skipped: ${(error as Error).message.split('\n')[0]}`;
  }
}

await browser.close();
server.close();

// ---- summary ---------------------------------------------------------------

const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
const out: string[] = ['# WAO with/without comparison', ''];
out.push('Chromium, Playwright `ariaSnapshot()`. Tokens are characters / 4.', '');
out.push('## Snapshots', '');
out.push(
  row([
    'Page',
    'Variant',
    'Chars',
    'Tokens',
    'Interactive in tree',
    'Named',
    'Unnamed',
    'Interactive in DOM',
    'Landmarks',
  ]),
  row(Array(9).fill('---'))
);
const addRows = (label: string, m: Record<Variant, Metrics>) => {
  for (const v of variants) {
    const x = m[v];
    out.push(
      row([
        label,
        v,
        x.chars,
        x.tokens,
        x.interactive,
        x.named,
        x.unnamed,
        x.domInteractive,
        x.landmarks.join(' ') || 'none',
      ])
    );
  }
};
for (const name of pages) addRows(`${name}.html`, pageResults[name].metrics);
out.push('', '## Visual identity (full-page screenshot, pixel diff)', '');
out.push(
  row(['Page', 'Same size', 'Differing pixels', 'Total pixels']),
  row(['---', '---', '---', '---'])
);
for (const name of pages) {
  const p = pageResults[name].pixels;
  out.push(row([`${name}.html`, p.sameSize ? 'yes' : 'no', p.differing, p.total]));
}
out.push('', '## Role-only agent', '');
out.push(
  'Locators are `getByRole(role, { name })` only. A step that cannot be reached by role is run by CSS so the rest can be measured, and counts as a failure.',
  ''
);
out.push(row(['Step', 'Without WAO', 'With WAO']), row(['---', '---', '---']));
STEPS.forEach((s, i) => {
  const f = (v: Variant) => (agent[v].results[i].reachable ? 'reachable' : 'MISSING');
  out.push(row([s.label, f('without'), f('with')]));
});
const reached = (v: Variant) => agent[v].results.filter((r) => r.reachable).length;
out.push(
  row([
    '**Steps reachable**',
    `${reached('without')}/${STEPS.length}`,
    `${reached('with')}/${STEPS.length}`,
  ]),
  row([
    '**Task success (role locators only)**',
    String(agent.without.success),
    String(agent.with.success),
  ]),
  row([
    'Task completed with CSS assists',
    String(agent.without.completedWithAssist),
    String(agent.with.completedWithAssist),
  ])
);
out.push('', '## LLM loop (claude-sonnet-5-5, max 15 steps)', '');
out.push(
  llm
    ? `Without WAO: success ${llm.without.success} in ${llm.without.steps} steps. With WAO: success ${llm.with.success} in ${llm.with.steps} steps.`
    : 'Skipped: ANTHROPIC_API_KEY is not set.'
);
out.push('', '## WAO report on the fixture shop', '');
out.push('```json', JSON.stringify(pageResults.shop.report, null, 2), '```', '');
out.push('## Real sites (load and snapshot only)', '');
out.push(
  row([
    'Site',
    'Variant',
    'Chars',
    'Tokens',
    'Interactive',
    'Named',
    'Unnamed',
    'DOM interactive',
    'WAO changes',
    'WAO issues',
    'Differing pixels (viewport)',
  ]),
  row(Array(11).fill('---'))
);
for (const [url, r] of Object.entries(siteResults)) {
  if (typeof r === 'string') {
    out.push(row([url, r, '', '', '', '', '', '', '', '', '']));
    continue;
  }
  for (const v of variants) {
    const x = r.metrics[v];
    out.push(
      row([
        url,
        v,
        x.chars,
        x.tokens,
        x.interactive,
        x.named,
        x.unnamed,
        x.domInteractive,
        v === 'with' ? r.changes : '',
        v === 'with' ? r.issues : '',
        v === 'with' ? (r.pixels?.differing ?? '') : '',
      ])
    );
  }
}
out.push('', 'Live sites change and animate, so a few differing pixels there are not WAO.', '');
writeFileSync(join(resultsDir, 'summary.md'), out.join('\n'));
console.log(out.join('\n'));
