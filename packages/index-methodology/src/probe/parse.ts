import { decodeHtmlEntities } from './html-entities.ts';

export type ParsedHtml = {
  raw: string;
  lower: string;
  text: string;
  textLength: number;
  title: string | null;
  meta: Record<string, string>;
  linkRels: Array<{ rel: string; href: string; type?: string }>;
  jsonLd: unknown[];
  headings: { h1: number; h2: number; h3: number };
  semanticTags: {
    main: boolean;
    nav: boolean;
    article: boolean;
    section: boolean;
    footer: boolean;
    header: boolean;
  };
  bodyScriptRatio: number;
  scripts: number;
  hasNoscriptWarning: boolean;
  anchors: string[];
};

const META_RE = /<meta\b([^>]*?)\/?>/gi;
const ATTR_RE = /(\w[\w:-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
const LINK_RE = /<link\b([^>]*?)\/?>/gi;
const JSONLD_RE =
  /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const STYLE_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const TAG_RE = /<[^>]+>/g;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const ANCHOR_RE = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;

function parseAttrs(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(input))) {
    const key = m[1].toLowerCase();
    // Attribute values are HTML, so `content="Stunt Double&#x27;s"` means an
    // apostrophe, the same as a browser would read it.
    out[key] = decodeHtmlEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

export function parseHtml(raw: string): ParsedHtml {
  const lower = raw.toLowerCase();
  const meta: Record<string, string> = {};
  META_RE.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = META_RE.exec(raw))) {
    const attrs = parseAttrs(mm[1]);
    const name = attrs.name || attrs.property || attrs.itemprop;
    if (name && attrs.content != null) {
      meta[name.toLowerCase()] = attrs.content;
    }
    if (attrs['http-equiv'] && attrs.content != null) {
      meta[`http-equiv:${attrs['http-equiv'].toLowerCase()}`] = attrs.content;
    }
  }

  const linkRels: ParsedHtml['linkRels'] = [];
  LINK_RE.lastIndex = 0;
  let lm: RegExpExecArray | null;
  while ((lm = LINK_RE.exec(raw))) {
    const attrs = parseAttrs(lm[1]);
    if (attrs.rel && attrs.href) {
      linkRels.push({ rel: attrs.rel.toLowerCase(), href: attrs.href, type: attrs.type });
    }
  }

  const jsonLd: unknown[] = [];
  JSONLD_RE.lastIndex = 0;
  let jm: RegExpExecArray | null;
  while ((jm = JSONLD_RE.exec(raw))) {
    try {
      const parsed = JSON.parse(jm[1].trim());
      jsonLd.push(parsed);
    } catch {
      // skip invalid JSON-LD blocks
    }
  }

  const scripts = (raw.match(SCRIPT_RE) || []).length;
  const text = raw
    .replace(SCRIPT_RE, ' ')
    .replace(STYLE_RE, ' ')
    .replace(TAG_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const anchors: string[] = [];
  ANCHOR_RE.lastIndex = 0;
  let am: RegExpExecArray | null;
  while ((am = ANCHOR_RE.exec(raw))) {
    const href = am[2] ?? am[3] ?? am[4] ?? '';
    if (href) anchors.push(href);
  }

  const titleMatch = TITLE_RE.exec(raw);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : null;

  const bodyLen = Math.max(raw.length, 1);
  const scriptChars = (raw.match(SCRIPT_RE) || []).reduce((a, s) => a + s.length, 0);

  return {
    raw,
    lower,
    text,
    textLength: text.length,
    title,
    meta,
    linkRels,
    jsonLd,
    headings: {
      h1: (lower.match(/<h1\b/g) || []).length,
      h2: (lower.match(/<h2\b/g) || []).length,
      h3: (lower.match(/<h3\b/g) || []).length,
    },
    semanticTags: {
      main: /<main[\s>]/i.test(raw),
      nav: /<nav[\s>]/i.test(raw),
      article: /<article[\s>]/i.test(raw),
      section: /<section[\s>]/i.test(raw),
      footer: /<footer[\s>]/i.test(raw),
      header: /<header[\s>]/i.test(raw),
    },
    bodyScriptRatio: scriptChars / bodyLen,
    scripts,
    hasNoscriptWarning:
      /<noscript[^>]*>[\s\S]*?(enable javascript|requires javascript|please enable)/i.test(raw),
    anchors,
  };
}

export function flattenJsonLd(nodes: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: unknown) => {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === 'object') {
      const obj = n as Record<string, unknown>;
      out.push(obj);
      if (Array.isArray(obj['@graph'])) obj['@graph'].forEach(walk);
    }
  };
  nodes.forEach(walk);
  return out;
}

export function hasJsonLdType(nodes: unknown[], type: string | string[]): boolean {
  const types = Array.isArray(type) ? type.map((t) => t.toLowerCase()) : [type.toLowerCase()];
  for (const obj of flattenJsonLd(nodes)) {
    const t = obj['@type'];
    const arr = Array.isArray(t) ? t : t ? [t] : [];
    for (const tt of arr) {
      if (typeof tt === 'string' && types.includes(tt.toLowerCase())) return true;
    }
  }
  return false;
}

export function socialHandles(html: ParsedHtml): string[] {
  const found = new Set<string>();
  const patterns: Array<[string, RegExp]> = [
    ['twitter', /(?:twitter\.com|x\.com)\/[A-Za-z0-9_]{2,}/gi],
    ['facebook', /facebook\.com\/[A-Za-z0-9.\-_]{2,}/gi],
    ['linkedin', /linkedin\.com\/(?:company|in)\/[A-Za-z0-9.\-_]{2,}/gi],
    ['instagram', /instagram\.com\/[A-Za-z0-9._]{2,}/gi],
    ['youtube', /youtube\.com\/(?:c|channel|@)[A-Za-z0-9_-]{2,}/gi],
    ['github', /github\.com\/[A-Za-z0-9-]{2,}/gi],
  ];
  for (const [key, re] of patterns) {
    if (re.test(html.raw)) found.add(key);
  }
  return Array.from(found);
}
