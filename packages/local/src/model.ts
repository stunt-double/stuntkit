// The model client for standalone Studio runs: the Anthropic Messages API or
// any OpenAI-compatible chat completions endpoint (OpenAI, OpenRouter, Ollama,
// LM Studio), over plain fetch with the person's own key.
//
// Policy line: this is the only module that calls a model, and only the
// standalone runner (runner.ts) imports it. The MCP server (mcp.ts) never
// reaches it, so inside Claude Code the person's session stays the only model
// (test/no-model.test.ts). It never uses a Claude subscription: no claude.ai
// OAuth, no Claude Code credentials, no `claude` process, no Agent SDK.
//
// Each provider keeps its own transcript. The Anthropic one is append-only, as
// thinking blocks bound to the conversation require, and leaves trimming old
// tool results to server-side context editing; the OpenAI-compatible one trims
// old page reads and screenshots itself.

import type { Connection } from './credentials.ts';

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
export type ToolCall = { id: string; name: string; input: Record<string, unknown> };
export type ToolResult = { id: string; text: string; image?: string; isError?: boolean };

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  /** Null when neither the provider nor the price list says what it cost. */
  cost_usd: number | null;
};

export type Turn = {
  text: string;
  calls: ToolCall[];
  usage: Usage;
  /** The model declined (Anthropic's `refusal` stop reason). */
  refused: boolean;
};

export interface ModelConversation {
  turn(signal?: AbortSignal): Promise<Turn>;
  /** The results of the last turn's calls, plus an optional note after them. */
  addResults(results: ToolResult[], note?: string): void;
  addUser(text: string): void;
}

export class ModelError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

type Fetch = typeof fetch;

/** US dollars per million tokens: Anthropic first-party list prices. */
const ANTHROPIC_PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
};
/** A 5-minute cache write is 1.25 times the input price. */
const CACHE_WRITE = 1.25;

const RETRIES = 2;
const MAX_OUTPUT_TOKENS = 16_000;

async function post(
  fetchFn: Fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (attempt < RETRIES) {
        await sleep(1000 * 2 ** attempt, signal);
        continue;
      }
      throw new ModelError(`Could not reach ${new URL(url).host}: ${(err as Error).message}`, null);
    }
    if (res.ok) return (await res.json()) as Record<string, unknown>;
    const retryable = res.status === 429 || res.status === 408 || res.status >= 500;
    if (retryable && attempt < RETRIES) {
      const after = Number(res.headers.get('retry-after'));
      await sleep(after > 0 && after < 60 ? after * 1000 : 1000 * 2 ** attempt, signal);
      continue;
    }
    // The provider's own message (never the key, which no provider echoes).
    const text = await res.text().catch(() => '');
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      detail = typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? detail);
    } catch {
      // Not JSON: keep the text.
    }
    throw new ModelError(`${new URL(url).host} answered ${res.status}: ${detail}`, res.status);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((ok, fail) => {
    const timer = setTimeout(ok, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      fail(signal.reason);
    });
  });
}

// ── Anthropic ──────────────────────────────────────────────────────────────

type AnthropicBlock = { type: string; [key: string]: unknown };
type AnthropicMessage = { role: 'user' | 'assistant'; content: AnthropicBlock[] };

/** Models that take server-side refusal fallbacks. */
const FALLBACK_MODELS = /^claude-(opus-5|sonnet-5-5|fable-5-1)/;

class AnthropicConversation implements ModelConversation {
  private readonly messages: AnthropicMessage[] = [];
  private readonly connection: Connection;
  private readonly system: string;
  private readonly tools: ToolSpec[];
  private readonly fetchFn: Fetch;

  constructor(connection: Connection, system: string, tools: ToolSpec[], fetchFn: Fetch) {
    this.connection = connection;
    this.system = system;
    this.tools = tools;
    this.fetchFn = fetchFn;
  }

  addUser(text: string): void {
    this.messages.push({ role: 'user', content: [{ type: 'text', text }] });
  }

  addResults(results: ToolResult[], note?: string): void {
    const content: AnthropicBlock[] = results.map((r) => ({
      type: 'tool_result',
      tool_use_id: r.id,
      ...(r.isError ? { is_error: true } : {}),
      content: [
        { type: 'text', text: r.text || '(no output)' },
        ...(r.image
          ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: r.image } }]
          : []),
      ],
    }));
    if (note) content.push({ type: 'text', text: note });
    this.messages.push({ role: 'user', content });
  }

  async turn(signal?: AbortSignal): Promise<Turn> {
    const { connection } = this;
    const fallback = FALLBACK_MODELS.test(connection.model);
    const betas = ['context-management-2025-06-27'];
    if (fallback) betas.push('server-side-fallback-2026-07-01');
    const data = await post(
      this.fetchFn,
      `${connection.baseUrl}/v1/messages`,
      {
        'x-api-key': connection.apiKey ?? '',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': betas.join(','),
      },
      {
        model: connection.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Caches the newest block on every turn, so each turn reads the last one's prefix.
        cache_control: { type: 'ephemeral' },
        system: this.system,
        ...(this.tools.length
          ? {
              tools: this.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              })),
              tool_choice: { type: 'auto' },
            }
          : {}),
        // Old page reads are cleared server side: the transcript itself stays append-only.
        context_management: { edits: [{ type: 'clear_tool_uses_20250919' }] },
        ...(fallback ? { fallbacks: 'default' } : {}),
        messages: this.messages,
      },
      signal
    );
    const content = (data.content as AnthropicBlock[] | undefined) ?? [];
    // Sent back exactly as it came, thinking blocks included.
    this.messages.push({ role: 'assistant', content });
    const raw = (data.usage ?? {}) as Record<string, number | undefined>;
    const input = raw.input_tokens ?? 0;
    const cacheRead = raw.cache_read_input_tokens ?? 0;
    const cacheWrite = raw.cache_creation_input_tokens ?? 0;
    const output = raw.output_tokens ?? 0;
    const price = ANTHROPIC_PRICES[String(data.model ?? connection.model)];
    return {
      text: content
        .filter((b) => b.type === 'text')
        .map((b) => String(b.text))
        .join('\n'),
      calls: content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
          id: String(b.id),
          name: String(b.name),
          input: (b.input as Record<string, unknown>) ?? {},
        })),
      usage: {
        input_tokens: input + cacheRead + cacheWrite,
        output_tokens: output,
        cache_read_tokens: cacheRead,
        cost_usd: price
          ? (input * price.input +
              cacheWrite * price.input * CACHE_WRITE +
              cacheRead * price.cacheRead +
              output * price.output) /
            1e6
          : null,
      },
      refused: data.stop_reason === 'refusal',
    };
  }
}

