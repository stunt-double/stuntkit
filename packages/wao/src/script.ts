// The drop-in build: `<script src=".../wao.global.js" defer></script>`.
//
// Optimises the page once the DOM is ready and exposes the handle as
// `window.wao`. Options come from `window.waoOptions`, set before the script
// loads, so a site can ship its rules without a build step:
//
//   <script>window.waoOptions = { rules: [{ selector: '#cart', label: 'Basket' }] };</script>
//   <script src=".../wao.global.js" defer></script>

import { optimise } from './optimise.ts';

function start(): void {
  // A second copy of the script on the same page must not optimise twice.
  if (window.wao) return;
  window.wao = optimise(window.waoOptions);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
