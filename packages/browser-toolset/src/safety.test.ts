/**
 * Benchmark sessions promise they never pay or sign up for real. These pin the
 * guards that keep that promise, and that they stay out of the way of every
 * run that does not ask for them.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DirectBrowserTools } from './direct-tools.ts';
import type { BrowserDriver, DriverPage } from './driver.ts';
import { BrowserToolsetExecutor } from './executor.ts';
import {
  containsCardNumber,
  type ElementFacts,
  luhnValid,
  paymentBlocklistFor,
  sensitiveFieldReason,
  submitReason,
} from './safety.ts';

type Call = { method: string; args: unknown[] };

const FACTS: ElementFacts = {
  tag: 'input',
  type: 'text',
  autocomplete: '',
  name: '',
  id: '',
  ariaLabel: '',
  placeholder: '',
  label: '',
  role: 'textbox',
  isNavigatingLink: false,
  isSubmit: false,
  isButton: false,
  iframeSrc: '',
  iframeTitle: '',
  inForm: false,
  formSensitive: false,
  formSubmitLabel: '',
};

const facts = (overrides: Partial<ElementFacts>): ElementFacts => ({ ...FACTS, ...overrides });

/**
 * A page whose script answers `inspect` with the given facts (for any target),
 * `resolve` with a point, and `form` with success. Records every op it is asked.
 */
function fakeDriver(inspected: ElementFacts | null) {
  const calls: Call[] = [];
  const ops: string[] = [];
  const page = {
    id: 'page-1',
    goto: async () => {},
    goBack: async () => {},
    goForward: async () => {},
    screenshot: async () => Buffer.from('png-bytes'),
    evaluate: async (expr: string) => {
      const op = /"op":"(\w+)"/.exec(expr)?.[1] ?? '';
      ops.push(op);
      if (op === 'inspect') return { ok: true, facts: inspected };
      if (op === 'form') return { ok: true, description: 'Set ref_1' };
      return { ok: true, x: 40, y: 60, inViewport: true };
    },
    url: async () => 'https://shop.example/checkout',
    title: async () => 'Checkout',
    click: async (...args: unknown[]) => void calls.push({ method: 'click', args }),
    hover: async () => {},
    scroll: async () => {},
    dragAndDrop: async () => {},
    type: async (...args: unknown[]) => void calls.push({ method: 'type', args }),
    keyPress: async (...args: unknown[]) => void calls.push({ method: 'key', args }),
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    close: async () => {},
  } as unknown as DriverPage;
  const driver = {
    context: {
      activePage: async () => page,
      pages: async () => [page],
      setDomainPolicy: async () => {},
      newPage: async () => page,
      setActivePage: async () => {},
    },
    act: async () => ({ success: true }),
    extract: async () => ({}),
    close: async () => {},
  } as unknown as BrowserDriver;
  return { driver, calls, ops };
}

const guarded = (driver: BrowserDriver) =>
  new DirectBrowserTools(driver, {
    viewport: { width: 1280, height: 720 },
    settleMs: 0,
    safety: { refuseSensitiveInput: true, blockSubmit: true },
  });

const plain = (driver: BrowserDriver) =>
  new DirectBrowserTools(driver, { viewport: { width: 1280, height: 720 }, settleMs: 0 });

// A published test card number (Visa), Luhn-valid by construction.
const TEST_CARD = '4242 4242 4242 4242';

test('Luhn: test card numbers pass, a near miss and a phone number do not', () => {
  assert.equal(luhnValid('4242424242424242'), true);
  assert.equal(luhnValid('4242424242424241'), false);
  assert.equal(containsCardNumber(TEST_CARD), true);
  assert.equal(containsCardNumber('4242-4242-4242-4242'), true);
  assert.equal(containsCardNumber('Card: 5555555555554444 exp 12/30'), true);
  assert.equal(containsCardNumber('1234 5678 9012 3456'), false, 'not Luhn-valid');
  assert.equal(containsCardNumber('+61 2 9876 5432'), false);
  assert.equal(containsCardNumber('Order 12345'), false);
});

