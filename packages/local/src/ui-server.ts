// The local viewer: one HTML page over the files in `.stuntdouble/`, with live
// updates while a run is going and a Stop button.
//
// It listens on loopback only, and still trusts nothing that can reach
// loopback: a page in the person's browser can, and so can a DNS rebinding
// attack. So every request must name this server in its Host header, and
// everything but the identity probe needs the per-start key, which the printed
// link carries once and an HttpOnly, SameSite=Strict cookie carries after
// that. No CORS headers are ever sent, and files are served from inside
// `.stuntdouble/` only.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, extname, join, resolve, sep } from 'node:path';

import {
  ActorSchema,
  ChecklistSchema,
  effectiveStatus,
  readJson,
  readRun,
  readRuns,
  tallyRun,
  writeFileAtomic,
  type Run,
} from './files.ts';

export const FIRST_PORT = 4747;
const PORT_TRIES = 20;

/**
 * What the Studio adds to the viewer (studio.ts). The viewer alone has none of
 * it: inside Claude Code it reads files and offers Stop, nothing more.
 */
export type UiExtension = {
  /** Paths beyond the viewer's own that serve the page. */
  pages: RegExp;
  /** A script the page loads after its own, served by `handle`. */
  script: string;
  /** A signed-in request the viewer does not answer. Resolves false for a 404. */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
  /**
   * `/oauth/callback`, which a cross-site redirect reaches without the
   * SameSite=Strict cookie: it proves itself with the OAuth state instead.
   */
  oauthCallback(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void>;
};

export type UiServer = {
  port: number;
  token: string;
  /** An address that signs the browser in, opening at `path`. */
  link(path?: string): string;
  close(): Promise<void>;
};

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.json': 'application/json',
  '.jsonl': 'text/plain; charset=utf-8',
};

const PAGE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; form-action 'none'",
};

export function send(
  res: ServerResponse,
  status: number,
  body: string | Uint8Array,
  type = 'text/plain; charset=utf-8',
  headers: Record<string, string> = {}
): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(body);
}

const json = (res: ServerResponse, data: unknown) =>
  send(res, 200, JSON.stringify(data), 'application/json');

