// Accessible names: a compact reading of the computation browsers expose to
// assistive technology and to agents (the accessibility tree), and the
// heuristics WAO uses to infer a name for a control that has none.
//
// The reading is deliberately a subset of accname-1.2: enough to tell whether
// a control already has a name, which is all WAO needs, because it never
// replaces a name an element has. It errs towards "has a name", so a doubtful
// case is left alone.

const collapse = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, ' ').trim();

/** Elements whose name comes from their content when nothing else names them. */
const NAME_FROM_CONTENT = new Set([
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'gridcell',
  'heading',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'row',
  'rowheader',
  'switch',
  'tab',
  'tooltip',
  'treeitem',
]);

const NATIVE_NAME_FROM_CONTENT = new Set([
  'A',
  'BUTTON',
  'SUMMARY',
  'TH',
  'TD',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LEGEND',
  'CAPTION',
  'OPTION',
]);

/** Text an element contributes to a name from content: text, `alt`, SVG titles. */
export function contentText(element: Element): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      parts.push(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) return;
    const tag = el.tagName.toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') return;
    const label = collapse(el.getAttribute('aria-label'));
    if (label && el !== element) {
      parts.push(` ${label} `);
      return;
    }
    if (tag === 'IMG' || (tag === 'INPUT' && el.getAttribute('type') === 'image')) {
      parts.push(` ${el.getAttribute('alt') ?? ''} `);
      return;
    }
    if (tag === 'SVG') {
      const title = Array.from(el.children).find((c) => c.tagName.toUpperCase() === 'TITLE');
      parts.push(` ${title?.textContent ?? ''} `);
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child);
  };
  walk(element);
  return collapse(parts.join(''));
}

function labelledByText(element: Element): string {
  const ids = collapse(element.getAttribute('aria-labelledby'));
  if (!ids) return '';
  const doc = element.ownerDocument;
  return collapse(
    ids
      .split(' ')
      .map((id) => {
        const target = doc.getElementById(id);
        return target ? contentText(target) : '';
      })
      .join(' ')
  );
}

function labelsText(element: Element): string {
  const labels = (element as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    return collapse(
      Array.from(labels)
        .map((l) => contentText(l))
        .join(' ')
    );
  }
  // Some DOMs do not implement `labels`; fall back to the two ways a label binds.
  const id = element.getAttribute('id');
  const doc = element.ownerDocument;
  if (id) {
    for (const label of Array.from(doc.querySelectorAll('label[for]'))) {
      if (label.getAttribute('for') === id) return contentText(label);
    }
  }
  const wrapping = element.closest('label');
  return wrapping ? contentText(wrapping) : '';
}

/** The element's ARIA role: its explicit `role`, or the implicit one WAO cares about. */
export function roleOf(element: Element): string {
  const explicit = collapse(element.getAttribute('role')).split(' ')[0];
  if (explicit) return explicit;
  const tag = element.tagName.toUpperCase();
  if (tag === 'A' && element.hasAttribute('href')) return 'link';
  if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
  if (tag === 'SELECT') return 'combobox';
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'INPUT') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (type === 'hidden') return '';
    return 'textbox';
  }
  if (tag === 'IMG') return 'img';
  return '';
}

/**
 * The element's accessible name, or '' when it has none. A subset of
 * accname: `aria-labelledby`, `aria-label`, native labels and values, content
 * for roles that take their name from it, then `title` and `placeholder`.
 */
export function accessibleName(element: Element): string {
  const labelledBy = labelledByText(element);
  if (labelledBy) return labelledBy;
  const ariaLabel = collapse(element.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;

  const tag = element.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'METER') {
    const type = (element.getAttribute('type') ?? '').toLowerCase();
    if (tag === 'INPUT' && ['button', 'submit', 'reset'].includes(type)) {
      const value = collapse(element.getAttribute('value'));
      // Browsers name a valueless submit "Submit" and a reset "Reset".
      if (value) return value;
      if (type === 'submit') return 'Submit';
      if (type === 'reset') return 'Reset';
    }
    if (tag === 'INPUT' && type === 'image') {
      const alt = collapse(element.getAttribute('alt'));
      if (alt) return alt;
    }
    const labels = labelsText(element);
    if (labels) return labels;
  } else if (tag === 'IMG') {
    const alt = element.getAttribute('alt');
    if (alt !== null) return collapse(alt);
  } else if (NATIVE_NAME_FROM_CONTENT.has(tag) || NAME_FROM_CONTENT.has(roleOf(element))) {
    const content = contentText(element);
    if (content) return content;
  }

  return collapse(element.getAttribute('title')) || collapse(element.getAttribute('placeholder'));
}

