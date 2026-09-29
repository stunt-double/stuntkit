// The in-page half of the browser toolset executor: one script, evaluated in
// the page, that reads the accessibility-ish tree Claude's `read_page` and
// `find` expect and resolves the `ref_N` handles those return.
//
// Stagehand 4 gives no raw CDP, so `Accessibility.getFullAXTree` is out of
// reach; this walks the DOM (including open shadow roots) instead and tags each
// element it reports with a `data-sd-ref` attribute. A ref therefore survives
// until the element leaves the DOM, which is the lifetime the toolset docs
// promise ("valid until the tab navigates or the DOM changes materially").
//
// It is a string expression, never a function, because Stagehand serialises
// functions with `toString()` and the bundler's `__name` helper does not exist
// in the page (see docs/architecture/ai-models.md). `buildPageCall` is the only
// way in, and it JSON-encodes its arguments, so nothing a model supplies is
// ever spliced into the script as code.

import { CARD_FIELD_PATTERN, type ElementFacts, PAYMENT_PROVIDER_DOMAINS } from './safety.ts';

export type PageOp =
  | { op: 'read'; filter: 'visible' | 'interactive' | 'all'; depth: number; ref?: string }
  | { op: 'find'; query: string }
  | { op: 'text' }
  | { op: 'resolve'; ref: string; scroll: boolean }
  | { op: 'form'; ref: string; value: string | number | boolean }
  | { op: 'viewport' }
  | { op: 'inspect'; target: InspectTarget };

/** An element to describe: a ref, whatever is at a point, or whatever has focus. */
export type InspectTarget =
  { type: 'ref'; ref: string } | { type: 'coordinate'; x: number; y: number } | { type: 'focused' };

export type ReadResult = { ok: true; text: string; truncated: boolean } | PageError;
export type ResolveResult = { ok: true; x: number; y: number; inViewport: boolean } | PageError;
export type FormResult = { ok: true; description: string } | PageError;
export type ViewportResult = { ok: true; width: number; height: number };
/** `facts` is null when nothing is there (an empty point, nothing focused). */
export type InspectResult = { ok: true; facts: ElementFacts | null } | PageError;
export type PageError = { ok: false; error: string };

/** Max characters `read_page` / `find` / `get_page_text` return (toolset limit). */
export const MAX_PAGE_TEXT_CHARS = 50_000;

// The safety guards' vocabulary, spliced in as JSON: constants of ours, never
// anything a model supplied.
const CARD_PATTERN_SOURCE = JSON.stringify(CARD_FIELD_PATTERN.source);
const PAYMENT_DOMAINS_JSON = JSON.stringify(PAYMENT_PROVIDER_DOMAINS);

