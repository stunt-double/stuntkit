/** Most tags kept per domain. */
export const MAX_CATEGORY_TAGS = 16;

/** Longest single tag kept; anything longer is a sentence, not a category. */
export const MAX_CATEGORY_TAG_LENGTH = 40;

/**
 * Normalises a site's self-declared categories. Sites put comma (or `;`, `|`)
 * separated lists into fields meant for one value (JSON-LD `category`,
 * `genre`, `article:section`), and older rows stored those lists as a single
 * tag, so every value is split, trimmed, lowercased and deduped. Tags over
 * `MAX_CATEGORY_TAG_LENGTH` characters are dropped rather than cut mid-word,
 * and at most `MAX_CATEGORY_TAGS` survive.
 *
 * Kept free of runtime imports so `node --test` can load it directly.
 */
export function normaliseCategoryTags(values: Iterable<unknown>): string[] {
  const tags = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    for (const part of value.split(/[,;|]/)) {
      const tag = part.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!tag || tag.length > MAX_CATEGORY_TAG_LENGTH) continue;
      tags.add(tag);
      if (tags.size >= MAX_CATEGORY_TAGS) return Array.from(tags);
    }
  }
  return Array.from(tags);
}
