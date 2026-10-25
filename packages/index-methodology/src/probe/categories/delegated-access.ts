import { CheckBuilder } from '../check-builder.ts';
import type { DomainProbe } from '../probe.ts';
import { jsonEndpointExists, pageExists, textEndpointExists } from '../probe.ts';
import { MCP_FRICTION, PUBLIC_API_FRICTION } from '../retired.ts';
import { detectSignIn } from '../sign-in.ts';
import type { CategoryCheckResult } from '../types.ts';

/** Below this much server-rendered text the homepage is probably an app shell. */
const MIN_TEXT_FOR_SIGN_IN_EVIDENCE = 500;

export function delegatedAccess(probe: DomainProbe): CategoryCheckResult {
  // Delegation needs an account to delegate. A site with no sign-in is not
  // scored here (rather than scored 0) and gets no delegated-access sessions.
  // An unreachable or client-rendered homepage (next to no server text, so no
  // links to read) gives no evidence either way, so it stays scored.
  if (probe.html && probe.html.textLength >= MIN_TEXT_FOR_SIGN_IN_EVIDENCE) {
    const signIn = detectSignIn({
      anchors: probe.html.anchors,
      text: probe.html.text,
      pageUrl: probe.homepage.finalUrl || probe.origin,
      authMetadata:
        jsonEndpointExists(probe.wellKnownOidc) || jsonEndpointExists(probe.oauthAuthServer),
      accountPages:
        pageExists(probe.extraPages['signup']) || pageExists(probe.extraPages['register']),
    });
    if (!signIn.hasSignIn) {
      return {
        category: 'delegated-access',
        score: 0,
        findings: [
          {
            id: 'sign-in',
            label: 'Not scored: the site has no sign-in or user accounts to delegate',
            weight: 0,
            passed: true,
            detail: signIn.evidence,
          },
        ],
        frictions: [],
        applicable: false,
      };
    }
  }

  const b = new CheckBuilder('delegated-access');

  // MCP is the de facto agent-to-tool standard: ChatGPT apps, Claude
  // connectors and the public MCP registry all build on it. Either the
  // SEP-1649 server card or the legacy single-file manifest counts.
  const serverCard = jsonEndpointExists(probe.mcpServerCard);
  const legacyManifest = jsonEndpointExists(probe.wellKnownMcp);
  const mcp = serverCard || legacyManifest;
  b.add(
    'mcp-discovery',
    'MCP server discoverable (`/.well-known/mcp/server-card.json` or `mcp.json`)',
    30,
    mcp,
    serverCard
      ? 'server card found'
      : legacyManifest
        ? 'legacy mcp.json found'
        : 'neither endpoint serves JSON'
  );
  if (!mcp) b.friction('high', MCP_FRICTION);

  // OAuth metadata is how an agent bootstraps delegated auth without a human
  // copy-pasting keys. RFC 8414 / RFC 9728 endpoints are also required by the
  // MCP authorization spec; OIDC discovery counts as an equivalent surface.
  const oidc = jsonEndpointExists(probe.wellKnownOidc);
  const oauthAs = jsonEndpointExists(probe.oauthAuthServer);
  const oauthPr = jsonEndpointExists(probe.oauthProtectedResource);
  const oauthSurface = oidc || oauthAs || oauthPr;
  b.add(
    'oauth-metadata',
    'OAuth/OIDC discovery metadata served (RFC 8414 / RFC 9728 / OIDC)',
    25,
    oauthSurface,
    [
      oidc ? 'openid-configuration' : null,
      oauthAs ? 'oauth-authorization-server' : null,
      oauthPr ? 'oauth-protected-resource' : null,
    ]
      .filter(Boolean)
      .join(', ') || 'no metadata endpoints found'
  );
  if (!oauthSurface)
    b.friction(
      'medium',
      'No OAuth/OIDC discovery metadata. Agents cannot bootstrap a scoped, revocable session; any delegation falls back to password sharing.'
    );

  const openapi = jsonEndpointExists(probe.openapi);
  const apiDocs = pageExists(probe.extraPages['apiDocs']);
  const developers = pageExists(probe.extraPages['developers']);
  const publicApi = openapi || apiDocs || developers;
  b.add(
    'public-api',
    'Public API surface discoverable (OpenAPI / /api-docs / /developers)',
    25,
    publicApi,
    openapi ? 'openapi.json' : apiDocs ? '/api-docs' : developers ? '/developers' : undefined
  );
  if (!publicApi) b.friction('high', PUBLIC_API_FRICTION);

  const agentCard = jsonEndpointExists(probe.agentCard);
  b.add('a2a-agent-card', 'A2A agent card (`/.well-known/agent-card.json`)', 5, agentCard);

  const agentsMd = textEndpointExists(probe.agentsMd);
  b.add('agents-md', 'AGENTS.md served (`/.well-known/agents.md`)', 5, agentsMd);

  const scopedHint = /(oauth|personal access token|api key|scopes?)\b/i.test(probe.html?.raw ?? '');
  b.add('scopes-mentioned', 'Mentions OAuth / API keys / scopes on homepage', 10, scopedHint);

  return b.build();
}
