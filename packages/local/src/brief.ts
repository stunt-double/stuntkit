// What the actor is told at the start of a run: who it is, what to do, the
// checks to judge, and how a local run works. The agent reading it is the
// person's own session, so this is the whole of the actor's instructions.

import type { Actor, Check, Checklist } from './files.ts';

const CONDITION_LABELS: Record<Check['run_condition'], string> = {
  always: 'always',
  if_previous_passed: 'only if the check before it passed',
  if_previous_failed: 'only if the check before it failed',
};

/** `(weighted x2, always)`: how a check counts and when it runs. */
export function checkLabel(check: Check): string {
  const kind =
    check.type === 'informational'
      ? 'informational, record what you observe'
      : check.type === 'weighted'
        ? `weighted x${check.weight ?? 1}${(check.weight ?? 1) < 0 ? ', a penalty' : ''}`
        : 'pass/fail';
  const parts = [kind, CONDITION_LABELS[check.run_condition]];
  if (check.on_failure === 'stop') parts.push('the run stops if it fails');
  return `(${parts.join(', ')})`;
}

export function checkLine(check: Check): string {
  return `- [${check.key}] ${checkLabel(check)} ${check.description}`;
}

export function buildBrief(input: {
  actor: Actor;
  checklist: Checklist;
  url: string;
  /** The checks still to judge: all of them, or on a resume the ones without a verdict. */
  checks: Check[];
  resumed: boolean;
}): string {
  const { actor, checklist, url, checks, resumed } = input;
  const persona = [
    `You are ${actor.name}${actor.description ? `: ${actor.description}` : ''}.`,
    actor.system_prompt ?? '',
  ]
    .filter(Boolean)
    .join('\n');
  const knowledge = actor.knowledge.length
    ? [
        'What you know:',
        ...actor.knowledge.map((k) => `### ${k.title} (${k.kind})\n${k.content}`),
      ].join('\n')
    : '';
  return [
    persona,
    knowledge,
    `Your task: ${checklist.instructions}`,
    `Start at ${url}${resumed ? ' (this run is resuming: earlier verdicts stand, judge only the checks below)' : ''}.`,
    `Checks to judge:\n${checks.map(checkLine).join('\n')}`,
    [
      'How to work:',
      '- Stay in persona: act and judge as this person would, not as a tester.',
      '- Read the page with read_page and find. Ask for a screenshot only when how something looks is the question.',
      '- Judge each check with evaluate_check as soon as you have observed it, while the evidence is on screen.',
      '- A passed verdict needs a locator: text visible on the page, or a CSS selector, that shows the evidence. A failure may describe something missing.',
      '- Cite only what you saw in this run. Never pass a check on what a page probably does.',
      '- When something stops you (a sign-in wall, a broken page, a CAPTCHA), judge the checks you cannot reach as "blocked" and say what stopped you.',
      '- Always end with finish_run and a one or two sentence summary, even when blocked or stopped.',
    ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
}
