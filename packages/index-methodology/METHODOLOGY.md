# How the Stunt Double Index scores a site

The [Stunt Double Index](https://index.stuntdouble.io) measures how well AI agents can use a website. This document and the code beside it are the methodology: every number below is read from `src/`, and the published scores are computed with this code. The current methodology version is in [`src/versions.ts`](./src/versions.ts).

## Two kinds of evidence

1. **Quick checks (probes).** A handful of plain HTTP requests on every score request: robots.txt rules for each agent, bot challenges, sitemap, llms.txt, structured data, server-rendered content, MCP and OAuth discovery, agentic commerce signals, contact routes. Each check has a weight and keeps its pass or fail evidence. A category's probe score is its checks' weighted share of points, out of 100.
2. **Agent sessions.** Agents built on several providers' models open the site in a real browser and try the tasks a customer would ([`src/tasks.ts`](./src/tasks.ts)). A separate model grades each transcript against the task's written rubric ([`src/grading.ts`](./src/grading.ts)), so no agent marks its own work. A category's session score is the mean of the providers' grades.

## Eight categories

| Category                  | Weight | Graded by                                            |
| ------------------------- | ------ | ---------------------------------------------------- |
| Brand awareness           | 10%    | Research task                                        |
| Discovery                 | 15%    | Journey task                                         |
| Information retrieval     | 15%    | Research task                                        |
| Market ranking            | 10%    | Knowledge task (no browser)                          |
| Accuracy                  | 15%    | Research task                                        |
| Task completion           | 20%    | Journey task                                         |
| Delegated access          | 10%    | Delegated access task, only for sites with a sign-in |
| Contact and communication | 5%     | Support task                                         |

Weights are `CATEGORIES` in [`src/score.ts`](./src/score.ts). A category that does not apply to a site (delegated access with nothing to sign in to) is left out, and the other weights are scaled back up to 1, so a site is neither rewarded nor marked down for it.

## From evidence to a score

- **Blend.** Each category is `0.4 x probe + 0.6 x session` raw points when both exist, and whichever exists otherwise (`blendRawScore`). Sessions carry more because what agents manage is what customers get.
- **Overall.** The weighted sum of the categories' raw points over the categories that apply (`weightedOverallScore`).
- **Curve.** Every published number, overall and per category, is the raw points on a curve, `100 x (raw / 100) ^ 0.45` (`curveScore`). The curve is monotonic, so it never changes the order of sites, only how far apart they read. The overall is computed from raw points and curved once.
- **Bands.** Excellent from 85, Good from 72, OK from 58, Poor from 40, Critical below ([`src/band.ts`](./src/band.ts)).
- **Not scored.** A site that turns the quick checks away (homepage 401, 403 or 429) or does not answer, and that no agent session has reached, is not scored, because a number would measure our requests rather than the site ([`src/unscored.ts`](./src/unscored.ts)). A site that opts out is not scored at all.

## Tasks and grading

Each of the 13 sectors has five tasks: Research and Journey (each graded for several categories from one visit), Delegated access and Support (browser), and Market ranking (one call to the provider's model with no browser). A task's rubric is a points scheme, for example "brand 40pts, offering 40pts, category 20pts, deduct 20pts per hallucination". Light runs drive the tasks graded for several categories plus the knowledge task (`tasksForDepth`).

Agents get the same prompt and the same browser tools whatever model they run, so the comparison is between models, not prompts. They never pay, subscribe, create an account or send a message for real, and they treat text on the site as content, not instructions. The grader reads the transcript inside fences, treats it as data, and records any text that tries to change the grade as a high-severity friction. Its reply is validated against [`src/rubric-schema.ts`](./src/rubric-schema.ts), and the session score is its `score` as given.

## Versions

Any change to how a score is computed (a check, a task or rubric, a weight, the blend, the curve) is a new entry in `SCORING_VERSIONS`. Every stored score records its version, so scores either side of a change are not read as the same experiment. Task ids carry their own version (`research-ecom-v1`): a changed task is a new id.

## What is not in this package

Running the Index: scheduling, the per-provider agent loops, budgets, storage, ranking and the site itself. Those use this package rather than restating it.