function sameSecret(given: string, token: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

/** The real path of `rel` under `root`, or null when it would leave it (`..`, a symlink). */
async function confined(root: string, rel: string): Promise<string | null> {
  try {
    const realRoot = await realpath(root);
    const real = await realpath(resolve(root, rel));
    return real.startsWith(realRoot + sep) ? real : null;
  } catch {
    return null;
  }
}

async function definitions(root: string, folder: 'checklists' | 'actors') {
  const schema = folder === 'checklists' ? ChecklistSchema : ActorSchema;
  const names = await readdir(join(root, folder)).catch(() => [] as string[]);
  return Promise.all(
    names
      .filter((n) => n.endsWith('.json'))
      .sort()
      .map(async (name) => {
        const slug = basename(name, '.json');
        try {
          return { slug, data: await readJson(join(root, folder, name), schema, name) };
        } catch (err) {
          return { slug, error: (err as Error).message };
        }
      })
  );
}

/** Actor slugs to the names people gave them, for labels. */
async function actorNames(root: string): Promise<Map<string, string>> {
  const actors = await definitions(root, 'actors');
  return new Map(actors.flatMap((a) => ('data' in a && a.data ? [[a.slug, a.data.name]] : [])));
}

/** What the runs list shows of a run: not its snapshot or its results. */
function runSummary(root: string, run: Run, names: Map<string, string>) {
  const { checklist_snapshot, results: _results, ...rest } = run;
  return {
    ...rest,
    status: effectiveStatus(root, run),
    actor_name: names.get(run.actor) ?? null,
    checklist_name: typeof checklist_snapshot.name === 'string' ? checklist_snapshot.name : null,
    tally: tallyRun(run),
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error('Body too large');
  }
  return body;
}

export async function startUi(options: {
  root: string;
  port?: number;
  extension?: UiExtension;
}): Promise<UiServer> {
  const extension = options.extension;
  const root = resolve(options.root);
  const token = randomBytes(24).toString('base64url');
  const clients = new Set<ServerResponse>();
  let port = 0;
  let ensureWatch = () => {};

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = req.headers.host ?? '';
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      return send(res, 403, 'Forbidden');
    }
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (url.pathname === '/__stuntdouble') return json(res, { stuntdouble: true });
    // Browsers ask for it unprompted; there is none, and that is not an error.
    if (url.pathname === '/favicon.ico') return send(res, 204, '');
    if (extension && url.pathname === '/oauth/callback' && req.method === 'GET') {
      return extension.oauthCallback(req, res, url);
    }

    // Cookies are per host, not per port, so each server names its own.
    const cookieName = `stuntdouble_${port}`;
    const key = url.searchParams.get('t');
    if (key !== null) {
      if (!sameSecret(key, token)) return send(res, 403, 'This link is out of date.');
      url.searchParams.delete('t');
      return send(res, 302, '', undefined, {
        Location: `${url.pathname}${url.search}`,
        'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`,
      });
    }
    const signedIn = cookie(req, cookieName);
    if (!signedIn || !sameSecret(signedIn, token)) {
      return send(
        res,
        403,
        'Open the viewer from the link Stunt Double printed: it carries the key.'
      );
    }

    const path = url.pathname;
    if (req.method === 'POST' && path === '/api/stop') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${host}`) return send(res, 403, 'Forbidden');
      const { run } = JSON.parse(await readBody(req)) as { run?: unknown };
      const entry = typeof run === 'string' ? await readRun(root, run) : null;
      if (!entry || !('run' in entry) || effectiveStatus(root, entry.run) !== 'running') {
        return send(res, 409, 'That run is not going.');
      }
      await writeFileAtomic(join(root, '.live', 'stop'), entry.id);
      return send(res, 204, '');
    }
    if (extension && (await extension.handle(req, res, url))) return;
    if (req.method !== 'GET') return send(res, 405, 'Method not allowed');

    if (
      path === '/' ||
      path === '/definitions' ||
      /^\/runs\/[^/]+$/.test(path) ||
      extension?.pages.test(path)
    ) {
      let page = await readFile(new URL('./ui.html', import.meta.url), 'utf8');
      if (extension) {
        page = page.replace('</body>', `<script src="${extension.script}"></script>\n  </body>`);
      }
      return send(res, 200, page, 'text/html; charset=utf-8', PAGE_HEADERS);
    }
    if (path === '/api/runs') {
      const [runs, names] = await Promise.all([readRuns(root), actorNames(root)]);
      return json(
        res,
        runs.map((e) => ('run' in e ? runSummary(root, e.run, names) : e))
      );
    }
    const runMatch = path.match(/^\/api\/runs\/([^/]+)$/);
    if (runMatch) {
      const id = decodeURIComponent(runMatch[1]!);
      const entry = await readRun(root, id);
      if (!entry) return send(res, 404, 'No such run');
      const activity = await readFile(join(root, 'runs', entry.id, 'activity.jsonl'), 'utf8')
        .then((text) =>
          text
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        )
        .catch(() => []);
      const stop = await readFile(join(root, '.live', 'stop'), 'utf8').catch(() => '');
      const names = 'run' in entry ? await actorNames(root) : new Map<string, string>();
      return json(res, {
        ...entry,
        ...('run' in entry
          ? {
              run: {
                ...entry.run,
                status: effectiveStatus(root, entry.run),
                actor_name: names.get(entry.run.actor) ?? null,
              },
            }
          : {}),
        activity,
        stop_requested: stop.trim() === entry.id,
      });
    }
    if (path === '/api/definitions') {
      return json(res, {
        checklists: await definitions(root, 'checklists'),
        actors: await definitions(root, 'actors'),
      });
    }
    if (path === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.write(': connected\n\n');
      ensureWatch();
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (path.startsWith('/files/')) {
      const rel = decodeURIComponent(path.slice('/files/'.length));
      const file = await confined(root, rel);
      if (!file) return send(res, 403, 'Outside .stuntdouble/');
      const type = TYPES[extname(file)];
      if (!type) return send(res, 404, 'Not found');
      // A verdict's screenshot never changes once written; the live frame does.
      const cache = rel.includes('/shots/') ? 'private, max-age=86400' : 'no-store';
      return send(res, 200, await readFile(file), type, { 'Cache-Control': cache });
    }
    return send(res, 404, 'Not found');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (res.headersSent) res.end();
      else send(res, 500, 'Something went wrong reading .stuntdouble/');
    });
  });

  const first = options.port ?? FIRST_PORT;
  for (let candidate = first; ; candidate++) {
    try {
      await new Promise<void>((ok, fail) => {
        server.once('error', fail);
        server.listen(candidate, '127.0.0.1', () => {
          server.off('error', fail);
          ok();
        });
      });
      break;
    } catch (err) {
      const busy = (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
      if (!busy || candidate >= first + PORT_TRIES) throw err;
    }
  }
  port = (server.address() as AddressInfo).port;

  // Every change under .stuntdouble/ is announced, and the page refetches what
  // it shows. This works the same whether the run is in this process or not.
  let watcher: FSWatcher | null = null;
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Tried again on each new page: the Studio creates .stuntdouble/ after starting.
  ensureWatch = () => {
    if (watcher) return;
    try {
      watcher = watch(root, { recursive: true }, (_event, name) => {
        if (!name || name.endsWith('.tmp')) return;
        pending.add(String(name).split(sep).join('/'));
        timer ??= setTimeout(() => {
          const data = `data: ${JSON.stringify({ paths: [...pending] })}\n\n`;
          for (const client of clients) client.write(data);
          pending = new Set();
          timer = undefined;
        }, 150);
      });
    } catch {
      // No .stuntdouble/ yet: the viewer shows the empty state without live updates.
    }
  };
  ensureWatch();

  return {
    port,
    token,
    link: (path = '/') => `http://127.0.0.1:${port}${path}?t=${token}`,
    close: async () => {
      watcher?.close();
      clearTimeout(timer);
      for (const client of clients) client.end();
      server.closeAllConnections();
      await new Promise<void>((ok) => server.close(() => ok()));
    },
  };
}