/** "first_name", "firstName", "first-name" -> "First name". */
export function humanise(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

// Icon font class names: `fa-trash`, `bi-x-lg`, `glyphicon-search`,
// `icon-cart`, `mdi-close`. The word after the prefix names the action.
const ICON_CLASS =
  /^(?:fa|fas|far|fab|bi|glyphicon|icon|mdi|ti|lucide|ion|la|feather)-([a-z0-9-]+)$/;
// Modifiers that share the prefix but name a size or style, not a picture.
const ICON_MODIFIERS =
  /^(?:solid|regular|light|thin|duotone|brands|sharp|fw|lg|sm|xs|xl|[0-9]+x|spin|pulse|border|inverse|stack|flip-.*|rotate-.*|pull-.*)$/;

function iconName(element: Element): string {
  const candidates = [element, ...Array.from(element.querySelectorAll('[class]'))];
  for (const el of candidates) {
    for (const cls of Array.from(el.classList)) {
      const match = ICON_CLASS.exec(cls);
      if (match && !ICON_MODIFIERS.test(match[1])) return humanise(match[1]);
    }
  }
  return '';
}

// Tooltip libraries keep the text a sighted user sees on hover here.
const TOOLTIP_ATTRIBUTES = [
  'data-tooltip',
  'data-tip',
  'data-title',
  'data-original-title',
  'data-bs-original-title',
  'data-label',
];

function nearbyLabel(element: Element): string {
  // `<td>Email</td><td><input></td>` and `<span>Email</span><input>`: the
  // short text right before the field, in the same row or the same parent.
  const short = (text: string) => (text.length > 0 && text.length <= 60 ? text : '');
  let previous = element.previousElementSibling;
  while (previous && previous.matches('br, input[type="hidden"]'))
    previous = previous.previousElementSibling;
  if (previous && !previous.matches('input, select, textarea, button')) {
    const text = short(
      contentText(previous)
        .replace(/[:*]\s*$/, '')
        .trim()
    );
    if (text) return text;
  }
  const cell = element.closest('td');
  if (cell && cell.children.length === 1) {
    const before = cell.previousElementSibling;
    if (before)
      return short(
        contentText(before)
          .replace(/[:*]\s*$/, '')
          .trim()
      );
  }
  return '';
}

function hrefName(element: Element): string {
  const href = element.getAttribute('href') ?? '';
  if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return '';
  try {
    const segment = new URL(href, 'https://example.invalid/').pathname
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/\.[a-z0-9]+$/i, '');
    return segment ? humanise(decodeURIComponent(segment)) : '';
  } catch {
    return ''; // An unparseable URL or a malformed escape names nothing.
  }
}

/** A name inferred for an unnamed control, and where it came from. */
export interface InferredName {
  name: string;
  source: 'tooltip' | 'icon' | 'nearby-text' | 'field-name' | 'href';
}

/** Infer a name for a control that has none, or `null` when nothing is good enough. */
export function inferName(element: Element): InferredName | null {
  for (const attribute of TOOLTIP_ATTRIBUTES) {
    const value = collapse(element.getAttribute(attribute));
    if (value) return { name: value, source: 'tooltip' };
  }
  const tag = element.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    const nearby = nearbyLabel(element);
    if (nearby) return { name: nearby, source: 'nearby-text' };
    const field = element.getAttribute('name') || element.getAttribute('id');
    if (field) return { name: humanise(field), source: 'field-name' };
    return null;
  }
  const icon = iconName(element);
  if (icon) return { name: icon, source: 'icon' };
  const fromHref = tag === 'A' ? hrefName(element) : '';
  if (fromHref) return { name: fromHref, source: 'href' };
  return null;
}
