/// <reference lib="esnext.disposable" />

// The optimiser: repairs the semantics an agent reads a page through (the
// accessibility tree), in place and reversibly.
//
// Agents see a page as its accessibility tree (Playwright's aria snapshot,
// CDP's Accessibility domain, `read_page` in @stunt-double/browser-toolset) and as
// screenshots. Legacy pages fail the first: a `<div onclick>` is not a button,
// an icon link has no name, a field's label is a table cell beside it. WAO
// fixes those with attributes alone. It never replaces, moves or restyles a
// node, so event handlers, framework state and screenshots are untouched, and
// it never overwrites an attribute the page set, except where a rule written
// for the page says to.

import { accessibleName, inferName, roleOf, type InferredName } from './name.ts';

/** A rule for one page or site: what a selector's elements are, for agents. */
export interface WaoRule {
  /** CSS selector. Every match gets the attributes below. */
  selector: string;
  /** Accessible name (`aria-label`). */
  label?: string;
  /** Longer description (`aria-description`): what the control does or what the region holds. */
  description?: string;
  /** ARIA role, for example `button`, `navigation`, `main`, `search`. */
  role?: string;
}

/** Which automatic repairs run. All default to on. */
export interface WaoRepairs {
  /** Give clickable non-semantic elements (`<div onclick>`, `cursor: pointer`) a button role and focus. */
  clickables?: boolean;
  /** Infer names for unnamed controls from tooltips, icon classes, nearby text, field names and URLs. */
  names?: boolean;
  /** Mark the page's main region when it has no `<main>` and one obvious candidate. */
  landmarks?: boolean;
}

export interface WaoOptions {
  /** The subtree to optimise. Default: the document element. */
  root?: Element;
  /** Re-run on content the page adds later (single-page apps). Default true. */
  observe?: boolean;
  /** Activate repaired clickables with Enter and Space, as a native button is. Default true. */
  keyboard?: boolean;
  /** Also optimise inside open shadow roots (web components). Default true. */
  shadow?: boolean;
  repairs?: WaoRepairs;
  rules?: readonly WaoRule[];
  /** Restore the page when this signal aborts, as `restore()` does. */
  signal?: AbortSignal;
  /** Called with the report after every pass, including passes over content added later. */
  onReport?: (report: WaoReport) => void;
}

export type WaoChangeKind = 'rule' | 'role' | 'focus' | 'name' | 'landmark';

/** One attribute WAO set. */
export interface WaoChange {
  kind: WaoChangeKind;
  element: Element;
  /** A short CSS-like path to the element, for logs and reports. */
  target: string;
  attribute: string;
  value: string;
  /** For an inferred name, what it was inferred from. */
  source?: InferredName['source'] | 'rule';
}

export type WaoIssueKind = 'unnamed-control' | 'image-without-alt' | 'no-main';

/** Something WAO found but could not fix with confidence. */
export interface WaoIssue {
  kind: WaoIssueKind;
  element?: Element;
  target?: string;
}

export interface WaoReport {
  changes: WaoChange[];
  issues: WaoIssue[];
}

export interface Wao extends Disposable {
  /** Every change in effect and every open issue, as of the last pass. */
  report(): WaoReport;
  /** Run a full pass now, for example after the page changed in a way the observer cannot see. */
  refresh(): WaoReport;
  /** Undo every change, stop observing and remove the keyboard handler. Safe to call twice. */
  restore(): void;
  /** `restore()`, so `using wao = optimise()` restores the page at the end of the block. */
  [Symbol.dispose](): void;
}

// `Symbol.dispose` is missing from older browsers; fall back to the symbol
// TypeScript's `using` helper looks for there.
const DISPOSE: typeof Symbol.dispose =
  typeof Symbol.dispose === 'symbol'
    ? Symbol.dispose
    : (Symbol.for('Symbol.dispose') as typeof Symbol.dispose);

declare global {
  interface Window {
    /** The handle the script build creates once the DOM is ready. */
    wao?: Wao;
    /** Options for the script build, set before it loads. */
    waoOptions?: WaoOptions;
  }
}

/** Marks every element WAO changed: `data-wao="role focus name"`. */
export const WAO_ATTRIBUTE = 'data-wao';

const NATIVE_INTERACTIVE =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, label, iframe, [contenteditable=""], [contenteditable="true"]';

const INTERACTIVE_ROLES = [
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'combobox',
  'textbox',
  'searchbox',
  'slider',
  'spinbutton',
  'treeitem',
];

const INTERACTIVE = `${NATIVE_INTERACTIVE}, ${INTERACTIVE_ROLES.map((r) => `[role="${r}"]`).join(', ')}`;

// Elements a site makes clickable with a script handler instead of a button.
const CLICKABLE_CANDIDATES = 'div, span, li, td, th, tr, img, i, svg, p, section, article';

const MAIN_CANDIDATES = [
  '#main',
  '#main-content',
  '#maincontent',
  '#content',
  '.main',
  '.main-content',
];