test('a password field is refused, and nothing is typed', async () => {
  const { driver, calls } = fakeDriver(facts({ type: 'password', name: 'password' }));
  const out = await guarded(driver).run('type', { ref: 'ref_4', text: 'hunter2' });
  assert.equal(out.error, undefined, 'a refusal is a result, not an error');
  assert.match(out.text, /Refused: That is a password field\./);
  assert.match(out.text, /report what you observed/);
  assert.equal(calls.filter((c) => c.method === 'type').length, 0);
});

test('a cc-* autocomplete field is refused for type and form_input', async () => {
  const { driver, calls, ops } = fakeDriver(facts({ autocomplete: 'billing cc-number' }));
  const tools = guarded(driver);
  const typed = await tools.run('type', { text: 'Jane Citizen' });
  assert.match(typed.text, /payment card field/);
  const filled = await tools.run('form_input', { ref: 'ref_7', value: 'Jane Citizen' });
  assert.match(filled.text, /payment card field/);
  assert.equal(calls.filter((c) => c.method === 'type').length, 0);
  assert.ok(!ops.includes('form'), 'the field is never set');
});

test('a field named for the card number or CVC is refused', () => {
  assert.ok(sensitiveFieldReason(facts({ name: 'cardNumber' })));
  assert.ok(sensitiveFieldReason(facts({ id: 'cc-cvc' })));
  assert.ok(sensitiveFieldReason(facts({ ariaLabel: 'Security code' })));
  assert.ok(sensitiveFieldReason(facts({ placeholder: 'MM / YY' })));
  assert.ok(
    sensitiveFieldReason(
      facts({ tag: 'iframe', iframeSrc: 'https://js.stripe.com/v3/elements-inner-card.html' })
    )
  );
  assert.equal(sensitiveFieldReason(facts({ name: 'email', label: 'Email address' })), null);
  assert.equal(
    sensitiveFieldReason(facts({ name: 'gift_message', label: 'Gift card message' })),
    null
  );
});

test('a Luhn-valid card number is refused whatever field it is headed for', async () => {
  const { driver, calls } = fakeDriver(facts({ name: 'notes' }));
  const out = await guarded(driver).run('type', { text: TEST_CARD });
  assert.match(out.text, /That value is a card number/);
  assert.equal(calls.filter((c) => c.method === 'type').length, 0);
});

test('a 16-digit number that fails Luhn types normally', async () => {
  const { driver, calls } = fakeDriver(facts({ name: 'reference' }));
  const out = await guarded(driver).run('type', { text: '1234 5678 9012 3456' });
  assert.doesNotMatch(out.text, /Refused/);
  assert.deepEqual(
    calls.filter((c) => c.method === 'type').map((c) => c.args[0]),
    ['1234 5678 9012 3456']
  );
});

test('a submit control in a form holding a password or card field is refused', async () => {
  const { driver, calls } = fakeDriver(
    facts({
      tag: 'button',
      type: 'submit',
      role: 'button',
      label: 'Continue',
      isSubmit: true,
      isButton: true,
      inForm: true,
      formSensitive: true,
    })
  );
  const out = await guarded(driver).run('click', { ref: 'ref_9' });
  assert.match(out.text, /Refused: That would submit a form holding a password or payment card/);
  assert.equal(calls.filter((c) => c.method === 'click').length, 0);
});

test('a "Create account" submit and a "Pay now" button are refused', () => {
  const submit = { tag: 'button', type: 'submit', isSubmit: true, isButton: true, inForm: true };
  assert.ok(submitReason(facts({ ...submit, label: 'Create account' })));
  assert.ok(submitReason(facts({ ...submit, label: 'Subscribe' })));
  // No form at all: checkouts built in script still pay on a plain button.
  assert.ok(
    submitReason(facts({ tag: 'button', type: 'button', isButton: true, label: 'Pay now' }))
  );
  assert.ok(
    submitReason(facts({ tag: 'button', type: 'button', isButton: true, label: 'Place order' }))
  );
  // Billing toggles and choosing a provider are not paying.
  assert.equal(
    submitReason(facts({ tag: 'button', type: 'button', isButton: true, label: 'Pay monthly' })),
    null
  );
  assert.equal(submitReason(facts({ ...submit, label: 'Search', formSensitive: false })), null);
});

