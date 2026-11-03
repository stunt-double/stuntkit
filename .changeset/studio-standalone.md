---
'stuntdouble': minor
---

Stunt Double Studio: `npx stuntdouble studio` opens a local app for a project. Create and edit actors and checklists in forms checked by the same schemas a run reads them with, run a checklist with an AI actor in a local Chrome, watch it live, stop it and review the verdicts.

- Studio runs use only a connection you configure: an Anthropic API key, or an OpenAI-compatible endpoint such as OpenAI, OpenRouter, Ollama or LM Studio. Never a Claude subscription. Keys stay in `~/.stuntdouble/credentials.json` (mode 0600) and never reach the page.
- A Studio run reuses the MCP run end to end (brief, browser tools, `evaluate_check`, `finish_run`, scoring), so it writes the same files. It stops at a step and token limit, shows calls, tokens and cost where known, and honours Stop. `run.json`'s `runner` gains optional `model` and `usage`.
- Signed in to Stunt Double (OAuth with PKCE against the hosted MCP), a checklist also runs in the cloud: Studio pushes the files, writes the cloud ids back, runs it and pulls the result back beside the local runs.
- New commands: `stuntdouble studio [dir]` (the default in a terminal), `run <checklist> [--cloud]`, `login` and `logout`. `mcp`, `view` and `doctor` are unchanged, and inside Claude Code nothing calls a model.
