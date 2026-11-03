// A scripted OpenAI-compatible chat completions server: each request gets the
// next step of the script, so a run needs no key and no real model.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Step =
  { calls: Array<{ name: string; arguments: Record<string, unknown> }> } | { text: string };

export type FakeModel = {
  url: string;
  requests: Array<Record<string, unknown>>;
  close(): Promise<void>;
};

export async function fakeModel(
  script: Step[] | ((n: number, body: Record<string, unknown>) => Step),
  delayMs = 0
): Promise<FakeModel> {
  const requests: Array<Record<string, unknown>> = [];
  const server: Server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    requests.push({ ...body, authorization: req.headers.authorization ?? null });
    const n = requests.length - 1;
    if (delayMs) await new Promise((ok) => setTimeout(ok, delayMs));
    const step =
      typeof script === 'function' ? script(n, body) : (script[n] ?? { text: 'Nothing more.' });
    const message =
      'calls' in step
        ? {
            role: 'assistant',
            content: null,
            tool_calls: step.calls.map((c, i) => ({
              id: `call_${n}_${i}`,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.arguments) },
            })),
          }
        : { role: 'assistant', content: step.text };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `chatcmpl-${n}`,
        choices: [{ index: 0, message, finish_reason: 'calls' in step ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050 },
      })
    );
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    requests,
    close: () =>
      new Promise<void>((ok) => {
        server.closeAllConnections();
        server.close(() => ok());
      }),
  };
}
