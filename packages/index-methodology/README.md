# @stunt-double/index-methodology

How the [Stunt Double Index](https://index.stuntdouble.io) scores a website for AI agents, as code: the eight categories and their weights, the probe and session blend, the published curve and bands, every agent task and rubric, the agents' prompts, and the grader's prompt and reply schema. The Index computes its published scores with this package, so you can recompute any score, see exactly what an agent was asked, and propose a change.

Read [METHODOLOGY.md](./METHODOLOGY.md) for the method in prose.

```sh
pnpm add @stunt-double/index-methodology
```

Releases are on GitHub Packages: the project `.npmrc` needs `@stunt-double:registry=https://npm.pkg.github.com` and a token with `read:packages`.

## Recompute a score

```ts
import {
  blendRawScore,
  curveScore,
  scoreBand,
  weightedOverallScore,
} from '@stunt-double/index-methodology';

// One category: 70 raw points from the quick checks, 55 from agent sessions.
const discovery = curveScore(blendRawScore(70, 55)); // 0.4 x 70 + 0.6 x 55 = 61, published as 80.1

// The overall, from each category's published score.
const overall = weightedOverallScore([
  { category: 'discovery', score: discovery },
  { category: 'delegated-access', score: 0, applicable: false }, // no sign-in: left out
  // ...
]);
scoreBand(overall); // 'excellent' | 'good' | 'ok' | 'poor' | 'critical'
```

## Run the quick checks on a site

```sh
npx @stunt-double/index-methodology probe example.com
```

This runs the probe the Index runs, over plain HTTP, and prints every check with its pass or fail and evidence. Add `--json` for the full report. Agent sessions and the Is Agentic and agent search lookups are not run here: they need a browser and keys the Index holds.

From code, the probe is `@stunt-double/index-methodology/probe`:

```ts
import { runProbe } from '@stunt-double/index-methodology/probe';

const report = await runProbe('example.com'); // categories, findings, frictions, providers
```

The probe sends one identifying user agent (`StuntDoubleIndex`, linked to the methodology) and honours robots.txt and `X-Robots-Tag` opt-outs. A caller that holds a Web Bot Auth signing key can add signatures with `setRequestHeaders`. The Is Agentic and agent search reads take keys, so a caller passes their results in through `lookups`.

## Tasks and grading

```ts
import {
  buildRubricPrompt,
  getTasksForSector,
  INDEX_AGENT_PROMPT,
  INDEX_GRADER_PROMPT,
  interpolatePrompt,
  summariseTranscript,
} from '@stunt-double/index-methodology';

const [research] = getTasksForSector('saas');
const task = interpolatePrompt(research.prompt, 'example.com'); // the agent's first message

// After the session: what the grader is sent, one call per graded category.
const prompt = buildRubricPrompt({
  taskRubric: research.grades[0].rubric,
  transcriptSummary: summariseTranscript(steps),
  finalOutput,
});
```

The grader's reply is validated with `rubricSchema` from `@stunt-double/index-methodology/rubric-schema`, the one entry point that needs `zod` (an optional peer dependency).

## Fix prompts and leverage

`@stunt-double/index-methodology/fix-prompt` turns a report's failing checks into a Markdown brief for a coding agent. `@stunt-double/index-methodology/leverage` says which category, lifted to its next band, would move the overall most.

## Contributing

Changes to how a score is computed (a weight, a task, a rubric, the blend, the curve) need an issue first: they change what every published score means. Such a change lands as a new entry in `SCORING_VERSIONS`, and a changed task gets a new id (`-v1` to `-v2`). See [CONTRIBUTING.md](../../CONTRIBUTING.md).

The licence covers this code and text, not the Stunt Double Index name: an index built on this package is welcome, under its own name.

## Licence

[Apache-2.0](./LICENSE)
