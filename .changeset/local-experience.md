---
'stuntdouble': patch
---

Clearer outcomes and a quieter viewer for Stunt Double Local.

- `finish_run` always gives the checks passed, and a checklist with no weighted checks now says it has no score and passes only when every pass/fail check passes (and that its `pass_threshold` applies to weighted checks only). `start_run` warns about an unused `pass_threshold` up front, and the viewer's score card says the same.
- A new read-only `doctor` tool returns the same lines as `npx stuntdouble doctor`, so an agent can run it without a shell. While the viewer runs, it reports the viewer's port. Its billing line no longer claims to know how Claude Code bills.
- `open_ui` returns a line on each of the latest runs beside the link. A second `finish_run` or a late `evaluate_check` says the run has already finished and where its report is.
- `start_run` no longer returns the start page's title, and the actor's description no longer ends in a doubled full stop. The brief steers the actor to `read_page` and `find` before the long page reads.
- Safety: pages with no host (`about:blank`, `data:`, `blob:`) get the third-party guard, kept logins are kept per project in `~/.stuntdouble/profiles/<project>/<actor>`, a run counts as live only with its marker in `.live/running/`, so a reused pid no longer holds an old run open, and a locked kept profile says another run is using it.
- A hung page can no longer hold `evaluate_check`; a missing checklist lists the ones that exist; a file that cannot be read says why rather than "file not found"; an older Node is refused at start with the version needed; a run pulled back from the cloud with no `started_at` reads.
- Viewer: one outcome marker per finished run, no blank thumbnails on collapsed rows, the actor's name, "Copy cloud command", plain-language activity with page reads folded away, a duration that leaves out the gap before a resume, an "Earlier" mark on verdicts from before it, verdicts shown about 250ms sooner, the live frame fetched once per new frame, a lighter runs list, a run read on its own, and no favicon error.
