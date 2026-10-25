import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATEGORIES,
  TASKS,
  getApplicableTasks,
  getTaskForCategory,
  getTasksForSector,
  isAgentRunDepth,
  taskCategories,
  tasksForDepth,
  type DomainSector,
} from './index.ts';

// Written as a code point so the repo's no-emdash rule holds for this file too.
const EMDASH = String.fromCodePoint(0x2014);

const SECTORS: DomainSector[] = [
  'ecommerce',
  'saas',
  'travel',
  'finance',
  'media',
  'marketplace',
  'professional-services',
  'developer-tools',
  'utilities',
  'social',
  'education',
  'health',
  'government',
];

test('every sector grades every category exactly once', () => {
  for (const sector of SECTORS) {
    const graded = getTasksForSector(sector).flatMap(taskCategories);
    assert.deepEqual(
      [...graded].sort(),
      CATEGORIES.map((c) => c.id).sort(),
      `${sector} grades each category once`
    );
  }
  assert.equal(TASKS.flatMap(taskCategories).length, SECTORS.length * CATEGORIES.length);
});

test('every sector runs four browser tasks and one knowledge task', () => {
  for (const sector of SECTORS) {
    const tasks = getTasksForSector(sector);
    assert.equal(tasks.filter((t) => t.mode === 'browser').length, 4, sector);
    const knowledge = tasks.filter((t) => t.mode === 'knowledge');
    assert.equal(knowledge.length, 1, sector);
    assert.deepEqual(taskCategories(knowledge[0]), ['market-ranking']);
  }
});

test('the shared tasks grade the categories they replaced', () => {
  for (const sector of SECTORS) {
    const research = getTaskForCategory(sector, 'brand-awareness')!;
    assert.deepEqual(taskCategories(research), [
      'brand-awareness',
      'information-retrieval',
      'accuracy',
    ]);
    const journey = getTaskForCategory(sector, 'discovery')!;
    assert.deepEqual(taskCategories(journey), ['discovery', 'checkout']);
    // Roughly the larger merged task plus a margin, never the sum.
    assert.ok(research.maxSteps <= 30 && journey.maxSteps <= 30, sector);
  }
});

test('a light run keeps Research, Journey and the knowledge task in every sector', () => {
  for (const sector of SECTORS) {
    const all = getTasksForSector(sector);
    assert.deepEqual(tasksForDepth(all, 'full'), all);
    const light = tasksForDepth(all, 'light');
    assert.deepEqual(
      light.map((t) => t.id),
      [
        getTaskForCategory(sector, 'brand-awareness')!.id,
        getTaskForCategory(sector, 'discovery')!.id,
        getTaskForCategory(sector, 'market-ranking')!.id,
      ].sort((a, b) => all.findIndex((t) => t.id === a) - all.findIndex((t) => t.id === b)),
      sector
    );
    assert.equal(light.filter((t) => t.mode === 'browser').length, 2, sector);
  }
});

test('a light run judges a task by its definition, not its applicable grades', () => {
  const research = getTaskForCategory('saas', 'brand-awareness')!;
  const trimmed = { ...research, grades: research.grades.slice(0, 1) };
  assert.deepEqual(tasksForDepth([trimmed], 'light'), [trimmed]);
  assert.equal(isAgentRunDepth('light'), true);
  assert.equal(isAgentRunDepth('quick'), false);
});

test('knowledge prompts never ask for a browser tool', () => {
  for (const t of TASKS.filter((x) => x.mode === 'knowledge')) {
    assert.ok(!t.prompt.includes('done()'), `${t.id} mentions done()`);
    assert.ok(!t.prompt.includes('https://'), `${t.id} sends the model to a URL`);
  }
});

test('every task has an id, a prompt and a rubric per grade', () => {
  const ids = new Set<string>();
  for (const t of TASKS) {
    assert.equal(ids.has(t.id), false, `duplicate task id ${t.id}`);
    ids.add(t.id);
    assert.ok(t.prompt.includes('{domain}'), `${t.id} prompt names no domain`);
    assert.ok(t.grades.length > 0, `${t.id} grades nothing`);
    for (const g of t.grades) assert.ok(g.rubric.length > 20, `${t.id} ${g.category} rubric`);
    assert.ok(!(t.prompt + t.grades.map((g) => g.rubric).join('')).includes(EMDASH), t.id);
  }
});

test('a filtered shared task keeps its grades in order, so the first applicable one holds the transcript', () => {
  const tasks = getApplicableTasks('saas', [{ category: 'brand-awareness', applicable: false }]);
  const research = tasks.find((t) => t.id.startsWith('research-'))!;
  assert.deepEqual(taskCategories(research), ['information-retrieval', 'accuracy']);
});
