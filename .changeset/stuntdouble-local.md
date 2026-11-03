---
'stuntdouble': minor
---

First release of `stuntdouble`, Stunt Double Local: an MCP server that gives your own coding agent session a local Chrome and the run tools (`start_run`, `evaluate_check`, `finish_run`, `open_ui`), keeps every run as files in `.stuntdouble/`, scores runs with the same code as the Stunt Double cloud, and serves a local viewer with live updates and Stop. It makes no model calls of its own. `npx stuntdouble view` opens the viewer without an agent, and `npx stuntdouble doctor` checks the setup.
