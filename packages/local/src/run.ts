// One process, one run at a time: the run lifecycle behind start_run,
// evaluate_check and finish_run, and the browser tools in between.
//
// Everything a run produces is a file under `.stuntdouble/runs/<id>/`, written
// as it happens: `run.json` is rewritten atomically after every verdict, and
// `activity.jsonl` gains a line per tool call. A run whose process dies stays
// `running` on disk with a dead pid, and the next start_run marks it
// interrupted, so it can be resumed.

import {
  DirectBrowserTools,
  type DirectBrowserToolsOptions,
} from '@stunt-double/browser-toolset/direct-tools';
import type { BrowserDriver } from '@stunt-double/browser-toolset/driver';
import { isPrivateHost, redactInput } from '@stunt-double/browser-toolset/executor';
import { hostMatchesDomain, INDEX_SESSION_SAFETY } from '@stunt-double/browser-toolset/safety';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import pkg from '../package.json' with { type: 'json' };
import { buildBrief, checkLabel } from './brief.ts';
import { type LaunchOptions, PlaywrightDriver } from './driver.ts';
import { cleanLocator, focusEvidence } from './evidence.ts';
import {
  ActorSchema,
  appendJsonl,
  type Check,
  type Checklist,
  ChecklistSchema,
  type Config,
  ConfigSchema,
  isAlive,
  type Locator,
  readJson,
  readRuns,
  type Result,
  type Run,
  sdDir,
  writeFileAtomic,
  writeJsonAtomic,
} from './files.ts';
import { startUi, type UiServer } from './ui-server.ts';
import { resolveSkippedChecks } from './vendor/scoring/conditions.ts';
import { resolveHaltedChecks } from './vendor/scoring/failure.ts';
import {
  describeRunScore,
  newChecklistScoring,
  scoreChecklistRun,
} from './vendor/scoring/scoring.ts';

export const PACKAGE = `${pkg.name}@${pkg.version}`;

export type Launch = (options: LaunchOptions) => Promise<BrowserDriver>;

export type Verdict = 'passed' | 'failed' | 'informational' | 'blocked';

export type ToolOutput = { text: string; image?: string; isError?: boolean };

const STOPPED =
  'This run was stopped from the viewer. Do not use the browser again: call finish_run now with a summary of what you found.';
/** What finish_run records for a check nobody judged; a resume judges it after all. */
const NOT_JUDGED = 'Not judged before the run finished.';
/** activity.jsonl is committed, so a page read is kept to its opening lines. */
const LOG_TEXT_CHARS = 500;

const PRESETS = {
  desktop: { width: 1280, height: 720, touch: false },
  tablet: { width: 1024, height: 1366, touch: true },
  mobile: { width: 390, height: 844, touch: true },
};

type Active = {
  dir: string;
  run: Run;
  checklist: Checklist;
  driver: BrowserDriver;
  trusted: DirectBrowserTools;
  /** The same tools with the pay, sign-up and secrets guards on, for other hosts. */
  guarded: DirectBrowserTools | null;
  trustedHosts: string[];
  /** A fresh profile to delete when the run ends; null for a kept one. */
  tempProfile: string | null;
  everyScreenshot: boolean;
  stopped: boolean;
};

/** The checklist URL with its origin swapped for `local_base_url`. */
export function rebase(url: string, localBase: string | null | undefined): string {
  if (!localBase) return url;
  const target = new URL(url);
  const base = new URL(localBase);
  target.protocol = base.protocol;
  target.host = base.host;
  return target.href;
}

/** `20261103-142210`, in local time, so folders sort by when they started. */
function stamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

const now = () => new Date().toISOString();

export class LocalSession {
  readonly root: string;
  private readonly launch: Launch;
  private active: Active | null = null;
  private ui: UiServer | null = null;

  constructor(options: { project: string; launch?: Launch }) {
    this.root = sdDir(options.project);
    this.launch = options.launch ?? PlaywrightDriver.launch;
  }

  /** The viewer's address, starting it on first use. */
  async openUi(path = '/'): Promise<string> {
    this.ui ??= await startUi({ root: this.root });
    await writeJsonAtomic(join(this.root, '.live', 'server.json'), {
      port: this.ui.port,
      token: this.ui.token,
      pid: process.pid,
    });
    return this.ui.link(path);
  }

