// Opens a link in the person's default browser, for `stuntdouble studio` and
// `stuntdouble login`. The one place this package starts a process: the
// platform's own opener, with the link as its only argument, nothing else
// (test/no-model.test.ts holds it to that).

import { spawn } from 'node:child_process';

export function openBrowser(url: string): void {
  if (!/^https?:\/\//.test(url)) return;
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // No opener: the link is printed as well.
  }
}