const SCRIPT = String.raw`
(function (args) {
  var REF_ATTR = 'data-sd-ref';
  var MAX = ${MAX_PAGE_TEXT_CHARS};
  var w = window;
  if (typeof w.__sdRefSeq !== 'number') w.__sdRefSeq = 0;

  function refOf(el) {
    var existing = el.getAttribute(REF_ATTR);
    if (existing) return existing;
    w.__sdRefSeq += 1;
    var ref = 'ref_' + w.__sdRefSeq;
    el.setAttribute(REF_ATTR, ref);
    return ref;
  }

  function findRef(ref, root) {
    root = root || document;
    var hit = root.querySelector('[' + REF_ATTR + '="' + ref + '"]');
    if (hit) return hit;
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) {
        var inner = findRef(ref, all[i].shadowRoot);
        if (inner) return inner;
      }
    }
    return null;
  }

  function isHidden(el) {
    if (el.getAttribute('aria-hidden') === 'true') return true;
    var style = w.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return true;
    if (parseFloat(style.opacity) === 0) return true;
    var rect = el.getBoundingClientRect();
    return rect.width === 0 && rect.height === 0;
  }

  function inViewport(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < w.innerHeight && r.left < w.innerWidth;
  }

  var INPUT_ROLES = {
    button: 'button', submit: 'button', reset: 'button', image: 'button',
    checkbox: 'checkbox', radio: 'radio', range: 'slider', search: 'searchbox',
    email: 'textbox', tel: 'textbox', url: 'textbox', text: 'textbox',
    password: 'textbox', number: 'spinbutton', date: 'textbox', file: 'button'
  };
  var TAG_ROLES = {
    A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox',
    H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading',
    IMG: 'img', NAV: 'navigation', MAIN: 'main', HEADER: 'banner', FOOTER: 'contentinfo',
    FORM: 'form', DIALOG: 'dialog', TABLE: 'table', UL: 'list', OL: 'list', LI: 'listitem',
    SUMMARY: 'button', LABEL: 'label', OPTION: 'option', IFRAME: 'iframe', VIDEO: 'video'
  };
  var INTERACTIVE_ROLES = {
    button: 1, link: 1, checkbox: 1, radio: 1, textbox: 1, searchbox: 1, combobox: 1,
    slider: 1, spinbutton: 1, switch: 1, tab: 1, menuitem: 1, menuitemcheckbox: 1,
    menuitemradio: 1, option: 1, treeitem: 1
  };

  function roleOf(el) {
    var explicit = el.getAttribute('role');
    if (explicit) return explicit.split(' ')[0];
    if (el.tagName === 'INPUT') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'hidden') return null;
      return INPUT_ROLES[t] || 'textbox';
    }
    if (el.tagName === 'A' && !el.hasAttribute('href')) return null;
    if (el.tagName === 'IMG' && !el.getAttribute('alt')) return null;
    if (el.isContentEditable && el.parentElement && !el.parentElement.isContentEditable) return 'textbox';
    return TAG_ROLES[el.tagName] || null;
  }

  function isInteractive(el, role) {
    if (role && INTERACTIVE_ROLES[role]) return true;
    if (el.hasAttribute('onclick')) return true;
    var tab = el.getAttribute('tabindex');
    return tab !== null && Number(tab) >= 0 && !!role;
  }

  function clean(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  // Roles whose own text is their name. Containers (banner, list, table, form)
  // take a name only from an explicit label: their text is their children's,
  // which the tree already lists, and repeating it drowns \`find\`.
  var TEXT_NAMED = { heading: 1, option: 1, label: 1, text: 1, generic: 1, listitem: 0 };

  function nameOf(el, role) {
    var label = el.getAttribute('aria-label');
    if (label) return clean(label);
    var by = el.getAttribute('aria-labelledby');
    if (by) {
      var parts = by.split(/\s+/).map(function (id) {
        var n = document.getElementById(id);
        return n ? n.textContent : '';
      });
      var joined = clean(parts.join(' '));
      if (joined) return joined;
    }
    if (el.id) {
      var forLabel = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (forLabel) return clean(forLabel.textContent);
    }
    var alt = el.getAttribute('alt') || el.getAttribute('title');
    if (alt) return clean(alt);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return clean(el.getAttribute('placeholder') || '');
    }
    if (role && !INTERACTIVE_ROLES[role] && !TEXT_NAMED[role]) return '';
    return clean(el.innerText || el.textContent).slice(0, 100);
  }

  function valueOf(el) {
    if (el.tagName === 'INPUT') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'checkbox' || t === 'radio') return el.checked ? 'checked' : 'unchecked';
      if (t === 'password') return el.value ? '••••' : '';
      return el.value ? clean(el.value).slice(0, 80) : '';
    }
    if (el.tagName === 'TEXTAREA') return el.value ? clean(el.value).slice(0, 80) : '';
    if (el.tagName === 'SELECT') {
      var opt = el.options[el.selectedIndex];
      return opt ? clean(opt.text) : '';
    }
    return '';
  }

  function hasOwnText(el) {
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 && c.nodeValue && c.nodeValue.trim()) return true;
    }
    return false;
  }

  function children(el) {
    var out = Array.prototype.slice.call(el.children);
    if (el.shadowRoot) out = out.concat(Array.prototype.slice.call(el.shadowRoot.children));
    return out;
  }

  function describe(el, role) {
    var name = nameOf(el, role);
    var line = role + (name ? ' "' + name.replace(/"/g, "'") + '"' : '');
    var value = valueOf(el);
    if (value) line += ' value="' + value.replace(/"/g, "'") + '"';
    if (el.tagName === 'A' && el.getAttribute('href')) {
      var href = el.getAttribute('href');
      if (href.indexOf('javascript:') !== 0) line += ' href="' + href.slice(0, 200) + '"';
    }
    if (el.disabled) line += ' disabled';
    return line + ' [' + refOf(el) + ']';
  }

  function read(filter, depth, rootRef) {
    var root = document.body;
    if (rootRef) {
      root = findRef(rootRef);
      if (!root) return { ok: false, error: rootRef + ' is stale or not found on the current page. Re-read the page to get fresh references.' };
    }
    var lines = [];
    var size = 0;
    var truncated = false;
    function walk(el, level, reported) {
      if (truncated || !el || el.nodeType !== 1) return;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT' || el.tagName === 'TEMPLATE') return;
      if (isHidden(el)) return;
      var role = roleOf(el);
      var interactive = isInteractive(el, role);
      var include;
      if (filter === 'interactive') include = interactive;
      else include = !!role || interactive || (hasOwnText(el) && clean(el.innerText).length > 0);
      if (include && filter !== 'all' && !inViewport(el)) include = false;
      var next = reported;
      if (include) {
        var line = '  '.repeat(Math.min(reported, 20)) + describe(el, role || (interactive ? 'generic' : 'text'));
        if (size + line.length + 1 > ${MAX_PAGE_TEXT_CHARS}) { truncated = true; return; }
        lines.push(line);
        size += line.length + 1;
        next = reported + 1;
        if (!interactive && !role) return;
      }
      // Depth counts levels of the reported tree, not DOM nesting: a real
      // page nests its buttons far deeper than 15 elements.
      if (next >= depth) return;
      var kids = children(el);
      for (var i = 0; i < kids.length; i++) walk(kids[i], level + 1, next);
    }
    walk(root, 0, 0);
    var text = lines.join('\n');
    if (!text) text = filter === 'all' ? 'The page has no readable elements.' : 'No elements in the viewport match. Scroll, or read with filter "all".';
    if (truncated) text += '\n[truncated: the page tree exceeded ' + MAX + ' characters; pass a ref or a smaller depth]';
    return { ok: true, text: text, truncated: truncated };
  }

  function find(query) {
    var terms = clean(query).toLowerCase().split(' ').filter(function (t) { return t.length > 1; });
    if (!terms.length) return { ok: false, error: 'find needs a query.' };
    var scored = [];
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (isHidden(el)) continue;
      var role = roleOf(el);
      var interactive = isInteractive(el, role);
      if (!role && !interactive) continue;
      var hay = (role + ' ' + nameOf(el, role || 'generic') + ' ' + (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('name') || '')).toLowerCase();
      var score = 0;
      for (var j = 0; j < terms.length; j++) if (hay.indexOf(terms[j]) !== -1) score += 1;
      if (score > 0) scored.push({ el: el, role: role || 'generic', score: score + (interactive ? 0.5 : 0) + (inViewport(el) ? 0.25 : 0) });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.slice(0, 20);
    if (!top.length) return { ok: true, text: 'No elements match "' + clean(query) + '".', truncated: false };
    return { ok: true, text: top.map(function (s) { return describe(s.el, s.role); }).join('\n'), truncated: false };
  }

  function pageText() {
    var main = document.querySelector('main, [role="main"], article');
    var text = clean((main && main.innerText.length > 200 ? main.innerText : document.body.innerText) || '');
    var truncated = text.length > MAX;
    return { ok: true, text: truncated ? text.slice(0, MAX) + '\n[truncated]' : text || 'The page has no text.', truncated: truncated };
  }

  function resolve(ref, scroll) {
    var el = findRef(ref);
    if (!el || !el.isConnected) return { ok: false, error: ref + ' is stale or not found on the current page. Re-read the page to get fresh references.' };
    // Instant, not the page's own scroll-behavior: smooth, which is still
    // moving when the box is measured, so the click would land short.
    if (scroll && !inViewport(el)) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    var r = el.getBoundingClientRect();
    return { ok: true, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), inViewport: inViewport(el) };
  }

  function form(ref, value) {
    var el = findRef(ref);
    if (!el) return { ok: false, error: ref + ' is stale or not found on the current page. Re-read the page to get fresh references.' };
    var fire = function (type) { el.dispatchEvent(new Event(type, { bubbles: true })); };
    if (el.tagName === 'SELECT') {
      var want = String(value).toLowerCase();
      for (var i = 0; i < el.options.length; i++) {
        var o = el.options[i];
        if (o.value.toLowerCase() === want || clean(o.text).toLowerCase() === want) {
          el.selectedIndex = i; fire('input'); fire('change');
          return { ok: true, description: 'Selected "' + clean(o.text) + '"' };
        }
      }
      return { ok: false, error: 'No option "' + value + '" in ' + ref + '.' };
    }
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
      var on = value === true || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'checked';
      if (el.checked !== on) el.click();
      return { ok: true, description: (el.checked ? 'Checked ' : 'Unchecked ') + ref };
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      var proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      el.focus();
      setter.call(el, String(value));
      fire('input'); fire('change');
      return { ok: true, description: 'Set ' + ref + ' to "' + String(value).slice(0, 80) + '"' };
    }
    if (el.isContentEditable) {
      el.focus(); el.textContent = String(value); fire('input');
      return { ok: true, description: 'Set ' + ref + ' text' };
    }
    return { ok: false, error: ref + ' is not a form field.' };
  }

  // --- inspect: the facts the safety guards decide on ----------------------

  var CARD_RE = new RegExp(${CARD_PATTERN_SOURCE}, 'i');
  var PAYMENT_DOMAINS = ${PAYMENT_DOMAINS_JSON};
  var ACTIONABLE = 'a[href],button,input,select,textarea,summary,iframe,[role="button"],[role="link"],[role="checkbox"],[role="textbox"],[contenteditable="true"]';

  function isPaymentFrame(src) {
    var host = '';
    try { host = new URL(src, location.href).hostname.toLowerCase(); } catch (e) { return false; }
    for (var i = 0; i < PAYMENT_DOMAINS.length; i++) {
      var d = PAYMENT_DOMAINS[i];
      if (host === d || host.slice(-(d.length + 1)) === '.' + d) return true;
    }
    return false;
  }

  function isCardField(el) {
    if (el.tagName === 'IFRAME') {
      return isPaymentFrame(el.getAttribute('src') || '') || CARD_RE.test((el.getAttribute('title') || '') + ' ' + (el.getAttribute('name') || ''));
    }
    if (/(^|\s)cc-/.test((el.getAttribute('autocomplete') || '').toLowerCase())) return true;
    var text = [el.getAttribute('name'), el.id, el.getAttribute('aria-label'), el.getAttribute('placeholder')].join(' ');
    return CARD_RE.test(text);
  }

  // Across the whole page only visible fields count: a login modal parked
  // in the DOM must not make every button on the page look like a submit.
  function holdsSensitive(root, visibleOnly) {
    if (!root) return false;
    var fields = root.querySelectorAll('input, iframe');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var t = (f.getAttribute('type') || '').toLowerCase();
      if (t === 'hidden' || t === 'submit' || t === 'button') continue;
      if (t !== 'password' && !isCardField(f)) continue;
      if (visibleOnly && isHidden(f)) continue;
      return true;
    }
    return false;
  }

  function deepActive() {
    var el = document.activeElement;
    for (var i = 0; el && i < 10; i++) {
      if (el.shadowRoot && el.shadowRoot.activeElement) { el = el.shadowRoot.activeElement; continue; }
      if (el.tagName === 'IFRAME') {
        var inner = null;
        try { inner = el.contentDocument && el.contentDocument.activeElement; } catch (e) { inner = null; }
        if (inner && inner !== el.contentDocument.body) { el = inner; continue; }
      }
      break;
    }
    return el && el !== document.body && el !== document.documentElement ? el : null;
  }

  function atPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    for (var i = 0; el && el.shadowRoot && i < 10; i++) {
      var inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  function submitLabel(form) {
    var controls = form.querySelectorAll('button, input[type="submit" i], input[type="image" i]');
    for (var i = 0; i < controls.length; i++) {
      var c = controls[i];
      var t = (c.getAttribute('type') || 'submit').toLowerCase();
      if (t === 'submit' || t === 'image') return labelOf(c);
    }
    return '';
  }

  function labelOf(el) {
    var name = nameOf(el, roleOf(el) || 'generic');
    if (!name && el.tagName === 'INPUT') name = clean(el.value || '');
    return name;
  }

  function factsOf(raw) {
    if (!raw || raw.nodeType !== 1) return null;
    var el = raw.closest ? raw.closest(ACTIONABLE) || raw : raw;
    var tag = el.tagName.toLowerCase();
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'button' && !type) type = 'submit';
    var role = roleOf(el) || '';
    var form = el.form || (el.closest ? el.closest('form') : null);
    var href = tag === 'a' ? el.getAttribute('href') || '' : '';
    var navigating = tag === 'a' && !!href && href.charAt(0) !== '#' && href.toLowerCase().indexOf('javascript:') !== 0 && el.getAttribute('role') !== 'button';
    var isSubmit = !!form && ((tag === 'button' && type === 'submit') || (tag === 'input' && (type === 'submit' || type === 'image')));
    var isButton = tag === 'button' || role === 'button' || (tag === 'input' && (type === 'submit' || type === 'button' || type === 'image'));
    return {
      tag: tag,
      type: type,
      autocomplete: (el.getAttribute('autocomplete') || '').toLowerCase(),
      name: el.getAttribute('name') || '',
      id: el.id || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '',
      label: labelOf(el).slice(0, 200),
      role: role,
      isNavigatingLink: navigating,
      isSubmit: isSubmit,
      isButton: isButton,
      iframeSrc: tag === 'iframe' ? (el.getAttribute('src') || '').slice(0, 500) : '',
      iframeTitle: tag === 'iframe' ? el.getAttribute('title') || '' : '',
      inForm: !!form,
      // Without a form, the page stands in for one: a single-page sign-up
      // with a password box and a "Create account" button is still a sign-up.
      formSensitive: form ? holdsSensitive(form, false) : holdsSensitive(document, true),
      formSubmitLabel: form ? submitLabel(form).slice(0, 200) : ''
    };
  }

  function inspect(target) {
    if (target.type === 'focused') return { ok: true, facts: factsOf(deepActive()) };
    if (target.type === 'coordinate') return { ok: true, facts: factsOf(atPoint(target.x, target.y)) };
    var el = findRef(target.ref);
    if (!el) return { ok: false, error: target.ref + ' is stale or not found on the current page. Re-read the page to get fresh references.' };
    return { ok: true, facts: factsOf(el) };
  }

  switch (args.op) {
    case 'read': return read(args.filter, args.depth, args.ref);
    case 'find': return find(args.query);
    case 'text': return pageText();
    case 'resolve': return resolve(args.ref, args.scroll);
    case 'form': return form(args.ref, args.value);
    case 'viewport': return { ok: true, width: w.innerWidth, height: w.innerHeight };
    case 'inspect': return inspect(args.target);
  }
  return { ok: false, error: 'unknown op' };
})`;

/** The expression to `evaluate` for one operation. Arguments are JSON, never code. */
export function buildPageCall(op: PageOp): string {
  return `${SCRIPT}(${JSON.stringify(op)})`;
}
