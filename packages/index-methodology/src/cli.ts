#!/usr/bin/env node
// `index-methodology probe <domain>`: run the Index's quick checks on one site
// and print what they found. The same probe the Index runs, with no agent
// sessions and no third-party lookups (Is Agentic, agent search), so a site
// owner can see every check and its evidence on their own machine.

import { BAND_LABEL, CATEGORIES, scoreBand } from './index.ts';
import { runProbe, type ProbeReport } from './probe/index.ts';

const USAGE = `Usage: index-methodology probe <domain> [--json]

Runs the Index's quick checks against a site over plain HTTP and prints each
category's score and the checks that failed. Agent sessions and the Is Agentic
and agent search lookups are not run here.`;

function printReport(report: ProbeReport): void {
  if (!report.reachable) {
    console.log(`${report.domain}: homepage returned ${report.homepageStatus || 'no response'}.`);
    console.log('A site that turns the quick checks away is not scored, so no score is shown.');
    return;
  }
  console.log(`${report.name} (${report.domain})`);
  console.log(
    `Quick-check score: ${report.overallScore} (${BAND_LABEL[scoreBand(report.overallScore)]})`
  );
  console.log('');
  for (const c of CATEGORIES) {
    const score = report.categoryScores.find((s) => s.category === c.id);
    if (!score) continue;
    if (score.applicable === false) {
      console.log(`${c.label}: not applicable to this site`);
      continue;
    }
    console.log(`${c.label}: ${score.score}`);
    for (const f of report.findings[c.id] ?? []) {
      if (f.passed) continue;
      const detail = f.detail ? ` (${f.detail})` : '';
      console.log(`  fail  ${f.label}${detail}`);
    }
  }
  if (report.frictions.length > 0) {
    console.log('');
    console.log('Frictions:');
    for (const f of report.frictions) console.log(`  [${f.severity}] ${f.summary}`);
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, domain, ...flags] = argv;
  if (command !== 'probe' || !domain || argv.includes('--help')) {
    console.error(USAGE);
    return command === '--help' || argv.includes('--help') ? 0 : 1;
  }
  const report = await runProbe(domain);
  if (flags.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
);
