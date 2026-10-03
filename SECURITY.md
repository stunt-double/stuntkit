# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately, either:

- through [GitHub's private vulnerability reporting](https://github.com/stunt-double/backlot/security/advisories/new), or
- by email to security@stuntdouble.io.

Include the package and version, what an attacker can do, and steps or code to reproduce it. We will acknowledge your report within three working days, keep you updated as we investigate, and credit you in the advisory unless you would rather we did not.

## Supported versions

Fixes land in the latest published minor version of each package. Pre-1.0 packages get fixes only in their latest release.

## Scope

In scope: the published packages in this repository, including bypasses of `@stdbl/browser-toolset`'s safety guards (`BrowserSafetyOptions`) and navigation checks (`isPrivateHost`, `checkNavigation`) by content a page can control.

The guards read the DOM the page shows, and are documented as a strong default rather than a sandbox, so a report is most useful when it shows a realistic page getting past them.