  async startRun(input: { checklist: string; resume?: boolean }): Promise<string> {
    if (this.active) {
      throw new Error(`Run ${this.active.run.id} is still going: call finish_run first.`);
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.checklist)) {
      throw new Error(`"${input.checklist}" is not a checklist slug (checklists/<slug>.json).`);
    }
    const config: Config = await readJson(
      join(this.root, 'stuntdouble.json'),
      ConfigSchema,
      '.stuntdouble/stuntdouble.json'
    );
    let checklist = await readJson(
      join(this.root, 'checklists', `${input.checklist}.json`),
      ChecklistSchema,
      `.stuntdouble/checklists/${input.checklist}.json`
    );
    const actor = await readJson(
      join(this.root, 'actors', `${checklist.actor}.json`),
      ActorSchema,
      `.stuntdouble/actors/${checklist.actor}.json`
    );
    await this.markInterrupted();

    let run: Run;
    let dir: string;
    if (input.resume) {
      const entry = (await readRuns(this.root)).find(
        (e) =>
          'run' in e &&
          e.run.checklist === input.checklist &&
          e.run.runner.kind === 'local' &&
          (e.run.status === 'interrupted' || e.run.status === 'stopped')
      );
      if (!entry || !('run' in entry)) {
        throw new Error(`No interrupted or stopped run of ${input.checklist} to resume.`);
      }
      dir = join(this.root, 'runs', entry.id);
      // A resumed run is judged against the checks it started with.
      checklist = ChecklistSchema.parse(entry.run.checklist_snapshot);
      await this.clearStop(entry.id);
      run = {
        ...entry.run,
        results: entry.run.results.filter((r) => r.evidence !== NOT_JUDGED),
        status: 'running',
        pid: process.pid,
        finished_at: null,
        score: null,
        summary: null,
      };
    } else {
      dir = '';
      run = {
        format: 'stuntdouble.run/1',
        id: '',
        runner: { kind: 'local', package: PACKAGE, judged: false },
        status: 'running',
        pid: process.pid,
        url: rebase(checklist.url, config.local_base_url),
        started_at: now(),
        finished_at: null,
        checklist: input.checklist,
        actor: checklist.actor,
        checklist_snapshot: { ...checklist, cloud: undefined },
        results: [],
        score: null,
        summary: null,
        cloud: null,
      };
    }

    const trustedHosts = [
      ...new Set(
        [run.url, checklist.url, config.local_base_url]
          .filter((u): u is string => Boolean(u))
          .map((u) => new URL(u).hostname)
      ),
    ];
    const preset = PRESETS[checklist.browser_config?.preset ?? 'desktop'];
    const toolOptions: DirectBrowserToolsOptions = {
      viewport: checklist.browser_config?.viewport ?? preset,
      allowPrivateHosts: true,
      checkNavigation: (href) => {
        const host = new URL(href).hostname;
        return isPrivateHost(host) && !trustedHosts.some((t) => hostMatchesDomain(host, t))
          ? 'Local and private addresses other than the app under test are not reachable.'
          : null;
      },
    };

    // The browser first: a run folder is only made for a run that can start.
    const tempProfile = actor.persist_login
      ? null
      : await mkdtemp(join(tmpdir(), 'stuntdouble-profile-'));
    const profileDir = tempProfile ?? join(homedir(), '.stuntdouble', 'profiles', checklist.actor);
    await mkdir(profileDir, { recursive: true });
    let driver: BrowserDriver;
    try {
      driver = await this.launch({
        profileDir,
        headless: config.headless,
        viewport: toolOptions.viewport,
        touch: checklist.browser_config?.touch ?? preset.touch,
        locale: checklist.browser_config?.locale,
      });
    } catch (err) {
      if (tempProfile) await rm(tempProfile, { recursive: true, force: true });
      throw err;
    }

