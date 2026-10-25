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

## Contributing

Changes to how a score is computed (a weight, a task, a rubric, the blend, the curve) need an issue first: they change what every published score means. Such a change lands as a new entry in `SCORING_VERSIONS`, and a changed task gets a new id (`-v1` to `-v2`). See [CONTRIBUTING.md](../../CONTRIBUTING.md).

The licence covers this code and text, not the Stunt Double Index name: an index built on this package is welcome, under its own name.

## Licence

[Apache-2.0](./LICENSE)