test('a "Sign up" link that only navigates is clicked', async () => {
  const { driver, calls } = fakeDriver(
    facts({ tag: 'a', role: 'link', label: 'Sign up', isNavigatingLink: true, inForm: false })
  );
  const out = await guarded(driver).run('click', { ref: 'ref_2' });
  assert.doesNotMatch(out.text, /Refused/);
  assert.equal(calls.filter((c) => c.method === 'click').length, 1);
});

test('Enter in a sign-up form is refused; Enter in a search box is not', async () => {
  const signup = fakeDriver(
    facts({ name: 'email', inForm: true, formSubmitLabel: 'Sign up for free' })
  );
  const refused = await guarded(signup.driver).run('key', { text: 'Enter' });
  assert.match(refused.text, /Refused: Enter would submit "Sign up for free"/);
  assert.equal(signup.calls.filter((c) => c.method === 'key').length, 0);

  const search = fakeDriver(facts({ name: 'q', inForm: true, formSubmitLabel: 'Search' }));
  const pressed = await guarded(search.driver).run('key', { text: 'Enter' });
  assert.doesNotMatch(pressed.text, /Refused/);
  assert.equal(search.calls.filter((c) => c.method === 'key').length, 1);
});

test('the guards are off by default: nothing is inspected and everything runs', async () => {
  const sensitive = facts({
    type: 'password',
    tag: 'button',
    isSubmit: true,
    isButton: true,
    inForm: true,
    formSensitive: true,
    label: 'Pay now',
  });
  const { driver, calls, ops } = fakeDriver(sensitive);
  const tools = plain(driver);
  await tools.run('type', { text: TEST_CARD });
  await tools.run('click', { ref: 'ref_9' });
  await tools.run('key', { text: 'Enter' });
  await tools.run('form_input', { ref: 'ref_7', value: TEST_CARD });
  assert.ok(!ops.includes('inspect'), 'no guard ran');
  assert.deepEqual(
    calls.map((c) => c.method),
    ['type', 'click', 'key']
  );
  assert.ok(ops.includes('form'));

  // The executor on its own, with no safety options.
  const ex = new BrowserToolsetExecutor(fakeDriver(sensitive).driver);
  const out = await ex.execute('type', { text: TEST_CARD });
  assert.deepEqual(out, [{ type: 'text', text: 'Typed 19 characters' }]);
});

test('a refusal inside a browser toolset turn does not halt the calls after it', async () => {
  const { driver, calls } = fakeDriver(facts({ type: 'password' }));
  const ex = new BrowserToolsetExecutor(driver, {
    safety: { refuseSensitiveInput: true, blockSubmit: true },
  });
  const { results } = await ex.runTurn([
    { id: 'a', name: 'type', input: { text: 'secret' }, toolset_name: 'browser' },
    { id: 'b', name: 'wait', input: { duration: 0 }, toolset_name: 'browser' },
  ]);
  assert.equal(results[0].is_error, undefined);
  assert.equal(results[1].is_error, undefined);
  assert.equal(calls.filter((c) => c.method === 'type').length, 0);
});

test('the payment blocklist exempts the provider being visited', () => {
  const shop = paymentBlocklistFor('www.shop.example');
  assert.ok(shop.includes('js.stripe.com'));
  assert.ok(shop.includes('paypal.com'));
  const paypal = paymentBlocklistFor('www.paypal.com');
  assert.ok(!paypal.includes('paypal.com'));
  assert.ok(paypal.includes('js.stripe.com'));
  assert.ok(!paymentBlocklistFor('stripe.com').includes('js.stripe.com'));
});