    if (!input.resume) {
      await mkdir(join(this.root, 'runs'), { recursive: true });
      // Two runs started in the same second get a suffix rather than one folder.
      for (let n = 1; !dir; n++) {
        const id = `${stamp()}-${input.checklist}${n > 1 ? `-${n}` : ''}`;
        const made = await mkdir(join(this.root, 'runs', id)).then(
          () => true,
          (err: NodeJS.ErrnoException) => {
            if (err.code === 'EEXIST') return false;
            throw err;
          }
        );
        if (made) [run.id, dir] = [id, join(this.root, 'runs', id)];
      }
    }
    const gitignore = join(this.root, '.gitignore');
    if (!(await stat(gitignore).catch(() => null))) await writeFile(gitignore, '.live/\n');

    this.active = {
      dir,
      run,
      checklist,
      driver,
      trusted: new DirectBrowserTools(driver, toolOptions),
      guarded:
        config.safety === 'third_party'
          ? new DirectBrowserTools(driver, { ...toolOptions, safety: INDEX_SESSION_SAFETY })
          : null,
      trustedHosts,
      tempProfile,
      everyScreenshot: config.model_screenshots === 'every_action',
      stopped: false,
    };
    await this.save();
    await this.log('start_run', input, input.resume ? 'Resumed' : 'Started');

