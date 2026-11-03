# stuntdouble

Stunt Double Local: run [Stunt Double](https://stuntdouble.io) checklists in a Chrome on your own machine, from your own coding agent session, with every run kept as files in your project and a local viewer to watch and review them.

It is an MCP server and nothing more. Your agent session does all of the reasoning: it reads the actor's brief, drives the browser through the tools here and judges each check. This package drives the browser, checks that a passed verdict cites something on the page, scores the run with the same code as the Stunt Double cloud, and writes the files. It never calls a model, never starts an agent, and never reads an agent's credentials (a test fails the build if it tries), so a local run uses whatever account your agent is signed in with, and nothing else.

Most people use it through the Stunt Double plugin for Claude Code, which starts it for you: `/stuntdouble setup`, then `/stuntdouble run <checklist>`.

## Commands

```sh
npx stuntdouble mcp          # the MCP server over stdio; your agent starts this
npx stuntdouble view [dir]   # the viewer over a project's .stuntdouble/, no agent needed
npx stuntdouble doctor       # Node, Chrome, the viewer port, the project, and how local runs are billed
```

To add it to another MCP client, run `npx -y stuntdouble mcp` with `STUNTDOUBLE_PROJECT_DIR` set to the project folder (the current directory otherwise).

Needs Node 22.18 or later and Google Chrome (or Playwright's Chromium, from `npx playwright install chromium`).

## Tools

| Tool                                                                                                           | What it does                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigate`, `read_page`, `find`, `get_page_text`, `click`, `type`, `form_input`, `key`, `scroll`, `screenshot` | The direct tools from [`@stunt-double/browser-toolset`](../browser-toolset). Screenshots go back to the model only from `screenshot`, unless `model_screenshots` is `every_action`.                                                   |
| `start_run`                                                                                                    | Validates the files (naming every field to fix), opens a fresh Chrome at the checklist's URL and returns the viewer link, the actor's brief and the checks. `resume` continues an interrupted run, or one still open in this session. |
| `evaluate_check`                                                                                               | Records one verdict. A pass must cite text or a selector that is on the page now. Scrolls the evidence into view and saves `shots/<check>.png`.                                                                                       |
| `finish_run`                                                                                                   | Settles the checks left, scores the run and closes the browser.                                                                                                                                                                       |
| `open_ui`                                                                                                      | The viewer's link, and a line on each of the five latest runs: checklist, status, outcome, checks passed and when it started.                                                                                                         |
| `doctor`                                                                                                       | Read only. The same lines as `npx stuntdouble doctor`, one per check (`ok`, `FAIL`, `note` or `--`), so an agent can run it without a shell. While the viewer runs, it reports the viewer's port rather than probing 4747.            |

## Files

Everything lives in `.stuntdouble/` in your project, and everything but `.live/` is meant to be committed:

```
.stuntdouble/
  stuntdouble.json          {"format": "stuntdouble/1", "local_base_url": "http://localhost:3000", "headless": false,
                             "model_screenshots": "on_request", "safety": "third_party"}
  actors/<slug>.json        name, description, system_prompt, knowledge, persist_login
  checklists/<slug>.json    name, actor, url, instructions, checks (each with a stable key), pass_threshold, ...
  runs/<stamp>-<checklist>/ run.json, activity.jsonl, shots/<check>.png
  .live/                    the viewer's address and key, the latest frame, the stop flag
```

Actors and checklists use the same fields, and the same limits, as the Stunt Double MCP server's `create_actor` and `create_checklist`, so the same files run in the cloud. The exception is `browser_config` (a preset, viewport, touch or locale), which the cloud inputs do not take yet, so a cloud run uses the default desktop browser. A local run swaps the checklist URL's origin for `local_base_url`, so one checklist covers `localhost` here and the public address there.

Local results are self-judged: the actor records its own verdicts. Cloud runs add a second judge.

A checklist with no `weighted` checks has no score: it passes only when every pass/fail check passes, and its `pass_threshold`, which applies to weighted checks only, is not used. `start_run` and `finish_run` say so, and the viewer shows the tally with the same sentence.

## Safety

- Every run gets a fresh Chrome profile, deleted afterwards. An actor with `persist_login` keeps its own profile in `~/.stuntdouble/profiles/<project>/<actor>` (the project as a short hash of its path, so two projects with the same actor name never share cookies), never yours.
- The browser reaches local and private addresses only for the app under test: the exact origins (scheme, host and port) of the checklist's URL and `local_base_url`. The rule holds however the browser gets there, by a link, a script, a popup, a frame or a redirect; a redirect's request is still sent, but the page is cleared before any tool reads it.
- With `safety` at `third_party` (the default), on any other host the tools refuse to pay, subscribe, create an account or type a password or card number. Set it to `off` when your app signs in on another domain.
- The viewer listens on `127.0.0.1` only (port 4747, or the next free one), answers only to its own Host header, needs the key from the printed link (kept as an HttpOnly, SameSite=Strict cookie), sends no CORS headers and serves files from `.stuntdouble/` only. Its one control is Stop.

## Licence

[Apache-2.0](./LICENSE), copyright 2026 Turnout Labs Ltd.
