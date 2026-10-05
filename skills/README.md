# Skills

[Agent Skills](https://agentskills.io) for the StuntKit packages. Each one teaches a coding agent when to reach for a package, how to wire it up, and the mistakes to avoid, so it gets the integration right the first time.

| Skill                                                                     | For                                                                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`stunt-double-wao`](./stunt-double-wao/SKILL.md)                         | Making sites work for agents, and injecting WAO into an agent's browser           |
| [`stunt-double-browser-toolset`](./stunt-double-browser-toolset/SKILL.md) | Browser agents on Anthropic's browser use toolset or any model's function calling |
| [`stunt-double-spelling`](./stunt-double-spelling/SKILL.md)               | American, British and Canadian spelling localisation                              |
| [`stunt-double-icons`](./stunt-double-icons/SKILL.md)                     | The Continuity icon pack in React, SVG and raw markup, and migrating from lucide  |

## Install

As a plugin from this repository's marketplace:

```sh
/plugin marketplace add stunt-double/stuntkit
/plugin install stuntkit@stuntkit
```

Any agent that reads Agent Skills (a `SKILL.md` per folder): copy the folders you want into your project's skills directory, or install them with a skills installer that reads GitHub repositories.

## Writing a skill

A skill belongs here when it helps someone use a published package. Skills for working on this repository are [project skills](../.claude/skills) instead.

- One folder per package, named `stunt-double-<package>`, holding a `SKILL.md` with `name` (matching the folder) and `description` frontmatter.
- The description says when to use the skill, in the words a developer would use for the task, not just the package name.
- Lead with the decision (which entry point or surface), then the code, then the mistakes. Keep it under about 150 lines; link to the package README for the full API.
- Update the skill in the same pull request as the package change it describes, and bump `version` in the plugin manifest.