function describe(element: Element): string {
  const parts: string[] = [];
  let el: Element | null = element;
  while (el && parts.length < 3) {
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute('id');
    if (id) {
      parts.unshift(`${tag}#${id}`);
      break;
    }
    const classes = Array.from(el.classList).slice(0, 2);
    parts.unshift(classes.length > 0 ? `${tag}.${classes.join('.')}` : tag);
    el = el.parentElement;
  }
  return parts.join(' > ');
}

function isHidden(element: Element): boolean {
  return element.closest('[hidden], [aria-hidden="true"], template') !== null;
}

/**
 * Optimise a page for agents. Runs one pass now, then (by default) keeps
 * newly added content optimised. Safe to call before the DOM has finished
 * loading only if `root` already exists; the script build waits for it.
 */
export function optimise(options: WaoOptions = {}): Wao {
  const root = options.root ?? document.documentElement;
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const repairs = { clickables: true, names: true, landmarks: true, ...options.repairs };
  const rules = options.rules ?? [];
  const shadow = options.shadow !== false;

  // Every attribute WAO touched, with the value it had before (null: absent).
  const originals = new Map<Element, Map<string, string | null>>();
  const changes: WaoChange[] = [];
  let issues: WaoIssue[] = [];

  function mark(element: Element, kind: WaoChangeKind): void {
    const marks = new Set((element.getAttribute(WAO_ATTRIBUTE) ?? '').split(' ').filter(Boolean));
    marks.add(kind);
    element.setAttribute(WAO_ATTRIBUTE, [...marks].join(' '));
  }

  function set(
    element: Element,
    attribute: string,
    value: string,
    kind: WaoChangeKind,
    source?: WaoChange['source']
  ): void {
    if (element.getAttribute(attribute) === value) return;
    let saved = originals.get(element);
    if (!saved) {
      saved = new Map();
      saved.set(WAO_ATTRIBUTE, element.getAttribute(WAO_ATTRIBUTE));
      originals.set(element, saved);
    }
    if (!saved.has(attribute)) saved.set(attribute, element.getAttribute(attribute));
    element.setAttribute(attribute, value);
    mark(element, kind);
    changes.push({ kind, element, target: describe(element), attribute, value, source });
  }

  /** Set only where the page has not: the automatic repairs never overwrite. */
  function fill(
    element: Element,
    attribute: string,
    value: string,
    kind: WaoChangeKind,
    source?: WaoChange['source']
  ): void {
    if (!element.hasAttribute(attribute)) set(element, attribute, value, kind, source);
  }

  // Open shadow roots under a scope, nested ones included. Closed roots are
  // out of reach, for WAO as for any script outside the component.
  function shadowRootsUnder(scope: Element): ShadowRoot[] {
    if (!shadow) return [];
    const found: ShadowRoot[] = [];
    const visit = (host: Element) => {
      const shadowRoot = host.shadowRoot;
      if (!shadowRoot) return;
      found.push(shadowRoot);
      for (const el of Array.from(shadowRoot.querySelectorAll('*'))) visit(el);
    };
    visit(scope);
    for (const el of Array.from(scope.querySelectorAll('*'))) visit(el);
    return found;
  }

  function within(scope: Element, selector: string): Element[] {
    const found = Array.from(scope.querySelectorAll(selector));
    if (scope.matches(selector)) found.unshift(scope);
    for (const shadowRoot of shadowRootsUnder(scope)) {
      found.push(...Array.from(shadowRoot.querySelectorAll(selector)));
    }
    return found;
  }

  function applyRules(scope: Element): void {
    for (const rule of rules) {
      let matches: Element[];
      try {
        matches = within(scope, rule.selector);
      } catch {
        continue; // An invalid selector in a rule must not stop the rest.
      }
      for (const element of matches) {
        if (rule.role) set(element, 'role', rule.role, 'rule', 'rule');
        if (rule.label) set(element, 'aria-label', rule.label, 'rule', 'rule');
        if (rule.description) set(element, 'aria-description', rule.description, 'rule', 'rule');
      }
    }
  }

  function isPointer(element: Element): boolean {
    return view?.getComputedStyle(element).cursor === 'pointer';
  }

  function looksClickable(element: Element): boolean {
    if (element.hasAttribute('onclick')) return true;
    if (typeof (element as HTMLElement).onclick === 'function') return true;
    // `cursor` inherits, so only the outermost pointer element is the target.
    if (!isPointer(element)) return false;
    const parent = element.parentElement;
    return !parent || !isPointer(parent);
  }

  function repairClickables(scope: Element): void {
    for (const element of within(scope, CLICKABLE_CANDIDATES)) {
      if (element.hasAttribute('role') || isHidden(element)) continue;
      // Inside a link or button already, or a card wrapping one: not a control of its own.
      if (element.parentElement?.closest(INTERACTIVE) || element.querySelector(INTERACTIVE))
        continue;
      if (!looksClickable(element)) continue;
      fill(element, 'role', 'button', 'role');
      fill(element, 'tabindex', '0', 'focus');
    }
  }

  function repairNames(scope: Element): void {
    for (const element of within(scope, INTERACTIVE)) {
      if (isHidden(element) || roleOf(element) === '' || accessibleName(element)) continue;
      const inferred = inferName(element);
      if (inferred) fill(element, 'aria-label', inferred.name, 'name', inferred.source);
    }
  }

  function repairLandmarks(): void {
    if (doc.querySelector('main, [role="main"]')) return;
    const candidates = MAIN_CANDIDATES.flatMap((selector) =>
      Array.from(doc.querySelectorAll(selector))
    );
    const unique = [...new Set(candidates)].filter((el) => root.contains(el));
    if (unique.length === 1) fill(unique[0], 'role', 'main', 'landmark');
  }

  function collectIssues(): WaoIssue[] {
    const found: WaoIssue[] = [];
    for (const element of within(root, INTERACTIVE)) {
      if (isHidden(element) || roleOf(element) === '' || accessibleName(element)) continue;
      found.push({ kind: 'unnamed-control', element, target: describe(element) });
    }
    for (const element of within(root, 'img:not([alt])')) {
      if (isHidden(element)) continue;
      found.push({ kind: 'image-without-alt', element, target: describe(element) });
    }
    if (!doc.querySelector('main, [role="main"]')) found.push({ kind: 'no-main' });
    return found;
  }

  function pass(scope: Element): void {
    applyRules(scope);
    if (repairs.clickables) repairClickables(scope);
    if (repairs.names) repairNames(scope);
  }

  function fullPass(): WaoReport {
    if (stopped) return report();
    pass(root);
    if (repairs.landmarks) repairLandmarks();
    issues = collectIssues();
    observeShadowRoots(root);
    return notify();
  }

  function notify(): WaoReport {
    const current = report();
    options.onReport?.(current);
    return current;
  }

  function report(): WaoReport {
    return { changes: [...changes], issues: [...issues] };
  }

  // Enter and Space activate a repaired clickable, as they would a button.
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // Inside a shadow root, `target` is retargeted to the host at the document.
    const target = (event.composedPath()[0] ?? event.target) as Element | null;
    if (!target || target.nodeType !== 1) return;
    const marks = target.getAttribute(WAO_ATTRIBUTE) ?? '';
    if (!marks.split(' ').includes('role') || target.getAttribute('role') !== 'button') return;
    event.preventDefault();
    (target as HTMLElement).click();
  }

  // Content the page adds later: batch a burst of mutations into one pass
  // over the added subtrees, then a cheap refresh of the issue list.
  let pending = new Set<Element>();
  let scheduled = false;
  let stopped = false;
  // Still under `root`, through any shadow hosts: a node can be added and
  // then moved elsewhere before the batch runs.
  function inRoot(element: Element): boolean {
    let node: Element | null = element;
    while (node) {
      if (!node.isConnected) return false;
      if (root.contains(node)) return true;
      const tree = node.getRootNode();
      node = tree.nodeType === 11 ? (tree as ShadowRoot).host : null;
    }
    return false;
  }

  function flush(): void {
    scheduled = false;
    if (stopped) return;
    const scopes = [...pending].filter(inRoot);
    pending = new Set();
    for (const scope of scopes) {
      pass(scope);
      observeShadowRoots(scope);
    }
    if (repairs.landmarks) repairLandmarks();
    issues = collectIssues();
    notify();
  }
  const observer =
    options.observe !== false && view?.MutationObserver
      ? new view.MutationObserver((records) => {
          for (const record of records) {
            for (const node of Array.from(record.addedNodes)) {
              if (node.nodeType === 1) pending.add(node as Element);
            }
          }
          if (pending.size > 0 && !scheduled) {
            scheduled = true;
            setTimeout(flush, 50);
          }
        })
      : null;

  // A MutationObserver does not see into shadow roots, so each one is observed
  // on its own. A root attached after its host was optimised is picked up by
  // the next pass that reaches the host (or by `refresh()`).
  const observedShadowRoots = new WeakSet<ShadowRoot>();
  function observeShadowRoots(scope: Element): void {
    if (!observer) return;
    for (const shadowRoot of shadowRootsUnder(scope)) {
      if (observedShadowRoots.has(shadowRoot)) continue;
      observedShadowRoots.add(shadowRoot);
      observer.observe(shadowRoot, { childList: true, subtree: true });
    }
  }

  function restore(): void {
    if (stopped) return;
    stopped = true;
    observer?.disconnect();
    pending = new Set();
    doc.removeEventListener('keydown', onKeydown);
    options.signal?.removeEventListener('abort', restore);
    for (const [element, saved] of originals) {
      for (const [attribute, value] of saved) {
        if (value === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, value);
      }
    }
    originals.clear();
    changes.length = 0;
    issues = [];
  }

  if (options.signal?.aborted) {
    stopped = true;
  } else {
    observer?.observe(root, { childList: true, subtree: true });
    if (options.keyboard !== false) doc.addEventListener('keydown', onKeydown);
    options.signal?.addEventListener('abort', restore, { once: true });
    fullPass();
  }

  return {
    report,
    refresh: fullPass,
    restore,
    [DISPOSE]: restore,
  };
}
