import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Window } from 'happy-dom';

import { WAO_ATTRIBUTE, accessibleName, optimise, type WaoOptions } from './index.ts';

function page(body: string, head = '') {
  const window = new Window();
  window.document.write(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`);
  const document = window.document as unknown as Document;
  const $ = (selector: string) => document.querySelector(selector)!;
  const run = (options: WaoOptions = {}) =>
    optimise({ root: document.documentElement, observe: false, ...options });
  return { window, document, $, run };
}

test('a div with an onclick handler becomes a focusable button', () => {
  const { $, run } = page(`<div id="buy" onclick="buy()">Buy now</div>`);
  const wao = run();
  assert.equal($('#buy').getAttribute('role'), 'button');
  assert.equal($('#buy').getAttribute('tabindex'), '0');
  assert.equal($('#buy').getAttribute(WAO_ATTRIBUTE), 'role focus');
  assert.deepEqual(
    wao.report().changes.map((c) => [c.kind, c.attribute, c.value]),
    [
      ['role', 'role', 'button'],
      ['focus', 'tabindex', '0'],
    ]
  );
});

test('only the outermost pointer element is a clickable, and never inside a link', () => {
  const { $, run } = page(`
    <style>.card { cursor: pointer }</style>
    <div class="card" id="card"><span id="inner">Open</span></div>
    <a href="/x"><span id="in-link" style="cursor: pointer">Go</span></a>
    <div id="wrapper" style="cursor: pointer"><button>Real</button></div>
  `);
  run();
  assert.equal($('#card').getAttribute('role'), 'button');
  assert.equal($('#inner').hasAttribute('role'), false);
  assert.equal($('#in-link').hasAttribute('role'), false);
  assert.equal($('#wrapper').hasAttribute('role'), false);
});

test('a script-assigned onclick property counts as clickable', () => {
  const { $, run } = page(`<span id="x">Delete</span>`);
  ($('#x') as HTMLElement).onclick = () => undefined;
  run();
  assert.equal($('#x').getAttribute('role'), 'button');
});

test('unnamed controls get a name from tooltips, icon classes and URLs', () => {
  const { $, run } = page(`
    <button id="tip" data-bs-original-title="Remove item"><svg></svg></button>
    <button id="icon"><i class="fa fa-solid fa-trash-can"></i></button>
    <a id="link" href="/account/settings"><img src="cog.png" alt=""></a>
    <a id="named" href="/home" title="Home"><i class="bi-house"></i></a>
  `);
  const wao = run();
  assert.equal($('#tip').getAttribute('aria-label'), 'Remove item');
  assert.equal($('#icon').getAttribute('aria-label'), 'Trash can');
  assert.equal($('#link').getAttribute('aria-label'), 'Settings');
  assert.equal($('#named').hasAttribute('aria-label'), false);
  assert.deepEqual(
    wao
      .report()
      .changes.filter((c) => c.kind === 'name')
      .map((c) => c.source),
    ['tooltip', 'icon', 'href']
  );
});

test('fields take a name from the text beside them, then their name attribute', () => {
  const { $, run } = page(`
    <table><tr><td>Email address:</td><td><input id="email"></td></tr></table>
    <span>Postcode *</span><input id="postcode">
    <input id="phone" name="phone_number">
    <label>Already named <input id="labelled"></label>
    <input id="placeholder" placeholder="Search">
  `);
  run();
  assert.equal($('#email').getAttribute('aria-label'), 'Email address');
  assert.equal($('#postcode').getAttribute('aria-label'), 'Postcode');
  assert.equal($('#phone').getAttribute('aria-label'), 'Phone number');
  assert.equal($('#labelled').hasAttribute('aria-label'), false);
  assert.equal($('#placeholder').hasAttribute('aria-label'), false);
});

test('a repaired clickable with only an icon is named too', () => {
  const { $, run } = page(`<div id="close" onclick="close()"><i class="icon-close"></i></div>`);
  run();
  assert.equal($('#close').getAttribute('role'), 'button');
  assert.equal($('#close').getAttribute('aria-label'), 'Close');
});

test('rules set roles, names and descriptions, overriding the page', () => {
  const { $, run } = page(`
    <div id="nav" class="menu"><a href="/">Home</a></div>
    <button id="go" aria-label="btn1">Go</button>
  `);
  run({
    rules: [
      { selector: '.menu', role: 'navigation', label: 'Primary' },
      { selector: '#go', label: 'Check out', description: 'Pays for the basket' },
      { selector: '::not-a-selector', label: 'ignored' },
    ],
  });
  assert.equal($('#nav').getAttribute('role'), 'navigation');
  assert.equal($('#nav').getAttribute('aria-label'), 'Primary');
  assert.equal($('#go').getAttribute('aria-label'), 'Check out');
  assert.equal($('#go').getAttribute('aria-description'), 'Pays for the basket');
});

test('a single obvious main candidate becomes the main landmark', () => {
  const one = page(`<div id="content">Hello</div>`);
  one.run();
  assert.equal(one.$('#content').getAttribute('role'), 'main');

  const two = page(`<div id="content">A</div><div class="main">B</div>`);
  const wao = two.run();
  assert.equal(two.$('#content').hasAttribute('role'), false);
  assert.ok(wao.report().issues.some((i) => i.kind === 'no-main'));

  const native = page(`<main>A</main><div id="content">B</div>`);
  native.run();
  assert.equal(native.$('#content').hasAttribute('role'), false);
});

test('what cannot be fixed is reported', () => {
  const { run } = page(`<main><button id="b"><svg></svg></button><img src="x.png"></main>`);
  const issues = run().report().issues;
  assert.deepEqual(
    issues.map((i) => [i.kind, i.target]),
    [
      ['unnamed-control', 'button#b'],
      ['image-without-alt', 'body > main > img'],
    ]
  );
});

test('restore puts every attribute back as it was', () => {
  const { document, run } = page(`
    <div id="a" onclick="x()" data-wao="kept"><i class="fa-search"></i></div>
    <button id="b" aria-label="Original">B</button>
    <div id="content">C</div>
  `);
  const before = document.body.innerHTML;
  const wao = run({ rules: [{ selector: '#b', label: 'Changed' }] });
  assert.notEqual(document.body.innerHTML, before);
  wao.restore();
  assert.equal(document.body.innerHTML, before);
  assert.deepEqual(wao.report(), { changes: [], issues: [] });
});

test('a second pass changes nothing', () => {
  const { document, run } = page(
    `<div onclick="x()"><i class="fa-search"></i></div><input name="q"><div id="content"></div>`
  );
  const wao = run();
  const html = document.body.innerHTML;
  const count = wao.report().changes.length;
  wao.refresh();
  assert.equal(document.body.innerHTML, html);
  assert.equal(wao.report().changes.length, count);
});

test('content added later is optimised', async () => {
  const { window, document, $ } = page(`<main id="app"></main>`);
  const wao = optimise({ root: document.documentElement });
  $('#app').innerHTML = `<div id="late" onclick="go()"><i class="icon-cart"></i></div>`;
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  assert.equal($('#late').getAttribute('role'), 'button');
  assert.equal($('#late').getAttribute('aria-label'), 'Cart');
  wao.restore();
  $('#app').innerHTML = `<div id="later" onclick="go()">x</div>`;
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  assert.equal($('#later').hasAttribute('role'), false);
});

test('Enter and Space activate a repaired clickable, and only that', () => {
  const { window, $, run } = page(
    `<div id="x" onclick="">Go</div><div id="y" role="button">No</div>`
  );
  let clicks = 0;
  $('#x').addEventListener('click', () => clicks++);
  $('#y').addEventListener('click', () => clicks++);
  const wao = run();
  const press = (el: Element, key: string) =>
    el.dispatchEvent(
      new window.KeyboardEvent('keydown', { key, bubbles: true }) as unknown as Event
    );
  press($('#x'), 'Enter');
  press($('#x'), ' ');
  press($('#x'), 'a');
  press($('#y'), 'Enter');
  assert.equal(clicks, 2);
  wao.restore();
  press($('#x'), 'Enter');
  assert.equal(clicks, 2);
});

test('accessible names follow the parts of accname WAO relies on', () => {
  const { $ } = page(`
    <span id="l1">Billing</span><span id="l2">address</span>
    <input id="a" aria-labelledby="l1 l2">
    <input id="b" type="submit">
    <button id="c"><img alt="Save"></button>
    <button id="d"><svg><title>Print</title></svg></button>
    <button id="e"><span aria-hidden="true">x</span></button>
    <img id="f" alt="">
  `);
  assert.equal(accessibleName($('#a')), 'Billing address');
  assert.equal(accessibleName($('#b')), 'Submit');
  assert.equal(accessibleName($('#c')), 'Save');
  assert.equal(accessibleName($('#d')), 'Print');
  assert.equal(accessibleName($('#e')), '');
  assert.equal(accessibleName($('#f')), '');
});

test('controls inside open shadow roots are repaired, and keep up with later content', async () => {
  const { window, document, $ } = page(`<main><div id="host"></div></main>`);
  const shadow = $('#host').attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <span id="l">Quantity</span><input id="qty" aria-labelledby="l">
    <div id="buy" onclick="buy()"><i class="fa-cart-plus"></i></div>
  `;
  const wao = optimise({ root: document.documentElement });
  const inside = (selector: string) => shadow.querySelector(selector)!;
  assert.equal(inside('#buy').getAttribute('role'), 'button');
  assert.equal(inside('#buy').getAttribute('aria-label'), 'Cart plus');
  // `aria-labelledby` resolves inside the shadow root, so the field is already named.
  assert.equal(inside('#qty').hasAttribute('aria-label'), false);

  // happy-dom hangs on `insertAdjacentHTML` inside a shadow root, so build the node.
  const late = document.createElement('span');
  late.id = 'late';
  late.setAttribute('onclick', 'go()');
  late.setAttribute('data-tooltip', 'Wishlist');
  shadow.append(late);
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  assert.equal(inside('#late').getAttribute('aria-label'), 'Wishlist');

  wao.restore();
  assert.equal(inside('#buy').hasAttribute('role'), false);
  assert.equal(inside('#late').hasAttribute('aria-label'), false);
});

