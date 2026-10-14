# Adding WAO to a site you own

In every framework: run `optimise` once, in the browser, after the DOM exists, and restore on teardown. The observer handles content added later, so do not call it per route or per render.

## Plain HTML or a server-rendered site (Rails, Django, PHP, WordPress)

Copy `node_modules/@stunt-double/wao/dist/wao.global.js` into your static assets at build or deploy time (the package also exposes it to CDNs that read the `unpkg` and `jsdelivr` fields, but serving it yourself avoids a third-party script). Options go before it:

```html
<script>
  window.waoOptions = { rules: [{ selector: '.btn-go', label: 'Check out' }] };
</script>
<script src="/assets/wao.global.js" defer></script>
```

The handle is `window.wao`. With a Content Security Policy, put the options in a nonced inline script or in a small file loaded before WAO.

## React (Vite, CRA, Remix client)

```tsx
import { optimise, type WaoRule } from '@stunt-double/wao';
import { useEffect } from 'react';

export function AgentReady({ rules }: { rules?: WaoRule[] }) {
  useEffect(() => {
    const controller = new AbortController();
    optimise({ signal: controller.signal, rules });
    return () => controller.abort();
  }, [rules]);
  return null;
}
```

Render `<AgentReady />` once near the root. Define `rules` outside the component (or memoise them) so the effect does not rerun every render. Strict Mode's double effect is harmless: the first handle is aborted and restored.

## Next.js (App Router)

```tsx
// app/agent-ready.tsx
'use client';
import { optimise } from '@stunt-double/wao';
import { useEffect } from 'react';

export function AgentReady() {
  useEffect(() => {
    const controller = new AbortController();
    optimise({ signal: controller.signal });
    return () => controller.abort();
  }, []);
  return null;
}
```

Render it in `app/layout.tsx`. It runs after hydration, so React never sees the added attributes as a mismatch. In the Pages Router, put the same effect in `_app.tsx`. Do not use `next/script` with the global build and the npm entry together.

## Vue 3

```ts
// main.ts, after app.mount('#app')
import { optimise } from '@stunt-double/wao';
const wao = optimise();
// On unmount of the root app, if you ever do: wao.restore();
```

In Nuxt, do it in a client-only plugin (`plugins/wao.client.ts`) with `defineNuxtPlugin(() => { optimise(); })`.

## Svelte and SvelteKit

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { optimise } from '@stunt-double/wao';
  onMount(() => {
    const wao = optimise();
    return () => wao.restore();
  });
</script>
```

Put it in the root `+layout.svelte`. `onMount` never runs on the server.

## Angular

```ts
import { afterNextRender, Component, DestroyRef, inject } from '@angular/core';
import { optimise } from '@stunt-double/wao';

@Component({ selector: 'app-root', templateUrl: './app.component.html' })
export class AppComponent {
  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const wao = optimise();
      destroyRef.onDestroy(() => wao.restore());
    });
  }
}
```

## Scoping and opting out

- Optimise one widget: `optimise({ root: document.querySelector('#legacy-app')! })`.
- Turn a repair off: `optimise({ repairs: { landmarks: false } })`, for a page whose layout makes the main-candidate guess wrong.
- Leave web components alone: `shadow: false`.
- Watch what it does in development: `optimise({ onReport: (r) => console.table(r.issues.map(({ kind, target }) => ({ kind, target }))) })`.

## Prefer fixing the source

Each `report()` change is a hint about the real fix: a `name` change from an icon class is a missing `aria-label`; a `role` change on a `div` is a missing `<button>`. Ship WAO for what you cannot change soon, and move fixes into the markup over time.
