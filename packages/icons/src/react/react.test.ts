import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ArrowRightIcon, iconComponents } from './index.ts';

const render = (props: Parameters<typeof ArrowRightIcon>[0] = {}) =>
  renderToStaticMarkup(createElement(ArrowRightIcon, props));

test('an icon is decorative by default', () => {
  const html = render();
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /role=/);
  assert.match(html, /class="continuity-icon continuity-icon-arrow-right"/);
  assert.match(html, /<path d="M4 12h16"/);
});

test('a title names the icon as an image', () => {
  const html = render({ title: 'Next', className: 'extra' });
  assert.match(html, /role="img"/);
  assert.doesNotMatch(html, /aria-hidden/);
  assert.match(html, /<title>Next<\/title>/);
  assert.match(html, /class="continuity-icon continuity-icon-arrow-right extra"/);
});

test('absoluteStrokeWidth holds the stroke in px', () => {
  assert.match(render({ size: 48, strokeWidth: 2, absoluteStrokeWidth: true }), /stroke-width="1"/);
});

test('the registry covers every component by name', () => {
  assert.equal(iconComponents['arrow-right'], ArrowRightIcon);
  assert.equal(ArrowRightIcon.displayName, 'ArrowRightIcon');
});