// ── OpenAI-compatible ──────────────────────────────────────────────────────

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<Record<string, unknown>> | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

/** Page reads older than this many tool results are cut to their opening lines. */
const KEEP_TOOL_RESULTS = 6;
const TRIMMED_CHARS = 600;
const PRUNED_SCREENSHOT = '[earlier screenshot removed to save tokens]';

class OpenAiConversation implements ModelConversation {
  private readonly messages: ChatMessage[];
  private readonly connection: Connection;
  private readonly tools: ToolSpec[];
  private readonly fetchFn: Fetch;

  constructor(connection: Connection, system: string, tools: ToolSpec[], fetchFn: Fetch) {
    this.connection = connection;
    this.tools = tools;
    this.fetchFn = fetchFn;
    this.messages = [{ role: 'system', content: system }];
  }

  addUser(text: string): void {
    this.messages.push({ role: 'user', content: text });
  }

  addResults(results: ToolResult[], note?: string): void {
    for (const r of results) {
      this.messages.push({
        role: 'tool',
        tool_call_id: r.id,
        content: (r.isError ? 'Error: ' : '') + (r.text || '(no output)'),
      });
    }
    // Chat completions carry images in user messages only.
    for (const r of results.filter((r) => r.image)) {
      this.messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'The screenshot you asked for:' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${r.image}` } },
        ],
      });
    }
    if (note) this.addUser(note);
    this.trim();
  }

  // ponytail: trims by count, not by tokens; a token budget per model would fit small contexts better.
  private trim(): void {
    const tools = this.messages.filter((m) => m.role === 'tool');
    for (const m of tools.slice(0, -KEEP_TOOL_RESULTS)) {
      if (typeof m.content === 'string' && m.content.length > TRIMMED_CHARS) {
        m.content = `${m.content.slice(0, TRIMMED_CHARS)}\n[trimmed: read the page again if you need it]`;
      }
    }
    const images = this.messages.filter((m) => Array.isArray(m.content));
    for (const m of images.slice(0, -1)) m.content = PRUNED_SCREENSHOT;
  }

  async turn(signal?: AbortSignal): Promise<Turn> {
    const { connection } = this;
    const openRouter = new URL(connection.baseUrl).hostname.endsWith('openrouter.ai');
    const data = await post(
      this.fetchFn,
      `${connection.baseUrl}/chat/completions`,
      connection.apiKey ? { authorization: `Bearer ${connection.apiKey}` } : {},
      {
        model: connection.model,
        messages: this.messages,
        ...(this.tools.length
          ? {
              tools: this.tools.map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.parameters },
              })),
              tool_choice: 'auto',
            }
          : {}),
        ...(openRouter ? { usage: { include: true } } : {}),
      },
      signal
    );
    const choice = ((data.choices as Array<Record<string, unknown>> | undefined) ?? [])[0];
    const message = (choice?.message ?? {}) as {
      content?: string | null;
      tool_calls?: ChatMessage['tool_calls'];
    };
    const toolCalls = message.tool_calls ?? [];
    this.messages.push({
      role: 'assistant',
      content: message.content ?? null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    });
    const raw = (data.usage ?? {}) as {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
    return {
      text: message.content ?? '',
      calls: toolCalls.map((c, i) => ({
        id: c.id || `call_${i}`,
        name: c.function.name,
        input: parseArguments(c.function.arguments),
      })),
      usage: {
        input_tokens: raw.prompt_tokens ?? 0,
        output_tokens: raw.completion_tokens ?? 0,
        cache_read_tokens: raw.prompt_tokens_details?.cached_tokens ?? 0,
        cost_usd: typeof raw.cost === 'number' ? raw.cost : null,
      },
      refused: false,
    };
  }
}

/** Arguments that are not a JSON object arrive as `{__invalid}`, for the runner to refuse. */
function parseArguments(text: string | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : { __invalid: text };
  } catch {
    return { __invalid: text };
  }
}

export function startConversation(
  connection: Connection,
  options: { system: string; tools: ToolSpec[]; fetch?: Fetch }
): ModelConversation {
  const fetchFn = options.fetch ?? fetch;
  return connection.provider === 'anthropic'
    ? new AnthropicConversation(connection, options.system, options.tools, fetchFn)
    : new OpenAiConversation(connection, options.system, options.tools, fetchFn);
}
