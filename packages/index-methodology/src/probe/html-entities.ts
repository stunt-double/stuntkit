const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '-',
  ndash: '-',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

const ENTITY_RE = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi;

/**
 * Decodes the character references a site leaves in an attribute value
 * (`&#x27;`, `&amp;`, `&rsquo;`), so a meta description reads as text rather
 * than markup. Unknown named references are left as written. Dashes decode to
 * a hyphen: a site's copy is shown on our pages, which carry no em dashes.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input.includes('&')) return input;
  return input.replace(ENTITY_RE, (match, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      // Out of range, or a lone UTF-16 surrogate (not a character on its own,
      // and ill-formed text if emitted): leave the reference as written.
      const invalid =
        !Number.isFinite(code) ||
        code <= 0 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff);
      if (invalid) return match;
      const char = String.fromCodePoint(code);
      return char === '\u2014' || char === '\u2013' ? '-' : char;
    }
    return NAMED[body.toLowerCase()] ?? match;
  });
}
