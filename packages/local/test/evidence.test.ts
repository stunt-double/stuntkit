/**
 * The citation check in headless Chrome: a passed verdict cites what a person
 * sees on the page, not text that is in the DOM but hidden. Skipped, saying so,
 * on a machine with no Chrome.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import type { Page } from 'playwright-core';

import { PlaywrightDriver } from '../src/driver.ts';
import { cleanLocator, focusEvidence } from '../src/evidence.ts';

const PAGE = `<!doctype html><main>
  <h1>Basket</h1>
  <div style="display:none">Order confirmed</div>
  <div hidden>Please enter a valid email</div>
  <div style="visibility:hidden">Saved for later</div>
  <address>12 High Street<br>London</address>
  <input placeholder="Search mugs">
  <shop-button></shop-button>
</main>
<script>
  customElements.define('shop-button', class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = '<button>Add to basket</button>';
    }
  });
</script>`;

let profile: string | undefined;
let driver: PlaywrightDriver | undefined;
after(async () => {
  await driver?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});

test('evidence is matched against what is rendered', async (t) => {
  profile = await mkdtemp(join(tmpdir(), 'stuntdouble-evidence-'));
  try {
    driver = await PlaywrightDriver.launch({
      profileDir: profile,
      headless: true,
      viewport: { width: 1280, height: 720 },
      touch: false,
      refuseNavigation: () => null,
    });
  } catch {
    return t.skip('No Chrome on this machine');
  }
  const page = (await driver.context.activePage())!;
  await (page as unknown as { raw: Page }).raw.setContent(PAGE);
  const found = (locator: { text?: string; selector?: string }) =>
    focusEvidence(page, cleanLocator(locator));

  // Hidden text is not evidence.
  assert.equal(await found({ text: 'Order confirmed' }), null);
  assert.equal(await found({ text: 'Please enter a valid email' }), null);
  assert.equal(await found({ text: 'Saved for later' }), null);
  // Rendered text is, across a line break and inside a shadow root.
  assert.equal(await found({ text: '12 High Street London' }), 'text');
  assert.equal(await found({ text: 'Add to basket' }), 'text');
  assert.equal(await found({ text: 'search mugs' }), 'text');
  // A selector for the whole page proves nothing; with text, it has to show it.
  assert.equal(await found({ selector: 'body' }), null);
  assert.equal(await found({ selector: 'main' }), null);
  assert.equal(await found({ selector: 'h1' }), 'selector');
  assert.equal(await found({ selector: 'h1', text: 'Order confirmed' }), null);
  assert.equal(await found({ selector: 'address', text: 'London' }), 'selector');
});

test('a page that never answers is a miss, not a run that hangs', async () => {
  const hung = { evaluate: () => new Promise(() => {}), waitForTimeout: async () => {} };
  const via = await focusEvidence(
    hung as unknown as Parameters<typeof focusEvidence>[0],
    cleanLocator({ text: 'Basket' }),
    20
  );
  assert.equal(via, null);
});
