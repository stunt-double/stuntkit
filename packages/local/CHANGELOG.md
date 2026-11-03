# stuntdouble

## 0.2.0

### Minor Changes

- [#47](https://github.com/stunt-double/stuntkit/pull/47) [`9b3e69b`](https://github.com/stunt-double/stuntkit/commit/9b3e69bba0d9b0073295a9d56e126f83c7ee55a0) Thanks [@mrprkr](https://github.com/mrprkr)! - Stunt Double Studio: `npx stuntdouble studio` opens a local app for a project. Create and edit actors and checklists in forms checked by the same schemas a run reads them with, run a checklist with an AI actor in a local Chrome, watch it live, stop it and review the verdicts.
  
  - Studio runs use only a connection you configure: an Anthropic API key, or an OpenAI-compatible endpoint such as OpenAI, OpenRouter, Ollama or LM Studio. Never a Claude subscription. Keys stay in `~/.stuntdouble/credentials.json` (mode 0600) and never reach the page.
  - A Studio run reuses the MCP run end to end (brief, browser tools, `evaluate_check`, `finish_run`, scoring), so it writes the same files. It stops at a step and token limit, shows calls, tokens and cost where known, and honours Stop. `run.json`'s `runner` gains optional `model` and `usage`.
  - Signed in to Stunt Double (OAuth with PKCE against the hosted MCP), a checklist also runs in the cloud: Studio pushes the files, writes the cloud ids back, runs it and pulls the result back beside the local runs.
  - New commands: `stuntdouble studio [dir]` (the default in a terminal), `run <checklist> [--cloud]`, `login` and `logout`. `mcp`, `view` and `doctor` are unchanged, and inside Claude Code nothing calls a model.

## 0.1.3

### Patch Changes

- [#44](https://github.com/stunt-double/stuntkit/pull/44) [`e778ec4`](https://github.com/stunt-double/stuntkit/commit/e778ec469c946189368bc54348cf1fb9728d0b46) Thanks [@mrprkr](https://github.com/mrprkr)! - Clearer outcomes and a quieter viewer for Stunt Double Local.
  
  - `finish_run` always gives the checks passed, and a checklist with no weighted checks now says it has no score and passes only when every pass/fail check passes (and that its `pass_threshold` applies to weighted checks only). `start_run` warns about an unused `pass_threshold` up front, and the viewer's score card says the same.
  - A new read-only `doctor` tool returns the same lines as `npx stuntdouble doctor`, so an agent can run it without a shell. While the viewer runs, it reports the viewer's port. Its billing line no longer claims to know how Claude Code bills.
  - `open_ui` returns a line on each of the latest runs beside the link. A second `finish_run` or a late `evaluate_check` says the run has already finished and where its report is.
  - `start_run` no longer returns the start page's title, and the actor's description no longer ends in a doubled full stop. The brief steers the actor to `read_page` and `find` before the long page reads.
  - Safety: pages with no host (`about:blank`, `data:`, `blob:`) get the third-party guard, kept logins are kept per project in `~/.stuntdouble/profiles/<project>/<actor>`, a run counts as live only with its marker in `.live/running/`, so a reused pid no longer holds an old run open, and a locked kept profile says another run is using it.
  - A hung page can no longer hold `evaluate_check`; a missing checklist lists the ones that exist; a file that cannot be read says why rather than "file not found"; an older Node is refused at start with the version needed; a run pulled back from the cloud with no `started_at` reads.
  - Viewer: one outcome marker per finished run, no blank thumbnails on collapsed rows, the actor's name, "Copy cloud command", plain-language activity with page reads folded away, a duration that leaves out the gap before a resume, an "Earlier" mark on verdicts from before it, verdicts shown about 250ms sooner, the live frame fetched once per new frame, a lighter runs list, a run read on its own, and no favicon error.
