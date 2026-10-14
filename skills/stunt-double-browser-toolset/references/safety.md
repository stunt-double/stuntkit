# Safety

## When to turn the guards on

| Situation                                                         | Setting                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| The agent browses sites you do not own (research, benchmarks, QA) | `safety: INDEX_SESSION_SAFETY` plus the network block |
| Testing your own product with test data, a sandbox checkout       | Leave `safety` unset (the default)                    |
| Your own product, but the agent must never type real secrets      | `{ refuseSensitiveInput: true }`                      |

A prompt saying "never pay or sign up" is a request the model may ignore. The guards live in the tools: a refused action never reaches the page, and the model gets an ordinary result (not an error) ending in `SAFETY_REFUSAL_SUFFIX`, so the rest of its turn still runs and it reports what it saw.

## What each guard refuses

- `refuseSensitiveInput`: typing or filling a password field, a card field (by `cc-*` autocomplete, or name, id, label or placeholder: card number, CVC, expiry, cardholder), or a card field inside a payment provider's iframe. Also any value containing a Luhn-valid card number, whatever field it is headed for.
- `blockSubmit`: a click, Enter or Space that would submit a form holding a password or card field, or a form whose button reads as pay, purchase, place order, subscribe, buy now, sign up, create account, register, join or start a trial; or a payment button outside a form ("Pay now", "Confirm and pay"). A link that only navigates to a sign-up page is allowed, and so are billing toggles ("Pay monthly").

## The network layer

The guards read the DOM, so a page built to disguise a payment form can get past them. Block payment providers too:

```ts
import { paymentBlocklistFor } from '@stunt-double/browser-toolset/safety';

const target = new URL(startUrl).hostname;
await driver.context.setDomainPolicy({ blockedDomains: paymentBlocklistFor(target) });
```

`paymentBlocklistFor` exempts the provider's own site when it is the one under test, so visiting paypal.com still works. `PAYMENT_PROVIDER_DOMAINS` is the full list; `hostMatchesDomain(host, domain)` is the suffix match to use in your own router. Use accounts that hold no real payment details.

## Navigation

`navigate` refuses anything but `http` and `https`, and refuses loopback, private and link-local hosts (`localhost`, `10.0.0.0/8`, `169.254.169.254`, `*.internal`) so a page cannot steer the model at the machine the browser runs on or a cloud metadata endpoint. `isPrivateHost(hostname)` is the check.

- Executor only: `allowPrivateHosts: true` when a local dev server or intranet is the point.
- Executor only: `checkNavigation(url)` returns a message to refuse, or `null` to allow. Use it for an allow list:

```ts
new BrowserToolsetExecutor(driver, {
  safety: INDEX_SESSION_SAFETY,
  checkNavigation: (url) =>
    hostMatchesDomain(new URL(url).hostname, 'example.com')
      ? null
      : 'Stay on example.com for this task.',
});
```

The navigate guard covers model-initiated navigation only. Links the model clicks go wherever they point, so pair an allow list with `setDomainPolicy({ allowedDomains })` when it must hold.

## Building your own policy

From `/safety`: `containsCardNumber`, `luhnValid`, `sensitiveFieldReason(facts)`, `submitReason(facts)`, `enterSubmitReason(facts)`, `refusalText(reason)`, and the patterns (`CARD_FIELD_PATTERN`, `PAYMENT_ACTION_PATTERN`, `COMMIT_ACTION_PATTERN`, `FORMLESS_COMMIT_PATTERN`). Each reason function returns a string to refuse or `null` to allow.

## Evidence

Typed text and form values are redacted in `ToolsetCallRecord.input` (`[7 characters]`), so records are safe to log. `redactInput(name, input)` does the same for your own logs.
