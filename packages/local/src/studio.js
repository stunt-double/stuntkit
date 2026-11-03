// Stunt Double Studio: the views `stuntdouble studio` adds to the viewer
// (ui.html), served only by studio.ts. Editing actors and checklists, starting
// a run on the person's own connection or in the cloud, and settings.
//
// Every value from a file or a server reply is set as text through h(), never
// as markup, and only http(s) addresses become links. The page never sees a
// key: the server says only whether one is set and where from.

/* global window, document, history, location, CSS */

(() => {
  const sd = window.stuntdouble;
  const { h, icon, pageHeader, emptyState, getJson, announce } = sd;

  Object.assign(sd.ICONS, {
    settings:
      '<path d="M10.25 5.48V3.17a9 9 0 0 1 3.5 0v2.31a6.75 6.75 0 0 1 1.62.67l1.64-1.63a9 9 0 0 1 2.47 2.47l-1.63 1.64a6.75 6.75 0 0 1 .67 1.62h2.31a9 9 0 0 1 0 3.5h-2.31a6.75 6.75 0 0 1-.67 1.62l1.63 1.64a9 9 0 0 1-2.47 2.47l-1.64-1.63a6.75 6.75 0 0 1-1.62.67v2.31a9 9 0 0 1-3.5 0v-2.31a6.75 6.75 0 0 1-1.62-.67l-1.64 1.63a9 9 0 0 1-2.47-2.47l1.63-1.64a6.75 6.75 0 0 1-.67-1.62H3.17a9 9 0 0 1 0-3.5h2.31a6.75 6.75 0 0 1 .67-1.62L4.52 6.99a9 9 0 0 1 2.47-2.47l1.64 1.63a6.75 6.75 0 0 1 1.62-.67z"/><circle cx="12" cy="12" r="2.75"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    pencil: '<path d="M4 20v-4L16 4l4 4L8 20z"/><path d="M13.5 6.5l4 4"/>',
    'arrow-up': '<path d="M12 20V4"/><path d="M6 10l6-6 6 6"/>',
    'arrow-down': '<path d="M12 4v16"/><path d="M6 14l6 6 6-6"/>',
    key: '<circle cx="7.5" cy="16.5" r="4.5"/><path d="M10.68 13.32L20 4"/><path d="M16.5 7.5l2.5 2.5"/><path d="M14 10l2 2"/>',
    'log-out':
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M10 12h10"/><path d="M16 8l4 4-4 4"/>',
    trash:
      '<path d="M4 6h16"/><path d="M9 6V3h6v3"/><path d="M6 6v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/><path d="M10 10v7"/><path d="M14 10v7"/>',
    coins: '<circle cx="9" cy="9" r="6"/><path d="M15 9a6 6 0 1 1-6 6"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
    sparkles:
      '<path d="M10 5q1 7 8 8-7 1-8 8-1-7-8-8 7-1 8-8z"/><path d="M18 3v4"/><path d="M16 5h4"/>',
  });

  // ── Styles the forms need, on the viewer's tokens ─────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .form { display: grid; gap: 2rem; max-width: 42rem; }
    .form-section { display: grid; gap: 1rem; }
    .form-section > h2 { font-size: 0.9375rem; }
    .form-section > .section-note { margin-top: -0.5rem; }
    .fields { display: grid; gap: 1rem; }
    @media (min-width: 40rem) { .fields.two { grid-template-columns: 1fr 1fr; } }
    .field { display: grid; gap: 0.375rem; min-width: 0; align-content: start; }
    .field > label, .field > .label { font-size: 0.8125rem; font-weight: 500; }
    .field .hint { font-size: 0.75rem; color: var(--muted-foreground); }
    .field-error { font-size: 0.75rem; color: var(--destructive); }
    .field-error:empty { display: none; }
    .input {
      width: 100%; min-width: 0; height: 2.25rem; padding: 0.25rem 0.75rem;
      border: 1px solid var(--input); border-radius: var(--radius-md);
      background: var(--background); color: var(--foreground);
      font: 400 16px/1.4 var(--font-sans);
      transition: border-color var(--duration-quick) ease, box-shadow var(--duration-quick) ease;
    }
    @media (min-width: 48rem) { .input { font-size: 14px; } }
    textarea.input { height: auto; min-height: 5.5rem; padding-block: 0.5rem; resize: vertical; }
    select.input { padding-right: 2rem; }
    .input::placeholder { color: color-mix(in oklch, var(--muted-foreground) 80%, transparent); }
    .input:hover { border-color: color-mix(in oklch, var(--foreground) 30%, transparent); }
    .input:focus-visible {
      outline: none; border-color: var(--ring);
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 20%, transparent);
    }
    .input[aria-invalid='true'] {
      border-color: var(--destructive);
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--destructive) 18%, transparent);
    }
    .input.mono { font-family: var(--font-mono); }
    .check-label { display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.8125rem; }
    .check-label input { margin-top: 0.2rem; accent-color: var(--primary); }
    .form-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .form-actions .note { font-size: 0.8125rem; color: var(--muted-foreground); }
    .rows { display: grid; }
    .rows > .row-card { padding: 1rem; display: grid; gap: 0.75rem; }
    .rows > .row-card + .row-card { border-top: 1px solid color-mix(in oklch, var(--border) 60%, transparent); }
    .row-top { display: flex; gap: 0.5rem; align-items: center; justify-content: space-between; }
    .row-top .overline { margin: 0; }
    .row-tools { display: flex; gap: 0.25rem; }
    .row-fields { display: grid; gap: 0.75rem; }
    @media (min-width: 40rem) {
      .row-fields.check-row { grid-template-columns: 12rem 1fr; }
      .row-fields.check-row .wide { grid-column: 1 / -1; }
      .row-fields.knowledge-row { grid-template-columns: 10rem 1fr; }
      .row-fields.knowledge-row .wide { grid-column: 1 / -1; }
      .row-fields.rules { grid-template-columns: repeat(3, 1fr); }
    }
    .btn.ghost { border-color: transparent; background: transparent; color: var(--muted-foreground); }
    .btn.ghost:hover { background: var(--accent); color: var(--accent-foreground); }
    .btn.icon-only { width: 2rem; padding: 0; }
    .btn.icon-only:has(> svg) { padding: 0; }
    .choice { display: grid; gap: 0.5rem; }
    .choice label {
      display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem; align-items: start;
      padding: 0.875rem 1rem; border: 1px solid var(--border); border-radius: var(--radius-lg);
      background: var(--card); cursor: pointer;
    }
    .choice label:has(input:checked) { border-color: var(--ring); box-shadow: 0 0 0 1px var(--ring); }
    .choice label:has(input:disabled) { cursor: default; opacity: 0.6; }
    .choice input { margin-top: 0.2rem; accent-color: var(--primary); }
    .choice strong { font-weight: 500; }
    .choice .hint { grid-column: 2; font-size: 0.8125rem; color: var(--muted-foreground); }
    .def-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; padding-left: 1.5rem; }
    .usage { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; padding: 0.75rem 1rem; font-size: 0.8125rem; color: var(--muted-foreground); }
    .usage .fact { display: inline-flex; gap: 0.375rem; align-items: center; }
    .usage .mono { font-variant-numeric: tabular-nums; color: var(--foreground); }
    .presets { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .settings-card { padding: 1.25rem; display: grid; gap: 1rem; }
    .result-text { font-size: 0.8125rem; }
    .result-text.ok { color: var(--success-ink); }
    .result-text.bad { color: var(--destructive); }
  `;
  document.head.append(style);

  // ── Chrome ────────────────────────────────────────────────────────────────
  document.querySelector('.bar .product').textContent = 'Stunt Double Studio';
  document.title = 'Stunt Double Studio';
  const nav = document.querySelector('.bar nav');
  nav.setAttribute('aria-label', 'Studio');
  nav.replaceChildren(
    ...[
      ['/', 'Runs'],
      ['/checklists', 'Checklists'],
      ['/actors', 'Actors'],
      ['/settings', 'Settings'],
    ].map(([href, label]) => h('a', { href, 'data-nav': true }, label))
  );
  document
    .querySelector('footer p')
    .replaceChildren(
      'Studio runs use your own model connection and a browser on this machine, one at a time. The cloud runs on schedules and in parallel, records every run and shares reports with your team. ',
      h('a', { href: 'https://stuntdouble.io/pricing' }, 'See plans')
    );

  // ── Helpers ───────────────────────────────────────────────────────────────
  let status = null;
  async function refresh() {
    status = await getJson('/api/studio');
    return status;
  }

  function go(path) {
    history.pushState(null, '', path);
    window.scrollTo(0, 0);
    sd.render(true);
  }

  /** A write to the Studio's API. Resolves to {ok, status, data}. */
  async function send(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
    } catch {
      return {
        ok: false,
        status: 0,
        data: { error: 'The Studio is not answering. Is it still running?' },
      };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  let fieldSeq = 0;
  /** A labelled control with its hint and its error line, found by `path`. */
  function field(label, control, opts = {}) {
    const id = control.id || 'f' + ++fieldSeq;
    control.id = id;
    const errorId = id + '-error';
    const hintId = opts.hint ? id + '-hint' : null;
    control.setAttribute('aria-describedby', [hintId, errorId].filter(Boolean).join(' '));
    return h(
      'div',
      { class: 'field' + (opts.className ? ' ' + opts.className : ''), 'data-path': opts.path },
      h('label', { for: id }, label),
      control,
      opts.hint && h('p', { class: 'hint', id: hintId }, opts.hint),
      h('p', { class: 'field-error', id: errorId, role: 'alert' })
    );
  }
  const input = (attrs) => h('input', { class: 'input', type: 'text', ...attrs });
  const textarea = (attrs, value) => {
    const el = h('textarea', { class: 'input', ...attrs });
    el.value = value ?? '';
    return el;
  };
  function select(attrs, options, value) {
    const el = h(
      'select',
      { class: 'input', ...attrs },
      options.map(([v, label]) => h('option', { value: v }, label))
    );
    el.value = value ?? options[0][0];
    return el;
  }

  /**
   * Show the server's field errors beside their fields. An error on a path
   * with no field of its own lands on the nearest field above it, or in the
   * notice at the top of the form.
   */
  function showErrors(form, issues, notice) {
    for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    const loose = [];
    for (const issue of issues) {
      const parts = issue.path ? issue.path.split('.') : [];
      let target = null;
      for (let n = parts.length; n > 0 && !target; n--) {
        target = form.querySelector(
          '[data-path="' + CSS.escape(parts.slice(0, n).join('.')) + '"]'
        );
      }
      if (!target) {
        loose.push(issue.message);
        continue;
      }
      const line = target.querySelector('.field-error');
      line.textContent = line.textContent ? line.textContent + ' ' + issue.message : issue.message;
      target.querySelector('.input')?.setAttribute('aria-invalid', 'true');
    }
    notice.replaceChildren();
    notice.hidden = issues.length === 0;
    if (issues.length) {
      notice.append(
        icon('alert-triangle'),
        h(
          'div',
          {},
          h(
            'p',
            {},
            issues.length === 1
              ? 'Fix the field marked below.'
              : 'Fix the ' + issues.length + ' fields marked below.'
          ),
          loose.map((m) => h('p', {}, m))
        )
      );
      const first = form.querySelector('[aria-invalid="true"]');
      (first || notice).focus?.();
      announce(
        issues.length === 1 ? 'One field needs fixing' : issues.length + ' fields need fixing'
      );
    }
  }
  const noticeBox = () => h('div', { class: 'notice warning', hidden: true, tabindex: '-1' });

  function pending(button, label) {
    button.disabled = true;
    const text = button.lastChild;
    const before = text.textContent;
    text.textContent = label;
    return () => {
      button.disabled = false;
      text.textContent = before;
    };
  }

  // ── Onboarding ────────────────────────────────────────────────────────────
  function renderWelcome() {
    const notice = noticeBox();
    const url = input({
      name: 'url',
      type: 'url',
      placeholder: 'http://localhost:3000',
      autocomplete: 'url',
      required: true,
    });
    const submit = h(
      'button',
      { type: 'submit', class: 'btn primary' },
      h('span', {}, 'Create the project')
    );
    const form = h(
      'form',
      {
        class: 'form',
        novalidate: true,
        onsubmit: async (event) => {
          event.preventDefault();
          const done = pending(submit, 'Creating');
          const res = await send('POST', '/api/studio/init', { url: url.value.trim() });
          done();
          if (res.ok) {
            await refresh();
            go('/checklists/' + res.data.checklist);
          } else
            showErrors(form, res.data.issues || [{ path: '', message: res.data.error }], notice);
        },
      },
      notice,
      h(
        'div',
        { class: 'form-section' },
        field('Address to test', url, {
          path: 'url',
          hint: 'Localhost works: the browser runs on this machine.',
        })
      ),
      h('div', { class: 'form-actions' }, submit)
    );
    return [
      pageHeader({
        title: 'Test your product with an AI actor',
        description:
          'Studio keeps actors, checklists and runs as files in .stuntdouble/, in ' +
          status.project +
          '. Give it an address and it writes a first-time visitor and a first checklist to start from.',
      }),
      h('div', { class: 'stack' }, form),
    ];
  }

  // ── Lists ─────────────────────────────────────────────────────────────────
  function cloudBadge(cloud) {
    return cloud && Object.values(cloud).some((v) => v && typeof v !== 'object')
      ? h('span', { class: 'badge arc' }, 'Linked to the cloud')
      : h('span', { class: 'badge secondary' }, 'Local only');
  }
  function unreadable(entry) {
    return h(
      'li',
      { class: 'def' },
      h(
        'div',
        { class: 'def-head' },
        h(
          'span',
          { class: 'def-name' },
          icon('alert-triangle', 'tone-error'),
          h('code', {}, entry.slug)
        ),
        h('span', { class: 'badge warning' }, 'Unreadable')
      ),
      h('p', { class: 'def-body error-text' }, entry.error)
    );
  }

  async function renderChecklists() {
    const { checklists } = await getJson('/api/definitions');
    return [
      pageHeader({
        title: 'Checklists',
        description:
          'What an actor checks on each run. Each one is a file in .stuntdouble/checklists/.',
        actions: h(
          'a',
          { class: 'btn primary', href: '/checklists/new', 'data-nav': true },
          icon('plus'),
          h('span', {}, 'New checklist')
        ),
      }),
      checklists.length === 0
        ? emptyState(
            'checklist',
            'No checklists yet',
            'A checklist names the page to start on, what to do and the checks to judge.'
          )
        : h(
            'ul',
            { class: 'group card' },
            checklists.map((entry) =>
              entry.error
                ? unreadable(entry)
                : h(
                    'li',
                    { class: 'def' },
                    h(
                      'div',
                      { class: 'def-head' },
                      h(
                        'span',
                        { class: 'def-name' },
                        icon('checklist'),
                        h('span', { class: 'truncate' }, entry.data.name)
                      ),
                      cloudBadge(entry.data.cloud)
                    ),
                    h(
                      'div',
                      { class: 'def-facts' },
                      h('code', {}, entry.slug),
                      h('span', { class: 'fact' }, icon('actor'), entry.data.actor),
                      h('span', { class: 'fact truncate' }, icon('globe'), entry.data.url),
                      h(
                        'span',
                        { class: 'fact mono' },
                        String(entry.data.checks.length).padStart(2, '0') + ' checks'
                      )
                    ),
                    h('p', { class: 'def-body' }, entry.data.instructions),
                    h(
                      'div',
                      { class: 'def-actions' },
                      h(
                        'a',
                        {
                          class: 'btn outline',
                          href: '/checklists/' + encodeURIComponent(entry.slug) + '/run',
                          'data-nav': true,
                        },
                        icon('play'),
                        h('span', {}, 'Run')
                      ),
                      h(
                        'a',
                        {
                          class: 'btn ghost',
                          href: '/checklists/' + encodeURIComponent(entry.slug),
                          'data-nav': true,
                        },
                        icon('pencil'),
                        h('span', {}, 'Edit')
                      )
                    )
                  )
            )
          ),
    ];
  }

  async function renderActors() {
    const { actors } = await getJson('/api/definitions');
    return [
      pageHeader({
        title: 'Actors',
        description:
          'The people your checklists are run as. Each one is a file in .stuntdouble/actors/.',
        actions: h(
          'a',
          { class: 'btn primary', href: '/actors/new', 'data-nav': true },
          icon('plus'),
          h('span', {}, 'New actor')
        ),
      }),
      actors.length === 0
        ? emptyState(
            'actor',
            'No actors yet',
            'An actor is a persona described by role, such as a first-time visitor or a busy finance manager.'
          )
        : h(
            'ul',
            { class: 'group card' },
            actors.map((entry) =>
              entry.error
                ? unreadable(entry)
                : h(
                    'li',
                    { class: 'def' },
                    h(
                      'div',
                      { class: 'def-head' },
                      h(
                        'span',
                        { class: 'def-name' },
                        icon('actor'),
                        h('span', { class: 'truncate' }, entry.data.name)
                      ),
                      cloudBadge(entry.data.cloud)
                    ),
                    h(
                      'div',
                      { class: 'def-facts' },
                      h('code', {}, entry.slug),
                      entry.data.persist_login && h('span', {}, 'Keeps its logins')
                    ),
                    entry.data.description && h('p', { class: 'def-body' }, entry.data.description),
                    entry.data.knowledge.length > 0 &&
                      h(
                        'p',
                        { class: 'def-body fact' },
                        icon('knowledge'),
                        'Knows: ' + entry.data.knowledge.map((k) => k.title).join(', ')
                      ),
                    h(
                      'div',
                      { class: 'def-actions' },
                      h(
                        'a',
                        {
                          class: 'btn ghost',
                          href: '/actors/' + encodeURIComponent(entry.slug),
                          'data-nav': true,
                        },
                        icon('pencil'),
                        h('span', {}, 'Edit')
                      )
                    )
                  )
            )
          ),
    ];
  }

  // ── Editors ───────────────────────────────────────────────────────────────
  const slugify = (text) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

  /** A list of rows, each a set of inputs, that can be added to, moved and removed. */
  function rowEditor({ items, blank, build, label, addLabel, path }) {
    const list = h('div', { class: 'rows' });
    const rows = items.map((item) => ({ item }));
    function draw() {
      list.replaceChildren(
        ...rows.map((row, i) => {
          row.read = null;
          const { node, read } = build(row.item, i);
          row.read = read;
          const tool = (mark, text, onclick, disabled) =>
            h(
              'button',
              {
                type: 'button',
                class: 'btn ghost icon-only',
                'aria-label': text + ' ' + (i + 1),
                title: text,
                disabled,
                onclick,
              },
              icon(mark)
            );
          return h(
            'div',
            { class: 'row-card', 'data-path': path + '.' + i },
            h(
              'div',
              { class: 'row-top' },
              h('p', { class: 'overline' }, label + ' ' + String(i + 1).padStart(2, '0')),
              h(
                'div',
                { class: 'row-tools' },
                tool('arrow-up', 'Move up', () => move(i, -1), i === 0),
                tool('arrow-down', 'Move down', () => move(i, 1), i === rows.length - 1),
                tool('trash', 'Remove', () => {
                  collect();
                  rows.splice(i, 1);
                  draw();
                })
              )
            ),
            node
          );
        })
      );
    }
    function collect() {
      for (const row of rows) row.item = row.read();
    }
    function move(i, by) {
      collect();
      const [row] = rows.splice(i, 1);
      rows.splice(i + by, 0, row);
      draw();
    }
    draw();
    const add = h(
      'button',
      {
        type: 'button',
        class: 'btn outline',
        onclick: () => {
          collect();
          rows.push({ item: blank() });
          draw();
          list.lastChild?.querySelector('.input')?.focus();
        },
      },
      icon('plus'),
      h('span', {}, addLabel)
    );
    return {
      node: h(
        'div',
        { class: 'card', 'data-path': path },
        list,
        h(
          'div',
          {
            style:
              'padding: 1rem; border-top: 1px solid color-mix(in oklch, var(--border) 60%, transparent)',
          },
          add,
          h('p', { class: 'field-error', role: 'alert' })
        )
      ),
      values: () => {
        collect();
        return rows.map((r) => r.item);
      },
    };
  }

  const number = (value) => (value === '' || value == null ? undefined : Number(value));
  /** Drop empty strings and undefined, so an untouched optional field stays out of the file. */
  const tidy = (object) =>
    Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== ''));

  async function renderChecklistEditor(slug) {
    const isNew = slug === 'new';
    const [{ checklists, actors }] = await Promise.all([getJson('/api/definitions')]);
    const entry = checklists.find((c) => c.slug === slug);
    if (!isNew && !entry)
      return [
        pageHeader({
          back: { href: '/checklists', label: 'Checklists' },
          title: 'No checklist called ' + slug,
        }),
      ];
    if (entry && entry.error) {
      return [
        pageHeader({
          back: { href: '/checklists', label: 'Checklists', trail: slug },
          title: slug,
        }),
        h(
          'div',
          { class: 'notice warning' },
          icon('alert-triangle'),
          h('p', {}, entry.error + ' Fix it in the file, then come back.')
        ),
      ];
    }
    const data = entry ? entry.data : { checks: [] };
    const notice = noticeBox();
    const name = input({ name: 'name', value: data.name ?? '', maxlength: 200 });
    const slugInput =
      isNew &&
      input({
        name: 'slug',
        class: 'input mono',
        placeholder: 'guest-checkout',
        spellcheck: 'false',
      });
    if (slugInput)
      name.addEventListener(
        'input',
        () => !slugInput.dataset.touched && (slugInput.value = slugify(name.value))
      );
    if (slugInput) slugInput.addEventListener('input', () => (slugInput.dataset.touched = '1'));
    const actor = select(
      { name: 'actor' },
      actors
        .filter((a) => a.data)
        .map((a) => [a.slug, a.data.name + ' (' + a.slug + ')'])
        .concat(actors.length ? [] : [['', 'No actors yet']]),
      data.actor
    );
    const url = input({
      name: 'url',
      type: 'url',
      value: data.url ?? '',
      placeholder: 'http://localhost:3000',
    });
    const instructions = textarea(
      {
        name: 'instructions',
        rows: 3,
        placeholder: 'Buy the cheapest mug as a guest. Stop at the payment step.',
      },
      data.instructions
    );

    const checks = rowEditor({
      items: data.checks.length ? data.checks : [{}],
      blank: () => ({}),
      label: 'Check',
      addLabel: 'Add a check',
      path: 'checks',
      build: (check, i) => {
        const p = 'checks.' + i + '.';
        const description = textarea(
          { rows: 2, placeholder: 'Shipping cost is shown before payment' },
          check.description
        );
        const key = input({
          class: 'input mono',
          value: check.key ?? '',
          placeholder: 'shipping-early',
          spellcheck: 'false',
        });
        description.addEventListener(
          'input',
          () =>
            !key.dataset.touched &&
            !check.key &&
            (key.value = slugify(description.value).slice(0, 40))
        );
        key.addEventListener('input', () => (key.dataset.touched = '1'));
        const type = select(
          {},
          [
            ['pass_fail', 'Pass or fail'],
            ['weighted', 'Weighted'],
            ['informational', 'Observation'],
          ],
          check.type
        );
        const weight = input({
          type: 'number',
          step: '1',
          value: check.weight ?? '',
          placeholder: '1',
        });
        const weightField = field('Weight', weight, {
          path: p + 'weight',
          hint: 'Negative is a penalty.',
        });
        const syncWeight = () => (weightField.hidden = type.value !== 'weighted');
        type.addEventListener('change', syncWeight);
        syncWeight();
        const condition = select(
          {},
          [
            ['always', 'Always'],
            ['if_previous_passed', 'If the check before passed'],
            ['if_previous_failed', 'If the check before failed'],
          ],
          check.run_condition
        );
        const onFailure = select(
          {},
          [
            ['continue', 'Carry on'],
            ['stop', 'Stop the run'],
          ],
          check.on_failure
        );
        return {
          node: h(
            'div',
            { class: 'row-fields check-row' },
            field('Key', key, { path: p + 'key', hint: 'Stays the same across runs.' }),
            field('What must be true', description, { path: p + 'description' }),
            h(
              'div',
              { class: 'row-fields rules wide' },
              field('Type', type, { path: p + 'type' }),
              field('Runs', condition, { path: p + 'run_condition' }),
              field('If it fails', onFailure, { path: p + 'on_failure' })
            ),
            h('div', { class: 'wide' }, weightField)
          ),
          read: () =>
            tidy({
              ...check,
              key: key.value.trim(),
              description: description.value.trim(),
              type: type.value === 'pass_fail' && !check.type ? undefined : type.value,
              weight: type.value === 'weighted' ? number(weight.value) : undefined,
              run_condition:
                condition.value === 'always' && !check.run_condition ? undefined : condition.value,
              on_failure:
                onFailure.value === 'continue' && !check.on_failure ? undefined : onFailure.value,
            }),
        };
      },
    });

    const threshold = input({
      type: 'number',
      min: 0,
      step: '1',
      value: data.pass_threshold ?? '',
      placeholder: '100',
    });
    const scoreType = select(
      {},
      [
        ['percent', 'Percent'],
        ['points', 'Points'],
      ],
      data.score_type
    );
    const preset = select(
      {},
      [
        ['', 'Desktop (default)'],
        ['tablet', 'Tablet'],
        ['mobile', 'Phone'],
      ],
      data.browser_config?.preset ?? ''
    );

    const save = h(
      'button',
      { type: 'submit', class: 'btn primary' },
      h('span', {}, 'Save checklist')
    );
    const saved = h('span', { class: 'note', role: 'status' });
    const form = h(
      'form',
      {
        class: 'form',
        novalidate: true,
        onsubmit: async (event) => {
          event.preventDefault();
          const browser = { ...(data.browser_config || {}) };
          if (preset.value) browser.preset = preset.value;
          else delete browser.preset;
          const body = tidy({
            ...data,
            name: name.value.trim(),
            actor: actor.value,
            url: url.value.trim(),
            instructions: instructions.value.trim(),
            checks: checks.values(),
            pass_threshold: number(threshold.value),
            score_type:
              scoreType.value === 'percent' && !data.score_type ? undefined : scoreType.value,
            browser_config: Object.keys(browser).length ? browser : undefined,
          });
          const target = isNew ? slugInput.value.trim() : slug;
          const done = pending(save, 'Saving');
          const res = await send(
            'PUT',
            '/api/studio/checklists/' + encodeURIComponent(target || '-'),
            { data: body, create: isNew }
          );
          done();
          if (!res.ok)
            return showErrors(
              form,
              res.data.issues || [{ path: '', message: res.data.error }],
              notice
            );
          showErrors(form, [], notice);
          if (isNew) return go('/checklists/' + encodeURIComponent(res.data.slug));
          saved.textContent = 'Saved to .stuntdouble/checklists/' + slug + '.json';
          announce('Saved');
        },
      },
      notice,
      h(
        'section',
        { class: 'form-section' },
        h('h2', {}, 'What the actor does'),
        h(
          'div',
          { class: 'fields two' },
          field('Name', name, { path: 'name' }),
          slugInput &&
            field('File name', slugInput, {
              path: 'slug',
              hint: 'checklists/<name>.json, and the name you run it by.',
            })
        ),
        h(
          'div',
          { class: 'fields two' },
          field('Actor', actor, { path: 'actor' }),
          field('Start at', url, {
            path: 'url',
            hint: 'A local run can swap the origin for local_base_url.',
          })
        ),
        field('Instructions', instructions, {
          path: 'instructions',
          hint: 'Where to go, what to do and any test data to use.',
        })
      ),
      h(
        'section',
        { class: 'form-section' },
        h('h2', {}, 'Checks'),
        h(
          'p',
          { class: 'section-note' },
          'Each one is judged with evidence from the page, in this order.'
        ),
        checks.node
      ),
      h(
        'section',
        { class: 'form-section' },
        h('h2', {}, 'Scoring and browser'),
        h(
          'div',
          { class: 'fields two' },
          field('Pass threshold', threshold, {
            path: 'pass_threshold',
            hint: 'For weighted checks only. Leave empty for every point.',
          }),
          field('Score in', scoreType, { path: 'score_type' })
        ),
        field('Browser', preset, { path: 'browser_config' })
      ),
      h(
        'div',
        { class: 'form-actions' },
        save,
        !isNew &&
          h(
            'a',
            {
              class: 'btn outline',
              href: '/checklists/' + encodeURIComponent(slug) + '/run',
              'data-nav': true,
            },
            icon('play'),
            h('span', {}, 'Run')
          ),
        saved
      )
    );
    return [
      pageHeader({
        back: { href: '/checklists', label: 'Checklists', trail: isNew ? null : slug },
        title: isNew ? 'New checklist' : data.name,
        description: isNew
          ? 'Saved as a file in .stuntdouble/checklists/, which the cloud takes as it is.'
          : null,
      }),
      form,
    ];
  }

  async function renderActorEditor(slug) {
    const isNew = slug === 'new';
    const { actors } = await getJson('/api/definitions');
    const entry = actors.find((a) => a.slug === slug);
    if (!isNew && !entry)
      return [
        pageHeader({
          back: { href: '/actors', label: 'Actors' },
          title: 'No actor called ' + slug,
        }),
      ];
    if (entry && entry.error) {
      return [
        pageHeader({ back: { href: '/actors', label: 'Actors', trail: slug }, title: slug }),
        h(
          'div',
          { class: 'notice warning' },
          icon('alert-triangle'),
          h('p', {}, entry.error + ' Fix it in the file, then come back.')
        ),
      ];
    }
    const data = entry ? entry.data : { knowledge: [] };
    const notice = noticeBox();
    const name = input({ value: data.name ?? '', placeholder: 'First-time shopper' });
    const slugInput =
      isNew &&
      input({ class: 'input mono', placeholder: 'first-time-shopper', spellcheck: 'false' });
    if (slugInput)
      name.addEventListener(
        'input',
        () => !slugInput.dataset.touched && (slugInput.value = slugify(name.value))
      );
    if (slugInput) slugInput.addEventListener('input', () => (slugInput.dataset.touched = '1'));
    const description = textarea(
      { rows: 2, placeholder: 'Price-sensitive, on a phone, new to the site' },
      data.description
    );
    const prompt = textarea({ rows: 3, maxlength: 1000 }, data.system_prompt);
    const persist = h('input', { type: 'checkbox', id: 'persist-login' });
    persist.checked = Boolean(data.persist_login);
    const knowledge = rowEditor({
      items: data.knowledge,
      blank: () => ({ kind: 'reference' }),
      label: 'Entry',
      addLabel: 'Add knowledge',
      path: 'knowledge',
      build: (k, i) => {
        const p = 'knowledge.' + i + '.';
        const kind = select(
          {},
          [
            ['reference', 'Reference'],
            ['account', 'Test account'],
            ['process', 'Process'],
            ['expertise', 'Expertise'],
          ],
          k.kind
        );
        const title = input({ value: k.title ?? '', maxlength: 120 });
        const content = textarea({ rows: 3, maxlength: 8000 }, k.content);
        return {
          node: h(
            'div',
            { class: 'row-fields knowledge-row' },
            field('Kind', kind, { path: p + 'kind' }),
            field('Title', title, { path: p + 'title' }),
            field('What it knows', content, {
              path: p + 'content',
              className: 'wide',
              hint: 'Test accounts only, never real credentials: this file is committed.',
            })
          ),
          read: () => ({
            kind: kind.value,
            title: title.value.trim(),
            content: content.value.trim(),
          }),
        };
      },
    });
    const save = h('button', { type: 'submit', class: 'btn primary' }, h('span', {}, 'Save actor'));
    const saved = h('span', { class: 'note', role: 'status' });
    const form = h(
      'form',
      {
        class: 'form',
        novalidate: true,
        onsubmit: async (event) => {
          event.preventDefault();
          const body = tidy({
            ...data,
            name: name.value.trim(),
            description: description.value.trim() || undefined,
            system_prompt: prompt.value.trim() || undefined,
            knowledge: knowledge.values(),
            persist_login: persist.checked,
          });
          const target = isNew ? slugInput.value.trim() : slug;
          const done = pending(save, 'Saving');
          const res = await send('PUT', '/api/studio/actors/' + encodeURIComponent(target || '-'), {
            data: body,
            create: isNew,
          });
          done();
          if (!res.ok)
            return showErrors(
              form,
              res.data.issues || [{ path: '', message: res.data.error }],
              notice
            );
          showErrors(form, [], notice);
          if (isNew) return go('/actors/' + encodeURIComponent(res.data.slug));
          saved.textContent = 'Saved to .stuntdouble/actors/' + slug + '.json';
          announce('Saved');
        },
      },
      notice,
      h(
        'section',
        { class: 'form-section' },
        h('h2', {}, 'Who they are'),
        h(
          'div',
          { class: 'fields two' },
          field('Name', name, { path: 'name', hint: 'A role, never a person’s name.' }),
          slugInput && field('File name', slugInput, { path: 'slug' })
        ),
        field('Description', description, {
          path: 'description',
          hint: 'Background, goals and how comfortable they are with technology.',
        }),
        field('Extra instructions', prompt, {
          path: 'system_prompt',
          hint: 'Up to 1,000 characters, layered on the persona.',
        }),
        h(
          'label',
          { class: 'check-label', for: 'persist-login' },
          persist,
          h('span', {}, 'Keep this actor’s logins between runs, in ~/.stuntdouble/profiles/')
        )
      ),
      h('section', { class: 'form-section' }, h('h2', {}, 'What they know'), knowledge.node),
      h('div', { class: 'form-actions' }, save, saved)
    );
    return [
      pageHeader({
        back: { href: '/actors', label: 'Actors', trail: isNew ? null : slug },
        title: isNew ? 'New actor' : data.name,
      }),
      form,
    ];
  }

  // ── Run ───────────────────────────────────────────────────────────────────
  async function startRun(checklist, where, resume, button) {
    const done = button && pending(button, 'Starting');
    const res = await send('POST', '/api/studio/run', { checklist, where, resume });
    done?.();
    if (res.ok) {
      await refresh();
      go('/runs/' + encodeURIComponent(res.data.run_id));
      return null;
    }
    return res.data.error || 'The run did not start.';
  }

  async function renderRunPicker(slug) {
    await refresh();
    const { checklists } = await getJson('/api/definitions');
    const entry = checklists.find((c) => c.slug === slug && c.data);
    if (!entry)
      return [
        pageHeader({
          back: { href: '/checklists', label: 'Checklists' },
          title: 'No checklist called ' + slug,
        }),
      ];
    const c = status.connection;
    const cloud = status.cloud;
    const local = c.configured && !(c.key === 'none' && c.provider === 'anthropic');
    const option = (value, title, hint, enabled) =>
      h(
        'label',
        {},
        h('input', { type: 'radio', name: 'where', value, disabled: !enabled }),
        h('strong', {}, title),
        h('span', { class: 'hint' }, hint)
      );
    const choice = h(
      'div',
      { class: 'choice', role: 'radiogroup', 'aria-label': 'Where to run it' },
      option(
        'local',
        'On this machine',
        local
          ? 'A Chrome window on this machine, driven by ' +
              c.model +
              ' on your own connection. Reaches localhost.'
          : 'Connect a model in Settings first: an Anthropic API key or an OpenAI-compatible endpoint.',
        local
      ),
      option(
        'cloud',
        'In the cloud',
        cloud.signed_in && cloud.workspace
          ? 'Stunt Double’s browsers and judge, billed to ' +
              cloud.workspace.name +
              '. Needs a public or preview address.'
          : 'Sign in to Stunt Double in Settings, on a paid plan.',
        cloud.signed_in && Boolean(cloud.workspace)
      )
    );
    const first = choice.querySelector('input:not(:disabled)');
    if (first) first.checked = true;
    const error = h('p', { class: 'result-text bad', role: 'alert' });
    const start = h(
      'button',
      { type: 'submit', class: 'btn primary', disabled: !first },
      icon('play'),
      h('span', {}, 'Start run')
    );
    const form = h(
      'form',
      {
        class: 'form',
        onsubmit: async (event) => {
          event.preventDefault();
          const where = choice.querySelector('input:checked')?.value;
          if (!where) return;
          error.textContent = (await startRun(slug, where, false, start)) || '';
        },
      },
      choice,
      h(
        'div',
        { class: 'form-actions' },
        start,
        !first &&
          h(
            'a',
            { class: 'btn outline', href: '/settings', 'data-nav': true },
            icon('settings'),
            h('span', {}, 'Settings')
          )
      ),
      error
    );
    return [
      pageHeader({
        back: { href: '/checklists/' + encodeURIComponent(slug), label: entry.data.name },
        title: 'Run ' + entry.data.name,
        description:
          entry.data.checks.length +
          ' checks, as ' +
          entry.data.actor +
          ', starting at ' +
          entry.data.url +
          '.',
      }),
      form,
    ];
  }

  /** On a run's page: what a Studio run has used so far, from the server. */
  function usageLine(run) {
    const job = status && status.jobs.find((j) => j.run_id === run.id);
    const usage = (job && job.usage) || run.runner.usage;
    if (!usage || !run.runner.model) return null;
    const tokens = usage.input_tokens + usage.output_tokens;
    return h(
      'section',
      { class: 'card usage', id: 'usage', 'aria-label': 'Model use' },
      h(
        'span',
        { class: 'fact' },
        icon('sparkles'),
        h('span', { class: 'mono' }, run.runner.model.id)
      ),
      h(
        'span',
        { class: 'fact' },
        h('span', { class: 'mono' }, String(usage.steps)),
        ' model calls'
      ),
      h(
        'span',
        { class: 'fact' },
        h('span', { class: 'mono' }, tokens.toLocaleString()),
        ' tokens'
      ),
      usage.cost_usd != null &&
        h(
          'span',
          { class: 'fact' },
          icon('coins'),
          'about ',
          h('span', { class: 'mono' }, '$' + usage.cost_usd.toFixed(2))
        ),
      job &&
        job.usage &&
        h('span', { class: 'fact' }, 'of at most ' + status.limits.maxSteps + ' calls')
    );
  }
  sd.runExtras = usageLine;

  // A finished run's one primary action is running it again, here.
  sd.runActions = (run, running, resumable) => {
    if (running) return null;
    const error = h('span', { class: 'stop-error', role: 'alert' });
    const again = h(
      'button',
      {
        type: 'button',
        class: 'btn primary',
        'data-focus-key': 'again',
        onclick: async (event) => {
          error.textContent =
            (await startRun(
              run.checklist,
              run.runner.kind === 'cloud' ? 'cloud' : 'local',
              resumable && run.runner.kind === 'local',
              event.currentTarget
            )) || '';
        },
      },
      icon('play'),
      h('span', {}, resumable && run.runner.kind === 'local' ? 'Resume' : 'Run again')
    );
    return [
      sd.webUrl(run.runner.url) &&
        h(
          'a',
          {
            class: 'btn outline',
            href: run.runner.url,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          icon('external-link'),
          h('span', {}, 'Open in Stunt Double')
        ),
      again,
      error,
    ].filter(Boolean);
  };

  // While a run is going, the usage line follows it without redrawing the page.
  setInterval(async () => {
    if (!status || status.jobs.length === 0) return;
    await refresh().catch(() => null);
    const box = document.getElementById('usage');
    const id = decodeURIComponent(location.pathname.slice('/runs/'.length));
    const run = location.pathname.startsWith('/runs/') && {
      id,
      runner: { model: status.jobs.find((j) => j.run_id === id)?.model },
    };
    if (box && run && run.runner.model) {
      const line = usageLine(run);
      if (line) box.replaceWith(line);
    }
  }, 2000);

  // ── Settings ──────────────────────────────────────────────────────────────
  const PRESETS = [
    ['OpenAI', 'https://api.openai.com/v1', 'gpt-5'],
    ['OpenRouter', 'https://openrouter.ai/api/v1', 'anthropic/claude-sonnet-5.5'],
    ['Ollama', 'http://localhost:11434/v1', 'qwen3.5:9b'],
    ['LM Studio', 'http://localhost:1234/v1', ''],
  ];

  async function renderSettings() {
    await refresh();
    const c = status.connection;
    const notice = noticeBox();
    const provider = select(
      { name: 'provider' },
      [
        ['anthropic', 'Anthropic API'],
        ['openai', 'OpenAI-compatible endpoint'],
      ],
      c.configured ? c.provider : 'anthropic'
    );
    const model = input({
      name: 'model',
      value: c.configured ? c.model : 'claude-opus-5-5',
      spellcheck: 'false',
      class: 'input mono',
    });
    const baseUrl = input({
      name: 'base_url',
      type: 'url',
      value: c.configured && c.provider === 'openai' ? c.base_url : '',
      placeholder: 'https://api.openai.com/v1',
      class: 'input mono',
    });
    const key = input({
      name: 'api_key',
      type: 'password',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const forget = h('input', { type: 'checkbox', id: 'forget-key' });
    const keyState = () => {
      if (!c.configured || c.provider !== provider.value) return 'No key yet.';
      if (c.key === 'stored')
        return 'A key is stored on this machine. Leave this empty to keep it.';
      if (c.key === 'env')
        return 'Using ' + c.key_env + ' from the environment. A key entered here takes its place.';
      return 'No key yet.';
    };
    const keyHint = h('span', {});
    const forgetRow = h(
      'label',
      { class: 'check-label', for: 'forget-key' },
      forget,
      h('span', {}, 'Forget the stored key')
    );
    const presets = h(
      'div',
      { class: 'presets', role: 'group', 'aria-label': 'Fill in a known endpoint' },
      PRESETS.map(([label, url, suggested]) =>
        h(
          'button',
          {
            type: 'button',
            class: 'btn outline',
            onclick: () => {
              baseUrl.value = url;
              if (suggested) model.value = suggested;
              key.focus();
            },
          },
          label
        )
      )
    );
    const baseField = field('Endpoint', baseUrl, {
      path: 'base_url',
      hint: 'The address before /chat/completions. Ollama and LM Studio need no key.',
    });
    const presetRow = h(
      'div',
      { class: 'field' },
      h('span', { class: 'label' }, 'Known endpoints'),
      presets
    );
    const sync = () => {
      const openai = provider.value === 'openai';
      baseField.hidden = !openai;
      presetRow.hidden = !openai;
      keyHint.textContent = keyState();
      forgetRow.hidden = !(c.configured && c.key === 'stored' && c.provider === provider.value);
      if (!openai && !/^claude-/.test(model.value)) model.value = 'claude-opus-5-5';
    };
    provider.addEventListener('change', sync);
    const keyField = field('API key', key, { path: 'api_key' });
    keyField.querySelector('label').after(keyHint);
    keyHint.className = 'hint';
    sync();

    const result = h('p', { class: 'result-text', role: 'status' });
    const save = h(
      'button',
      { type: 'submit', class: 'btn primary' },
      h('span', {}, 'Save connection')
    );
    const test = h(
      'button',
      {
        type: 'button',
        class: 'btn outline',
        onclick: async (event) => {
          const done = pending(event.currentTarget, 'Testing');
          const res = await send('POST', '/api/studio/connection/test');
          done();
          result.className = 'result-text ' + (res.data.ok ? 'ok' : 'bad');
          result.textContent = res.data.message || res.data.error || '';
        },
      },
      h('span', {}, 'Test connection')
    );
    const form = h(
      'form',
      {
        class: 'card settings-card',
        novalidate: true,
        onsubmit: async (event) => {
          event.preventDefault();
          const done = pending(save, 'Saving');
          const res = await send('POST', '/api/studio/connection', {
            provider: provider.value,
            model: model.value.trim(),
            base_url: provider.value === 'openai' ? baseUrl.value.trim() : null,
            api_key: key.value,
            clear_key: forget.checked,
          });
          done();
          if (!res.ok)
            return showErrors(
              form,
              res.data.issues || [{ path: '', message: res.data.error }],
              notice
            );
          showErrors(form, [], notice);
          key.value = '';
          forget.checked = false;
          await refresh();
          Object.assign(c, status.connection);
          sync();
          result.className = 'result-text ok';
          result.textContent = 'Saved. Test it to make sure the key works.';
        },
      },
      notice,
      h(
        'div',
        { class: 'fields two' },
        field('Provider', provider, { path: 'provider' }),
        field('Model', model, { path: 'model' })
      ),
      presetRow,
      baseField,
      keyField,
      forgetRow,
      h('div', { class: 'form-actions' }, save, test),
      result
    );

    const cloud = status.cloud;
    const cloudBody = h('div', { class: 'card settings-card' });
    const cloudError = h('p', { class: 'result-text bad', role: 'alert' });
    if (!cloud.signed_in) {
      const signIn = h(
        'button',
        {
          type: 'button',
          class: 'btn outline',
          onclick: async (event) => {
            const done = pending(event.currentTarget, 'Opening Stunt Double');
            const res = await send('POST', '/api/studio/cloud/login');
            if (res.ok && sd.webUrl(res.data.url)) location.assign(res.data.url);
            else {
              done();
              cloudError.textContent = res.data.error || 'Sign-in could not start.';
            }
          },
        },
        icon('external-link'),
        h('span', {}, 'Sign in to Stunt Double')
      );
      cloudBody.append(
        h(
          'p',
          {},
          'Sign in and a checklist can also run in the cloud: on Stunt Double’s browsers, judged independently, billed to your workspace on a paid plan.'
        ),
        h('div', { class: 'form-actions' }, signIn),
        cloudError
      );
    } else {
      const picker = select({}, [['', 'Loading workspaces']], '');
      picker.disabled = true;
      getJson('/api/studio/cloud/workspaces').then(
        ({ workspaces }) => {
          picker.replaceChildren(
            h('option', { value: '' }, 'Choose a workspace'),
            ...workspaces.map((w) => h('option', { value: w.id }, w.name + ' (' + w.slug + ')'))
          );
          picker.value = cloud.workspace ? cloud.workspace.id : '';
          picker.disabled = false;
        },
        (err) => (cloudError.textContent = err.message)
      );
      picker.addEventListener('change', async () => {
        if (!picker.value) return;
        const res = await send('POST', '/api/studio/cloud/workspace', { id: picker.value });
        cloudError.textContent = res.ok ? '' : res.data.error;
        if (res.ok) announce('Cloud runs go to ' + res.data.workspace.name);
      });
      const signOut = h(
        'button',
        {
          type: 'button',
          class: 'btn outline',
          onclick: async () => {
            await send('POST', '/api/studio/cloud/logout');
            sd.render(false);
          },
        },
        icon('log-out'),
        h('span', {}, 'Sign out')
      );
      cloudBody.append(
        field('Workspace for cloud runs', picker, {
          hint: 'Cloud runs and the checklists they push go here.',
        }),
        h('div', { class: 'form-actions' }, signOut),
        cloudError
      );
    }

    return [
      pageHeader({
        title: 'Settings',
        description:
          'Kept in ~/.stuntdouble/credentials.json on this machine, never in the project and never shown here.',
      }),
      h(
        'div',
        { class: 'stack' },
        h(
          'section',
          { class: 'section' },
          h('h2', { class: 'section-title' }, 'Connection'),
          h(
            'p',
            { class: 'section-note' },
            'Studio runs use only this: your own Anthropic API key, or an OpenAI-compatible endpoint such as OpenAI, OpenRouter, Ollama or LM Studio. Never a Claude plan.'
          ),
          form
        ),
        h(
          'section',
          { class: 'section' },
          h('h2', { class: 'section-title' }, 'Stunt Double'),
          cloudBody
        )
      ),
    ];
  }

  // ── Runs, with the Studio's empty state ───────────────────────────────────
  async function renderHome() {
    const runs = await getJson('/api/runs');
    if (runs.length) return sd.renderRuns();
    return [
      h('h1', { class: 'sr-only' }, 'Runs'),
      emptyState(
        'checklist',
        'No runs yet',
        'Run a checklist and its verdicts, screenshots and activity land here as it goes.'
      ),
      h(
        'div',
        { class: 'form-actions', style: 'justify-content: center; margin-top: 1rem' },
        h(
          'a',
          { class: 'btn primary', href: '/checklists', 'data-nav': true },
          icon('play'),
          h('span', {}, 'Choose a checklist')
        )
      ),
    ];
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  const views = [
    [/^\/$/, renderHome],
    [/^\/definitions$/, renderChecklists],
    [/^\/checklists$/, renderChecklists],
    [
      /^\/checklists\/([^/]+)\/run$/,
      (m) => renderRunPicker(decodeURIComponent(m[1])),
      { narrow: true },
    ],
    [
      /^\/checklists\/([^/]+)$/,
      (m) => renderChecklistEditor(decodeURIComponent(m[1])),
      { keep: true, narrow: true },
    ],
    [/^\/actors$/, renderActors],
    [
      /^\/actors\/([^/]+)$/,
      (m) => renderActorEditor(decodeURIComponent(m[1])),
      { keep: true, narrow: true },
    ],
    [/^\/settings$/, renderSettings, { keep: true, narrow: true }],
  ];
  for (const [pattern, view, opts] of views) {
    sd.routes.push({
      match: (path) => pattern.test(path),
      ...opts,
      render: async (path) => {
        if (!status) await refresh();
        // No project yet: everything but Settings starts with setting one up.
        if (!status.initialised && path !== '/settings') {
          await refresh();
          if (!status.initialised) return renderWelcome();
        }
        return view(path.match(pattern));
      },
    });
  }
  refresh().catch(() => null);
})();
