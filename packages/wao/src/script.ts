// The drop-in build: `<script src=".../wao.global.js" defer></script>`.
//
// Optimises the page once the DOM is ready and exposes the handle as
// `window.wao`. Options come from `window.waoOptions`, set before the script
// loads, so a site can ship its rules without a build step:
//
//   <script>window.waoOptions = { rules: [{ selector: '#cart', label: 'Basket' }] };</script>
//   <script src=".../wao.global.js" defer></script>
//
// `window.waoAudit()` reports what WAO would change without changing it.
// With `waoOptions.auto = false` the page is never optimised on load, so an
// agent harness can audit a page exactly as its users see it.

import { audit, optimise } from './optimise.ts';

window.waoAudit ??= (options) => audit({ ...window.waoOptions, ...options });

function start(): void {
  // A second copy of the script on the same page must not optimise twice.
  if (window.wao || window.waoOptions?.auto === false) return;
  window.wao = optimise(window.waoOptions);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
