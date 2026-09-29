// Claude's browser toolset spells keys the xdotool way (`ctrl+a`, `Return`,
// `Page_Down`, space-separated sequences); Stagehand's `keyPress` takes
// Playwright's (`Control+A`, `Enter`, `PageDown`). Pure, so it is unit tested.

const ALIASES: Record<string, string> = {
  ctrl: 'Control',
  control: 'Control',
  cmd: 'Meta',
  command: 'Meta',
  meta: 'Meta',
  super: 'Meta',
  win: 'Meta',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Enter',
  kp_enter: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  space: ' ',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  page_up: 'PageUp',
  pageup: 'PageUp',
  prior: 'PageUp',
  page_down: 'PageDown',
  pagedown: 'PageDown',
  next: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  capslock: 'CapsLock',
  caps_lock: 'CapsLock',
};

function normaliseKey(raw: string): string {
  const key = raw.trim();
  const alias = ALIASES[key.toLowerCase()];
  if (alias) return alias;
  if (/^f([1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
  // A single character is typed as itself; Playwright wants it upper-cased
  // inside a chord (`Control+A`) and as-is on its own.
  return key;
}

/** One chord (`ctrl+shift+t`) in Playwright's spelling (`Control+Shift+T`). */
export function toPlaywrightChord(chord: string): string {
  const parts = chord.split('+').filter((p) => p.length > 0);
  // A literal plus (`ctrl++` or `+`) survives the split as an empty tail.
  if (chord.endsWith('+') && chord.length > 1 && chord[chord.length - 2] === '+') parts.push('+');
  if (parts.length === 0) return chord === '+' ? '+' : chord;
  const keys = parts.map(normaliseKey);
  if (keys.length > 1) {
    const last = keys[keys.length - 1];
    if (last.length === 1) keys[keys.length - 1] = last.toUpperCase();
  }
  return keys.join('+');
}

/**
 * `text` as the toolset sends it: one key, one chord, or a space-separated
 * sequence (`Backspace Backspace`). A lone space is the space key.
 */
export function toPlaywrightKeySequence(text: string): string[] {
  if (text === ' ') return [' '];
  return text
    .split(/\s+/)
    .filter((k) => k.length > 0)
    .map(toPlaywrightChord);
}