test('shadow: false leaves shadow roots alone', () => {
  const { $, run } = page(`<main><div id="host"></div></main>`);
  const shadow = $('#host').attachShadow({ mode: 'open' });
  shadow.innerHTML = `<div id="buy" onclick="buy()">Buy</div>`;
  run({ shadow: false });
  assert.equal(shadow.querySelector('#buy')!.hasAttribute('role'), false);
});

test('an abort signal restores the page, and an aborted one never starts', () => {
  const { window, document, $, run } = page(`<main><div id="x" onclick="go()">Go</div></main>`);
  const before = document.body.innerHTML;
  const controller = new window.AbortController() as unknown as AbortController;
  run({ signal: controller.signal });
  assert.equal($('#x').getAttribute('role'), 'button');
  controller.abort();
  assert.equal(document.body.innerHTML, before);

  const late = run({ signal: controller.signal });
  assert.equal($('#x').hasAttribute('role'), false);
  assert.deepEqual(late.report(), { changes: [], issues: [] });
});

test('the handle is disposable, for `using wao = optimise()`', () => {
  // Node 22 cannot parse `using` yet, so this calls what it would.
  const { document, run } = page(`<main><div id="x" onclick="go()">Go</div></main>`);
  const before = document.body.innerHTML;
  const wao = run();
  assert.notEqual(document.body.innerHTML, before);
  wao[Symbol.dispose]();
  assert.equal(document.body.innerHTML, before);
  wao.restore(); // A second restore is a no-op.
  assert.equal(document.body.innerHTML, before);
});

test('onReport hears every pass, including content added later', async () => {
  const { window, document, $ } = page(`<main id="app"></main>`);
  const reports: number[] = [];
  const wao = optimise({
    root: document.documentElement,
    onReport: (report) => reports.push(report.changes.length),
  });
  $('#app').innerHTML = `<div onclick="go()">Go</div>`;
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  assert.deepEqual(reports, [0, 2]);
  wao.restore();
});
