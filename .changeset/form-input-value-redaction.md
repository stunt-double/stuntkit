---
'@stunt-double/browser-toolset': patch
---

`form_input` results no longer repeat the value that was set: a text field reports its length (`Set ref_4 (12 characters)`) and a missing select option no longer quotes the value. Results are recorded in transcripts and run logs, and the value can be a password or a one-time code. The model still sends the value as before.
