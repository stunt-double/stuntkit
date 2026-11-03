// The Studio's secrets: the person's own model connection and their Stunt
// Double sign-in, in `~/.stuntdouble/credentials.json` (mode 0600), never in
// the project's `.stuntdouble/`, never in a log and never sent to the page.
//
// Policy line: a standalone run uses only a connection the person configures,
// an Anthropic API key or an OpenAI-compatible endpoint. Nothing here reads a
// Claude subscription, `~/.claude` or Claude Code's credentials. Only the
// Studio (studio.ts, cli.ts) imports this module; the MCP server never does
// (test/no-model.test.ts).

import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export const PROVIDERS = ['anthropic', 'openai'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5',
};
export const DEFAULT_BASE_URLS: Record<Provider, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
};
/** The environment variable each provider's key may come from instead. */
const KEY_ENV: Record<Provider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

const ConnectionSchema = z.object({
  provider: z.enum(PROVIDERS),
  model: z.string().min(1).max(200),
  base_url: z.url({ protocol: /^https?$/ }).nullish(),
  api_key: z.string().max(500).nullish(),
});
export type StoredConnection = z.infer<typeof ConnectionSchema>;

const CredentialsSchema = z
  .object({
    connection: ConnectionSchema.optional(),
    cloud: z
      .object({
        server: z.string(),
        client: z.record(z.string(), z.unknown()).optional(),
        tokens: z.record(z.string(), z.unknown()).optional(),
        workspace: z.object({ id: z.string(), slug: z.string(), name: z.string() }).nullish(),
      })
      .optional(),
  })
  .loose();
export type Credentials = z.infer<typeof CredentialsSchema>;

export const stuntdoubleHome = (): string =>
  process.env.STUNTDOUBLE_HOME || join(homedir(), '.stuntdouble');
const credentialsFile = () => join(stuntdoubleHome(), 'credentials.json');

export async function readCredentials(): Promise<Credentials> {
  const raw = await readFile(credentialsFile(), 'utf8').catch(() => null);
  if (!raw) return {};
  try {
    const parsed = CredentialsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** Written whole, 0600 from the start, in a 0700 folder. */
export async function writeCredentials(credentials: Credentials): Promise<void> {
  const home = stuntdoubleHome();
  await mkdir(home, { recursive: true, mode: 0o700 });
  const file = credentialsFile();
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, file);
  await chmod(file, 0o600);
}

export async function updateCredentials(
  change: (current: Credentials) => Credentials
): Promise<Credentials> {
  const next = change(await readCredentials());
  await writeCredentials(next);
  return next;
}

export async function forgetCredentials(): Promise<void> {
  await rm(credentialsFile(), { force: true });
}

/** A connection ready to call, key included. Never leaves this process. */
export type Connection = {
  provider: Provider;
  model: string;
  baseUrl: string;
  apiKey: string | null;
  keySource: 'stored' | 'env' | 'none';
};

/**
 * The connection a run uses: the stored one, its key from the file or else the
 * provider's environment variable. With nothing stored, an `ANTHROPIC_API_KEY`
 * in the environment is enough on its own.
 */
export async function resolveConnection(): Promise<Connection | null> {
  const stored = (await readCredentials()).connection;
  const provider: Provider | null =
    stored?.provider ?? (process.env.ANTHROPIC_API_KEY ? 'anthropic' : null);
  if (!provider) return null;
  const envKey =
    provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env[KEY_ENV.openai];
  const apiKey = stored?.api_key || envKey || null;
  return {
    provider,
    model: stored?.model ?? DEFAULT_MODELS[provider],
    baseUrl: (stored?.base_url || DEFAULT_BASE_URLS[provider]).replace(/\/+$/, ''),
    apiKey,
    keySource: stored?.api_key ? 'stored' : envKey ? 'env' : 'none',
  };
}

/** What the page may know: whether a key is set and where from, never the key. */
export async function connectionStatus() {
  const c = await resolveConnection();
  if (!c) return { configured: false as const };
  return {
    configured: true as const,
    provider: c.provider,
    model: c.model,
    base_url: c.baseUrl,
    key: c.keySource,
    key_env: KEY_ENV[c.provider],
  };
}

/** Save the connection. An empty `api_key` keeps the stored one; `clear_key` drops it. */
export async function saveConnection(input: {
  provider: Provider;
  model: string;
  base_url?: string | null;
  api_key?: string | null;
  clear_key?: boolean;
}): Promise<void> {
  await updateCredentials((current) => {
    const keep =
      current.connection?.provider === input.provider ? current.connection.api_key : null;
    const connection = ConnectionSchema.parse({
      provider: input.provider,
      model: input.model.trim(),
      base_url: input.base_url?.trim() || null,
      api_key: input.clear_key ? null : input.api_key?.trim() || keep || null,
    });
    return { ...current, connection };
  });
}
