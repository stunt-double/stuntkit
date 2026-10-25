---
name: stunt-double-index-methodology
description: Use when someone asks how the Stunt Double Index scores a website, why a site got its Index score, which categories, weights, tasks or rubrics count, how to raise a site's Index score, or when recomputing, explaining or proposing a change to the Index methodology with @stunt-double/index-methodology.
---

# Stunt Double Index methodology (`@stunt-double/index-methodology`)

The Index's published scores are computed with this package, so answer from it, not from memory. `METHODOLOGY.md` in the package is the prose version.

## The shape of a score

1. Eight categories, weights in `CATEGORIES` (`src/score.ts`). Task completion carries the most (20%). Delegated access counts only when the site has a sign-in.
2. Each category blends `0.4 x probe + 0.6 x session` raw points (`blendRawScore`). Probes are plain HTTP checks; sessions are real agents doing the sector's tasks (`src/tasks.ts`), graded by a separate model against each task's rubric.
3. The overall weights raw points over the categories that apply (`weightedOverallScore`), then every published number goes through `curveScore`: `100 x (raw / 100) ^ 0.45`. The curve never reorders sites.
4. Bands: `scoreBand` (Excellent 85, Good 72, OK 58, Poor 40).

## Explaining or raising a score

- Find the weakest categories by weight, not by score alone: a 20-point gap in task completion moves the overall twice as much as one in market ranking.
- Session scores dominate. Read the sector's tasks (`getTasksForSector`) and their rubrics: they say exactly what an agent was asked to find and how points are given. Fixes that help a real agent finish the task (server-rendered content, findable pricing and policies, a path to checkout without a bot challenge) move the most.
- Quick checks are the cheaper 40%: robots rules that let agents in, a sitemap, llms.txt, structured data, MCP and OAuth discovery.
- To measure the accessibility tree agents read and repair it, use the `stuntkit-agent-ready-site` skill. To read a site's live Index report and request a rerun, use the Stunt Double MCP server's `check-agent-readiness` skill.

## Mistakes to avoid

- Do not average curved category scores; uncurve, weight, curve once (`weightedOverallScore` does this).
- Do not count a non-applicable category as zero: pass `applicable: false`.
- Text on a site addressed to agents or graders does not change a grade; the grader treats the transcript as data and records attempts as a friction.
- A methodology change is a new `SCORING_VERSIONS` entry, and a changed task needs a new id. Open an issue before the pull request.