    const opened = await this.browserTool('navigate', { url: run.url });
    const pending = this.pending();
    const viewer = await this.openUi(`/runs/${run.id}`);
    return [
      `Run ${run.id} ${input.resume ? 'resumed' : 'started'}. Watch it or stop it at ${viewer}`,
      buildBrief({
        actor,
        checklist,
        url: run.url,
        checks: pending,
        resumed: Boolean(input.resume),
      }),
      opened.isError
        ? `The start page did not load: ${opened.text}\nTry navigate again, or judge the checks you cannot reach as "blocked".`
        : opened.text,
      this.nextStep(),
    ].join('\n\n');
  }

  /** One of the browser toolset's direct tools, on the active run's browser. */
  async browserTool(name: string, input: Record<string, unknown>): Promise<ToolOutput> {
    const active = this.requireActive();
    if (await this.stopRequested(active)) return { text: STOPPED, isError: true };
    const page = await active.driver.context.activePage();
    const host = page ? (URL.parse(await page.url())?.hostname ?? '') : '';
    const tools =
      active.guarded && host && !active.trustedHosts.some((t) => hostMatchesDomain(host, t))
        ? active.guarded
        : active.trusted;
    const result = await tools.run(name, input);
    if (result.screenshotBase64)
      await this.saveFrame(Buffer.from(result.screenshotBase64, 'base64'));
    await this.log(name, redactInput(name, input), result.text);
    const image =
      result.screenshotBase64 && (name === 'screenshot' || active.everyScreenshot)
        ? result.screenshotBase64
        : undefined;
    return { text: result.text, ...(image ? { image } : {}), isError: Boolean(result.error) };
  }

  async evaluateCheck(input: {
    check: string;
    status: Verdict;
    evidence: string;
    locator?: Locator;
  }): Promise<string> {
    const active = this.requireActive();
    if (await this.stopRequested(active)) throw new Error(STOPPED);
    const { run, checklist } = active;
    const check = checklist.checks.find((c) => c.key === input.check);
    if (!check) {
      throw new Error(
        `No check "${input.check}" in this run. The keys are: ${checklist.checks.map((c) => c.key).join(', ')}.`
      );
    }
    const earlier = run.results.find((r) => r.check === check.key);
    if (earlier) {
      throw new Error(
        `[${check.key}] already has a verdict (${earlier.status}). Each check gets one.`
      );
    }
    if (
      check.type === 'informational' &&
      (input.status === 'passed' || input.status === 'failed')
    ) {
      throw new Error(
        `[${check.key}] is informational: record what you observed with status "informational".`
      );
    }
    if (check.type !== 'informational' && input.status === 'informational') {
      throw new Error(
        `[${check.key}] is scored: judge it "passed" or "failed", or "blocked" if you could not reach it.`
      );
    }

    const page = await active.driver.context.activePage();
    const query = cleanLocator(input.locator);
    const found = page ? await focusEvidence(page, query) : null;
    if (input.status === 'passed' && !found) {
      throw new Error(
        query.text || query.selector
          ? `Not recorded: the locator ${JSON.stringify(query.text ?? query.selector)} is not visible on the current page. Go back to where you saw the evidence, or cite text that is on screen now.`
          : 'Not recorded: a passed verdict needs a locator, {"text": "..."} visible on the page or {"selector": "..."}.'
      );
    }
    let screenshot: string | undefined;
    if (page) {
      try {
        const png = await page.screenshot({ type: 'png', timeout: 10_000 });
        screenshot = `shots/${check.key}.png`;
        await writeFileAtomic(join(active.dir, screenshot), png);
        await this.saveFrame(png);
      } catch {
        screenshot = undefined;
      }
    }
    run.results.push({
      check: check.key,
      status: input.status === 'blocked' ? 'error' : input.status,
      evidence: input.evidence,
      ...(query.text || query.selector
        ? {
            locator: {
              ...(query.text ? { text: query.text } : {}),
              ...(query.selector ? { selector: query.selector } : {}),
            },
          }
        : {}),
      ...(screenshot ? { screenshot } : {}),
      at: now(),
    });

    // Settle what this verdict decides: a failed stop check skips every check
    // left, and an unmet run condition skips its check and the chain after it.
    const statuses = new Map(run.results.map((r) => [r.check, r.status]));
    const halted = resolveHaltedChecks({
      checks: checklist.checks.map((c) => ({
        id: c.key,
        description: c.description,
        onFailure: c.on_failure,
      })),
      statuses,
    });
    const skipped = halted.length ? halted : this.conditionSkips(statuses);
    for (const s of skipped) {
      run.results.push({ check: s.checkId, status: 'skipped', evidence: s.reason, at: now() });
    }
    await this.save();
    const recorded = `Recorded [${check.key}] as ${input.status}.`;
    await this.log('evaluate_check', input, recorded);
    const notes = skipped.map((s) => `[${s.checkId}] ${s.reason}`);
    if (halted.length) notes.push('The run has stopped.');
    return [recorded, ...notes, this.nextStep()].join('\n');
  }

  async finishRun(input: { summary: string }): Promise<string> {
    const active = this.requireActive();
    const stopped = await this.stopRequested(active);
    const { run, checklist } = active;
    for (const s of this.conditionSkips(new Map(run.results.map((r) => [r.check, r.status])))) {
      run.results.push({ check: s.checkId, status: 'skipped', evidence: s.reason, at: now() });
    }
    for (const check of this.pending()) {
      run.results.push({
        check: check.key,
        status: 'error',
        evidence: NOT_JUDGED,
        at: now(),
      });
    }
    const score = scoreLocalRun(checklist, run.results);
    run.score = {
      score: score.score,
      unit: score.scoreUnit,
      outcome: score.outcome,
      pass_threshold: score.passThreshold,
      grade: score.grade,
    };
    run.summary = input.summary;
    run.status = stopped ? 'stopped' : 'completed';
    run.finished_at = now();
    await this.save();
    await this.log('finish_run', input, `Finished: ${score.outcome}`);
    const viewer = await this.openUi(`/runs/${run.id}`);
    await this.endBrowser();

    const line = (r: Result) => `- [${r.check}] ${r.evidence}`;
    const failed = run.results.filter((r) => r.status === 'failed');
    const blocked = run.results.filter((r) => r.status === 'error');
    const counts = describeRunScore(score, {
      passedCount: run.results.filter((r) => r.status === 'passed').length,
      totalCount: checklist.checks.length,
    });
    return [
      `Run ${run.id} ${run.status}: ${score.outcome}. ${counts}. Self-judged: the actor recorded its own verdicts.`,
      failed.length ? `Failed:\n${failed.map(line).join('\n')}` : '',
      blocked.length ? `Not judged:\n${blocked.map(line).join('\n')}` : '',
      `Report: ${viewer}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /** On shutdown: an unfinished run is marked interrupted, so it can be resumed. */
  async close(): Promise<void> {
    if (this.active) {
      this.active.run.status = this.active.stopped ? 'stopped' : 'interrupted';
      await this.save().catch(() => {});
      await this.endBrowser();
    }
    await this.ui?.close();
    this.ui = null;
  }

  private requireActive(): Active {
    if (!this.active) throw new Error('No run is going: call start_run first.');
    return this.active;
  }

  /** Checks with no result yet, in run order. */
  private pending(): Check[] {
    const active = this.requireActive();
    const judged = new Set(active.run.results.map((r) => r.check));
    return active.checklist.checks.filter((c) => !judged.has(c.key));
  }

  private conditionSkips(statuses: Map<string, Result['status']>) {
    return resolveSkippedChecks({
      checks: this.requireActive().checklist.checks.map((c) => ({
        id: c.key,
        description: c.description,
        runCondition: c.run_condition,
      })),
      statuses,
    });
  }

  private nextStep(): string {
    const pending = this.pending();
    if (pending.length === 0)
      return 'Every check has a verdict: call finish_run with a short summary.';
    const next = pending[0]!;
    return `Next: [${next.key}] ${checkLabel(next)} ${next.description} (${pending.length} left).`;
  }

  /** The viewer's Stop writes the run id to `.live/stop`; the run notices on its next call. */
  private async stopRequested(active: Active): Promise<boolean> {
    if (active.stopped) return true;
    const flag = await readFile(join(this.root, '.live', 'stop'), 'utf8').catch(() => '');
    if (flag.trim() !== active.run.id) return false;
    active.stopped = true;
    active.run.status = 'stopped';
    await this.save();
    await this.log('stop', {}, 'Stopped from the viewer');
    return true;
  }

  /** Runs left `running` by a process that is gone, or by this one before a restart. */
  private async markInterrupted(): Promise<void> {
    for (const entry of await readRuns(this.root)) {
      if (!('run' in entry) || entry.run.status !== 'running') continue;
      if (entry.run.pid !== process.pid && isAlive(entry.run.pid)) continue;
      await writeJsonAtomic(join(this.root, 'runs', entry.id, 'run.json'), {
        ...entry.run,
        status: 'interrupted',
      });
    }
  }

  private async endBrowser(): Promise<void> {
    const active = this.active;
    if (!active) return;
    this.active = null;
    await active.driver.close().catch(() => {});
    if (active.tempProfile) await rm(active.tempProfile, { recursive: true, force: true });
    await this.clearStop(active.run.id);
  }

  private async clearStop(id: string): Promise<void> {
    const stopFile = join(this.root, '.live', 'stop');
    const flag = await readFile(stopFile, 'utf8').catch(() => '');
    if (flag.trim() === id) await rm(stopFile, { force: true });
  }

  private async save(): Promise<void> {
    const active = this.requireActive();
    await writeJsonAtomic(join(active.dir, 'run.json'), active.run);
  }

  private async log(tool: string, input: unknown, text: string): Promise<void> {
    const active = this.requireActive();
    await appendJsonl(join(active.dir, 'activity.jsonl'), {
      at: now(),
      tool,
      input,
      text: text.length > LOG_TEXT_CHARS ? `${text.slice(0, LOG_TEXT_CHARS)}...` : text,
    });
  }

  /** The viewer's live frame. ponytail: one per project, so two sessions running at once share it. */
  private async saveFrame(png: Uint8Array): Promise<void> {
    await writeFileAtomic(join(this.root, '.live', 'latest.png'), png);
  }
}

/** A finished run's verdict, by the same code that scores a cloud run. */
export function scoreLocalRun(checklist: Checklist, results: Result[]) {
  const scoring = newChecklistScoring({
    scoreType: checklist.score_type,
    scoreUnit: checklist.score_unit,
    passThreshold: checklist.pass_threshold,
    scoreBands: checklist.score_bands,
    checks: checklist.checks.map((c) => ({ checkType: c.type, weight: c.weight })),
  });
  return scoreChecklistRun({
    checks: checklist.checks.map((c) => ({
      id: c.key,
      checkType: c.type,
      weight: c.weight ?? 1,
      onFailure: c.on_failure,
    })),
    results: results.map((r) => ({ checkId: r.check, status: r.status })),
    passThreshold: scoring.pass_threshold,
    scoreBands: scoring.score_bands,
    scoreType: scoring.score_type,
    scoreUnit: scoring.score_unit,
  });
}
